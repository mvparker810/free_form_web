// backend/main.cpp
#include <cstdio>
#include <cmath>
#include <string>
#include <httplib.h>
#include <nlohmann/json.hpp>

extern "C" {
    #include "../extern/free_form/freeform.h"
}

using json = nlohmann::json;

// Small helper: read number (double) from JSON with validation
static bool get_number(const json& j, const char* key, double& out) {
    if (!j.contains(key)) return false;
    try {
        out = j.at(key).get<double>();
        return std::isfinite(out);
    } catch (...) {
        return false;
    }
}

int main() {

    ff_Sketch* sketch = (ff_Sketch*)malloc(sizeof(ff_Sketch));
    ffSketch_Init(sketch, 1024, 256, 128);

    {
        ff_ParamHandle x1 = ffSketch_AddParameter(sketch,ff_ParameterDef{4.0f});
        ff_ParamHandle y1 = ffSketch_AddParameter(sketch,ff_ParameterDef{-4.0f});

        ff_EntityDef pDef1 = ff_EntityDef_DEFAULT(FF_POINT);
        pDef1.data.point.x = x1;
        pDef1.data.point.y = y1;
        ff_EntityHandle p1 = ffSketch_AddEntity(sketch, pDef1);

        ff_ParamHandle x2 = ffSketch_AddParameter(sketch,ff_ParameterDef{4.0f});
        ff_ParamHandle y2 = ffSketch_AddParameter(sketch,ff_ParameterDef{-4.0f});

        ff_EntityDef pDef2 = ff_EntityDef_DEFAULT(FF_POINT);
        pDef2.data.point.x = x2;
        pDef2.data.point.y = y2;
        ff_EntityHandle p2 = ffSketch_AddEntity(sketch, pDef2);

        ff_EntityDef lDef = ff_EntityDef_DEFAULT(FF_LINE);
        lDef.data.line.p1 = p1;
        lDef.data.line.p2 = p2;
        ff_EntityHandle line = ffSketch_AddEntity(sketch, lDef);





        ff_ParamHandle r = ffSketch_AddParameter(sketch,ff_ParameterDef{5.0f});
        ff_EntityDef cDef = ff_EntityDef_DEFAULT(FF_CIRCLE);
        cDef.data.circle.c = p2;
        cDef.data.circle.r = r;
        ff_EntityHandle circle = ffSketch_AddEntity(sketch, cDef);

        ff_ConstraintDef fDef = ff_ConstraintDef_DEFAULT();
        //cDef.type = FF_GENERAL;
        fDef.eq = exprInit_op(OperatorType_SUB, exprInit_param(x1),exprInit_param(y1));
        ffSketch_AddConstraint(sketch, fDef);

        

        printf(ffSketch_Solve(sketch, 0.01, 8) ? "Converged\n" : "Did not converge\n");
    }


    httplib::Server api;


    // GET /api/sketch/parameters
    api.Get("/api/sketch/parameters", [&sketch](const httplib::Request&, httplib::Response& res) {
        json params_array = json::array();
        
        for (uint16_t i = 0; i < sketch->params.cap; i++) {
            if (sketch->params.slots[i].alive) {
                ff_Parameter* param = &sketch->params.slots[i].payload;
                params_array.push_back({
                    {"id", i},
                    {"gen", sketch->params.slots[i].gen},
                    {"value", param->def.v}
                });
            }
        }
        
        res.set_content(params_array.dump(2), "application/json");
    });

    // GET /api/sketch/entities
    api.Get("/api/sketch/entities", [&sketch](const httplib::Request&, httplib::Response& res) {
        json entities_array = json::array();
        
        for (uint16_t i = 0; i < sketch->entities.cap; i++) {
            if (sketch->entities.slots[i].alive) {
                ff_Entity* ent = &sketch->entities.slots[i].payload;
                json entity_obj = {
                    {"id", i},
                    {"gen", sketch->entities.slots[i].gen},
                    {"type", ent->def.type}
                };
                
                // Add type-specific data
                switch(ent->def.type) {
                    case FF_POINT:
                        entity_obj["data"] = {
                            {"x_param", ent->def.data.point.x.idx},
                            {"y_param", ent->def.data.point.y.idx}
                        };
                        break;
                    case FF_LINE:
                        entity_obj["data"] = {
                            {"p1", ent->def.data.line.p1.idx},
                            {"p2", ent->def.data.line.p2.idx}
                        };
                        break;
                    case FF_CIRCLE:
                        entity_obj["data"] = {
                            {"center", ent->def.data.circle.c.idx},
                            {"radius_param", ent->def.data.circle.r.idx}
                        };
                        break;
                    case FF_ARC:
                        entity_obj["data"] = {
                            {"p1", ent->def.data.arc.p1.idx},
                            {"p2", ent->def.data.arc.p2.idx},
                            {"p3", ent->def.data.arc.p3.idx}
                        };
                        break;
                }
                
                entities_array.push_back(entity_obj);
            }
        }
        
        res.set_content(entities_array.dump(2), "application/json");
    });

    // GET /api/sketch/constraints
    api.Get("/api/sketch/constraints", [&sketch](const httplib::Request&, httplib::Response& res) {
        json constraints_array = json::array();
        
        for (uint16_t i = 0; i < sketch->constraints.cap; i++) {
            if (sketch->constraints.slots[i].alive) {
                ff_Constraint* cons = &sketch->constraints.slots[i].payload;
                constraints_array.push_back({
                    {"id", i},
                    {"gen", sketch->constraints.slots[i].gen},
                    {"type", cons->def.type},
                    {"error", cons->JMR.err}
                });
            }
        }
        
        res.set_content(constraints_array.dump(2), "application/json");
    });






    // Health check
    api.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        json j = {
            {"ok", true},
            {"service", "complexlib-backend"},
            {"lib_version", {
                {"major", 4},
                {"minor", 5},
                {"patch", 6}
            }}
        };
        res.set_content(j.dump(2), "application/json");
    });

    // POST /api/solve/quad  body: { "a": <num>, "b": <num>, "c": <num> }
    api.Post("/api/solve/quad", [](const httplib::Request& req, httplib::Response& res) {
        // Parse JSON
        json in;
        try {
            in = json::parse(req.body);
        } catch (...) {
            res.status = 400;
            res.set_content(R"({"error":"invalid JSON"})", "application/json");
            return;
        }

        double a, b, c;
        if (!get_number(in, "a", a) || !get_number(in, "b", b) || !get_number(in, "c", c)) {
            res.status = 400;
            res.set_content(R"({"error":"expected numeric fields a, b, c"})", "application/json");
            return;
        }

       
        int rc = 3;
        if (rc != 0) {
            res.status = 400;
            res.set_content(R"({"error":"a must be non-zero. also, hello world!"})", "application/json");
            return;
        }

        json out = {
            {"ok", true},
            {"input", {{"a", a}, {"b", b}, {"c", c}}},
            {"roots", {
                {{"real", 4}, {"imag", 7}},
                {{"real", 2}, {"imag", 9}}
            }},
            {"lib_version", {
                {"major", 6},
                {"minor", 4},
                {"patch", 8}
            }}
        };

        res.set_content(out.dump(2), "application/json");
    });

    // (Optional) simple index for quick manual test in a browser
    api.Get("/", [](const httplib::Request&, httplib::Response& res) {
        static const char* html =
            "<!doctype html><meta charset=utf-8>"
            "<title>complexlib backend</title>"
            "<h1>complexlib backend</h1>"
            "<p>Try POSTing JSON to <code>/api/solve/quad</code> like:"
            "<pre>{\"a\":1,\"b\":0,\"c\":-1}</pre>";
        res.set_content(html, "text/html");
    });










 

    const char* host = "127.0.0.1";
    const int   port = 8080;
    std::printf("Backend listening on http://%s:%d\n", host, port);
    api.listen(host, port);




    ffSketch_Free(sketch);
    free(sketch);

    return 0;
}