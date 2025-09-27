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
    httplib::Server api;

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







    ff_Sketch* sketch = (ff_Sketch*)malloc(sizeof(ff_Sketch));
    ffSketch_Init(sketch, 1024, 256, 128);

    ff_ParamHandle x = ffSketch_AddParameter(sketch,ff_ParameterDef{3.0f});
    ff_ParamHandle y = ffSketch_AddParameter(sketch,ff_ParameterDef{-3.0f});

    ff_ConstraintDef cDef = ff_ConstraintDef_DEFAULT();
    //cDef.type = FF_GENERAL;
    cDef.eq = exprInit_op(OperatorType_SUB, exprInit_param(x),exprInit_param(y));
    ffSketch_AddConstraint(sketch, cDef);
    /*
    ff_EntityDef point_def = ff_EntityDef_DEFAULT(FF_POINT);
    point_def.data.point.x = x;
    point_def.data.point.y = y;
    ff_EntityHandle point = ffSketch_AddEntity(sketch, point_def);
    */

    printf(ffSketch_Solve(sketch, 0.01, 8) ? "Converged\n" : "Did not converge\n");

    const char* host = "127.0.0.1";
    const int   port = 8080;
    std::printf("Backend listening on http://%s:%d\n", host, port);
    api.listen(host, port);

    ffSketch_Free(sketch);
    free(sketch);

    return 0;
}