import { useEffect, useState } from 'react'
import { getApiStatus } from '../../api/client'

export default function StatusPage() {
  const [status, setStatus] = useState(null)
  const [checkedAt, setCheckedAt] = useState(null)

  const check = () => {
    getApiStatus()
      .then(r => { setStatus({ ok: true, ...r.data }) })
      .catch(() => { setStatus({ ok: false }) })
      .finally(() => setCheckedAt(new Date()))
  }

  useEffect(() => { check() }, [])

  const ok = status?.ok
  const colour = ok === null ? '#aaa' : ok ? '#22a06b' : '#e2483d'
  const label  = ok === null ? 'Checking…' : ok ? 'All Systems Operational' : 'Service Degraded'

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#f5f7f5', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'48px 40px', width:480, maxWidth:'100%', boxShadow:'0 4px 32px rgba(0,0,0,.08)', border:'1px solid #e8eee8', textAlign:'center' }}>

        <div style={{ fontSize:48, marginBottom:16 }}>
          {ok === null ? '⏳' : ok ? '✅' : '⚠️'}
        </div>

        <h1 style={{ fontSize:22, fontWeight:700, color:'#1a2a1a', marginBottom:8 }}>Ikan FM Staff Portal</h1>
        <h2 style={{ fontSize:16, fontWeight:600, color: colour, marginBottom:24 }}>{label}</h2>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fbf8', border:'1px solid #e8eee8', borderRadius:8, padding:'10px 16px' }}>
            <span style={{ fontSize:14, color:'#1a2a1a' }}>API</span>
            <span style={{ fontSize:13, fontWeight:600, color: colour }}>
              {ok === null ? '…' : ok ? 'Operational' : 'Down'}
            </span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fbf8', border:'1px solid #e8eee8', borderRadius:8, padding:'10px 16px' }}>
            <span style={{ fontSize:14, color:'#1a2a1a' }}>Database</span>
            <span style={{ fontSize:13, fontWeight:600, color: status?.db === 'connected' ? '#22a06b' : colour }}>
              {ok === null ? '…' : status?.db === 'connected' ? 'Connected' : 'Issue'}
            </span>
          </div>
        </div>

        <button
          onClick={check}
          style={{ padding:'10px 24px', borderRadius:20, border:'none', background:'#6abf3f', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Refresh
        </button>

        {checkedAt && (
          <p style={{ fontSize:11, color:'#8aaa8a', marginTop:16 }}>
            Last checked: {checkedAt.toLocaleTimeString()}
          </p>
        )}
      </div>

      <div style={{ marginTop:24, fontSize:12, color:'#6a8a6a' }}>
        Copyright {new Date().getFullYear()} Ikan FM. All rights reserved.
      </div>
    </div>
  )
}
