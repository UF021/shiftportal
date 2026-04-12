import { useEffect, useState } from 'react'
import { getAllHols, getAllStaff, approveHol, rejectHol } from '../../api/client'

export default function HRHolidays() {
  const [hols,   setHols]  = useState([])
  const [staff,  setStaff] = useState([])
  const [filter, setFil]   = useState('pending')
  const [proc,   setProc]  = useState(null)

  const load = () => {
    getAllStaff().then(r=>setStaff(r.data||[])).catch(()=>{})
    getAllHols().then(r=>setHols(r.data||[])).catch(()=>setHols([]))
  }
  useEffect(load,[])

  async function handle(id, action) {
    setProc(id)
    try { action==='approve' ? await approveHol(id) : await rejectHol(id); load() }
    catch(ex) { alert(ex.response?.data?.detail||'Action failed') }
    finally { setProc(null) }
  }

  const filtered = hols.filter(h => !filter || h.status===filter)
  const name = id => staff.find(s=>s.id===id)?.full_name||'—'

  return (
    <>
      <div style={{marginBottom:26}}>
        <h2 style={{fontSize:23,fontWeight:700,marginBottom:4}}>Holiday Requests</h2>
        <p style={{fontSize:14,color:'var(--text-muted)'}}>Review and action staff holiday requests</p>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:18}}>
        {[['pending','⏳ Pending'],['approved','✓ Approved'],['rejected','✗ Rejected'],['','All']].map(([v,l])=>(
          <button key={v} onClick={()=>setFil(v)} style={{
            padding:'8px 16px',borderRadius:8,cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:13,
            border:`1px solid ${filter===v?'var(--green)':'var(--border)'}`,
            background:filter===v?'var(--green-muted)':'transparent',
            color:filter===v?'var(--green)':'var(--text-muted)',fontWeight:filter===v?700:400,
          }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{padding:0}}>
        <div className="tw">
          <table>
            <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Days</th><th>Notes</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map(h=>(
                <tr key={h.id}>
                  <td><strong>{name(h.user_id||h.staff_id)}</strong></td>
                  <td style={{fontFamily:'DM Mono,monospace',fontSize:12}}>{h.from_date}</td>
                  <td style={{fontFamily:'DM Mono,monospace',fontSize:12}}>{h.to_date}</td>
                  <td style={{fontWeight:700}}>{h.days}</td>
                  <td style={{fontSize:12,color:'var(--text-muted)',maxWidth:140}}>{h.note||'—'}</td>
                  <td style={{fontSize:11,color:'var(--text-muted)'}}>{h.submitted_at?new Date(h.submitted_at).toLocaleDateString('en-GB'):'—'}</td>
                  <td>
                    <span className={`badge ${h.status==='approved'?'badge-green':h.status==='rejected'?'badge-red':'badge-amber'}`}>
                      {h.status==='approved'?'✓ Approved':h.status==='rejected'?'✗ Rejected':'⏳ Pending'}
                    </span>
                  </td>
                  <td>
                    {h.status==='pending'&&(
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>handle(h.id,'approve')} disabled={proc===h.id} className="btn btn-brand" style={{fontSize:11,padding:'5px 10px'}}>{proc===h.id?'…':'✓'}</button>
                        <button onClick={()=>handle(h.id,'reject')}  disabled={proc===h.id} className="btn btn-danger" style={{fontSize:11,padding:'5px 10px'}}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              )):(
                <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No {filter} holiday requests</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
