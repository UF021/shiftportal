import { useEffect, useState } from 'react'
import { getAllHols, getAllStaff, approveHol, rejectHol, getShiftAvg } from '../../api/client'

export default function HRHolidays() {
  const [hols,    setHols]    = useState([])
  const [staff,   setStaff]   = useState([])
  const [filter,  setFil]     = useState('pending')
  const [proc,    setProc]    = useState(null)
  const [confirm, setConfirm] = useState(null)   // { hol, avgHours, loading }

  const load = () => {
    getAllStaff().then(r => setStaff(r.data || [])).catch(() => {})
    getAllHols().then(r => setHols(r.data || [])).catch(() => setHols([]))
  }
  useEffect(load, [])

  async function startApprove(h) {
    const staffMember = staff.find(s => s.id === (h.user_id || h.staff_id))
    setConfirm({ hol: h, name: staffMember?.full_name || '—', avgHours: null, loading: true })
    try {
      const r = await getShiftAvg(h.user_id || h.staff_id)
      setConfirm(c => ({ ...c, avgHours: r.data.avg_shift_hours, loading: false }))
    } catch {
      setConfirm(c => ({ ...c, avgHours: null, loading: false }))
    }
  }

  async function confirmApprove() {
    if (!confirm) return
    setProc(confirm.hol.id)
    try {
      await approveHol(confirm.hol.id)
      setConfirm(null)
      load()
    } catch(ex) { alert(ex.response?.data?.detail || 'Approval failed') }
    finally { setProc(null) }
  }

  async function handleReject(id) {
    setProc(id)
    try { await rejectHol(id); load() }
    catch(ex) { alert(ex.response?.data?.detail || 'Action failed') }
    finally { setProc(null) }
  }

  const filtered = hols.filter(h => !filter || h.status === filter)
  const name = id => staff.find(s => s.id === id)?.full_name || '—'

  const estPay = (avgHours, days) => {
    if (!avgHours || !days) return null
    return Math.round(avgHours * days * 100) / 100
  }

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Holiday Requests</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Review and action staff holiday requests</p>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:18 }}>
        {[['pending','⏳ Pending'],['approved','✓ Approved'],['rejected','✗ Rejected'],['','All']].map(([v,l]) => (
          <button key={v} onClick={() => setFil(v)} style={{
            padding:'8px 16px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13,
            border:`1px solid ${filter===v?'var(--green)':'var(--border)'}`,
            background:filter===v?'var(--green-muted)':'transparent',
            color:filter===v?'var(--green)':'var(--text-muted)', fontWeight:filter===v?700:400,
          }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding:0 }}>
        <div className="tw">
          <table>
            <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Days</th><th>Notes</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map(h => (
                <tr key={h.id}>
                  <td><strong>{name(h.user_id || h.staff_id)}</strong></td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{h.from_date}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{h.to_date}</td>
                  <td style={{ fontWeight:700 }}>{h.days}</td>
                  <td style={{ fontSize:12, color:'var(--text-muted)', maxWidth:140 }}>{h.note || '—'}</td>
                  <td style={{ fontSize:11, color:'var(--text-muted)' }}>{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                      <span className={`badge ${h.status==='approved'?'badge-green':h.status==='rejected'?'badge-red':'badge-amber'}`}>
                        {h.status==='approved'?'✓ Approved':h.status==='rejected'?'✗ Rejected':'⏳ Pending'}
                      </span>
                      {h.status === 'approved' && h.holiday_pay_hours > 0 && (
                        <span className="badge badge-green" title="Estimated holiday pay hours">
                          💰 {h.holiday_pay_hours}h
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {h.status === 'pending' && (
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => startApprove(h)} disabled={proc === h.id} className="btn btn-brand" style={{ fontSize:11, padding:'5px 10px' }}>
                          {proc === h.id ? '…' : '✓'}
                        </button>
                        <button onClick={() => handleReject(h.id)} disabled={proc === h.id} className="btn btn-danger" style={{ fontSize:11, padding:'5px 10px' }}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No {filter} holiday requests</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve confirmation modal */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ width:420 }} onClick={e => e.stopPropagation()}>
            <h3>Confirm Approval</h3>
            <p className="sub">Review holiday pay estimate before approving</p>
            <div style={{ background:'var(--navy-light)', borderRadius:10, padding:'16px', marginBottom:18, lineHeight:2 }}>
              <div style={{ fontSize:14 }}>
                <strong>Employee:</strong> {confirm.name}
              </div>
              <div style={{ fontSize:14 }}>
                <strong>Days requested:</strong> {confirm.hol.days}
              </div>
              <div style={{ fontSize:14 }}>
                <strong>Average shift:</strong>{' '}
                {confirm.loading ? 'Calculating…' : confirm.avgHours != null ? `${confirm.avgHours}h` : 'No clock data'}
              </div>
              <div style={{ fontSize:14 }}>
                <strong>Estimated holiday pay:</strong>{' '}
                {confirm.loading ? '…' : confirm.avgHours != null
                  ? <span style={{ color:'var(--green)', fontWeight:700 }}>{estPay(confirm.avgHours, confirm.hol.days)}h total</span>
                  : <span style={{ color:'var(--text-muted)' }}>N/A (no clock history)</span>
                }
              </div>
            </div>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:18 }}>
              Approve {confirm.hol.days} day{confirm.hol.days !== 1 ? 's' : ''} holiday for {confirm.name}?
            </p>
            <div className="modal-footer">
              <button onClick={() => setConfirm(null)} className="btn btn-outline">Cancel</button>
              <button onClick={confirmApprove} disabled={confirm.loading || proc !== null} className="btn btn-brand">
                {proc ? 'Approving…' : '✓ Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
