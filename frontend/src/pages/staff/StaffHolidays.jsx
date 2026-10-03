// StaffHolidays.jsx
import { useEffect, useState } from 'react'
import { getMyHols, requestHol, getMyHolidayStats, amendHol, deleteHol } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const STAFF_LEAVE_TYPES = [
  { value: 'holiday',  label: '🏖 Holiday',  note: '4+ weeks advance notice required' },
  { value: 'sick',     label: '🤒 Sick Leave', note: 'Can be submitted retrospectively' },
  { value: 'other',   label: '📋 Other',      note: 'Contact HR for maternity/paternity' },
]

const LEAVE_LABELS = {
  holiday:   '🏖 Holiday',
  maternity: '👶 Maternity',
  paternity: '👨‍👦 Paternity',
  sick:      '🤒 Sick',
  other:     '📋 Other',
}

const LEAVE_COLORS = {
  holiday:   { bg:'#e8f5e9', color:'#2e7d32' },
  maternity: { bg:'#f3e5f5', color:'#6a1b9a' },
  paternity: { bg:'#e8f5e9', color:'#1b5e20' },
  sick:      { bg:'#fff3e0', color:'#e65100' },
  other:     { bg:'#f5f5f5', color:'#424242' },
}

const POLICY_TEXT = `The holiday year runs from 1 April to 31 March. You are entitled to four weeks of paid holiday per year. Each week of holiday is equivalent to your working week. If you work four days a week, you will be entitled to four days multiplied by four weeks, totaling 16 days holiday a year. The holiday must be accrued before it can be taken. This equates to 2.3 days of paid holiday (or an equivalent) per full month of employment. Holiday pay will be calculated on your average hours worked over the previous 3 months.`

function fmtD(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const inputStyle = {
  width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
  border:'1.5px solid #d0e0d0', background:'#f8fbf8',
  color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, boxSizing:'border-box',
}

export function StaffHolidays() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [data,    setData]   = useState(null)
  const [stats,   setStats]  = useState(null)
  const [form,    setForm]   = useState({ from_date:'', to_date:'', note:'', leave_type:'holiday' })
  const [err,     setErr]    = useState('')
  const [ok,      setOk]     = useState('')
  const [infoOpen, setInfo]  = useState(false)

  // edit / delete state
  const [editHol,    setEditHol]    = useState(null)   // holiday being edited
  const [editForm,   setEditForm]   = useState({})
  const [editErr,    setEditErr]    = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleting,   setDeleting]   = useState(null)   // id being deleted
  const [confirmDel, setConfirmDel] = useState(null)   // id to confirm delete

  // Calculator state
  const [daysInput,  setDaysInput]  = useState('')
  const [takenInput, setTakenInput] = useState('')
  const [calcResult, setCalcResult] = useState(null)

  const load = () => getMyHols().then(r => setData(r.data)).catch(() => setData({ remaining_days:20, approved_days:0, pending_days:0, requests:[] }))

  useEffect(() => {
    load()
    getMyHolidayStats()
      .then(r => {
        setStats(r.data)
        setDaysInput(String(r.data.avg_days_per_week ?? ''))
        setTakenInput(String(r.data.holidays_taken_since_april ?? 0))
      })
      .catch(() => {})
  }, [])

  function calculate() {
    const daysPerWeek    = parseFloat(daysInput) || 0
    const holidaysTaken  = parseFloat(takenInput) || 0
    const monthsEmployed = stats?.months_employed || 0
    const entitlement    = round1(daysPerWeek * 4)
    const noStartDate    = !monthsEmployed
    const accrued        = noStartDate
      ? entitlement
      : round1(Math.min((entitlement / 12) * 2.3 * monthsEmployed, entitlement))
    const remaining      = round1(Math.max(0, accrued - holidaysTaken))
    setCalcResult({ days: daysPerWeek, taken: holidaysTaken, months: monthsEmployed, entitlement, accrued, remaining, noStartDate })
  }

  function round1(n) { return Math.round(n * 10) / 10 }

  async function submit() {
    setErr(''); setOk('')
    if (!form.from_date || !form.to_date) return setErr('Please select both dates.')
    if (form.to_date < form.from_date)    return setErr('End date must be after start.')
    try {
      await requestHol({ from_date: form.from_date, to_date: form.to_date, note: form.note, leave_type: form.leave_type })
      setOk('✅ Request submitted. HR will respond within 2 working days.')
      setForm({ from_date:'', to_date:'', note:'', leave_type:'holiday' }); load()
    } catch(ex) { setErr(ex.response?.data?.detail || 'Request failed.') }
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

  async function confirmDelete() {
    if (!confirmDel) return
    setDeleting(confirmDel)
    try {
      await deleteHol(confirmDel)
      setConfirmDel(null)
      load()
    } catch(ex) { alert(ex.response?.data?.detail || 'Delete failed.') }
    finally { setDeleting(null) }
  }

  const inp = (id, type='date', label) => (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</label>
      <input type={type} value={form[id]} onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
        style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none' }} />
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:20, fontWeight:700, color:'#1a2a1a', marginBottom:16 }}>My Holidays</div>

      {/* Info modal */}
      {infoOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setInfo(false)}>
          <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', maxWidth:480, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#1a2a1a' }}>Holiday Entitlement Policy</div>
              <button onClick={() => setInfo(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#6a8a6a' }}>✕</button>
            </div>
            <p style={{ fontSize:13, color:'#4a6a4a', lineHeight:1.8 }}>{POLICY_TEXT}</p>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editHol && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setEditHol(null)}>
          <div style={{ background:'#fff', borderRadius:16, padding:'24px', maxWidth:400, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a2a1a', marginBottom:16 }}>Edit Holiday Request</div>
            {editErr && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#a02020', marginBottom:14 }}>⚠ {editErr}</div>}
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>From Date</label>
              <input type="date" value={editForm.from_date} onChange={e => setEditForm(f => ({ ...f, from_date: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>To Date</label>
              <input type="date" value={editForm.to_date} onChange={e => setEditForm(f => ({ ...f, to_date: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Notes (optional)</label>
              <textarea rows={2} value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                style={{ ...inputStyle, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setEditHol(null)} style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid #d0ddd0', background:'#f8fbf8', color:'#6a8a6a', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:editSaving?'not-allowed':'pointer', opacity:editSaving?0.7:1 }}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setConfirmDel(null)}>
          <div style={{ background:'#fff', borderRadius:16, padding:'24px', maxWidth:360, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a2a1a', marginBottom:10 }}>Delete Holiday Request?</div>
            <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>This will permanently remove the request. You can submit a new one if needed.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid #d0ddd0', background:'#f8fbf8', color:'#6a8a6a', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting === confirmDel} style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:'#e53535', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {deleting === confirmDel ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Holiday Calculator card */}
      <div className="s-card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="s-card-title" style={{ marginBottom:0 }}>📅 Holiday Entitlement Calculator</div>
          <button onClick={() => setInfo(true)} title="How is this calculated?"
            style={{ background:'#e8f5fd', border:'1px solid #b8dcf0', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:14, color:'#1a4a6a', flexShrink:0 }}>
            ℹ
          </button>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
            Average days worked per week (last 3 months)
          </label>
          <input type="number" value={daysInput} onChange={e => setDaysInput(e.target.value)}
            min="1" max="7" step="0.5"
            style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Mono,sans-serif', fontStyle:'normal', fontSize:15, outline:'none' }} />
          {stats && <div style={{ fontSize:11, color:'#8aaa8a', marginTop:4 }}>Based on your clock-in records (pre-filled, editable)</div>}
        </div>

        <div style={{ marginBottom:18 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
            Paid holidays taken since April 1st
          </label>
          <input type="number" value={takenInput} onChange={e => setTakenInput(e.target.value)}
            min="0" step="1"
            style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Mono,sans-serif', fontStyle:'normal', fontSize:15, outline:'none' }} />
          {stats && <div style={{ fontSize:11, color:'#8aaa8a', marginTop:4 }}>Based on approved holidays in current holiday year (pre-filled, editable)</div>}
        </div>

        <button onClick={calculate}
          style={{ width:'100%', padding:13, borderRadius:10, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom: calcResult ? 18 : 0 }}>
          Calculate
        </button>

        {calcResult && (
          <div>
            <div style={{ textAlign:'center', padding:'16px 0 8px' }}>
              <div style={{ fontSize:44, fontWeight:700, fontStyle:'normal', fontFamily:'DM Mono,monospace', color: c, lineHeight:1 }}>
                {calcResult.remaining}
              </div>
              <div style={{ fontSize:15, color:'#4a6a4a', marginTop:6 }}>
                days of holiday remaining
              </div>
            </div>
            {calcResult.noStartDate && (
              <div style={{ background:'#fef9e8', border:'1px solid #f0c060', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#7a5000', marginTop:8, textAlign:'center' }}>
                ⚠ Start date not yet confirmed by HR — showing full annual entitlement
              </div>
            )}
            <div style={{ background:'#f0f8f0', border:'1px solid #c8e8c8', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#4a6a4a', lineHeight:1.8, marginTop:10 }}>
              Based on <strong>{calcResult.days} days/week × 4 weeks = {calcResult.entitlement} days</strong> annual entitlement
              {!calcResult.noStartDate && <>, accrued <strong>{calcResult.accrued} days</strong> in <strong>{calcResult.months} months</strong> employment</>}
            </div>
          </div>
        )}

        <div style={{ background:'#e8f5fd', border:'1px solid #b8dcf0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1a4a6a', marginTop:16 }}>
          ℹ️ Requests must be 4+ weeks in advance. Do not book travel until formally approved.
        </div>
      </div>

      {/* Request form */}
      <div className="s-card">
        <div className="s-card-title">➕ Submit Leave Request</div>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Leave Type</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {STAFF_LEAVE_TYPES.map(t => (
              <button key={t.value} onClick={() => setForm(f => ({ ...f, leave_type: t.value }))} style={{
                flex:1, minWidth:90, padding:'10px 8px', borderRadius:10, cursor:'pointer',
                border: form.leave_type === t.value ? `2px solid ${c}` : '1.5px solid #d0e0d0',
                background: form.leave_type === t.value ? `${c}18` : '#f8fbf8',
                color: form.leave_type === t.value ? c : '#6a8a6a',
                fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:700, textAlign:'center', lineHeight:1.5,
              }}>
                <div>{t.label}</div>
                <div style={{ fontSize:10, fontWeight:400, marginTop:2 }}>{t.note}</div>
              </button>
            ))}
          </div>
        </div>
        {inp('from_date', 'date', 'From Date')}
        {inp('to_date',   'date', 'To Date')}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Notes (optional)</label>
          <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
            style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', resize:'vertical' }} />
        </div>
        {err && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px', fontSize:13, color:'#a02020', marginBottom:12 }}>⚠ {err}</div>}
        {ok  && <div style={{ background:'#e8f8e0', border:'1px solid #a0d080', borderRadius:8, padding:'10px', fontSize:13, color:'#3a7a20', marginBottom:12 }}>{ok}</div>}
        <button onClick={submit}
          style={{ width:'100%', padding:14, borderRadius:12, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:15, fontWeight:700, cursor:'pointer' }}>
          Submit Request
        </button>
      </div>

      {/* My requests */}
      <div className="s-card">
        <div className="s-card-title">📋 My Requests</div>
        {data?.requests?.length ? data.requests.map(h => (
          <div key={h.id} style={{ padding:'12px 0', borderBottom:'1px solid #f0f4f0' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#1a2a1a' }}>{fmtD(h.from_date)} → {fmtD(h.to_date)} ({h.days} day{h.days !== 1 ? 's' : ''})</div>
                <div style={{ marginTop:3, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  {(() => { const lc = LEAVE_COLORS[h.leave_type || 'holiday']; return (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:lc.bg, color:lc.color }}>
                      {LEAVE_LABELS[h.leave_type || 'holiday']}
                    </span>
                  )})()}
                  {h.note && <span style={{ fontSize:12, color:'#6a8a6a' }}>{h.note}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                {h.holiday_pay_hours > 0 && (
                  <span style={{ padding:'3px 8px', borderRadius:12, fontSize:11, fontWeight:700, background:'#e8f8e0', color:'#3a7a20' }}>
                    💰 {h.holiday_pay_hours}h pay
                  </span>
                )}
                <span style={{ padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700,
                  background: h.status==='approved'?'#e8f8e0':h.status==='rejected'?'#fde8e8':'#fef6e0',
                  color:      h.status==='approved'?'#3a7a20':h.status==='rejected'?'#a02020':'#7a5000' }}>
                  {h.status==='approved'?'✓ Approved':h.status==='rejected'?'✗ Rejected':'⏳ Pending'}
                </span>
                {h.status === 'pending' && (
                  <>
                    <button onClick={() => startEdit(h)} style={{
                      padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700,
                      border:'1px solid #b0c8b0', background:'transparent', color:'#4a7a4a', cursor:'pointer',
                    }}>Edit</button>
                    <button onClick={() => setConfirmDel(h.id)} style={{
                      padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700,
                      border:'1px solid #e0a0a0', background:'transparent', color:'#a03030', cursor:'pointer',
                    }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )) : <p style={{ color:'#8aaa8a', fontSize:13 }}>No requests yet</p>}
      </div>
    </div>
  )
}

export default StaffHolidays
