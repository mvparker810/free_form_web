import { useEffect, useRef, useState } from 'react'

// --- Types ---
type Vec2 = { x: number; y: number }

// PNG icon paths (place files in /public/icons/)
const ICONS = {
  // top bar
  new: '/icons/new.png',
  open: '/icons/open.png',
  undo: '/icons/undo.png',
  redo: '/icons/redo.png',
  solve: '/icons/solve.png',
  help: '/icons/help.png',
  // elements
  rect: '/icons/element-rect.png',
  circle: '/icons/element-circle.png',
  tri: '/icons/element-tri.png',
  poly: '/icons/element-poly.png',
  delete: '/icons/element-delete.png',
  // constraints
  parallel: '/icons/cons-parallel.png',
  perpendicular: '/icons/cons-perp.png',
  equal: '/icons/cons-equal.png',
  coincident: '/icons/cons-coincident.png',
  lesseq: '/icons/cons-lesseq.png',
};

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

// Simple runtime self-tests; results printed to the Console panel
function runSelfTests(): string {
  type C<T> = { name: string; got: T; want: T }
  const cases: C<any>[] = [
    { name: 'clamp inside', got: clamp(5, 0, 10), want: 5 },
    { name: 'clamp low bound', got: clamp(-3, 0, 10), want: 0 },
    { name: 'clamp high bound', got: clamp(12, 0, 10), want: 10 },
    { name: 'clamp equal bounds', got: clamp(7, 5, 5), want: 5 },
    { name: 'snapGrid z=1', got: snapGrid(10, 1), want: 5 },
    { name: 'snapGrid z=0.5', got: snapGrid(10, 0.5), want: 10 },
    { name: 'snapGrid z=2', got: snapGrid(10, 2), want: 2 },
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

export default function App() {
  const [out, setOut] = useState<string>('ready')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoom, setZoom] = useState<number>(1)
  const [origin, setOrigin] = useState<Vec2>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<Vec2>({ x: 0, y: 0 })
  const originStart = useRef<Vec2>({ x: 0, y: 0 })

  function appendConsole(msg: string) {
    setOut(prev => `${prev}\n${msg}`)
  }

  // Run tests once on mount
  useEffect(() => {
    appendConsole(runSelfTests())
  }, [])

  // --- Canvas drawing ---
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

    const BG = '#ffffff'
    const LINE = '#6375ffff'

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

    ctx.restore()
  }, [origin, zoom])

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
    }
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setOrigin({ x: originStart.current.x + dx, y: originStart.current.y + dy })
    }
  }
  function onMouseUp() { setIsPanning(false) }
  function onMouseLeave() { setIsPanning(false) }

  return (
    <div style={styles.app} className="blueprint">
      <TopBar />
      <div style={styles.bodyRow}>
        <LeftPanel />
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
              onContextMenu={(e)=>e.preventDefault()}
            />
          </div>
        </div>
        <RightPanel />
      </div>
      <Console out={out} />
      <StyleTag />
    </div>
  )
}

function TopBar() {
  return (
    <div style={styles.topBar}>
      <div style={styles.logo}>free_form</div>
      <div style={styles.topBtns}>
        <IconButton src={ICONS.new} title="New" />
        <IconButton src={ICONS.open} title="Open" />
        <IconButton src={ICONS.undo} title="Undo" />
        <IconButton src={ICONS.redo} title="Redo" />
        <IconButton src={ICONS.solve} title="Solve" />
        <IconButton src={ICONS.help} title="Help" />
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <aside style={styles.side}>
      <div style={styles.sectionHeader}>Elements</div>
      <div className="icon-grid">
        <IconButton src={ICONS.rect} title="Rectangle" />
        <IconButton src={ICONS.circle} title="Circle" />
        <IconButton src={ICONS.tri} title="Triangle" />
        <IconButton src={ICONS.poly} title="Polygon" />
        <IconButton src={ICONS.delete} title="Delete" />
      </div>
      <div style={styles.sectionHeader}>Cons</div>
      <div className="icon-grid">
        <IconButton src={ICONS.parallel} title="Parallel" />
        <IconButton src={ICONS.perpendicular} title="Perpendicular" />
        <IconButton src={ICONS.equal} title="Equal" />
        <IconButton src={ICONS.coincident} title="Coincident" />
        <IconButton src={ICONS.lesseq} title="≤ Constraint" />
      </div>
    </aside>
  )
}

function RightPanel() {
  return (
    <aside style={styles.side}>
      <div style={styles.sectionHeader}>Objects</div>
      <ul style={{padding:'4px 12px', margin:0, listStyle:'disc'}}>
        <li>Circle 1</li>
        <li>Circle 2</li>
        <li>Circle 3</li>
      </ul>
    </aside>
  )
}

function Console({out}:{out:string}) {
  return (
    <div style={styles.console}>
      <div style={styles.sectionHeader}>Console</div>
      <pre className="console-pre">{out}</pre>
    </div>
  )
}

function IconButton({src, title, onClick}:{src:string; title:string; onClick?:()=>void}) {
  return (
    <button className="icon-btn" aria-label={title} title={title} onClick={onClick}>
      <img src={src} alt={title} />
    </button>
  )
}

// --- Styles ---
const styles: Record<string, React.CSSProperties> = {
  app: { height:'100vh', width:'100vw', display:'flex', flexDirection:'column', background:'#fff', color:'#003399', fontFamily:'"Courier New", monospace' },
  topBar: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 8px', borderBottom:'2px solid #003399', background:'#ffffff' },
  logo: { fontWeight:700, color:'#003399' },
  topBtns: { display:'flex', gap:4 },
  bodyRow: { flex:1, display:'grid', gridTemplateColumns:'200px 1fr 200px', minHeight:0 },
  side: { borderRight:'2px solid #003399', borderLeft:'2px solid #003399', background:'#ffffff', minWidth:0, overflow:'auto', display:'flex', flexDirection:'column' },
  centerCol: { display:'flex', flexDirection:'column', minWidth:0 },
  viewportWrap: { flex:1, position:'relative', background:'#ffffff' },
  canvas: { width:'100%', height:'100%', display:'block', cursor:'crosshair' },
  console: { height:100, borderTop:'2px solid #003399', background:'#fff', display:'flex', flexDirection:'column' },
  sectionHeader: { padding:'4px 8px', borderBottom:'2px solid #003399', background:'#ffffff', color:'#003399', fontSize:12, fontWeight:'bold' },
}

function StyleTag() {
  return (
    <style>{`
      .blueprint {
        font-family: "Courier New", monospace !important;
        color:#003399;
      }
      .blueprint .u-btn { background:#fff; color:#003399; border:2px solid #003399; padding:2px 4px; border-radius:0; font-size:12px; }
      /* Square PNG icon buttons */
      .icon-btn { width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; background:#fff; border:2px solid #003399; border-radius:0; padding:0; }
      .icon-btn:hover { background:#e6ecff }
      .icon-btn img { width:18px; height:18px; image-rendering: pixelated; image-rendering: crisp-edges; }
      .blueprint .u-btn:hover { background:#e6ecff }
      .console-pre { margin:0; padding:6px; flex:1; color:#003399; background:transparent; font-family: "Courier New", monospace; white-space:pre-wrap; overflow:auto; font-size:12px }
      .icon-grid { display:grid; grid-template-columns: repeat(3, 30px); justify-content:start; gap:6px; padding:6px; }
    `}</style>
  )
}
