import { useEffect, useState } from 'react'
import { getAllStaff, getMySites, createManualShift } from '../../api/client'
import AnalogTimePicker from '../../components/AnalogTimePicker'

export default function HRManualShift() {
  const [staff,  setStaff]  = useState([])
  const [sites,  setSites]  = useState([])
  const [form,   setForm]   = useState({
    user_id: '', site_id: '', date: '',
    clock_in_time: '09:00', clock_out_time: '17:00',
    scheduled_start: '09:00',
    is_late: false,
    entry_notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  const [ok,   setOk]   = useState('')

  useEffect(() => {
    getAllStaff().then(r => setStaff((r.data || []).filter(s => s.is_active))).catch(() => {})
    getMySites().then(r => setSites(r.data || [])).catch(() => {})
  }, [])

  // Auto-check is_late when clock_in or scheduled_start changes
  useEffect(() => {
    if (!form.scheduled_start || !form.clock_in_time) return
    const [sh, sm] = form.scheduled_start.split(':').map(Number)
    const [ih, im] = form.clock_in_time.split(':').map(Number)
    setForm(f => ({ ...f, is_late: (ih * 60 + im) > (sh * 60 + sm) }))
  }, [form.clock_in_time, form.scheduled_start])

  async function submit() {
    setErr(''); setOk('')
    if (!form.user_id || !form.site_id || !form.date) return setErr('Please select staff member, site and date.')
    setBusy(true)
    try {
      await createManualShift({
        user_id:         parseInt(form.user_id),
        site_id:         parseInt(form.site_id),
        date:            form.date,
        clock_in_time:   form.clock_in_time,
        clock_out_time:  form.clock_out_time,
        scheduled_start: form.scheduled_start || null,
        entry_notes:     form.entry_notes || null,
      })
      setOk('✅ Manual shift entry created successfully.')
      setForm(f => ({ ...f, user_id: '', site_id: '', date: '', entry_notes: '' }))
    } catch(ex) { setErr(ex.response?.data?.detail || 'Failed to create shift.') }
    finally { setBusy(false) }
  }

  const minsLate = (() => {
    if (!form.scheduled_start || !form.clock_in_time) return 0
    const [sh, sm] = form.scheduled_start.split(':').map(Number)
    const [ih, im] = form.clock_in_time.split(':').map(Number)
    return Math.max(0, (ih * 60 + im) - (sh * 60 + sm))
  })()

  const F = ({ label, required, children }) => (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
        {label}{required && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}
      </label>
      {children}
    </div>
  )

  const dropStyle = { width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Manual Shift Entry</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Create backdated shift records — use when QR scanner was offline or for system backup entries</p>
      </div>

      <div className="card" style={{ maxWidth:600 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <F label="Staff Member" required>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} style={dropStyle}>
              <option value="">— Select staff —</option>
              {staff.sort((a,b) => a.full_name.localeCompare(b.full_name)).map(s => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </F>
          <F label="Site" required>
            <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))} style={dropStyle}>
              <option value="">— Select site —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
        </div>

        <F label="Date" required>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            style={{ ...dropStyle, fontFamily:'DM Mono,sans-serif', boxSizing:'border-box' }} />
        </F>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, marginBottom:20 }}>
          {[
            { key:'clock_in_time',   label:'Clock In Time' },
            { key:'clock_out_time',  label:'Clock Out Time' },
            { key:'scheduled_start', label:'Scheduled Start' },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{label}</div>
              <AnalogTimePicker value={form[key]} onChange={t => setForm(f => ({ ...f, [key]: t }))} />
            </div>
          ))}
        </div>

        <F label="Late Arrival">
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13, color:'var(--text)' }}>
            <input type="checkbox" checked={form.is_late} onChange={e => setForm(f => ({ ...f, is_late: e.target.checked }))}
              style={{ accentColor:'var(--green)', width:16, height:16 }} />
            Mark as late
            {form.is_late && minsLate > 0 && (
              <span style={{ fontSize:11, color:'var(--red)', fontWeight:600 }}>
                (auto-detected: {minsLate} min{minsLate !== 1 ? 's' : ''} late)
              </span>
            )}
          </label>
        </F>

        <F label="Reason / Notes">
          <textarea value={form.entry_notes} onChange={e => setForm(f => ({ ...f, entry_notes: e.target.value }))} rows={3}
            placeholder="e.g. QR scanner offline, system backup entry, card reader fault…"
            style={{ ...dropStyle, resize:'vertical', boxSizing:'border-box' }} />
        </F>

        {err && <div className="alert alert-red" style={{ marginBottom:12 }}>⚠ {err}</div>}
        {ok  && <div className="alert alert-green" style={{ marginBottom:12 }}>{ok}</div>}

        <div style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
          ℹ Creates two clock events (clock_in + clock_out) with <strong>clocked_via_qr = false</strong>. Visible in Time Report.
        </div>

        <button onClick={submit} disabled={busy} className="btn btn-brand" style={{ width:'100%', padding:13, fontSize:14 }}>
          {busy ? 'Creating…' : '✏ Create Manual Shift Entry'}
        </button>
      </div>
    </>
  )
}
