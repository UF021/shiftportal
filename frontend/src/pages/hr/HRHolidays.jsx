import { useEffect, useState } from 'react'
import { getAllHols, getAllStaff, approveHol, rejectHol, getShiftAvg, amendHol, deleteHol } from '../../api/client'
import { fmtDate, fmtDateTime } from '../../api/utils'

const inputStyle = {
  width:'100%', padding:'9px 12px', borderRadius:8, outline:'none',
  border:'1px solid var(--border)', background:'var(--navy-light)',
  color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box',
}

export default function HRHolidays() {
  const [hols,    setHols]    = useState([])
  const [staff,   setStaff]   = useState([])
  const [filter,     setFil]        = useState('pending')
  const [typeFilter, setTypeFilter] = useState('all')
  const [proc,    setProc]    = useState(null)
  const [confirm, setConfirm] = useState(null)   // { hol, avgHours, loading }

  // edit / delete state
  const [editHol,    setEditHol]    = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [editErr,    setEditErr]    = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(null)

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

  function startEdit(h) {
    setEditHol(h)
    setEditForm({ from_date: h.from_date, to_date: h.to_date, note: h.note || '' })
    setEditErr('')
  }

  async function saveEdit() {
    if (!editForm.from_date || !editForm.to_date) { setEditErr('Please select both dates.'); return }
    if (editForm.to_date < editForm.from_date)    { setEditErr('End date must be after start.'); return }
    setEditSaving(true); setEditErr('')
    try {
      await amendHol(editHol.id, {
        from_date: editForm.from_date,
        to_date:   editForm.to_date,
        note:      editForm.note || null,
      })
      setEditHol(null)
      load()
    } catch(ex) { setEditErr(ex.response?.data?.detail || 'Update failed.') }
    finally { setEditSaving(false) }
  }

  async function confirmDeleteHol() {
    if (!confirmDel) return
    setDeleting(confirmDel.id)
    try {
      await deleteHol(confirmDel.id)
      setConfirmDel(null)
      load()
    } catch(ex) { alert(ex.response?.data?.detail || 'Delete failed.') }
    finally { setDeleting(null) }
  }

  const staffType = id => staff.find(s => s.id === id)?.staff_type || 'payroll'
  const filtered = hols.filter(h => {
    if (filter && h.status !== filter) return false
    const t = staffType(h.user_id || h.staff_id)
    if (typeFilter !== 'all' && t !== typeFilter) return false
    return true
  })
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

      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        {[['pending','⏳ Pending'],['approved','✓ Approved'],['rejected','✗ Rejected'],['','All']].map(([v,l]) => (
          <button key={v} onClick={() => setFil(v)} style={{
            padding:'8px 16px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13,
            border:`1px solid ${filter===v?'var(--green)':'var(--border)'}`,
            background:filter===v?'var(--green-muted)':'transparent',
            color:filter===v?'var(--green)':'var(--text-muted)', fontWeight:filter===v?700:400,
          }}>{l}</button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          {[['all','All'],['payroll','Payroll'],['subcontract','Subcontract']].map(([v,l]) => (
            <button key={v} onClick={() => setTypeFilter(v)} style={{
              padding:'7px 13px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:12,
              border:`1px solid ${typeFilter===v?'#1565c0':'var(--border)'}`,
              background:typeFilter===v?'rgba(21,101,192,.12)':'transparent',
              color:typeFilter===v?'#1565c0':'var(--text-muted)', fontWeight:typeFilter===v?700:400,
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding:0 }}>
        <div className="tw">
          <table>
            <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Days</th><th>Notes</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.length ? filtered.map(h => (
                <tr key={h.id}>
                  <td><strong>{name(h.user_id || h.staff_id)}</strong></td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(h.from_date)}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(h.to_date)}</td>
                  <td style={{ fontWeight:700 }}>{h.days}</td>
                  <td style={{ fontSize:12, color:'var(--text-muted)', maxWidth:140 }}>{h.note || '—'}</td>
                  <td style={{ fontSize:11, color:'var(--text-muted)' }}>{fmtDateTime(h.submitted_at)}</td>
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
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {h.status === 'pending' && (
                        <>
                          <button onClick={() => startApprove(h)} disabled={proc === h.id} className="btn btn-brand" style={{ fontSize:11, padding:'5px 10px' }}>
                            {proc === h.id ? '…' : '✓'}
                          </button>
                          <button onClick={() => handleReject(h.id)} disabled={proc === h.id} className="btn btn-danger" style={{ fontSize:11, padding:'5px 10px' }}>✗</button>
                        </>
                      )}
                      <button onClick={() => startEdit(h)} className="btn btn-outline" style={{ fontSize:11, padding:'5px 10px' }}>Edit</button>
                      <button onClick={() => setConfirmDel({ id: h.id, name: name(h.user_id || h.staff_id), from: h.from_date, to: h.to_date })}
                        className="btn btn-danger" style={{ fontSize:11, padding:'5px 10px', background:'transparent', color:'var(--red)' }}>
                        Delete
                      </button>
                    </div>
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
              <div style={{ fontSize:14 }}><strong>Employee:</strong> {confirm.name}</div>
              <div style={{ fontSize:14 }}><strong>Days requested:</strong> {confirm.hol.days}</div>
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

      {/* Edit modal */}
      {editHol && (
        <div className="modal-overlay" onClick={() => setEditHol(null)}>
          <div className="modal" style={{ width:420 }} onClick={e => e.stopPropagation()}>
            <h3>Edit Holiday Request</h3>
            <p className="sub">{name(editHol.user_id || editHol.staff_id)} · currently {editHol.status}</p>
            {editErr && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#a02020', marginBottom:14 }}>⚠ {editErr}</div>}
            {editHol.status === 'approved' && (
              <div style={{ background:'#fef9e8', border:'1px solid #f0c060', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#7a5000', marginBottom:14 }}>
                ⚠ Changing dates on an approved holiday will recalculate holiday pay hours.
              </div>
            )}
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>From Date</label>
              <input type="date" value={editForm.from_date} onChange={e => setEditForm(f => ({ ...f, from_date: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>To Date</label>
              <input type="date" value={editForm.to_date} onChange={e => setEditForm(f => ({ ...f, to_date: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Notes (optional)</label>
              <textarea rows={2} value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                style={{ ...inputStyle, resize:'vertical' }} />
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditHol(null)} className="btn btn-outline">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="btn btn-brand">
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ width:380 }} onClick={e => e.stopPropagation()}>
            <h3>Delete Holiday Request?</h3>
            <p className="sub">{confirmDel.name} · {fmtDate(confirmDel.from)} → {fmtDate(confirmDel.to)}</p>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
              This will permanently remove the request and update payroll calculations accordingly.
            </p>
            <div className="modal-footer">
              <button onClick={() => setConfirmDel(null)} className="btn btn-outline">Cancel</button>
              <button onClick={confirmDeleteHol} disabled={deleting === confirmDel?.id} className="btn btn-danger">
                {deleting === confirmDel?.id ? 'Deleting…' : 'Delete Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
