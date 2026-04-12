import { useEffect, useState } from 'react'
import { getMyLogs, createLog, deleteLog, getMySites } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const fmtM = m => m!=null ? `${Math.floor(m/60)} hrs ${String(m%60).padStart(2,'0')} mins` : '—'
const TIMES = Array.from({length:48},(_,i)=>{const h=String(Math.floor(i/2)).padStart(2,'0');const m=i%2?'30':'00';return `${h}:${m}`})

export default function StaffTimelog() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  const [data, setData]   = useState(null)
  const [sites, setSites] = useState([])
  const [open, setOpen]   = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr]     = useState('')
  const [form, setForm]   = useState({ date:new Date().toISOString().split('T')[0], start_time:'09:00', end_time:'17:00', site_name:'' })

  const load = () => getMyLogs().then(r=>setData(r.data)).catch(()=>setData({total_mins:0,entry_count:0,entries:[]}))

  useEffect(()=>{ load(); getMySites().then(r=>setSites(r.data||[])).catch(()=>{}) },[])

  async function save() {
    setErr('')
    if (!form.site_name) return setErr('Please select a site.')
    try {
      await createLog(form); setSaved(true)
      setTimeout(()=>{ setSaved(false); setOpen(false); load() }, 900)
    } catch(ex) { setErr(ex.response?.data?.detail||'Failed to save.') }
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:'#1a2a1a' }}>My Time Log</div>
          <div style={{ fontSize:12, color:'#6a8a6a' }}>Record your shifts here</div>
        </div>
        <button onClick={()=>{setOpen(true);setSaved(false);setErr('')}} style={{ padding:'10px 16px', borderRadius:10, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          + Add Time-Log
        </button>
      </div>

      <div className="s-card" style={{ padding:'16px 20px 8px' }}>
        <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', color:c, marginBottom:4 }}>Total: {data ? fmtM(data.total_mins) : '…'}</div>
        <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:16 }}>{data?.entry_count??0} entr{data?.entry_count!==1?'ies':'y'}</div>
        {data?.entries?.length ? (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ borderBottom:'2px solid #e0ead0' }}>
              {['Date','Start','End','Site','Hours',''].map(h=><th key={h} style={{ padding:'8px 6px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.entries.map(e=>(
                <tr key={e.id} style={{ borderBottom:'1px solid #f0f4f0' }}>
                  <td style={{ padding:'10px 6px', fontWeight:700, color:'#1a2a1a', fontSize:12 }}>
                    {new Date(e.date+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}
                  </td>
                  <td style={{ padding:'10px 6px', fontFamily:'DM Mono,monospace', fontSize:12, color:c }}>{e.start_time}</td>
                  <td style={{ padding:'10px 6px', fontFamily:'DM Mono,monospace', fontSize:12, color:'#e05555' }}>{e.end_time}{e.overnight?' 🌙':''}</td>
                  <td style={{ padding:'10px 6px', fontSize:12, color:'#6a8a6a' }}>{e.site_name}</td>
                  <td style={{ padding:'10px 6px', fontFamily:'DM Mono,monospace', fontWeight:700, color:c }}>{fmtM(e.total_mins)}</td>
                  <td style={{ padding:'10px 6px' }}>
                    <button onClick={()=>deleteLog(e.id).then(load)} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #fcc', background:'#fff', color:'#e05555', fontSize:12, cursor:'pointer' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ color:'#8aaa8a', fontSize:13, padding:'12px 0' }}>No time logs yet.</p>}
      </div>

      {/* Bottom sheet modal */}
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={e=>e.target===e.currentTarget&&setOpen(false)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'28px 20px 40px', width:'100%', maxWidth:680, color:'#1a2a1a' }}>
            <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Add Time Scheduling</h3>
            <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:20, fontFamily:'DM Mono,monospace' }}>
              {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            </div>
            {[['Date:','date','date'],['','','']].filter(x=>x[0]).map(([lbl,id,type])=>null)}
            {/* Date */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Date:</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:15, outline:'none' }}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              {[['Start Time:','start_time'],['End Time:','end_time']].map(([lbl,key])=>(
                <div key={key}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{lbl}</label>
                  <select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:15, outline:'none' }}>
                    {TIMES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Description / Site:</label>
              <select value={form.site_name} onChange={e=>setForm(f=>({...f,site_name:e.target.value}))} style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:15, outline:'none' }}>
                <option value="">— Select site —</option>
                {sites.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            {saved && <div style={{ background:'#e8f8e0', border:'1px solid #a0d080', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#3a7a20', marginBottom:12 }}>✓ log added successful.</div>}
            {err   && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#a02020', marginBottom:12 }}>⚠ {err}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setOpen(false)} style={{ padding:'14px 20px', borderRadius:12, border:'1.5px solid #d0e0d0', background:'#fff', color:'#6a8a6a', fontFamily:'DM Sans,sans-serif', fontSize:15, cursor:'pointer' }}>Close</button>
              <button onClick={save} style={{ flex:1, padding:14, borderRadius:12, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:16, fontWeight:700, cursor:'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
