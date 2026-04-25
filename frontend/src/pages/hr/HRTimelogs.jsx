// HRTimelogs.jsx
import { useEffect, useRef, useState } from 'react'
import { getAllClockEvents, getAllStaff, getAllHols, getMySites,
         editShift, deleteShift, bulkDeleteShifts } from '../../api/client'
import { fmtDate } from '../../api/utils'

const fmtM = m => m != null ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : '—'

function calcMins(dateStr, inTime, outTime) {
  if (!dateStr || !inTime || !outTime) return null
  const [iy, im, id] = dateStr.split('-').map(Number)
  const [ih, imm]    = inTime.split(':').map(Number)
  const [oh, omm]    = outTime.split(':').map(Number)
  let inMs  = new Date(iy, im - 1, id, ih, imm).getTime()
  let outMs = new Date(iy, im - 1, id, oh, omm).getTime()
  // Auto overnight: if out <= in, shift crosses midnight — add 24h
  if (outMs <= inMs) outMs += 86400000
  return Math.round((outMs - inMs) / 60000)
}

function F({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

const ipt = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--navy-light)', color: 'var(--text)',
  fontFamily: 'DM Sans,sans-serif', fontSize: 13, width: '100%', boxSizing: 'border-box',
}

function Toast({ toast }) {
  if (!toast) return null
  const bg = toast.type === 'error' ? 'rgba(224,85,85,.15)' : 'rgba(106,191,63,.15)'
  const col = toast.type === 'error' ? '#e05555' : 'var(--green)'
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: bg, border: `1px solid ${col}`, borderRadius: 10,
      padding: '12px 20px', fontSize: 14, fontWeight: 600, color: col,
      boxShadow: '0 4px 20px rgba(0,0,0,.25)', maxWidth: 320,
    }}>
      {toast.msg}
    </div>
  )
}

function EditModal({ entry, sites, onClose, onSaved }) {
  const [form, setForm] = useState({
    date:            entry.date       || '',
    clock_in_time:   entry.start_time || '',
    clock_out_time:  entry.end_time   || '',
    site_id:         String(entry.site_id || (sites[0]?.id ?? '')),
    scheduled_start: entry.scheduled_start || '',
    entry_notes:     entry.entry_notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const previewMins = calcMins(form.date, form.clock_in_time, form.clock_out_time)

  // Auto-calculate lateness for preview
  const latePreview = (() => {
    if (!form.clock_in_time || !form.scheduled_start) return null
    const [sh, sm] = form.scheduled_start.split(':').map(Number)
    const [ih, im] = form.clock_in_time.split(':').map(Number)
    const diff = (ih * 60 + im) - (sh * 60 + sm)
    return diff > 0 ? diff : null
  })()

  async function handleSave() {
    // No time validation — times are optional; blank = keep existing value
    setSaving(true); setErr('')
    try {
      const payload = {
        date:            form.date,
        site_id:         Number(form.site_id),
        scheduled_start: form.scheduled_start || null,
        entry_notes:     form.entry_notes || null,
      }
      if (form.clock_in_time)  payload.clock_in_time  = form.clock_in_time
      if (form.clock_out_time) payload.clock_out_time = form.clock_out_time
      await editShift(entry.id, payload)
      onSaved('✅ Shift updated')
    } catch (ex) {
      const detail = ex.response?.data?.detail
      setErr(typeof detail === 'string' ? detail : 'Failed to save changes')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0 }}>Edit Shift</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* Read-only staff name */}
        <div style={{ background: 'var(--navy-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.06em' }}>Staff Member</span>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{entry.user_name}</div>
        </div>

        {err && <div className="alert alert-red" style={{ marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={ipt} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Site</label>
            <select value={form.site_id} onChange={e => set('site_id', e.target.value)} style={ipt}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>
              Clock In <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input type="time" value={form.clock_in_time} onChange={e => set('clock_in_time', e.target.value)} style={{ ...ipt, fontFamily: 'DM Mono,monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>
              Clock Out <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input type="time" value={form.clock_out_time} onChange={e => set('clock_out_time', e.target.value)} style={{ ...ipt, fontFamily: 'DM Mono,monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Scheduled Start</label>
            <input type="time" value={form.scheduled_start} onChange={e => set('scheduled_start', e.target.value)} style={{ ...ipt, fontFamily: 'DM Mono,monospace' }} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>HR Notes</label>
          <textarea value={form.entry_notes} onChange={e => set('entry_notes', e.target.value)} rows={2}
            placeholder="Optional notes…"
            style={{ ...ipt, resize: 'vertical' }} />
        </div>

        {/* Duration / lateness preview */}
        {(previewMins != null || latePreview != null) && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previewMins != null && (
              <div style={{ background: 'var(--navy-light)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Duration</span>
                <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 900, fontSize: 16, color: previewMins > 720 ? '#b54708' : 'var(--green)' }}>
                  {fmtM(previewMins)}
                </span>
                {previewMins > 720 && <span style={{ fontSize: 11, color: '#b54708', fontWeight: 700 }}>⚠ Over 12h</span>}
                {form.clock_in_time && form.clock_out_time && form.clock_out_time <= form.clock_in_time && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>🌙 Overnight</span>
                )}
              </div>
            )}
            {latePreview != null && (
              <div style={{ background: 'rgba(224,85,85,.08)', border: '1px solid rgba(224,85,85,.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#e05555', fontWeight: 600 }}>
                ⚠ {latePreview} min{latePreview !== 1 ? 's' : ''} late — will be recorded automatically
              </div>
            )}
            {form.scheduled_start && form.clock_in_time && !latePreview && (
              <div style={{ background: 'rgba(106,191,63,.08)', border: '1px solid rgba(106,191,63,.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
                ✅ On time
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button onClick={onClose} className="btn btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-brand">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Delete', danger = true }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 420 }}>
        <h3 style={{ marginBottom: 12 }}>Confirm Action</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-outline">Cancel</button>
          <button onClick={onConfirm} className="btn" style={{ background: danger ? '#e05555' : 'var(--green)', color: '#fff' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HRTimelogs() {
  const [data,    setData]    = useState(null)
  const [staff,   setStaff]   = useState([])
  const [hols,    setHols]    = useState([])
  const [sites,   setSites]   = useState([])
  const [fil,      setFil]      = useState({ staff_id: '', site_id: '', from_date: '', to_date: '' })
  const [appliedSiteId, setAppliedSiteId] = useState(null)
  const [mode,     setMode]     = useState('timelogs')
  const [lateOnly, setLateOnly] = useState(false)

  // Selection state
  const [selected, setSelected] = useState(new Set())

  // Edit / delete modals
  const [editEntry,       setEditEntry]       = useState(null)
  const [confirmDelete,   setConfirmDelete]   = useState(null)  // entry to delete
  const [confirmBulk,     setConfirmBulk]     = useState(false)

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg, type = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    getAllStaff().then(r => setStaff(r.data || [])).catch(() => {})
    getAllHols({ status_filter: 'approved' }).then(r => setHols(r.data || [])).catch(() => {})
    getMySites().then(r => setSites(r.data || [])).catch(() => {})
    // Load all records on mount with no filters
    setAppliedSiteId(null)
    getAllClockEvents({}).then(r => setData(r.data)).catch(() => setData({ entries: [], total_mins: 0 }))
  }, [])

  function run() {
    const p = {}
    if (fil.staff_id)  p.staff_id  = Number(fil.staff_id)
    if (fil.site_id)   p.site_id   = Number(fil.site_id)
    if (fil.from_date) p.from_date = fil.from_date
    if (fil.to_date)   p.to_date   = fil.to_date
    // Track applied site filter for frontend-side filtering
    setAppliedSiteId(fil.site_id ? Number(fil.site_id) : null)
    setSelected(new Set())
    getAllClockEvents(p)
      .then(r => setData(r.data))
      .catch(() => setData({ entries: [], total_mins: 0 }))
  }

  function exportCSV() {
    if (!data?.entries?.length) return
    const rows = [['Employee', 'Date', 'Start', 'End', 'Site', 'Hours', 'Source', 'Late?', 'Notes']]
    data.entries.forEach(e => {
      rows.push([
        e.user_name || '—', e.date, e.start_time, e.end_time || '—',
        e.site_name || '—', fmtM(e.shift_minutes),
        e.is_override ? 'Override' : e.is_manual ? 'Manual' : 'QR',
        e.scheduled_start ? (e.is_late ? `Late ${e.minutes_late}m` : 'On time') : '—',
        e.entry_notes || '',
      ])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `timelogs-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  // ── Selection helpers ────────────────────────────────────────────────────────

  const allEntries = (data?.entries || []).filter(e =>
    !appliedSiteId || e.site_id === appliedSiteId
  )
  const entries = lateOnly ? allEntries.filter(e => e.is_late) : allEntries
  const onTimeCount = allEntries.filter(e => e.scheduled_start && !e.is_late).length
  const lateCount   = allEntries.filter(e => e.is_late).length

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll()   { setSelected(new Set(entries.map(e => e.id))) }
  function deselectAll() { setSelected(new Set()) }

  const allSelected = entries.length > 0 && selected.size === entries.length

  // ── Delete handlers ──────────────────────────────────────────────────────────

  async function handleDelete(entry) {
    try {
      await deleteShift(entry.id)
      showToast('✅ Shift deleted')
      run()
    } catch (ex) {
      showToast(ex.response?.data?.detail || 'Failed to delete shift', 'error')
    }
    setConfirmDelete(null)
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    try {
      const res = await bulkDeleteShifts(ids)
      showToast(`✅ ${res.data.deleted} shift${res.data.deleted !== 1 ? 's' : ''} deleted`)
      run()
    } catch (ex) {
      showToast(ex.response?.data?.detail || 'Failed to delete shifts', 'error')
    }
    setConfirmBulk(false)
  }

  function handleEditSaved(msg) {
    setEditEntry(null)
    showToast(msg)
    run()
  }

  // Holiday pay
  const holPayEntries = hols.filter(h => h.holiday_pay_flagged && h.holiday_pay_hours > 0)

  return (
    <>
      <Toast toast={toast} />

      <div style={{ marginBottom: 26 }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Time Report</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>All staff shifts — manual entries and QR clock-ins</p>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['timelogs', '⏱ Timelogs'], ['holiday_pay', '💰 Holiday Pay']].map(([v, l]) => (
          <button key={v} onClick={() => setMode(v)} style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13,
            border: `1px solid ${mode === v ? 'var(--green)' : 'var(--border)'}`,
            background: mode === v ? 'var(--green-muted)' : 'transparent',
            color: mode === v ? 'var(--green)' : 'var(--text-muted)', fontWeight: mode === v ? 700 : 400,
          }}>{l}</button>
        ))}
      </div>

      {mode === 'timelogs' && <>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <F label="Employee">
            <select value={fil.staff_id} onChange={e => setFil(f => ({ ...f, staff_id: e.target.value }))}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy-light)', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>
              <option value="">All Staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </F>
          <F label="Site">
            <select value={fil.site_id} onChange={e => setFil(f => ({ ...f, site_id: e.target.value }))}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy-light)', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>
              <option value="">All Sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
          <F label="From">
            <input type="date" value={fil.from_date} onChange={e => setFil(f => ({ ...f, from_date: e.target.value }))}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy-light)', color: 'var(--text)', fontFamily: 'DM Mono,sans-serif', fontSize: 13 }} />
          </F>
          <F label="To">
            <input type="date" value={fil.to_date} onChange={e => setFil(f => ({ ...f, to_date: e.target.value }))}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy-light)', color: 'var(--text)', fontFamily: 'DM Mono,sans-serif', fontSize: 13 }} />
          </F>
          <button onClick={run} className="btn btn-brand">🔍 Search</button>
          <button onClick={exportCSV} className="btn btn-outline">📥 Export CSV</button>
          <button
            onClick={() => { setLateOnly(v => !v); setSelected(new Set()) }}
            style={{
              padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: lateOnly ? 700 : 400,
              border: `1px solid ${lateOnly ? '#e05555' : 'var(--border)'}`,
              background: lateOnly ? 'rgba(224,85,85,.1)' : 'transparent',
              color: lateOnly ? '#e05555' : 'var(--text-muted)',
            }}
          >
            🔴 Late Only{lateOnly ? ' ✓' : ''}
          </button>
        </div>

        {data && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Shifts: <strong style={{ color: 'var(--green)' }}>{entries.length}</strong></span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>On time: <strong style={{ color: 'var(--green)' }}>{entries.filter(e => e.scheduled_start && !e.is_late).length}</strong></span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Late: <strong style={{ color: lateCount > 0 ? '#e05555' : 'var(--text-muted)', fontWeight: lateCount > 0 ? 700 : 400 }}>{entries.filter(e => e.is_late).length}</strong></span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total hours: <strong style={{ color: 'var(--green)', fontFamily: 'DM Mono,monospace' }}>{fmtM(entries.reduce((sum, e) => sum + (e.shift_minutes || 0), 0))}</strong></span>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
            background: 'rgba(224,85,85,.08)', border: '1px solid rgba(224,85,85,.3)',
            borderRadius: 10, padding: '10px 16px',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {selected.size} shift{selected.size !== 1 ? 's' : ''} selected
            </span>
            <button onClick={selectAll} className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}>Select All</button>
            <button onClick={deselectAll} className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}>Deselect All</button>
            <button onClick={() => setConfirmBulk(true)} className="btn" style={{ fontSize: 12, padding: '5px 14px', background: '#e05555', color: '#fff', border: 'none' }}>
              🗑️ Delete Selected
            </button>
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} onChange={e => e.target.checked ? selectAll() : deselectAll()}
                      title={allSelected ? 'Deselect all' : 'Select all'} />
                  </th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Scheduled</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Site</th>
                  <th>Hours</th>
                  <th>Source</th>
                  <th>Punctuality</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {entries.length ? entries.map(e => (
                  <tr key={e.id} style={{
                    background: selected.has(e.id)
                      ? 'rgba(106,191,63,.06)'
                      : e.is_late
                        ? 'rgba(224,85,85,.05)'
                        : e.shift_minutes > 720
                          ? 'rgba(181,71,8,.06)'
                          : undefined,
                  }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleRow(e.id)} />
                    </td>
                    <td>
                      <strong>{e.user_name || '—'}</strong>
                      {e.entry_notes && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>📝 {e.entry_notes}</div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{fmtDate(e.date)}</td>
                    <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12, color: 'var(--text-muted)' }}>{e.scheduled_start || '—'}</td>
                    <td style={{ color: 'var(--green)', fontFamily: 'DM Mono,monospace' }}>{e.start_time}</td>
                    <td style={{ color: 'var(--red)', fontFamily: 'DM Mono,monospace' }}>{e.end_time || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.site_name || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 700, color: e.shift_minutes > 720 ? '#b54708' : 'var(--green)' }}>
                        {fmtM(e.shift_minutes)}
                      </span>
                      {e.shift_minutes > 720 && (
                        <span title="Shift exceeds 12 hours" style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700,
                          color: '#b54708', background: '#fef3e2', padding: '1px 6px', borderRadius: 4,
                        }}>⚠ 12h+</span>
                      )}
                    </td>
                    <td>
                      {e.is_override
                        ? (
                          <>
                            <span className="badge badge-amber">⚠️ Override</span>
                            {e.manager_name && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                by {e.manager_name}
                              </div>
                            )}
                          </>
                        )
                        : e.is_manual
                          ? <span className="badge badge-blue">✏️ Manual</span>
                          : <span className="badge badge-green">📱 QR</span>
                      }
                    </td>
                    <td>
                      {e.is_late
                        ? <span className="badge badge-red">🔴 Late {e.minutes_late}m</span>
                        : e.scheduled_start
                          ? <span className="badge badge-green">✅ On time</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => setEditEntry(e)}
                          title="Edit shift"
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
                        >✏️</button>
                        <button
                          onClick={() => setConfirmDelete(e)}
                          title="Delete shift"
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(224,85,85,.4)', background: 'rgba(224,85,85,.08)', color: '#e05555', cursor: 'pointer', fontSize: 13 }}
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No records for selected filters
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>}
      </>}

      {mode === 'holiday_pay' && <>
        <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)' }}>
          Approved holidays with calculated holiday pay (based on average shift hours over 3 months)
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Days</th><th>Pay Rate</th><th>Pay Hours</th><th>Est. Amount</th></tr></thead>
              <tbody>
                {holPayEntries.length ? holPayEntries.map(h => {
                  const s       = staff.find(x => x.id === (h.user_id || h.staff_id)) || {}
                  const payRate = s.pay_rate || null
                  const estAmt  = payRate && h.holiday_pay_hours ? (payRate * h.holiday_pay_hours).toFixed(2) : null
                  return (
                    <tr key={h.id}>
                      <td><strong>{s.full_name || '—'}</strong></td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{fmtDate(h.from_date)}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>{fmtDate(h.to_date)}</td>
                      <td style={{ fontWeight: 700 }}>{h.days}</td>
                      <td style={{ fontFamily: 'DM Mono,monospace', color: 'var(--green)' }}>{payRate ? `£${payRate}/hr` : '—'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          💰 <strong style={{ fontFamily: 'DM Mono,monospace', color: 'var(--green)' }}>{h.holiday_pay_hours}h</strong>
                        </span>
                      </td>
                      <td style={{ fontFamily: 'DM Mono,monospace', fontWeight: 700, color: 'var(--green)', fontSize: 14 }}>
                        {estAmt ? `£${estAmt}` : '—'}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No holiday pay records yet. Holiday pay is calculated when HR approves a holiday request.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* Edit modal */}
      {editEntry && (
        <EditModal
          entry={editEntry}
          sites={sites}
          onClose={() => setEditEntry(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Single delete confirmation */}
      {confirmDelete && (
        <ConfirmModal
          message={`Are you sure you want to delete the shift for ${confirmDelete.user_name} on ${fmtDate(confirmDelete.date)}? This cannot be undone.`}
          confirmLabel="Delete Shift"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Bulk delete confirmation */}
      {confirmBulk && (
        <ConfirmModal
          message={`Are you sure you want to delete ${selected.size} shift${selected.size !== 1 ? 's' : ''}? This cannot be undone.`}
          confirmLabel={`Delete ${selected.size} Shift${selected.size !== 1 ? 's' : ''}`}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </>
  )
}

export default HRTimelogs
