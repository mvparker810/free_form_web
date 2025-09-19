import { useState } from 'react'

export default function App() {
  const [out, setOut] = useState('click a button…')

  async function call(path: string, init?: RequestInit) {
    const r = await fetch(path, init)
    const text = await r.text()
    setOut(text)
  }

  return (
    <div style={{padding:24,fontFamily:'system-ui',maxWidth:720}}>
      <h1>React + C++ API Demo</h1>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}>
        <button onClick={()=>call('/api/health')}>GET /api/health</button>
        <button onClick={()=>call('/api/solve/quad', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ a: 1, b: 0, c: -1 })
        })}>POST /api/solve/quad</button>
      </div>
      <pre style={{background:'#111',color:'rgba(255, 255, 255, 1)',padding:12,borderRadius:8}}>{out}</pre>
    </div>
  )
}
