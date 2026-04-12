// StaffDashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyLogs, getMyHols } from '../../api/client'

function fmtM(m) { return m != null ? `${Math.floor(m/60)} hrs ${String(m%60).padStart(2,'0')} mins` : '—' }

export default function StaffDashboard() {
  const { user }  = useAuth()
  const { colour} = useBrand()
  const nav       = useNavigate()
  const c         = colour || '#6abf3f'
  const [logs, setLogs] = useState(null)
  const [hols, setHols] = useState(null)

  useEffect(() => {
    getMyLogs().then(r=>setLogs(r.data)).catch(()=>setLogs({total_mins:0,entry_count:0,entries:[]}))
    getMyHols().then(r=>setHols(r.data)).catch(()=>setHols({remaining_days:20}))
  }, [])

  const sia    = user?.sia_expiry ? new Date(user.sia_expiry) : null
  const days   = sia ? Math.ceil((sia-new Date())/86400000) : null
  const gone   = days !== null && days < 0
  const warn   = days !== null && days < 60
  const siaCol = gone?'#e05555':warn?'#f0a030':c

  return <>
    {/* Hero */}
    <div style={{ background:`linear-gradient(135deg,#0f1923 0%,#1a3a1a 60%,${c}55 100%)`, borderRadius:16, padding:24, marginBottom:14, color:'#fff', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:c+'22' }} />
      <div style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Hello, {user?.first_name} 👋</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.6)' }}>Licensed Security Officer</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:18 }}>
        {[
          { val: logs ? `${Math.floor((logs.total_mins||0)/60)}h` : '…', lbl:'Hours', col:c },
          { val: hols ? `${hols.remaining_days}d` : '…', lbl:'Holiday left', col:c },
          { val: gone?'EXP':days!=null?`${days}d`:'…', lbl:'SIA days left', col:siaCol },
        ].map(({val,lbl,col}) => (
          <div key={lbl} style={{ background:'rgba(255,255,255,.08)', borderRadius:10, padding:12, border:'1px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono,monospace', color:col }}>{val}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>

    {(gone||warn) && <div style={{ background:gone?'#fde8e8':'#fef9e8', border:`1px solid ${gone?'#e08080':'#f0c060'}`, borderRadius:10, padding:'12px 16px', fontSize:13, color:gone?'#a02020':'#7a5000', marginBottom:14 }}>
      {gone ? '🔴 Your SIA licence has expired. Contact HR immediately.' : `⚠ Your SIA licence expires in ${days} days. Please arrange renewal.`}
    </div>}

    {/* Contract card */}
    <div className="s-card">
      <div className="s-card-title">📄 Employment Contract</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'#1a2a1a' }}>Contract of Employment</div>
          <div style={{ fontSize:12, color:'#6a8a6a' }}>{user?.first_name} {user?.last_name} · Start: {user?.employment_start_date||'TBC'}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>nav('/staff/contract')} style={{ padding:'8px 14px', borderRadius:8, border:`1.5px solid ${c}`, background:'#fff', color:c, fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>View →</button>
          <button onClick={()=>nav('/staff/contract')} style={{ padding:'8px 14px', borderRadius:8, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer' }}>⬇ PDF</button>
        </div>
      </div>
    </div>

    {/* Hours */}
    <div className="s-card">
      <div className="s-card-title">⏱ Hours Recorded</div>
      <div style={{ fontSize:32, fontWeight:700, fontFamily:'DM Mono,monospace', color:c }}>{logs ? fmtM(logs.total_mins) : '…'}</div>
      <div style={{ fontSize:12, color:'#6a8a6a', marginTop:4 }}>Across {logs?.entry_count??0} shift{logs?.entry_count!==1?'s':''}</div>
      <button onClick={()=>nav('/staff/timelog')} style={{ marginTop:12, padding:'9px 18px', borderRadius:8, border:`1.5px solid ${c}44`, background:'#fff', color:c, fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer' }}>View full timelog →</button>
    </div>

    {/* Recent shifts */}
    <div className="s-card">
      <div className="s-card-title">🕐 Recent Shifts</div>
      {logs?.entries?.length ? logs.entries.slice(0,4).map(e=>(
        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f0f4f0' }}>
          <div style={{ width:88, fontSize:12, fontWeight:700, color:'#1a2a1a', flexShrink:0 }}>
            {new Date(e.date+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontFamily:'DM Mono,monospace', color:'#6a8a6a' }}>{e.start_time} → {e.end_time}{e.overnight?' 🌙':''}</div>
            <div style={{ fontSize:11, color:'#8aaa8a', marginTop:2 }}>{e.site_name}</div>
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:c, fontFamily:'DM Mono,monospace', whiteSpace:'nowrap' }}>{fmtM(e.total_mins)}</div>
        </div>
      )) : <p style={{ color:'#8aaa8a', fontSize:13 }}>No shifts yet. Tap Timelog to add your first.</p>}
    </div>
  </>
}
