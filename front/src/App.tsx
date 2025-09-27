import { useEffect, useRef, useState } from 'react'

// --- Types ---
type Vec2 = { x: number; y: number }

type Shape =
  | { kind: 'point'; c: Vec2 }
  | { kind: 'line'; p1: Vec2; p2: Vec2 }
  | { kind: 'circle'; c: Vec2; r: number }
  | { kind: 'arc'; c: Vec2; r: number; startAngle: number; endAngle: number }

type IconName =
  | 'new' | 'open' | 'undo' | 'redo' | 'solve' | 'help'
  | 'point' | 'line' | 'circle' | 'arc' | 'delete'
  | 'coincident' | 'parallel' | 'perpendicular' | 'fixed' | 'measurement' | 'equals' | 'tangent' | 'horizontal' | 'vertical'

// --- Spritesheet config ---
const SPRITE_URL = '/icons/sprite.png'
const ICON_SIZE = 16 // each icon is 16x16 pixels
const ICON_COLS = 8   // number of icons per row in the spritesheet

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

// --- Runtime self-tests (printed to Console on mount) ---
function runSelfTests(): string {
  type C<T> = { name: string; got: T; want: T }
  const cases: C<any>[] = [
    // existing tests
    { name: 'clamp inside',       got: clamp(5, 0, 10),   want: 5 },
    { name: 'clamp low bound',    got: clamp(-3, 0, 10),  want: 0 },
    { name: 'clamp high bound',   got: clamp(12, 0, 10),  want: 10 },
    { name: 'clamp equal bounds', got: clamp(7, 5, 5),    want: 5 },
    { name: 'snapGrid z=1',       got: snapGrid(10, 1),   want: 5 },
    { name: 'snapGrid z=0.5',     got: snapGrid(10, 0.5), want: 10 },
    { name: 'snapGrid z=2',       got: snapGrid(10, 2),   want: 2 },
    { name: 'snapGrid z=20',      got: snapGrid(10, 20),  want: 1 },
    { name: 'clamp big',          got: clamp(1e9, -1e6, 1e6), want: 1e6 },
    // extra coverage
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

  // UI scale (1 = 100%)
  const [uiScale, setUiScale] = useState<number>(1.4)
  const bumpScale = (d: number) => setUiScale(s => clamp(Math.round((s + d) * 10) / 10, 0.8, 2.5))

  // Viewport & interaction
  const [zoom, setZoom] = useState<number>(1)
  const [origin, setOrigin] = useState<Vec2>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<Vec2>({ x: 0, y: 0 })
  const originStart = useRef<Vec2>({ x: 0, y: 0 })

  // Model state
  const [tool, setTool] = useState<'select'|'point'|'line'|'circle'|'arc'|'delete'>('select')
  const [constraint, setConstraint] = useState<'none'|'coincident'|'parallel'|'perpendicular'|'fixed'|'measurement'|'equals'|'tangent'|'horizontal'|'vertical'>('none')
  const [shapes, setShapes] = useState<Shape[]>([])

  // Line drawing state
  const [isDrawingLine, setIsDrawingLine] = useState(false)
  const [lineStart, setLineStart] = useState<Vec2 | null>(null)
  const [tempLineEnd, setTempLineEnd] = useState<Vec2 | null>(null)

  // Arc drawing state
  const [isDrawingArc, setIsDrawingArc] = useState(false)
  const [arcCenter, setArcCenter] = useState<Vec2 | null>(null)
  const [arcRadius, setArcRadius] = useState<number | null>(null)

  // Undo/Redo stacks
  const [undoStack, setUndo] = useState<Shape[][]>([])
  const [redoStack, setRedo] = useState<Shape[][]>([])

  // File input (Open)
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

  // --- Render loop ---
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')!
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = cvs.clientWidth
    const h = cvs.clientHeight
    if (cvs.width !== Math.floor(w * dpr) || cvs.height !== Math.floor(h * dpr)) {
      cvs.width = Math.floor(w * dpr)
      cvs.height = Math.floor(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const BG = '#ffffffff'
    const LINE = '#003399'

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(w/2 + origin.x, h/2 + origin.y)
    ctx.scale(zoom, zoom)

    drawGrid(ctx, w, h, zoom, origin)

    // axes
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2/zoom
    ctx.beginPath()
    ctx.moveTo(-w, 0)
    ctx.lineTo(w, 0)
    ctx.moveTo(0, -h)
    ctx.lineTo(0, h)
    ctx.stroke()

    // shapes
    for (const s of shapes) drawShape(ctx, s, LINE, zoom)

    // drawing preview
    if (isDrawingLine && lineStart && tempLineEnd) {
      ctx.strokeStyle = 'rgba(0,51,153,0.5)'
      ctx.lineWidth = 2/zoom
      ctx.beginPath()
      ctx.moveTo(lineStart.x, -lineStart.y)
      ctx.lineTo(tempLineEnd.x, -tempLineEnd.y)
      ctx.stroke()
    }

    ctx.restore()
  }, [origin, zoom, shapes, isDrawingLine, lineStart, tempLineEnd])

  // --- Drawing helpers ---
  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, z: number, originLocal: Vec2) {
    const viewW = w / z
    const viewH = h / z
    const minor = snapGrid(40, z)
    ctx.save()
    const left = - (w/2 + originLocal.x) / z
    const top = - (h/2 + originLocal.y) / z
    ctx.strokeStyle = 'rgba(0,51,153,0.3)'
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

  function drawShape(ctx: CanvasRenderingContext2D, s: Shape, color: string, z: number) {
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 2 / z
    
    if (s.kind === 'point') {
      const pointSize = 4 / z
      ctx.fillRect(s.c.x - pointSize/2, -s.c.y - pointSize/2, pointSize, pointSize)
    } else if (s.kind === 'line') {
      ctx.beginPath()
      ctx.moveTo(s.p1.x, -s.p1.y)
      ctx.lineTo(s.p2.x, -s.p2.y)
      ctx.stroke()
    } else if (s.kind === 'circle') {
      ctx.beginPath()
      ctx.arc(s.c.x, -s.c.y, s.r, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.kind === 'arc') {
      ctx.beginPath()
      ctx.arc(s.c.x, -s.c.y, s.r, -s.endAngle, -s.startAngle, true)
      ctx.stroke()
    }
  }

  // --- Interaction ---
  function screenToWorld(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = (clientX - rect.left) - rect.width/2
    const y = (clientY - rect.top) - rect.height/2
    return { x: (x - origin.x)/zoom, y: (y - origin.y)/zoom }
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
      
      if (tool === 'point') {
        addShape({ kind: 'point', c: p })
      } else if (tool === 'line') {
        if (!isDrawingLine) {
          setIsDrawingLine(true)
          setLineStart(p)
          setTempLineEnd(p)
        } else {
          // Complete the line
          if (lineStart) {
            addShape({ kind: 'line', p1: lineStart, p2: p })
          }
          setIsDrawingLine(false)
          setLineStart(null)
          setTempLineEnd(null)
        }
      } else if (tool === 'circle') {
        addShape({ kind: 'circle', c: p, r: 30 })
      } else if (tool === 'arc') {
        if (!isDrawingArc) {
          setIsDrawingArc(true)
          setArcCenter(p)
          setArcRadius(null)
        } else if (arcCenter && !arcRadius) {
          const r = distance(arcCenter, p)
          setArcRadius(r)
        } else if (arcCenter && arcRadius) {
          // Complete the arc - for now just create a quarter arc
          addShape({ kind: 'arc', c: arcCenter, r: arcRadius, startAngle: 0, endAngle: Math.PI/2 })
          setIsDrawingArc(false)
          setArcCenter(null)
          setArcRadius(null)
        }
      } else if (tool === 'delete') {
        deleteLast()
      }
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setOrigin({ x: originStart.current.x + dx, y: originStart.current.y + dy })
    } else if (isDrawingLine && lineStart) {
      const p = screenToWorld(e.clientX, e.clientY)
      setTempLineEnd(p)
    }
  }
  
  function onMouseUp() { setIsPanning(false) }
  function onMouseLeave() { setIsPanning(false) }

  // --- Editing ops ---
  function pushHistory(next: Shape[]) {
    setUndo(u => [...u, shapes])
    setRedo([])
    setShapes(next)
  }
  function addShape(s: Shape) { pushHistory([...shapes, s]) }
  function deleteLast() { if (shapes.length) pushHistory(shapes.slice(0, -1)) }
  function clearAll() { pushHistory([]); appendConsole('Cleared canvas') }
  function undo() {
    setUndo(u => {
      if (!u.length) return u
      const prev = u[u.length - 1]
      setRedo(r => [...r, shapes])
      setShapes(prev)
      return u.slice(0, -1)
    })
  }
  function redo() {
    setRedo(r => {
      if (!r.length) return r
      const next = r[r.length - 1]
      setUndo(u => [...u, shapes])
      setShapes(next)
      return r.slice(0, -1)
    })
  }

  function openFromFile(files: FileList | null) {
    if (!files || !files[0]) return
    const file = files[0]
    file.text().then(txt => {
      try {
        const parsed = JSON.parse(txt) as Shape[]
        pushHistory(parsed)
        appendConsole(`Opened ${file.name} (${parsed.length} shapes)`) 
      } catch (e: any) {
        appendConsole(`! Failed to parse file: ${e.message ?? e}`)
      }
    })
  }

  function saveToFile() {
    const blob = new Blob([JSON.stringify(shapes, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scene.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const actions = {
    onNew: clearAll,
    onOpen: () => fileInputRef.current?.click(),
    onUndo: undo,
    onRedo: redo,
    onSolve: () => call('/api/solve/quad', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ a: 1, b: 0, c: -1 }) }),
    onHelp: () => appendConsole('Help: Left-click places shapes with the selected tool. For lines, click start then end point. Middle/Right drag to pan. Wheel to zoom.'),
  }

  return (
    <div style={{...styles.app, ['--ui-scale' as any]: uiScale, ['--ui-font' as any]: 'pxfont, "Courier New", monospace'}} className="blueprint">
      <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => openFromFile(e.target.files)} />
      <TopBar actions={actions} onSave={saveToFile} onBumpScale={bumpScale} />
      <div style={styles.bodyRow}>
        <LeftPanel setTool={setTool} tool={tool} setConstraint={setConstraint} constraint={constraint} />
        <div style={styles.centerCol}>
          <div style={styles.viewportWrap}>
            <canvas
              ref={canvasRef}
              style={styles.canvas}
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>
        <RightPanel shapes={shapes} />
      </div>
      <Console out={out} />
      <StyleTag />
    </div>
  )
}

// --- UI components ---
function TopBar({ actions, onSave, onBumpScale }:{ actions: { onNew: ()=>void; onOpen: ()=>void; onUndo: ()=>void; onRedo: ()=>void; onSolve: ()=>void; onHelp: ()=>void }, onSave: ()=>void, onBumpScale: (d:number)=>void }) {
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
    <aside style={styles.side}>
      <div style={styles.sectionHeader}>Tools</div>
      <div className="icon-grid">
        <IconButton name="point"  title="Point" onClick={() => setTool('point')} />
        <IconButton name="line"   title="Line" onClick={() => setTool('line')} />
        <IconButton name="circle" title="Circle" onClick={() => setTool('circle')} />
        <IconButton name="arc"    title="Arc" onClick={() => setTool('arc')} />
        <IconButton name="delete" title="Delete last" onClick={() => setTool('delete')} />
      </div>
      <div style={styles.sectionHeader}>Active Tool</div>
      <div style={{ padding: '6px 8px', fontSize: 12 }}>Tool: <b>{tool}</b></div>
      
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
      <div style={{ padding: '6px 8px', fontSize: 12 }}>Constraint: <b>{constraint}</b></div>
    </aside>
  )
}

function RightPanel({ shapes }:{ shapes: Shape[] }) {
  return (
    <aside style={styles.side}>
      <div style={styles.sectionHeader}>Objects</div>
      <ul style={{ padding: '4px 12px', margin: 0, listStyle: 'disc' }}>
        {shapes.map((s, i) => (
          <li key={i}>
            {s.kind} #{i + 1}
            {s.kind === 'point' && ` (${s.c.x.toFixed(1)}, ${s.c.y.toFixed(1)})`}
            {s.kind === 'circle' && ` r=${s.r.toFixed(1)}`}
            {s.kind === 'arc' && ` r=${s.r.toFixed(1)}`}
          </li>
        ))}
        {!shapes.length && <li style={{ opacity: 0.6 }}>No objects yet</li>}
      </ul>
      <div style={{ padding: '6px 8px', fontSize: 12, opacity: 0.8 }}>
        Click canvas to place shapes. For lines, click start then end point.
      </div>
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
  const scaleFactor = `calc((var(--btn) - ${ICON_SIZE / 2}px * var(--ui-scale)) / ${ICON_SIZE}px)`
  return (
    <button className="icon-btn" aria-label={title} title={title} onClick={onClick}>
      <span
        className="icon-sprite"
        style={{
          backgroundImage: `url(${SPRITE_URL})`,
          backgroundPosition: `calc(-${x}px * ${scaleFactor}) calc(-${y}px * ${scaleFactor})`,
          backgroundSize: `calc(${ICON_COLS * ICON_SIZE}px * ${scaleFactor}) auto`,
        }}
      />
    </button>
  )
}


// --- Styles ---
const styles: Record<string, React.CSSProperties> = {
  app: { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#fff', color: '#003399', fontFamily: 'var(--ui-font, "Courier New", monospace)' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '2px solid #003399', background: '#ffffff' },
  logo: { fontWeight: 700, color: '#003399' },
  topBtns: { display: 'flex', gap: 4 },
  bodyRow: { flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 200px', minHeight: 0 },
  side: { borderRight: '2px solid #003399', borderLeft: '2px solid #003399', background: '#ffffff', minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' },
  centerCol: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  viewportWrap: { flex: 1, position: 'relative', background: '#ffffff' },
  canvas: { width: '100%', height: '100%', display: 'block', cursor: 'crosshair' },
  console: { height: 110, borderTop: '2px solid #003399', background: '#fff', display: 'flex', flexDirection: 'column' },
  sectionHeader: { padding: '4px 8px', borderBottom: '2px solid #003399', background: '#ffffff', color: '#003399', fontSize: 12, fontWeight: 'bold' },
}

function StyleTag() {
  return (
    <style>{`
      @font-face {
        font-family: 'pxfont';
        src: url('/fonts/pxfont.woff2') format('woff2');
        font-weight: 400 800;
        font-style: normal;
        font-display: swap;
      }

      .blueprint {
        --ui-scale: var(--ui-scale, 1);
        --ui-font: var(--ui-font, pxfont, "Courier New", monospace);
        font-family: var(--ui-font);
        font-size: calc(12px * var(--ui-scale));
        color:#003399;
      }

      .blueprint { --frame-url: url('/icons/frame9-blue.png'); --frame-url-hover: url('/icons/frame9-blue-hover.png'); --frame-slice: 6; --frame-width: 6; }

      :root .blueprint { --btn: calc(32px * var(--ui-scale)); --icon: calc(18px * var(--ui-scale)); }

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
        width: calc(var(--btn) - 8px * var(--ui-scale)); 
        height: calc(var(--btn) - 8px * var(--ui-scale)); 
        pointer-events: none;
      }

      .console-pre { margin:0; padding: calc(6px * var(--ui-scale)); flex:1; color:#003399; background:transparent; white-space:pre-wrap; overflow:auto; font-size: 1em }
      .icon-grid { display:grid; grid-template-columns: repeat(3, var(--btn)); justify-content:start; gap: calc(6px * var(--ui-scale)); padding: calc(6px * var(--ui-scale)); }
      .constraint-grid { display:grid; grid-template-columns: repeat(3, var(--btn)); justify-content:start; gap: calc(4px * var(--ui-scale)); padding: calc(6px * var(--ui-scale)); }
      .sep { width: calc(8px * var(--ui-scale)); }
    `}</style>
  )
}