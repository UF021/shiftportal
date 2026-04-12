// HRTimelogs.jsx
import { useEffect, useState } from 'react'
import { getAllLogs, getAllStaff } from '../../api/client'

const fmtM = m => m!=null ? `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m` : '—'

export function HRTimelogs() {
  const [data,   setData]  = useState(null)
  const [staff,  setStaff] = useState([])
  const [fil,    setFil]   = useState({ staff_id:'', from_date:'', to_date:'' })

  useEffect(() => {
    getAllStaff().then(r=>setStaff(r.data||[])).catch(()=>{})
    run()
  }, [])

  function run() {
    const p={}
    if(fil.staff_id)  p.staff_id  = fil.staff_id
    if(fil.from_date) p.from_date = fil.from_date
    if(fil.to_date)   p.to_date   = fil.to_date
    getAllLogs(p).then(r=>setData(r.data)).catch(()=>setData({entries:[],total_mins:0}))
  }

  function exportCSV() {
    if(!data?.entries?.length) return
    const rows=[['Employee','Date','Start','End','Site','Hours','Overnight']]
    data.entries.forEach(e=>{
      const s=staff.find(x=>x.id===e.user_id)||{}
      rows.push([s.full_name||'—',e.date,e.start_time,e.end_time,e.site_name,fmtM(e.total_mins),e.overnight?'Yes':'No'])
    })
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download=`timelogs-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  const F = ({label,children}) => (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{label}</div>
      {children}
    </div>
  )

  return (
    <>
      <div style={{marginBottom:26}}>
        <h2 style={{fontSize:23,fontWeight:700,marginBottom:4}}>Time Report</h2>
        <p style={{fontSize:14,color:'var(--text-muted)'}}>All staff time logs — overnight shifts calculated correctly</p>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap',alignItems:'flex-end'}}>
        <F label="Employee">
          <select value={fil.staff_id} onChange={e=>setFil(f=>({...f,staff_id:e.target.value}))}
            style={{padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--navy-light)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:13}}>
            <option value="">All Staff</option>
            {staff.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </F>
        <F label="From">
          <input type="date" value={fil.from_date} onChange={e=>setFil(f=>({...f,from_date:e.target.value}))}
            style={{padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--navy-light)',color:'var(--text)',fontFamily:'DM Mono,sans-serif',fontSize:13}}/>
        </F>
        <F label="To">
          <input type="date" value={fil.to_date} onChange={e=>setFil(f=>({...f,to_date:e.target.value}))}
            style={{padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--navy-light)',color:'var(--text)',fontFamily:'DM Mono,sans-serif',fontSize:13}}/>
        </F>
        <button onClick={run} className="btn btn-brand">🔍 Search</button>
        <button onClick={exportCSV} className="btn btn-outline">📥 Export CSV</button>
      </div>

      {data && (
        <div style={{display:'flex',gap:20,marginBottom:14}}>
          <span style={{fontSize:13,color:'var(--text-muted)'}}>Total: <strong style={{color:'var(--green)',fontFamily:'DM Mono,monospace'}}>{fmtM(data.total_mins)}</strong></span>
          <span style={{fontSize:13,color:'var(--text-muted)'}}>Shifts: <strong style={{color:'var(--green)'}}>{data.entries?.length||0}</strong></span>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <div className="tw">
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Start</th><th>End</th><th>Site</th><th>Hours</th><th>Overnight</th></tr></thead>
            <tbody>
              {data?.entries?.length ? data.entries.map(e=>{
                const s=staff.find(x=>x.id===e.user_id)||{}
                return (
                  <tr key={e.id}>
                    <td><strong>{s.full_name||'—'}</strong></td>
                    <td style={{fontFamily:'DM Mono,monospace',fontSize:12}}>{e.date?new Date(e.date+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
                    <td style={{color:'var(--green)',fontFamily:'DM Mono,monospace'}}>{e.start_time}</td>
                    <td style={{color:'var(--red)',fontFamily:'DM Mono,monospace'}}>{e.end_time}</td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{e.site_name}</td>
                    <td style={{fontFamily:'DM Mono,monospace',fontWeight:700,color:'var(--green)'}}>{fmtM(e.total_mins)}</td>
                    <td>{e.overnight?<span className="badge badge-blue">🌙 Yes</span>:'—'}</td>
                  </tr>
                )
              }):(
                <tr><td colSpan={7} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
                  {data?'No records for selected filters':'Select filters and click Search'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default HRTimelogs
