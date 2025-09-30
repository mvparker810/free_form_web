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

        ff_ParamHandle x2 = ffSketch_AddParameter(sketch,ff_ParameterDef{12.0f});
        ff_ParamHandle y2 = ffSketch_AddParameter(sketch,ff_ParameterDef{-30.0f});

        ff_EntityDef pDef2 = ff_EntityDef_DEFAULT(FF_POINT);
        pDef2.data.point.x = x2;
        pDef2.data.point.y = y2;
        ff_EntityHandle p2 = ffSketch_AddEntity(sketch, pDef2);

        ff_EntityDef lDef = ff_EntityDef_DEFAULT(FF_LINE);
        lDef.data.line.p1 = p1;
        lDef.data.line.p2 = p2;
        ff_EntityHandle line = ffSketch_AddEntity(sketch, lDef);





        ff_ParamHandle r = ffSketch_AddParameter(sketch,ff_ParameterDef{15.0f});
        ff_EntityDef cDef = ff_EntityDef_DEFAULT(FF_CIRCLE);
        cDef.data.circle.c = p1;
        cDef.data.circle.r = r;
        //ff_EntityHandle circle = ffSketch_AddEntity(sketch, cDef);

        ff_ConstraintDef fDef = ff_ConstraintDef_DEFAULT();
        //cDef.type = FF_GENERAL;
        fDef.eq = exprInit_op(OperatorType_SUB, exprInit_param(x1),exprInit_param(y1));
        //ffSketch_AddConstraint(sketch, fDef);

        

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

    // PUT /api/sketch/parameters/:id - Update a parameter value
    api.Put(R"(/api/sketch/parameters/(\d+))", [&sketch](const httplib::Request& req, httplib::Response& res) {
        try {
            // Parse parameter ID from URL
            int param_id = std::stoi(req.matches[1]);

            // Parse JSON body
            json body = json::parse(req.body);
            double new_value;
            if (!get_number(body, "value", new_value)) {
                res.status = 400;
                res.set_content(R"({"error": "Invalid or missing 'value' field"})", "application/json");
                return;
            }

            // Check if parameter exists and is alive
            if (param_id >= sketch->params.cap || !sketch->params.slots[param_id].alive) {
                res.status = 404;
                res.set_content(R"({"error": "Parameter not found"})", "application/json");
                return;
            }

            // Update the parameter value
            sketch->params.slots[param_id].payload.def.v = new_value;

            // Re-solve the sketch after parameter update
            bool converged = ffSketch_Solve(sketch, 0.01, 8);

            // Return success response
            json response = {
                {"success", true},
                {"parameter_id", param_id},
                {"new_value", new_value},
                {"solver_converged", converged}
            };
            res.set_content(response.dump(2), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(R"({"error": "Invalid request"})", "application/json");
        }
    });

    // POST /api/sketch/entities/point - Create a new point
    api.Post("/api/sketch/entities/point", [&sketch](const httplib::Request& req, httplib::Response& res) {
        try {
            // Parse JSON body
            json body = json::parse(req.body);
            double x, y;
            if (!get_number(body, "x", x) || !get_number(body, "y", y)) {
                res.status = 400;
                res.set_content(R"({"error": "Invalid or missing 'x' or 'y' field"})", "application/json");
                return;
            }

            // Create parameters for the point coordinates
            ff_ParamHandle x_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)x});
            ff_ParamHandle y_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)y});

            // Create the point entity
            ff_EntityDef pointDef = ff_EntityDef_DEFAULT(FF_POINT);
            pointDef.data.point.x = x_param;
            pointDef.data.point.y = y_param;
            ff_EntityHandle point = ffSketch_AddEntity(sketch, pointDef);

            // Re-solve the sketch after adding the point
            bool converged = ffSketch_Solve(sketch, 0.01, 8);

            // Return success response with the new point data
            json response = {
                {"success", true},
                {"entity_id", point.idx},
                {"x_param_id", x_param.idx},
                {"y_param_id", y_param.idx},
                {"x", x},
                {"y", y},
                {"solver_converged", converged}
            };
            res.set_content(response.dump(2), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(R"({"error": "Invalid request"})", "application/json");
        }
    });

    // POST /api/sketch/entities/line - Create a new line
    api.Post("/api/sketch/entities/line", [&sketch](const httplib::Request& req, httplib::Response& res) {
        try {
            // Parse JSON body
            json body = json::parse(req.body);
            double x1, y1, x2, y2;
            if (!get_number(body, "x1", x1) || !get_number(body, "y1", y1) ||
                !get_number(body, "x2", x2) || !get_number(body, "y2", y2)) {
                res.status = 400;
                res.set_content(R"({"error": "Invalid or missing 'x1', 'y1', 'x2', or 'y2' field"})", "application/json");
                return;
            }

            // Create parameters for the first point
            ff_ParamHandle x1_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)x1});
            ff_ParamHandle y1_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)y1});

            // Create the first point entity
            ff_EntityDef point1Def = ff_EntityDef_DEFAULT(FF_POINT);
            point1Def.data.point.x = x1_param;
            point1Def.data.point.y = y1_param;
            ff_EntityHandle point1 = ffSketch_AddEntity(sketch, point1Def);

            // Create parameters for the second point
            ff_ParamHandle x2_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)x2});
            ff_ParamHandle y2_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)y2});

            // Create the second point entity
            ff_EntityDef point2Def = ff_EntityDef_DEFAULT(FF_POINT);
            point2Def.data.point.x = x2_param;
            point2Def.data.point.y = y2_param;
            ff_EntityHandle point2 = ffSketch_AddEntity(sketch, point2Def);

            // Create the line entity
            ff_EntityDef lineDef = ff_EntityDef_DEFAULT(FF_LINE);
            lineDef.data.line.p1 = point1;
            lineDef.data.line.p2 = point2;
            ff_EntityHandle line = ffSketch_AddEntity(sketch, lineDef);

            // Re-solve the sketch after adding the line
            bool converged = ffSketch_Solve(sketch, 0.01, 8);

            // Return success response with the new line data
            json response = {
                {"success", true},
                {"line_entity_id", line.idx},
                {"point1_entity_id", point1.idx},
                {"point2_entity_id", point2.idx},
                {"x1_param_id", x1_param.idx},
                {"y1_param_id", y1_param.idx},
                {"x2_param_id", x2_param.idx},
                {"y2_param_id", y2_param.idx},
                {"solver_converged", converged}
            };
            res.set_content(response.dump(2), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(R"({"error": "Invalid request"})", "application/json");
        }
    });

    // POST /api/sketch/entities/circle - Create a new circle
    api.Post("/api/sketch/entities/circle", [&sketch](const httplib::Request& req, httplib::Response& res) {
        try {
            // Parse JSON body
            json body = json::parse(req.body);
            double x, y, radius;
            if (!get_number(body, "x", x) || !get_number(body, "y", y) || !get_number(body, "radius", radius)) {
                res.status = 400;
                res.set_content(R"({"error": "Invalid or missing 'x', 'y', or 'radius' field"})", "application/json");
                return;
            }

            if (radius <= 0) {
                res.status = 400;
                res.set_content(R"({"error": "Radius must be positive"})", "application/json");
                return;
            }

            // Create parameters for the center point
            ff_ParamHandle x_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)x});
            ff_ParamHandle y_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)y});

            // Create the center point entity
            ff_EntityDef centerDef = ff_EntityDef_DEFAULT(FF_POINT);
            centerDef.data.point.x = x_param;
            centerDef.data.point.y = y_param;
            ff_EntityHandle center = ffSketch_AddEntity(sketch, centerDef);

            // Create parameter for the radius
            ff_ParamHandle radius_param = ffSketch_AddParameter(sketch, ff_ParameterDef{(float)radius});

            // Create the circle entity
            ff_EntityDef circleDef = ff_EntityDef_DEFAULT(FF_CIRCLE);
            circleDef.data.circle.c = center;
            circleDef.data.circle.r = radius_param;
            ff_EntityHandle circle = ffSketch_AddEntity(sketch, circleDef);

            // Re-solve the sketch after adding the circle
            bool converged = ffSketch_Solve(sketch, 0.01, 8);

            // Return success response with the new circle data
            json response = {
                {"success", true},
                {"circle_entity_id", circle.idx},
                {"center_entity_id", center.idx},
                {"x_param_id", x_param.idx},
                {"y_param_id", y_param.idx},
                {"radius_param_id", radius_param.idx},
                {"x", x},
                {"y", y},
                {"radius", radius},
                {"solver_converged", converged}
            };
            res.set_content(response.dump(2), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(R"({"error": "Invalid request"})", "application/json");
        }
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









 

    const char* host = "127.0.0.1";
    const int   port = 8080;
    std::printf("Backend listening on http://%s:%d\n", host, port);
    api.listen(host, port);




    ffSketch_Free(sketch);
    free(sketch);

    return 0;
}