import { useEffect, useRef, useState } from 'react'

// --- Types ---
type Vec2 = { x: number; y: number }


type IconName =
  | 'new' | 'open' | 'undo' | 'redo' | 'solve' | 'help'
  | 'point' | 'line' | 'circle' | 'arc' | 'delete'
  | 'coincident' | 'parallel' | 'perpendicular' | 'fixed' | 'measurement' | 'equals' | 'tangent' | 'horizontal' | 'vertical'

// --- Spritesheet config ---
const SPRITE_URL = '/icons/sprite.png'
const ICON_SIZE = 16
const ICON_COLS = 8

const ICON_INDEX: Record<IconName, number> = {
  new: 0, open: 1, undo: 2, redo: 3, solve: 4, help: 5,
  point: 6, line: 7, circle: 8, arc: 9, delete: 10,
  coincident: 11, parallel: 12, perpendicular: 13, fixed: 14, measurement: 15,
  equals: 16, tangent: 17, horizontal: 18, vertical: 19,
}

function spritePos(name: IconName) {
  const idx = ICON_INDEX[name]
  const x = (idx % ICON_COLS) * ICON_SIZE
  const y = Math.floor(idx / ICON_COLS) * ICON_SIZE
  return { x, y }
}

// --- Utils ---
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function snapGrid(base: number, z: number) {
  const scaled = base / z
  const steps = [1, 2, 5, 10, 20, 50, 100]
  let s = steps[0]
  for (const step of steps) if (scaled > step) s = step
  return s
}

function distance(p1: Vec2, p2: Vec2): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
}


function findBackendPointAt(entities: any[], params: any[], point: Vec2, tolerance: number = 10): { type: 'backend', index: number } | null {
  const getParamValue = (paramIdx: number) => {
    const param = params.find(p => p.id === paramIdx)
    return param ? param.value : 0
  }

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    if (entity.type === 0 && entity.data) { // type 0 = point
      const x = getParamValue(entity.data.x_param)
      const y = getParamValue(entity.data.y_param)
      const dist = distance({ x, y }, point)
      if (dist <= tolerance) {
        return { type: 'backend', index: i }
      }
    }
  }
  return null
}

function findCircleBorderAt(entities: any[], params: any[], point: Vec2, tolerance: number = 5): { entityIndex: number, center: Vec2, radius: number } | null {
  const getParamValue = (paramIdx: number) => {
    const param = params.find(p => p.id === paramIdx)
    return param ? param.value : 0
  }

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    if (entity.type === 2 && entity.data) { // type 2 = circle
      // Get center point entity
      const centerEntity = entities.find(e => e.id === entity.data.center)
      if (!centerEntity || !centerEntity.data) continue

      const centerX = getParamValue(centerEntity.data.x_param)
      const centerY = getParamValue(centerEntity.data.y_param)
      const radius = getParamValue(entity.data.radius_param)

      const center = { x: centerX, y: centerY }
      const distanceFromCenter = distance(center, point)
      const borderDistance = Math.abs(distanceFromCenter - radius)

      if (borderDistance <= tolerance) {
        return { entityIndex: i, center, radius }
      }
    }
  }
  return null
}

function snapToPixelGrid(x: number, y: number, pixelSize: number): [number, number] {
  return [
    Math.floor(x / pixelSize) * pixelSize + pixelSize / 2,
    Math.floor(y / pixelSize) * pixelSize + pixelSize / 2
  ]
}

function quantizeColor(color: string): string {
  // Convert to limited palette for true pixel art look
  if (color === '#ffffff') return '#ffffff' // Keep white
  if (color === '#ff6699') return '#ff0066' // Quantize pink
  if (color.includes('rgba')) {
    // For transparent colors, use solid equivalents
    return '#cccccc'
  }
  return color
}

// Entity sprite system
const ENTITY_SPRITE_URL = '/icons/entities.png'
const ENTITY_SPRITE_SIZE = 8 // 8x8 sprites
const ENTITY_SPRITE_COLS = 8 // 8 columns
let entitySpriteImage: HTMLImageElement | null = null

function loadEntitySprite() {
  if (!entitySpriteImage) {
    entitySpriteImage = new Image()
    entitySpriteImage.src = ENTITY_SPRITE_URL
  }
  return entitySpriteImage
}

function drawEntitySprite(ctx: CanvasRenderingContext2D, x: number, y: number, spriteIndex: number, scale: number = 1) {
  const img = loadEntitySprite()
  if (!img || !img.complete) return false // Return false if not loaded

  const spriteX = (spriteIndex % ENTITY_SPRITE_COLS) * ENTITY_SPRITE_SIZE
  const spriteY = Math.floor(spriteIndex / ENTITY_SPRITE_COLS) * ENTITY_SPRITE_SIZE

  const size = ENTITY_SPRITE_SIZE * scale

  try {
    // Save current smoothing setting
    const prevSmoothing = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false // Ensure crisp sprite rendering

    ctx.drawImage(
      img,
      spriteX, spriteY, ENTITY_SPRITE_SIZE, ENTITY_SPRITE_SIZE,
      x - size/2, y - size/2, size, size
    )

    // Restore smoothing setting
    ctx.imageSmoothingEnabled = prevSmoothing
    return true
  } catch (e) {
    return false // Fallback if drawing fails
  }
}

function drawTexturedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, scale: number = 1) {
  const img = loadEntitySprite()
  if (!img || !img.complete) return false // Return false if not loaded

  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)

  // Fixed texture density - always use base sprite size regardless of scale
  const baseTextureSize = ENTITY_SPRITE_SIZE
  const spriteSize = ENTITY_SPRITE_SIZE * scale

  // Calculate exact number of texture repeats (can be fractional)
  const textureRepeats = length / baseTextureSize
  const numSegments = Math.ceil(textureRepeats)

  try {
    const prevSmoothing = ctx.imageSmoothingEnabled
    // Keep smoothing disabled for crisp pixels
    ctx.imageSmoothingEnabled = false

    // Use sprite index 1 (next to point sprite)
    const spriteX = (1 % ENTITY_SPRITE_COLS) * ENTITY_SPRITE_SIZE
    const spriteY = Math.floor(1 / ENTITY_SPRITE_COLS) * ENTITY_SPRITE_SIZE

    ctx.save()
    ctx.translate(x1, y1)
    ctx.rotate(angle)

    // Draw segments with consistent texture density
    for (let i = 0; i < numSegments; i++) {
      // Calculate position based on texture repeats, not segments
      const segmentStart = (i / textureRepeats) * length
      const segmentEnd = Math.min(((i + 1) / textureRepeats) * length, length)
      const segmentWidth = segmentEnd - segmentStart

      // Calculate how much of the source texture to use
      const textureProgress = (i + 1) / textureRepeats
      const isLastSegment = i === numSegments - 1
      const sourceWidth = isLastSegment && textureProgress > 1
        ? ENTITY_SPRITE_SIZE * (1 - (textureProgress - 1))
        : ENTITY_SPRITE_SIZE

      // Add small overlap to prevent seams
      const overlap = Math.min(1 * scale, segmentWidth * 0.1)
      const drawStart = i === 0 ? segmentStart : segmentStart - overlap
      const drawWidth = i === 0 ? segmentWidth + overlap :
                       isLastSegment ? segmentWidth + overlap : segmentWidth + (2 * overlap)

      ctx.drawImage(
        img,
        spriteX, spriteY, sourceWidth, ENTITY_SPRITE_SIZE,  // Source: potentially partial width
        drawStart, -spriteSize/2, drawWidth, spriteSize     // Dest: with overlap
      )
    }

    ctx.restore()
    ctx.imageSmoothingEnabled = prevSmoothing
    return true
  } catch (e) {
    return false
  }
}

function drawTexturedCircle(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, scale: number = 1, zoom: number = 1) {
  const img = loadEntitySprite()
  if (!img || !img.complete) return false // Return false if not loaded

  const lineWidth = ENTITY_SPRITE_SIZE * scale

  try {
    const prevSmoothing = ctx.imageSmoothingEnabled

    // Use sprite index 1 (same as line texture)
    const spriteX = (1 % ENTITY_SPRITE_COLS) * ENTITY_SPRITE_SIZE
    const spriteY = Math.floor(1 / ENTITY_SPRITE_COLS) * ENTITY_SPRITE_SIZE

    // Use optimized resolution buffer - higher when zoomed in, capped to prevent slowdown
    const bufferScale = Math.min(16, Math.max(4, 8 * zoom)) // Scale up when zoomed in, cap at 16x
    const bufferSize = Math.ceil((radius + lineWidth) * 2 * bufferScale)
    const bufferCanvas = document.createElement('canvas')
    bufferCanvas.width = bufferSize
    bufferCanvas.height = bufferSize
    const bufferCtx = bufferCanvas.getContext('2d')!
    bufferCtx.imageSmoothingEnabled = true // Enable smoothing for smooth texture

    const bufferCenter = bufferSize / 2
    const scaledRadius = radius * bufferScale
    const scaledLineWidth = lineWidth * bufferScale

    // Extract sprite data once
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = ENTITY_SPRITE_SIZE
    tempCanvas.height = ENTITY_SPRITE_SIZE
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(img, spriteX, spriteY, ENTITY_SPRITE_SIZE, ENTITY_SPRITE_SIZE, 0, 0, ENTITY_SPRITE_SIZE, ENTITY_SPRITE_SIZE)
    const spriteImageData = tempCtx.getImageData(0, 0, ENTITY_SPRITE_SIZE, ENTITY_SPRITE_SIZE)

    // Create output image data
    const outputImageData = bufferCtx.createImageData(bufferSize, bufferSize)
    const outputData = outputImageData.data
    const spriteData = spriteImageData.data

    // Draw radially mapped texture with super-smooth sampling
    for (let y = 0; y < bufferSize; y++) {
      for (let x = 0; x < bufferSize; x++) {
        const dx = x - bufferCenter
        const dy = y - bufferCenter
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Check if pixel is within the circle ring
        if (distance >= scaledRadius - scaledLineWidth/2 && distance <= scaledRadius + scaledLineWidth/2) {
          // Calculate angle (0 to 2π) with smooth continuous mapping
          let angle = Math.atan2(dy, dx)
          if (angle < 0) angle += 2 * Math.PI

          // Map angle to horizontal texture coordinate with smooth partial repeating
          const circumference = 2 * Math.PI * (scaledRadius / bufferScale)
          const textureRepeats = circumference / (ENTITY_SPRITE_SIZE * scale)
          const textureU = (angle / (2 * Math.PI)) * ENTITY_SPRITE_SIZE * textureRepeats

          // Map distance to vertical texture coordinate
          const distanceFromInner = distance - (scaledRadius - scaledLineWidth/2)
          const textureV = (distanceFromInner / scaledLineWidth) * ENTITY_SPRITE_SIZE

          // Smooth texture sampling with slight interpolation for anti-aliasing
          const sampleTexture = (u: number, v: number) => {
            // Ensure continuous wrapping for U coordinate
            u = ((u % ENTITY_SPRITE_SIZE) + ENTITY_SPRITE_SIZE) % ENTITY_SPRITE_SIZE
            // Clamp V coordinate
            v = Math.max(0, Math.min(ENTITY_SPRITE_SIZE - 0.001, v))

            // Use minimal bilinear interpolation for smooth edges but crisp texture
            const u1 = Math.floor(u) % ENTITY_SPRITE_SIZE
            const u2 = (u1 + 1) % ENTITY_SPRITE_SIZE
            const v1 = Math.floor(v)
            const v2 = Math.min(ENTITY_SPRITE_SIZE - 1, v1 + 1)

            const uFrac = u - Math.floor(u)
            const vFrac = v - Math.floor(v)

            const getPixel = (pixelU: number, pixelV: number) => {
              const idx = (pixelV * ENTITY_SPRITE_SIZE + pixelU) * 4
              return {
                r: spriteData[idx],
                g: spriteData[idx + 1],
                b: spriteData[idx + 2],
                a: spriteData[idx + 3]
              }
            }

            // Use nearest-neighbor for crisp texture pixels
            const nearestU = Math.round(u) % ENTITY_SPRITE_SIZE
            const nearestV = Math.max(0, Math.min(ENTITY_SPRITE_SIZE - 1, Math.round(v)))

            return getPixel(nearestU, nearestV)
          }

          const final = sampleTexture(textureU, textureV)

          // Set final pixel
          const outputIndex = (y * bufferSize + x) * 4
          outputData[outputIndex] = final.r
          outputData[outputIndex + 1] = final.g
          outputData[outputIndex + 2] = final.b
          outputData[outputIndex + 3] = final.a
        }
      }
    }

    // Draw the result
    bufferCtx.putImageData(outputImageData, 0, 0)

    // Use selective smoothing - smooth for anti-aliasing but preserve texture crispness
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const finalSize = (radius + lineWidth) * 2
    ctx.drawImage(bufferCanvas,
      centerX - finalSize/2, centerY - finalSize/2,
      finalSize, finalSize)

    ctx.imageSmoothingEnabled = prevSmoothing
    return true
  } catch (e) {
    console.error('Circle texture error:', e)
    return false
  }
}



// --- Runtime self-tests ---
function runSelfTests(): string {
  type C<T> = { name: string; got: T; want: T }
  const cases: C<any>[] = [
    { name: 'clamp inside',       got: clamp(5, 0, 10),   want: 5 },
    { name: 'clamp low bound',    got: clamp(-3, 0, 10),  want: 0 },
    { name: 'clamp high bound',   got: clamp(12, 0, 10),  want: 10 },
    { name: 'clamp equal bounds', got: clamp(7, 5, 5),    want: 5 },
    { name: 'snapGrid z=1',       got: snapGrid(10, 1),   want: 5 },
    { name: 'snapGrid z=0.5',     got: snapGrid(10, 0.5), want: 10 },
    { name: 'snapGrid z=2',       got: snapGrid(10, 2),   want: 2 },
    { name: 'snapGrid z=20',      got: snapGrid(10, 20),  want: 1 },
    { name: 'clamp big',          got: clamp(1e9, -1e6, 1e6), want: 1e6 },
    { name: 'snapGrid z tiny',    got: snapGrid(10, 0.1), want: 50 },
    { name: 'distance test',      got: distance({x:0, y:0}, {x:3, y:4}), want: 5 },
  ]
  let pass = 0
  const lines: string[] = []
  for (const c of cases) {
    const ok = Object.is(c.got, c.want)
    pass += ok ? 1 : 0
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  got=${JSON.stringify(c.got)} want=${JSON.stringify(c.want)}`)
  }
  lines.unshift(`[Self-Tests] ${pass}/${cases.length} passing`)
  return lines.join('\n')
}

// --- App ---
export default function App() {
  const [out, setOut] = useState<string>('ready')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [uiScale, setUiScale] = useState<number>(1.4)
  const bumpScale = (d: number) => setUiScale(s => clamp(Math.round((s + d) * 10) / 10, 0.8, 2.5))

  const [zoom, setZoom] = useState<number>(1)
  const [origin, setOrigin] = useState<Vec2>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<Vec2>({ x: 0, y: 0 })
  const originStart = useRef<Vec2>({ x: 0, y: 0 })

  const [tool, setTool] = useState<'select'|'point'|'line'|'circle'|'arc'|'delete'>('select')
  const [constraint, setConstraint] = useState<'none'|'coincident'|'parallel'|'perpendicular'|'fixed'|'measurement'|'equals'|'tangent'|'horizontal'|'vertical'>('none')
  
  const [activeTab, setActiveTab] = useState<'parameters'|'entities'|'constraints'>('entities')
  
  const [rightPanelWidth, setRightPanelWidth] = useState(200)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(200)
  
  const [backendEntities, setBackendEntities] = useState<any[]>([])
  const [backendParams, setBackendParams] = useState<any[]>([])
  const [backendConstraints, setBackendConstraints] = useState<any[]>([])

  const [isDrawingLine, setIsDrawingLine] = useState(false)
  const [lineStart, setLineStart] = useState<Vec2 | null>(null)
  const [tempLineEnd, setTempLineEnd] = useState<Vec2 | null>(null)

  const [isDrawingArc, setIsDrawingArc] = useState(false)
  const [arcCenter, setArcCenter] = useState<Vec2 | null>(null)
  const [arcRadius, setArcRadius] = useState<number | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [draggedPoint, setDraggedPoint] = useState<{ type: 'local' | 'backend', index: number } | null>(null)
  const [dragStartPos, setDragStartPos] = useState<Vec2 | null>(null)
  const [dragCurrentPos, setDragCurrentPos] = useState<Vec2 | null>(null)

  const [hoveredPoint, setHoveredPoint] = useState<{ type: 'backend', index: number } | null>(null)
  const [isEditingCircle, setIsEditingCircle] = useState(false)
  const [editedCircle, setEditedCircle] = useState<{ entityIndex: number, initialRadius: number } | null>(null)






  const [isPixelated, setIsPixelated] = useState<boolean>(false)
  const [currentFont, setCurrentFont] = useState<string>('RetroGaming')

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function appendConsole(msg: string) {
    setOut(prev => `${prev}\n${msg}`)
  }

  async function call(path: string, init?: RequestInit) {
    try {
      const r = await fetch(path, init)
      const text = await r.text()
      appendConsole(`$ ${init?.method ?? 'GET'} ${path}\n${text}`)
    } catch (e: any) {
      appendConsole(`! Request failed: ${e?.message ?? e}`)
    }
  }

  useEffect(() => { appendConsole(runSelfTests()) }, [])

  async function fetchBackendData() {
    try {
      const [entitiesRes, paramsRes, constraintsRes] = await Promise.all([
        fetch('/api/sketch/entities'),
        fetch('/api/sketch/parameters'),
        fetch('/api/sketch/constraints')
      ])

      if (entitiesRes.ok) {
        const entities = await entitiesRes.json()
        setBackendEntities(entities)
        appendConsole(`Fetched ${entities.length} entities: ${JSON.stringify(entities)}`)
      } else {
        appendConsole(`! Entities fetch failed: ${entitiesRes.status}`)
      }

      if (paramsRes.ok) {
        const params = await paramsRes.json()
        setBackendParams(params)
        appendConsole(`Fetched ${params.length} parameters: ${JSON.stringify(params)}`)
      } else {
        appendConsole(`! Parameters fetch failed: ${paramsRes.status}`)
      }

      if (constraintsRes.ok) {
        const constraints = await constraintsRes.json()
        setBackendConstraints(constraints)
        appendConsole(`Fetched ${constraints.length} constraints`)
      } else {
        appendConsole(`! Constraints fetch failed: ${constraintsRes.status}`)
      }
    } catch (e: any) {
      appendConsole(`! Failed to fetch backend data: ${e?.message ?? e}`)
    }
  }

  async function updateBackendPoint(entityIndex: number, newPosition: Vec2) {
    const entity = backendEntities[entityIndex]
    if (!entity || entity.type !== 0 || !entity.data) return

    const xParamId = entity.data.x_param
    const yParamId = entity.data.y_param

    try {
      // Update both x and y parameters
      const updatePromises = [
        fetch(`/api/sketch/parameters/${xParamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: newPosition.x })
        }),
        fetch(`/api/sketch/parameters/${yParamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: newPosition.y })
        })
      ]

      const [xRes, yRes] = await Promise.all(updatePromises)

      if (xRes.ok && yRes.ok) {
        // Refresh backend data to get updated values
        fetchBackendData()
      } else {
        appendConsole(`! Failed to update point parameters: ${xRes.status}, ${yRes.status}`)
      }
    } catch (e: any) {
      appendConsole(`! Error updating backend point: ${e?.message ?? e}`)
    }
  }

  async function addBackendPoint(position: Vec2) {
    try {
      const response = await fetch('/api/sketch/entities/point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: position.x, y: position.y })
      })

      if (response.ok) {
        const result = await response.json()
        appendConsole(`✓ Created point at (${position.x}, ${position.y})`)
        // Refresh backend data to get the new point
        fetchBackendData()
      } else {
        const errorText = await response.text()
        appendConsole(`! Failed to create point: ${response.status} ${errorText}`)
      }
    } catch (e: any) {
      appendConsole(`! Error creating backend point: ${e?.message ?? e}`)
    }
  }

  async function addBackendLine(p1: Vec2, p2: Vec2) {
    try {
      const response = await fetch('/api/sketch/entities/line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
      })

      if (response.ok) {
        const result = await response.json()
        appendConsole(`✓ Created line from (${p1.x}, ${p1.y}) to (${p2.x}, ${p2.y})`)
        // Refresh backend data to get the new line
        fetchBackendData()
      } else {
        const errorText = await response.text()
        appendConsole(`! Failed to create line: ${response.status} ${errorText}`)
      }
    } catch (e: any) {
      appendConsole(`! Error creating backend line: ${e?.message ?? e}`)
    }
  }

  async function addBackendCircle(center: Vec2, radius: number) {
    try {
      const response = await fetch('/api/sketch/entities/circle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: center.x, y: center.y, radius: radius })
      })

      if (response.ok) {
        const result = await response.json()
        appendConsole(`✓ Created circle at (${center.x}, ${center.y}) with radius ${radius}`)
        // Refresh backend data to get the new circle
        fetchBackendData()
      } else {
        const errorText = await response.text()
        appendConsole(`! Failed to create circle: ${response.status} ${errorText}`)
      }
    } catch (e: any) {
      appendConsole(`! Error creating backend circle: ${e?.message ?? e}`)
    }
  }

  async function updateCircleRadius(entityIndex: number, newRadius: number) {
    const entity = backendEntities[entityIndex]
    if (!entity || entity.type !== 2 || !entity.data) return

    const radiusParamId = entity.data.radius_param

    try {
      const response = await fetch(`/api/sketch/parameters/${radiusParamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newRadius })
      })

      if (response.ok) {
        // Refresh backend data to get updated values
        fetchBackendData()
      } else {
        appendConsole(`! Failed to update circle radius: ${response.status}`)
      }
    } catch (e: any) {
      appendConsole(`! Error updating circle radius: ${e?.message ?? e}`)
    }
  }

  async function updateParameterValue(paramId: number, newValue: number) {
    try {
      const response = await fetch(`/api/sketch/parameters/${paramId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue })
      })

      if (response.ok) {
        fetchBackendData()
        appendConsole(`✓ Updated parameter ${paramId} to ${newValue}`)
      } else {
        appendConsole(`! Failed to update parameter ${paramId}: ${response.status}`)
      }
    } catch (e: any) {
      appendConsole(`! Error updating parameter: ${e?.message ?? e}`)
    }
  }

  useEffect(() => {
    fetchBackendData()
  }, [])

  function onResizeStart(e: React.MouseEvent) {
    setIsResizing(true)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = rightPanelWidth
  }

  useEffect(() => {
    if (!isResizing) return

    function onResizeMove(e: MouseEvent) {
      e.preventDefault()
      const delta = resizeStartX.current - e.clientX
      const newWidth = Math.max(150, Math.min(600, resizeStartWidth.current + delta))
      setRightPanelWidth(newWidth)
    }

    function onResizeEnd() {
      setIsResizing(false)
    }

    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeEnd)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onResizeMove)
      window.removeEventListener('mouseup', onResizeEnd)
    }
  }, [isResizing])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')!

    const w = cvs.clientWidth
    const h = cvs.clientHeight

    if (isPixelated) {
      // Pixelated rendering: use very low resolution for chunky pixels
      const pixelSize = 4 // Each pixel will be 4x4 screen pixels
      const pixelW = Math.floor(w / pixelSize)
      const pixelH = Math.floor(h / pixelSize)

      if (cvs.width !== pixelW || cvs.height !== pixelH) {
        cvs.width = pixelW
        cvs.height = pixelH
      }

      // Disable all smoothing completely
      ctx.imageSmoothingEnabled = false
      const scale = 1 / pixelSize
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
    } else {
      // Normal rendering: use device pixel ratio for crisp rendering
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const highResW = Math.floor(w * dpr)
      const highResH = Math.floor(h * dpr)

      if (cvs.width !== highResW || cvs.height !== highResH) {
        cvs.width = highResW
        cvs.height = highResH
      }

      ctx.imageSmoothingEnabled = true
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const BG = '#3d4a8c'
    const LINE = '#ffffff'
    const BACKEND_COLOR = '#ff6699'

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(w/2 + origin.x, h/2 + origin.y)
    ctx.scale(zoom, zoom)

    drawGrid(ctx, w, h, zoom, origin)

    // Draw backend entities - lines and circles first (without points)
    for (let i = 0; i < backendEntities.length; i++) {
      drawBackendEntity(ctx, backendEntities[i], backendParams, backendEntities, BACKEND_COLOR, zoom, false, i)
    }


    // Then draw all points on top (backend first, then local)
    for (let i = 0; i < backendEntities.length; i++) {
      if (backendEntities[i].type === 0) {
        drawBackendEntity(ctx, backendEntities[i], backendParams, backendEntities, BACKEND_COLOR, zoom, true, i)
      }
    }

    // Drawing preview
    if (isDrawingLine && lineStart && tempLineEnd) {
      // Try textured line for preview, fallback to regular
      const scale = Math.max(0.5, 2 / zoom)
      const textureDrawn = drawTexturedLine(ctx, lineStart.x, -lineStart.y, tempLineEnd.x, -tempLineEnd.y, scale)

      if (!textureDrawn) {
        // Fallback to regular line
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 2/zoom
        ctx.beginPath()
        ctx.moveTo(lineStart.x, -lineStart.y)
        ctx.lineTo(tempLineEnd.x, -tempLineEnd.y)
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [origin, zoom, isDrawingLine, lineStart, tempLineEnd, backendEntities, backendParams, isPixelated, isDragging, draggedPoint, dragCurrentPos, hoveredPoint, tool, isEditingCircle])

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, z: number, originLocal: Vec2) {
    const viewW = w / z
    const viewH = h / z
    const minor = snapGrid(40, z)
    ctx.save()
    const left = - (w/2 + originLocal.x) / z
    const top = - (h/2 + originLocal.y) / z
    ctx.strokeStyle = '#c2c0c348'
    ctx.lineWidth = 1/z
    ctx.beginPath()
    for (let x = Math.floor(left / minor) * minor; x < left + viewW; x += minor) {
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + viewH)
    }
    for (let y = Math.floor(top / minor) * minor; y < top + viewH; y += minor) {
      ctx.moveTo(left, y)
      ctx.lineTo(left + viewW, y)
    }
    ctx.stroke()
    ctx.restore()
  }


  function drawBackendEntity(ctx: CanvasRenderingContext2D, ent: any, params: any[], entities: any[], color: string, z: number, drawPoints: boolean = true, entityIndex: number = -1) {
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 3 / z

    const getParamValue = (paramIdx: number) => {
      const param = params.find(p => p.id === paramIdx)
      return param ? param.value : 0
    }

    const getEntityPoint = (entIdx: number): Vec2 | null => {
      const entity = entities.find(e => e.id === entIdx)
      if (!entity || entity.type !== 0) return null
      return {
        x: getParamValue(entity.data.x_param),
        y: getParamValue(entity.data.y_param)
      }
    }

    switch (ent.type) {
      case 0:
        if (ent.data && drawPoints) {
          let x = getParamValue(ent.data.x_param)
          let y = getParamValue(ent.data.y_param)

          // If this point is being dragged, use the drag position instead
          if (isDragging && draggedPoint?.type === 'backend' && draggedPoint?.index === entityIndex && dragCurrentPos) {
            x = dragCurrentPos.x
            y = dragCurrentPos.y
          }

          // Check if this point is hovered for highlighting
          const isHovered = hoveredPoint?.type === 'backend' && hoveredPoint?.index === entityIndex

          if (isHovered && tool === 'select') {
            // Draw sprite with yellow colorization
            ctx.save()
            ctx.filter = 'sepia(1) saturate(2) hue-rotate(40deg)'
            const scale = Math.max(0.5, 3 / z)
            const spriteDrawn = drawEntitySprite(ctx, x, -y, 0, scale)
            ctx.restore()

            if (!spriteDrawn) {
              // Fallback with yellow color
              ctx.fillStyle = '#FFFF00'
              const pointSize = 3 / z
              ctx.fillRect(x - pointSize/2, -y - pointSize/2, pointSize, pointSize)
            }
          } else {
            // Normal rendering
            const scale = Math.max(0.5, 3 / z)
            const spriteDrawn = drawEntitySprite(ctx, x, -y, 0, scale)

            if (!spriteDrawn) {
              // Fallback to rectangle if sprite fails
              const pointSize = 3 / z
              ctx.fillRect(x - pointSize/2, -y - pointSize/2, pointSize, pointSize)
            }
          }
        }
        break
      
      case 1:
        if (ent.data) {
          const p1 = getEntityPoint(ent.data.p1)
          const p2 = getEntityPoint(ent.data.p2)
          if (p1 && p2) {
            // Try to use textured line, fallback to regular line
            const scale = Math.max(0.5, 3 / z)
            const textureDrawn = drawTexturedLine(ctx, p1.x, -p1.y, p2.x, -p2.y, scale)

            if (!textureDrawn) {
              // Fallback to regular line if texture fails
              ctx.beginPath()
              ctx.moveTo(p1.x, -p1.y)
              ctx.lineTo(p2.x, -p2.y)
              ctx.stroke()
            }
          }
        }
        break
      
      case 2:
        if (ent.data) {
          const center = getEntityPoint(ent.data.center)
          const radius = getParamValue(ent.data.radius_param)
          if (center) {
            // Try to use textured circle, fallback to regular circle
            const scale = Math.max(0.5, 3 / z)
            const textureDrawn = drawTexturedCircle(ctx, center.x, -center.y, radius, scale, z)

            if (!textureDrawn) {
              // Fallback to regular circle if texture fails
              ctx.beginPath()
              ctx.arc(center.x, -center.y, radius, 0, Math.PI * 2)
              ctx.stroke()
            }
          }
        }
        break
      
      case 3:
        if (ent.data) {
          const p1 = getEntityPoint(ent.data.p1)
          const p2 = getEntityPoint(ent.data.p2)
          const p3 = getEntityPoint(ent.data.p3)
          if (p1 && p2 && p3) {
            ctx.beginPath()
            ctx.moveTo(p1.x, -p1.y)
            ctx.lineTo(p2.x, -p2.y)
            ctx.lineTo(p3.x, -p3.y)
            ctx.stroke()
          }
        }
        break
    }
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = (clientX - rect.left) - rect.width/2
    const y = (clientY - rect.top) - rect.height/2
    return { x: (x - origin.x)/zoom, y: -(y - origin.y)/zoom }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const delta = -e.deltaY
    const scaleFactor = Math.exp(delta * 0.001)
    const before = screenToWorld(e.clientX, e.clientY)
    setZoom(prev => {
      const next = clamp(prev * scaleFactor, 0.2, 10)
      const afterScale = next / prev
      setOrigin(o => ({
        x: (o.x - before.x * prev) * afterScale + before.x * next,
        y: (o.y - before.y * prev) * afterScale + before.y * next,
      }))
      return next
    })
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button === 1 || e.button === 2) {
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      originStart.current = { ...origin }
      return
    }
    if (e.button === 0) {
      const p = screenToWorld(e.clientX, e.clientY)

      // Check if clicking on a point for dragging or circle border for radius editing (only in select mode)
      if (tool === 'select') {
        const tolerance = Math.max(20, 50 / zoom)

        // First check for circle border click
        const circleBorder = findCircleBorderAt(backendEntities, backendParams, p, 10)
        if (circleBorder !== null) {
          console.log(`Starting circle radius edit for entity ${circleBorder.entityIndex}`)
          setIsEditingCircle(true)
          setEditedCircle({ entityIndex: circleBorder.entityIndex, initialRadius: circleBorder.radius })
          return
        }

        // Then try backend point dragging
        const backendPoint = findBackendPointAt(backendEntities, backendParams, p, tolerance)
        if (backendPoint !== null) {
          console.log(`Starting drag of backend point ${backendPoint.index}`)
          setIsDragging(true)
          setDraggedPoint(backendPoint)
          setDragStartPos(p)
          return
        }
      }

      if (tool === 'point') {
        addBackendPoint(p)
      } else if (tool === 'line') {
        if (!isDrawingLine) {
          setIsDrawingLine(true)
          setLineStart(p)
          setTempLineEnd(p)
        } else {
          if (lineStart) {
            addBackendLine(lineStart, p)
          }
          setIsDrawingLine(false)
          setLineStart(null)
          setTempLineEnd(null)
        }
      } else if (tool === 'circle') {
        addBackendCircle(p, 30)
      } else if (tool === 'arc') {
        appendConsole('Arc creation not yet implemented for backend')
      } else if (tool === 'delete') {
        appendConsole('Delete not yet implemented for backend')
      }
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = screenToWorld(e.clientX, e.clientY)

    if (isPanning) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setOrigin({ x: originStart.current.x + dx, y: originStart.current.y + dy })
    } else if (isDragging && draggedPoint !== null) {
      setDragCurrentPos(p)
      // For backend points, we just track position for visual feedback
    } else if (isEditingCircle && editedCircle !== null) {
      // Update circle radius based on distance from center
      const entity = backendEntities[editedCircle.entityIndex]
      if (entity && entity.type === 2) {
        const centerEntity = backendEntities.find(e => e.id === entity.data.center)
        if (centerEntity && centerEntity.data) {
          const getParamValue = (paramIdx: number) => {
            const param = backendParams.find(p => p.id === paramIdx)
            return param ? param.value : 0
          }

          const centerX = getParamValue(centerEntity.data.x_param)
          const centerY = getParamValue(centerEntity.data.y_param)
          const newRadius = distance({ x: centerX, y: centerY }, p)

          if (newRadius > 1) { // Minimum radius
            updateCircleRadius(editedCircle.entityIndex, newRadius)
          }
        }
      }
    } else if (isDrawingLine && lineStart) {
      setTempLineEnd(p)
    } else if (tool === 'select') {
      // Update hover state for point highlighting
      const tolerance = Math.max(20, 50 / zoom)
      const hoveredBackendPoint = findBackendPointAt(backendEntities, backendParams, p, tolerance)
      if (hoveredBackendPoint !== hoveredPoint) {
        console.log('Hover changed:', hoveredBackendPoint)
        setHoveredPoint(hoveredBackendPoint)
      }
    }
  }
  
  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    setIsPanning(false)
    if (isDragging && draggedPoint !== null) {
      const p = screenToWorld(e.clientX, e.clientY)

      if (draggedPoint.type === 'backend') {
        // Update backend point via API
        console.log(`Updating backend point ${draggedPoint.index} to (${p.x}, ${p.y})`)
        updateBackendPoint(draggedPoint.index, p)
      }
    }
    if (isEditingCircle) {
      console.log('Finished circle radius editing')
      setIsEditingCircle(false)
      setEditedCircle(null)
    }
    setIsDragging(false)
    setDraggedPoint(null)
    setDragStartPos(null)
    setDragCurrentPos(null)
  }
  function onMouseLeave() {
    setIsPanning(false)
    setIsDragging(false)
    setDraggedPoint(null)
    setDragStartPos(null)
    setDragCurrentPos(null)
    setHoveredPoint(null)
    setIsEditingCircle(false)
    setEditedCircle(null)
  }

  function clearAll() { appendConsole('Clear all not implemented for backend') }

  function openFromFile(files: FileList | null) {
    appendConsole('Open file not implemented for backend')
  }

  function saveToFile() {
    appendConsole('Save file not implemented for backend')
  }

  const actions = {
    onNew: clearAll,
    onOpen: () => fileInputRef.current?.click(),
    onUndo: () => appendConsole('Undo not implemented for backend'),
    onRedo: () => appendConsole('Redo not implemented for backend'),
    onSolve: () => {
      call('/api/solve/quad', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ a: 1, b: 0, c: -1 }) })
      setTimeout(() => fetchBackendData(), 100)
    },
    onHelp: () => appendConsole('Help: Left-click to create points (backend managed). Select tool to drag points. Middle/Right drag to pan. Wheel to zoom.'),
    onTogglePixelated: () => setIsPixelated(!isPixelated),
  }

  return (
    <div style={{...styles.app, ['--ui-scale' as any]: uiScale, fontFamily: `"${currentFont}", "Courier New", monospace`}} className="blueprint">
      <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => openFromFile(e.target.files)} />
      <TopBar actions={actions} onSave={saveToFile} onBumpScale={bumpScale} isPixelated={isPixelated} currentFont={currentFont} onFontChange={setCurrentFont} />
      <div style={styles.bodyRow}>
        <aside style={styles.side}>
          <LeftPanel setTool={setTool} tool={tool} setConstraint={setConstraint} constraint={constraint} />
        </aside>
        <div style={styles.centerCol}>
          <div style={styles.viewportWrap} className={isPixelated ? 'pixelated-container' : ''}>
            <canvas
              ref={canvasRef}
              className={isPixelated ? 'pixelated-canvas' : ''}
              style={{
                ...styles.canvas,
                imageRendering: isPixelated ? 'pixelated' : 'auto',
                // Force pixelated scaling
                ...(isPixelated && {
                  imageRendering: 'pixelated',
                  filter: 'none'
                })
              }}
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>
        <div style={{ position: 'relative', width: rightPanelWidth, flexShrink: 0 }}>
          <div 
            className="resize-handle"
            onMouseDown={onResizeStart}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '6px',
              cursor: 'ew-resize',
              zIndex: 10
            }}
          />
          <RightPanel

            activeTab={activeTab}
            setActiveTab={setActiveTab}
            backendEntities={backendEntities}
            backendParams={backendParams}
            backendConstraints={backendConstraints}
            updateParameterValue={updateParameterValue}
          />
        </div>
      </div>
      <Console out={out} />
      <StyleTag />
    </div>
  )
}

function TopBar({ actions, onSave, onBumpScale, isPixelated, currentFont, onFontChange }:{
  actions: {
    onNew: ()=>void;
    onOpen: ()=>void;
    onUndo: ()=>void;
    onRedo: ()=>void;
    onSolve: ()=>void;
    onHelp: ()=>void;
    onTogglePixelated: ()=>void;
  },
  onSave: ()=>void,
  onBumpScale: (d:number)=>void,
  isPixelated: boolean,
  currentFont: string,
  onFontChange: (font: string) => void
}) {
  return (
    <div style={styles.topBar}>
      <div style={styles.logo}>free_form</div>
      <div style={styles.topBtns}>
        <IconButton name="new"   title="New" onClick={actions.onNew} />
        <IconButton name="open"  title="Open (JSON)" onClick={actions.onOpen} />
        <IconButton name="undo"  title="Undo" onClick={actions.onUndo} />
        <IconButton name="redo"  title="Redo" onClick={actions.onRedo} />
        <IconButton name="solve" title="Solve (API demo)" onClick={actions.onSolve} />
        <IconButton name="help"  title="Help" onClick={actions.onHelp} />
        <div className="sep" />
        <button
          className="icon-btn"
          aria-label={`Toggle ${isPixelated ? 'smooth' : 'pixelated'} rendering`}
          title={`Switch to ${isPixelated ? 'smooth' : 'pixelated'} rendering`}
          onClick={actions.onTogglePixelated}
          style={{ backgroundColor: isPixelated ? 'rgba(255,255,255,0.2)' : 'transparent' }}
        >
          PX
        </button>
        <div className="sep" />
        <select
          value={currentFont}
          onChange={(e) => onFontChange(e.target.value)}
          style={{
            background: '#5762c8',
            border: '1px solid #ffffff',
            color: '#ffffff',
            padding: '2px 4px',
            fontSize: 'calc(9px * var(--ui-scale))',
            fontFamily: 'inherit'
          }}
          title="Change font"
        >
          <option value="PxFont" style={{ background: '#5762c8', color: '#ffffff' }}>PxFont</option>
          <option value="Alagard" style={{ background: '#5762c8', color: '#ffffff' }}>Alagard</option>
          <option value="Aurora" style={{ background: '#5762c8', color: '#ffffff' }}>Aurora</option>
          <option value="Bit23" style={{ background: '#5762c8', color: '#ffffff' }}>Bit-23</option>
          <option value="DePixelBreit" style={{ background: '#5762c8', color: '#ffffff' }}>DePixelBreit</option>
          <option value="Pixellari" style={{ background: '#5762c8', color: '#ffffff' }}>Pixellari</option>
          <option value="RetroGaming" style={{ background: '#5762c8', color: '#ffffff' }}>Retro Gaming</option>
          <option value="VCR" style={{ background: '#5762c8', color: '#ffffff' }}>VCR OSD Mono</option>
          <option value="WindowsBold" style={{ background: '#5762c8', color: '#ffffff' }}>Windows Bold</option>
        </select>
        <div className="sep" />
        <button className="icon-btn" aria-label="UI smaller" title="UI smaller" onClick={()=>onBumpScale(-0.1)}>A-</button>
        <button className="icon-btn" aria-label="UI larger"  title="UI larger"  onClick={()=>onBumpScale(+0.1)}>A+</button>
      </div>
    </div>
  )
}

function LeftPanel({ setTool, tool, setConstraint, constraint }:{
  setTool:(t: 'select'|'point'|'line'|'circle'|'arc'|'delete')=>void;
  tool: 'select'|'point'|'line'|'circle'|'arc'|'delete';
  setConstraint:(c: 'none'|'coincident'|'parallel'|'perpendicular'|'fixed'|'measurement'|'equals'|'tangent'|'horizontal'|'vertical')=>void;
  constraint: 'none'|'coincident'|'parallel'|'perpendicular'|'fixed'|'measurement'|'equals'|'tangent'|'horizontal'|'vertical';
}) {
  return (
    <>
      <div style={styles.sectionHeader}>Tools</div>
      <div className="icon-grid">
        <button
          className="icon-btn"
          title="Select/Move"
          onClick={() => setTool('select')}
          style={{
            backgroundColor: tool === 'select' ? 'rgba(255,255,255,0.2)' : 'transparent',
            fontSize: 'calc(9px * var(--ui-scale))',
            fontFamily: 'inherit'
          }}
        >
          SEL
        </button>
        <IconButton name="point"  title="Point" onClick={() => setTool('point')} />
        <IconButton name="line"   title="Line" onClick={() => setTool('line')} />
        <IconButton name="circle" title="Circle" onClick={() => setTool('circle')} />
        <IconButton name="arc"    title="Arc" onClick={() => setTool('arc')} />
        <IconButton name="delete" title="Delete last" onClick={() => setTool('delete')} />
      </div>
      <div style={styles.sectionHeader}>Active Tool</div>
      <div style={{ padding: '4px 6px', fontSize: 11 }}>Tool: <b>{tool}</b></div>
      
      <div style={styles.sectionHeader}>Constraints</div>
      <div className="constraint-grid">
        <IconButton name="coincident"    title="Coincident" onClick={() => setConstraint('coincident')} />
        <IconButton name="parallel"      title="Parallel" onClick={() => setConstraint('parallel')} />
        <IconButton name="perpendicular" title="Perpendicular" onClick={() => setConstraint('perpendicular')} />
        <IconButton name="fixed"         title="Fixed" onClick={() => setConstraint('fixed')} />
        <IconButton name="measurement"   title="Measurement" onClick={() => setConstraint('measurement')} />
        <IconButton name="equals"        title="Equals" onClick={() => setConstraint('equals')} />
        <IconButton name="tangent"       title="Tangent" onClick={() => setConstraint('tangent')} />
        <IconButton name="horizontal"    title="Horizontal" onClick={() => setConstraint('horizontal')} />
        <IconButton name="vertical"      title="Vertical" onClick={() => setConstraint('vertical')} />
      </div>
      <div style={styles.sectionHeader}>Active Constraint</div>
      <div style={{ padding: '4px 6px', fontSize: 11 }}>Constraint: <b>{constraint}</b></div>
    </>
  )
}

function RightPanel({ activeTab, setActiveTab, backendEntities, backendParams, backendConstraints, updateParameterValue }:{
  activeTab: 'parameters'|'entities'|'constraints';
  setActiveTab: (tab: 'parameters'|'entities'|'constraints') => void;
  backendEntities: any[];
  backendParams: any[];
  backendConstraints: any[];
  updateParameterValue: (paramId: number, newValue: number) => Promise<void>;
}) {
  
  const getEntityTypeName = (type: number) => {
    const types = ['PT', 'LN', 'CR', 'AR']
    return types[type] || 'UNKNOWN'
  }

  return (
    <aside style={{...styles.side, width: '100%'}}>
      <div style={styles.tabContainer}>
        <button 
          className={`tab-btn ${activeTab === 'parameters' ? 'active' : ''}`}
          onClick={() => setActiveTab('parameters')}
        >
          Params
        </button>
        <button 
          className={`tab-btn ${activeTab === 'entities' ? 'active' : ''}`}
          onClick={() => setActiveTab('entities')}
        >
          Entities
        </button>
        <button 
          className={`tab-btn ${activeTab === 'constraints' ? 'active' : ''}`}
          onClick={() => setActiveTab('constraints')}
        >
          Constr.
        </button>
      </div>
      
      {activeTab === 'parameters' && (
        <div style={styles.tabContent}>
          <div style={styles.sectionHeader}>Parameters (Backend)</div>
          <div style={styles.listStyle}>
            {backendParams.map((param, i) => (
              <div key={param.id} style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '3px',
                fontSize: '11px'
              }}>
                <span style={{ minWidth: '25px', color: '#ffffff', display: 'inline-block' }}>
                  x{param.id}
                </span>
                <span style={{ color: '#ffffff' }}>
                  =
                </span>
                <input
                  key={`param-${param.id}-${param.value.toFixed(3)}`}
                  type="text"
                  defaultValue={param.value.toFixed(3)}
                  onBlur={(e) => {
                    const newValue = parseFloat(e.target.value)
                    if (!isNaN(newValue) && newValue !== param.value) {
                      updateParameterValue(param.id, newValue)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    }
                  }}
                  style={{
                    marginLeft: '8px',
                    width: '70px',
                    padding: '2px 4px',
                    fontSize: '11px',
                    fontFamily: '"PxFont", "Courier New", monospace',
                    backgroundColor: '#5762c8',
                    color: '#ffffff',
                    border: '1px solid #ffffff',
                    outline: 'none'
                  }}
                />
              </div>
            ))}
            {!backendParams.length && <div style={{ opacity: 0.6, fontSize: '11px' }}>No parameters defined</div>}
          </div>
          <div style={styles.infoText}>
            Parameters are variables that can be constrained and solved by the system.
          </div>
        </div>
      )}
      
      {activeTab === 'entities' && (
        <div style={styles.tabContent}>
          <div style={styles.sectionHeader}>Entities (Backend)</div>
          <ul style={styles.listStyle}>
            {backendEntities.map((ent, i) => (
              <li key={i}>
                {getEntityTypeName(ent.type)}.{ent.id}
                {ent.type === 0 && ent.data && ` (x:p${ent.data.x_param}, y:p${ent.data.y_param})`}
                {ent.type === 1 && ent.data && ` (p${ent.data.p1} → p${ent.data.p2})`}
                {ent.type === 2 && ent.data && ` (c:e${ent.data.center}, r:p${ent.data.radius_param})`}
              </li>
            ))}
            {!backendEntities.length && <li style={{ opacity: 0.6 }}>No entities in backend</li>}
          </ul>
        </div>
      )}
      
      {activeTab === 'constraints' && (
        <div style={styles.tabContent}>
          <div style={styles.sectionHeader}>Constraints (Backend)</div>
          <ul style={styles.listStyle}>
            {backendConstraints.map((cons, i) => (
              <li key={i}>
                f_{cons.id} type={cons.type}
                {cons.error !== undefined && ` err=${cons.error.toFixed(6)}`}
              </li>
            ))}
            {!backendConstraints.length && <li style={{ opacity: 0.6 }}>No constraints applied</li>}
          </ul>
          <div style={styles.infoText}>
            Select entities and apply constraints to define relationships between them.
          </div>
        </div>
      )}
    </aside>
  )
}

function Console({ out }:{ out: string }) {
  return (
    <div style={styles.console}>
      <div style={styles.sectionHeader}>Console</div>
      <pre className="console-pre">{out}</pre>
    </div>
  )
}

function IconButton({ name, title, onClick }:{ name: IconName; title: string; onClick?: () => void }) {
  const { x, y } = spritePos(name)
  return (
    <button className="icon-btn" aria-label={title} title={title} onClick={onClick}>
      <span
        className="icon-sprite"
        style={{
          backgroundImage: `url(${SPRITE_URL})`,
          backgroundPosition: `-${x}px -${y}px`,
          backgroundSize: `128px auto`,
          transform: 'scale(2)',
          transformOrigin: 'center',
        }}
      />
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#5762c8', color: '#ffffff', fontFamily: '"PxFont", "Courier New", monospace' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', borderBottom: '2px solid #ffffff', background: '#5762c8' },
  logo: { fontWeight: 700, color: '#ffffff' },
  topBtns: { display: 'flex', gap: 3 },
  bodyRow: { flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' },
  side: { width: 200, borderRight: '2px solid #ffffff', borderLeft: '2px solid #ffffff', background: '#5762c8', minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  centerCol: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' },
  viewportWrap: { flex: 1, position: 'relative', background: '#3d4a8c' },
  canvas: { width: '100%', height: '100%', display: 'block', cursor: 'crosshair' },
  console: { height: 110, borderTop: '2px solid #ffffff', background: '#5762c8', display: 'flex', flexDirection: 'column' },
  sectionHeader: { padding: '3px 6px', borderBottom: '2px solid #ffffff', background: '#5762c8', color: '#ffffff', fontSize: 11, fontWeight: 'bold' },
  tabContainer: { display: 'flex', background: '#5762c8' },
  tabContent: { display: 'flex', flexDirection: 'column', flex: 1 },
  listStyle: { padding: '3px 10px', margin: 0, listStyle: 'disc', fontSize: 11 },
  infoText: { padding: '4px 6px', fontSize: 10, opacity: 0.8 },
}

function StyleTag() {
  return (
    <style>{`
      @font-face {
        font-family: 'PxFont';
        src: url('/fonts/pxfont.woff2') format('woff2');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'Alagard';
        src: url('/fonts/alagard.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'Aurora';
        src: url('/fonts/aurora-24.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'Bit23';
        src: url('/fonts/Bit-23.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'DePixelBreit';
        src: url('/fonts/DePixelBreit.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'Pixellari';
        src: url('/fonts/Pixellari.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'RetroGaming';
        src: url('/fonts/Retro Gaming.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'VCR';
        src: url('/fonts/VCR_OSD_MONO_1.001.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: 'WindowsBold';
        src: url('/fonts/windows-bold[1].ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      .blueprint {
        --ui-scale: var(--ui-scale, 1);
        font-size: calc(11px * var(--ui-scale));
        color: #ffffff;
        font-family: 'PxFont', "Courier New", monospace;
      }

      :root .blueprint { --btn: calc(32px * var(--ui-scale)); }

      .icon-btn {
        width: var(--btn); 
        height: var(--btn); 
        display: inline-grid; 
        place-items: center;
        padding: 0; 
        background: url('/icons/button-bg.png') center center no-repeat;
        background-size: 100% 100%;
        border: none;
        cursor: pointer;
        border-radius: 0;
        transition: all 0.1s ease;
        image-rendering: pixelated;
      }
      .icon-btn:hover { 
        transform: scale(1.05);
        filter: brightness(1.1);
      }
      .icon-btn:active {
        transform: scale(0.98);
        filter: brightness(0.9);
      }

      .icon-sprite {
        display: inline-block;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        background-repeat: no-repeat;
        width: 16px;
        height: 16px;
        pointer-events: none;
      }

      .console-pre { margin:0; padding: calc(4px * var(--ui-scale)); flex:1; color:#ffffff; background:transparent; white-space:pre-wrap; overflow:auto; font-size: 1em }
      .icon-grid { display:grid; grid-template-columns: repeat(3, var(--btn)); justify-content:start; gap: calc(4px * var(--ui-scale)); padding: calc(4px * var(--ui-scale)); }
      .constraint-grid { display:grid; grid-template-columns: repeat(3, var(--btn)); justify-content:start; gap: calc(3px * var(--ui-scale)); padding: calc(4px * var(--ui-scale)); }
      .sep { width: calc(6px * var(--ui-scale)); }
      
      .tab-btn {
        flex: 1;
        padding: calc(3px * var(--ui-scale)) calc(3px * var(--ui-scale));
        background: rgba(255,255,255,0.1);
        border: calc(1px * var(--ui-scale)) solid #ffffff;
        border-bottom: none;
        color: #ffffff;
        cursor: pointer;
        font-family: 'PxFont', "Courier New", monospace;
        font-size: calc(9px * var(--ui-scale));
        transition: background-color 0.1s ease;
      }
      .tab-btn:hover {
        background: rgba(255,255,255,0.2);
      }
      .tab-btn.active {
        background: rgba(255,255,255,0.15);
        font-weight: bold;
      }
      
      .resize-handle {
        background: transparent;
        transition: background-color 0.2s ease;
        pointer-events: auto;
      }
      .resize-handle:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      
      body.resizing * {
        pointer-events: none !important;
      }
      body.resizing .resize-handle {
        pointer-events: auto !important;
      }

      .pixelated-container * {
        image-rendering: pixelated !important;
        image-rendering: -moz-crisp-edges !important;
        image-rendering: -webkit-crisp-edges !important;
        image-rendering: crisp-edges !important;
        image-rendering: -o-crisp-edges !important;
        -ms-interpolation-mode: nearest-neighbor !important;
      }

      .pixelated-canvas {
        image-rendering: pixelated !important;
        image-rendering: -moz-crisp-edges !important;
        image-rendering: -webkit-crisp-edges !important;
        image-rendering: crisp-edges !important;
        -ms-interpolation-mode: nearest-neighbor !important;
      }

      canvas[style*="pixelated"] {
        image-rendering: pixelated !important;
      }
    `}</style>
  )
}