import { useEffect, useState } from 'react'
import { getAllStaff, getMySites, createManualShift } from '../../api/client'

function F({ label, required, children }) {
  return (
    <div className="field">
      <label>
        {label}
        {required && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function TimeField({ label, required, value, onChange }) {
  return (
    <F label={label} required={required}>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize:18, padding:'12px 14px', cursor:'pointer', fontStyle:'normal' }}
      />
    </F>
  )
}

export default function HRManualShift() {
  const [staff,  setStaff]  = useState([])
  const [sites,  setSites]  = useState([])
  const [form,   setForm]   = useState({
    user_id: '', site_id: '', date: '',
    clock_in_time: '09:00',
    scheduled_start: '09:00',
    entry_notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  const [ok,   setOk]   = useState('')

  useEffect(() => {
    getAllStaff().then(r => setStaff((r.data || []).filter(s => s.is_active))).catch(() => {})
    getMySites().then(r => setSites(r.data || [])).catch(() => {})
  }, [])

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Auto-detect minutes late
  const minsLate = (() => {
    if (!form.clock_in_time || !form.scheduled_start) return 0
    const [sh, sm] = form.scheduled_start.split(':').map(Number)
    const [ih, im] = form.clock_in_time.split(':').map(Number)
    return Math.max(0, (ih * 60 + im) - (sh * 60 + sm))
  })()

  async function submit() {
    setErr(''); setOk('')
    if (!form.user_id || !form.site_id || !form.date)
      return setErr('Please select a staff member, site, and date.')
    setBusy(true)
    try {
      await createManualShift({
        user_id:         parseInt(form.user_id),
        site_id:         parseInt(form.site_id),
        date:            form.date,
        clock_in_time:   form.clock_in_time,
        scheduled_start: form.scheduled_start || null,
        entry_notes:     form.entry_notes || null,
      })
      setOk('✅ Clock-in entry created successfully.')
      setForm(f => ({ ...f, user_id: '', site_id: '', date: '', entry_notes: '' }))
    } catch(ex) { setErr(ex.response?.data?.detail || 'Failed to create entry.') }
    finally { setBusy(false) }
  }

  const selStyle = {
    width:'100%', padding:'10px 12px', borderRadius:8,
    border:'1px solid var(--border)', background:'var(--navy-light)',
    color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none',
  }

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Manual Shift Entry</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>
          Create backdated clock-in records — use when QR scanner was offline or for system backup entries
        </p>
      </div>

      <div className="card" style={{ maxWidth:520 }}>

        <div className="form-row">
          <F label="Staff Member" required>
            <select value={form.user_id} onChange={e => setField('user_id', e.target.value)} style={selStyle}>
              <option value="">— Select staff —</option>
              {staff.sort((a,b) => a.full_name.localeCompare(b.full_name)).map(s => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </F>
          <F label="Site" required>
            <select value={form.site_id} onChange={e => setField('site_id', e.target.value)} style={selStyle}>
              <option value="">— Select site —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
        </div>

        <F label="Date" required>
          <input type="date" value={form.date} onChange={e => setField('date', e.target.value)}
            style={{ ...selStyle, fontFamily:'DM Mono,sans-serif', boxSizing:'border-box' }} />
        </F>

        <TimeField label="Clock In Time" required value={form.clock_in_time} onChange={v => setField('clock_in_time', v)} />
        <TimeField label="Scheduled Start (for punctuality)" value={form.scheduled_start} onChange={v => setField('scheduled_start', v)} />

        {minsLate > 0 && (
          <div style={{ background:'rgba(240,160,48,.12)', border:'1px solid rgba(240,160,48,.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--amber)', marginBottom:16 }}>
            ⚠ Auto-detected: {minsLate} min{minsLate !== 1 ? 's' : ''} late
          </div>
        )}

        <F label="Reason / Notes">
          <textarea value={form.entry_notes} onChange={e => setField('entry_notes', e.target.value)} rows={3}
            placeholder="e.g. QR scanner offline, system backup entry, card reader fault…"
            style={{ ...selStyle, resize:'vertical', boxSizing:'border-box' }} />
        </F>

        {err && <div className="alert alert-red" style={{ marginBottom:12 }}>⚠ {err}</div>}
        {ok  && <div className="alert alert-green" style={{ marginBottom:12 }}>{ok}</div>}

        <div style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
          ℹ Creates a clock-in event. Staff must clock out via QR code or a separate manual entry.
        </div>

        <button onClick={submit} disabled={busy} className="btn btn-brand btn-full btn-lg">
          {busy ? 'Creating…' : '✏ Create Clock-In Entry'}
        </button>
      </div>
    </>
  )
}
