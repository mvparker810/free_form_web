// TypeScript wrapper for FreeForm WASM module

export interface FreeFormModule extends EmscriptenModule {
  _wasm_sketch_create(p_cap: number, e_cap: number, c_cap: number): number
  _wasm_sketch_free(skt_ptr: number): void
  _wasm_sketch_solve(skt_ptr: number, tolerance: number, max_steps: number): number

  _wasm_add_parameter(skt_ptr: number, value: number): number
  _wasm_get_parameter(skt_ptr: number, param_idx: number): number
  _wasm_set_parameter(skt_ptr: number, param_idx: number, value: number): void

  _wasm_add_point(skt_ptr: number, x: number, y: number): number
  _wasm_add_line(skt_ptr: number, x1: number, y1: number, x2: number, y2: number): number
  _wasm_add_circle(skt_ptr: number, x: number, y: number, radius: number): number

  _wasm_get_param_count(skt_ptr: number): number
  _wasm_get_entity_count(skt_ptr: number): number

  _wasm_get_all_parameters(skt_ptr: number, ids_out: number, values_out: number, max_count: number): number
  _wasm_get_all_entities(skt_ptr: number, ids_out: number, types_out: number, max_count: number): number

  _wasm_get_entity_type(skt_ptr: number, entity_idx: number): number
  _wasm_get_point_data(skt_ptr: number, entity_idx: number, x_param_out: number, y_param_out: number): void
  _wasm_get_line_data(skt_ptr: number, entity_idx: number, p1_out: number, p2_out: number): void
  _wasm_get_circle_data(skt_ptr: number, entity_idx: number, center_out: number, radius_param_out: number): void
}

declare function createFreeFormModule(): Promise<FreeFormModule>

export enum EntityType {
  POINT = 0,
  LINE = 1,
  CIRCLE = 2,
  ARC = 3
}

export interface Parameter {
  id: number
  value: number
}

export interface Entity {
  id: number
  type: EntityType
  data?: any
}

export class FreeFormSketch {
  private module: FreeFormModule | null = null
  private sketchPtr: number = 0

  async initialize(p_cap = 1024, e_cap = 256, c_cap = 128) {
    // @ts-ignore - Import WASM module
    const createModule = (await import('/freeform.js')).default
    this.module = await createModule()
    this.sketchPtr = this.module._wasm_sketch_create(p_cap, e_cap, c_cap)
  }

  destroy() {
    if (this.module && this.sketchPtr) {
      this.module._wasm_sketch_free(this.sketchPtr)
      this.sketchPtr = 0
    }
  }

  solve(tolerance = 0.01, maxSteps = 8): boolean {
    if (!this.module || !this.sketchPtr) return false
    return this.module._wasm_sketch_solve(this.sketchPtr, tolerance, maxSteps) === 1
  }

  addParameter(value: number): number {
    if (!this.module || !this.sketchPtr) return -1
    return this.module._wasm_add_parameter(this.sketchPtr, value)
  }

  getParameter(paramId: number): number {
    if (!this.module || !this.sketchPtr) return 0
    return this.module._wasm_get_parameter(this.sketchPtr, paramId)
  }

  setParameter(paramId: number, value: number) {
    if (!this.module || !this.sketchPtr) return
    this.module._wasm_set_parameter(this.sketchPtr, paramId, value)
  }

  addPoint(x: number, y: number): number {
    if (!this.module || !this.sketchPtr) return -1
    return this.module._wasm_add_point(this.sketchPtr, x, y)
  }

  addLine(x1: number, y1: number, x2: number, y2: number): number {
    if (!this.module || !this.sketchPtr) return -1
    return this.module._wasm_add_line(this.sketchPtr, x1, y1, x2, y2)
  }

  addCircle(x: number, y: number, radius: number): number {
    if (!this.module || !this.sketchPtr) return -1
    return this.module._wasm_add_circle(this.sketchPtr, x, y, radius)
  }

  getAllParameters(): Parameter[] {
    if (!this.module || !this.sketchPtr) return []

    const count = this.module._wasm_get_param_count(this.sketchPtr)
    if (count === 0) return []

    const idsPtr = this.module._malloc(count * 4)
    const valuesPtr = this.module._malloc(count * 8)

    const actualCount = this.module._wasm_get_all_parameters(this.sketchPtr, idsPtr, valuesPtr, count)

    const ids = new Int32Array(this.module.HEAP32.buffer, idsPtr, actualCount)
    const values = new Float64Array(this.module.HEAPF64.buffer, valuesPtr, actualCount)

    const parameters: Parameter[] = []
    for (let i = 0; i < actualCount; i++) {
      parameters.push({ id: ids[i], value: values[i] })
    }

    this.module._free(idsPtr)
    this.module._free(valuesPtr)

    return parameters
  }

  getAllEntities(): Entity[] {
    if (!this.module || !this.sketchPtr) return []

    const count = this.module._wasm_get_entity_count(this.sketchPtr)
    if (count === 0) return []

    const idsPtr = this.module._malloc(count * 4)
    const typesPtr = this.module._malloc(count * 4)

    const actualCount = this.module._wasm_get_all_entities(this.sketchPtr, idsPtr, typesPtr, count)

    const ids = new Int32Array(this.module.HEAP32.buffer, idsPtr, actualCount)
    const types = new Int32Array(this.module.HEAP32.buffer, typesPtr, actualCount)

    const entities: Entity[] = []
    for (let i = 0; i < actualCount; i++) {
      const entity: Entity = {
        id: ids[i],
        type: types[i]
      }

      // Get type-specific data
      const dataPtr = this.module._malloc(16) // 4 ints max
      const dataView = new Int32Array(this.module.HEAP32.buffer, dataPtr, 4)

      switch (entity.type) {
        case EntityType.POINT:
          this.module._wasm_get_point_data(this.sketchPtr, entity.id, dataPtr, dataPtr + 4)
          entity.data = {
            x_param: dataView[0],
            y_param: dataView[1]
          }
          break
        case EntityType.LINE:
          this.module._wasm_get_line_data(this.sketchPtr, entity.id, dataPtr, dataPtr + 4)
          entity.data = {
            p1: dataView[0],
            p2: dataView[1]
          }
          break
        case EntityType.CIRCLE:
          this.module._wasm_get_circle_data(this.sketchPtr, entity.id, dataPtr, dataPtr + 4)
          entity.data = {
            center: dataView[0],
            radius_param: dataView[1]
          }
          break
      }

      this.module._free(dataPtr)
      entities.push(entity)
    }

    this.module._free(idsPtr)
    this.module._free(typesPtr)

    return entities
  }
}

// Create singleton instance
let sketchInstance: FreeFormSketch | null = null

export async function getSketch(): Promise<FreeFormSketch> {
  if (!sketchInstance) {
    sketchInstance = new FreeFormSketch()
    await sketchInstance.initialize()
  }
  return sketchInstance
}