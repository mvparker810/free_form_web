#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <emscripten.h>

// Define implementation guard before including header
#define FF_FREEFORM_IMPL_
#include "../extern/free_form/freeform.h"

// Global sketch instance (managed by JavaScript)
static ff_Sketch* global_sketch = NULL;

// Initialize sketch
EMSCRIPTEN_KEEPALIVE
void* wasm_sketch_create(int p_cap, int e_cap, int c_cap) {
    ff_Sketch* skt = (ff_Sketch*)malloc(sizeof(ff_Sketch));
    if (skt) {
        ffSketch_Init(skt, p_cap, e_cap, c_cap);
    }
    return skt;
}

// Free sketch
EMSCRIPTEN_KEEPALIVE
void wasm_sketch_free(void* skt_ptr) {
    if (skt_ptr) {
        ff_Sketch* skt = (ff_Sketch*)skt_ptr;
        ffSketch_Free(skt);
        free(skt);
    }
}

// Solve sketch
EMSCRIPTEN_KEEPALIVE
int wasm_sketch_solve(void* skt_ptr, double tolerance, int max_steps) {
    if (!skt_ptr) return 0;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    return ffSketch_Solve(skt, tolerance, max_steps) ? 1 : 0;
}

// Add parameter
EMSCRIPTEN_KEEPALIVE
int wasm_add_parameter(void* skt_ptr, double value) {
    if (!skt_ptr) return -1;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    ff_ParameterDef def = {value};
    ff_ParamHandle h = ffSketch_AddParameter(skt, def);
    return h.idx;
}

// Get parameter value
EMSCRIPTEN_KEEPALIVE
double wasm_get_parameter(void* skt_ptr, int param_idx) {
    if (!skt_ptr) return 0.0;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    if (param_idx >= skt->params.cap || !skt->params.slots[param_idx].alive) {
        return 0.0;
    }
    return skt->params.slots[param_idx].payload.def.v;
}

// Set parameter value
EMSCRIPTEN_KEEPALIVE
void wasm_set_parameter(void* skt_ptr, int param_idx, double value) {
    if (!skt_ptr) return;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    if (param_idx >= skt->params.cap || !skt->params.slots[param_idx].alive) {
        return;
    }
    skt->params.slots[param_idx].payload.def.v = value;
}

// Add point entity
EMSCRIPTEN_KEEPALIVE
int wasm_add_point(void* skt_ptr, double x, double y) {
    if (!skt_ptr) return -1;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;

    ff_ParamHandle x_param = ffSketch_AddParameter(skt, (ff_ParameterDef){x});
    ff_ParamHandle y_param = ffSketch_AddParameter(skt, (ff_ParameterDef){y});

    ff_EntityDef pointDef = ff_EntityDef_DEFAULT(FF_POINT);
    pointDef.data.point.x = x_param;
    pointDef.data.point.y = y_param;

    ff_EntityHandle h = ffSketch_AddEntity(skt, pointDef);
    return h.idx;
}

// Add line entity
EMSCRIPTEN_KEEPALIVE
int wasm_add_line(void* skt_ptr, double x1, double y1, double x2, double y2) {
    if (!skt_ptr) return -1;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;

    // Create first point
    ff_ParamHandle x1_param = ffSketch_AddParameter(skt, (ff_ParameterDef){x1});
    ff_ParamHandle y1_param = ffSketch_AddParameter(skt, (ff_ParameterDef){y1});
    ff_EntityDef point1Def = ff_EntityDef_DEFAULT(FF_POINT);
    point1Def.data.point.x = x1_param;
    point1Def.data.point.y = y1_param;
    ff_EntityHandle p1 = ffSketch_AddEntity(skt, point1Def);

    // Create second point
    ff_ParamHandle x2_param = ffSketch_AddParameter(skt, (ff_ParameterDef){x2});
    ff_ParamHandle y2_param = ffSketch_AddParameter(skt, (ff_ParameterDef){y2});
    ff_EntityDef point2Def = ff_EntityDef_DEFAULT(FF_POINT);
    point2Def.data.point.x = x2_param;
    point2Def.data.point.y = y2_param;
    ff_EntityHandle p2 = ffSketch_AddEntity(skt, point2Def);

    // Create line
    ff_EntityDef lineDef = ff_EntityDef_DEFAULT(FF_LINE);
    lineDef.data.line.p1 = p1;
    lineDef.data.line.p2 = p2;

    ff_EntityHandle h = ffSketch_AddEntity(skt, lineDef);
    return h.idx;
}

// Add circle entity
EMSCRIPTEN_KEEPALIVE
int wasm_add_circle(void* skt_ptr, double x, double y, double radius) {
    if (!skt_ptr) return -1;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;

    // Create center point
    ff_ParamHandle x_param = ffSketch_AddParameter(skt, (ff_ParameterDef){x});
    ff_ParamHandle y_param = ffSketch_AddParameter(skt, (ff_ParameterDef){y});
    ff_EntityDef centerDef = ff_EntityDef_DEFAULT(FF_POINT);
    centerDef.data.point.x = x_param;
    centerDef.data.point.y = y_param;
    ff_EntityHandle center = ffSketch_AddEntity(skt, centerDef);

    // Create radius parameter
    ff_ParamHandle r_param = ffSketch_AddParameter(skt, (ff_ParameterDef){radius});

    // Create circle
    ff_EntityDef circleDef = ff_EntityDef_DEFAULT(FF_CIRCLE);
    circleDef.data.circle.c = center;
    circleDef.data.circle.r = r_param;

    ff_EntityHandle h = ffSketch_AddEntity(skt, circleDef);
    return h.idx;
}

// Get all parameters (returns count, fills arrays)
EMSCRIPTEN_KEEPALIVE
int wasm_get_all_parameters(void* skt_ptr, int* ids_out, double* values_out, int max_count) {
    if (!skt_ptr) return 0;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;

    int count = 0;
    for (int i = 0; i < skt->params.cap && count < max_count; i++) {
        if (skt->params.slots[i].alive) {
            ids_out[count] = i;
            values_out[count] = skt->params.slots[i].payload.def.v;
            count++;
        }
    }
    return count;
}

// Get all entities (returns count, fills arrays)
EMSCRIPTEN_KEEPALIVE
int wasm_get_all_entities(void* skt_ptr, int* ids_out, int* types_out, int max_count) {
    if (!skt_ptr) return 0;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;

    int count = 0;
    for (int i = 0; i < skt->entities.cap && count < max_count; i++) {
        if (skt->entities.slots[i].alive) {
            ids_out[count] = i;
            types_out[count] = skt->entities.slots[i].payload.def.type;
            count++;
        }
    }
    return count;
}

// Get entity data for a specific entity
EMSCRIPTEN_KEEPALIVE
int wasm_get_entity_type(void* skt_ptr, int entity_idx) {
    if (!skt_ptr) return -1;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    if (entity_idx >= skt->entities.cap || !skt->entities.slots[entity_idx].alive) {
        return -1;
    }
    return skt->entities.slots[entity_idx].payload.def.type;
}

// Get point entity data
EMSCRIPTEN_KEEPALIVE
void wasm_get_point_data(void* skt_ptr, int entity_idx, int* x_param_out, int* y_param_out) {
    if (!skt_ptr) return;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    if (entity_idx >= skt->entities.cap || !skt->entities.slots[entity_idx].alive) {
        return;
    }
    ff_Entity* ent = &skt->entities.slots[entity_idx].payload;
    if (ent->def.type == FF_POINT) {
        *x_param_out = ent->def.data.point.x.idx;
        *y_param_out = ent->def.data.point.y.idx;
    }
}

// Get line entity data
EMSCRIPTEN_KEEPALIVE
void wasm_get_line_data(void* skt_ptr, int entity_idx, int* p1_out, int* p2_out) {
    if (!skt_ptr) return;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    if (entity_idx >= skt->entities.cap || !skt->entities.slots[entity_idx].alive) {
        return;
    }
    ff_Entity* ent = &skt->entities.slots[entity_idx].payload;
    if (ent->def.type == FF_LINE) {
        *p1_out = ent->def.data.line.p1.idx;
        *p2_out = ent->def.data.line.p2.idx;
    }
}

// Get circle entity data
EMSCRIPTEN_KEEPALIVE
void wasm_get_circle_data(void* skt_ptr, int entity_idx, int* center_out, int* radius_param_out) {
    if (!skt_ptr) return;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    if (entity_idx >= skt->entities.cap || !skt->entities.slots[entity_idx].alive) {
        return;
    }
    ff_Entity* ent = &skt->entities.slots[entity_idx].payload;
    if (ent->def.type == FF_CIRCLE) {
        *center_out = ent->def.data.circle.c.idx;
        *radius_param_out = ent->def.data.circle.r.idx;
    }
}

// Get parameter count
EMSCRIPTEN_KEEPALIVE
int wasm_get_param_count(void* skt_ptr) {
    if (!skt_ptr) return 0;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    return skt->params.alive_count;
}

// Get entity count
EMSCRIPTEN_KEEPALIVE
int wasm_get_entity_count(void* skt_ptr) {
    if (!skt_ptr) return 0;
    ff_Sketch* skt = (ff_Sketch*)skt_ptr;
    return skt->entities.alive_count;
}