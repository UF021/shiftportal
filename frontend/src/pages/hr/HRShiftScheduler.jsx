import { useState, useEffect, useCallback } from 'react'
import { useBrand } from '../../api/BrandContext'
import {
  getShiftWeek, createScheduledShift, updateScheduledShift,
  deleteScheduledShift, copyShiftWeek,
} from '../../api/client'

const STATUS = {
  scheduled:  { bg: 'rgba(59,130,246,.14)',  border: '#3b82f6', text: '#93c5fd', label: 'Scheduled' },
  upcoming:   { bg: 'rgba(6,182,212,.14)',   border: '#06b6d4', text: '#67e8f9', label: 'Upcoming'  },
  clocked_in: { bg: 'rgba(16,185,129,.14)',  border: '#10b981', text: '#6ee7b7', label: 'Clocked In'},
  completed:  { bg: 'rgba(22,163,74,.14)',   border: '#16a34a', text: '#86efac', label: 'Completed' },
  no_show:    { bg: 'rgba(239,68,68,.14)',   border: '#ef4444', text: '#fca5a5', label: 'No Show'   },
}

const navBtn = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--navy-mid)', color: 'var(--text-muted)', fontSize: 13,
  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
}

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--navy)',
  color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
}

function weekMonday(iso) {
  const d = iso ? new Date(iso + 'T12:00:00') : new Date()
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d.toISOString().slice(0, 10)
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDay(iso) {
  const d = new Date(iso + 'T12:00:00')
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date:    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
  }
}

function isToday(iso) {
  return iso === new Date().toISOString().slice(0, 10)
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 4,
      }}>{label}</label>
      {children}
    </div>
  )
}

export default function HRShiftScheduler() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [weekStart, setWeekStart] = useState(() => weekMonday(null))
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)
  const [copyOpen,  setCopyOpen]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')
  const [form,      setForm]      = useState({})
  const [copyForm,   setCopyForm]   = useState({ to_week: '' })
  const [typeFilter, setTypeFilter] = useState('all')

  const load = useCallback((ws) => {
    setLoading(true)
    getShiftWeek(ws)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(weekStart) }, [weekStart, load])

  function prevWeek() { setWeekStart(w => addDays(w, -7)) }
  function nextWeek() { setWeekStart(w => addDays(w,  7)) }
  function goToday()  { setWeekStart(weekMonday(null)) }

  function openAdd(date) {
    setForm({ date, user_id: '', site_id: '', start_time: '', end_time: '', notes: '' })
    setErr('')
    setModal({ type: 'add' })
  }

  function openEdit(shift) {
    setForm({
      date:       shift.date,
      user_id:    String(shift.user_id),
      site_id:    shift.site_id ? String(shift.site_id) : '',
      start_time: shift.start_time,
      end_time:   shift.end_time || '',
      notes:      shift.notes || '',
    })
    setErr('')
    setModal({ type: 'edit', shift })
  }

  const set = (f) => e => setForm(v => ({ ...v, [f]: e.target.value }))

  async function saveShift() {
    if (!form.user_id && modal.type === 'add') { setErr('Please select a staff member.'); return }
    if (!form.start_time) { setErr('Start time is required.'); return }
    setSaving(true); setErr('')
    try {
      if (modal.type === 'add') {
        await createScheduledShift({
          user_id:    Number(form.user_id),
          site_id:    form.site_id    ? Number(form.site_id) : null,
          date:       form.date,
          start_time: form.start_time,
          end_time:   form.end_time   || null,
          notes:      form.notes      || null,
        })
      } else {
        await updateScheduledShift(modal.shift.id, {
          site_id:    form.site_id    ? Number(form.site_id) : null,
          date:       form.date,
          start_time: form.start_time,
          end_time:   form.end_time   || null,
          notes:      form.notes      || null,
        })
      }
      setModal(null)
      load(weekStart)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this shift?')) return
    setSaving(true)
    try {
      await deleteScheduledShift(modal.shift.id)
      setModal(null)
      load(weekStart)
    } catch {
      setErr('Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyWeek() {
    if (!copyForm.to_week) { setErr('Please pick a date in the target week.'); return }
    setSaving(true); setErr('')
    try {
      const r = await copyShiftWeek({ from_week: weekStart, to_week: copyForm.to_week })
      setCopyOpen(false)
      setCopyForm({ to_week: '' })
      window.alert(r.data.message)
      load(weekStart)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Copy failed.')
    } finally {
      setSaving(false)
    }
  }

  // Group shifts by date (filtered by staff type)
  const visibleShifts = (data?.shifts || []).filter(s =>
    typeFilter === 'all' || (s.staff_type || 'payroll') === typeFilter
  )
  const byDate = {}
  for (const s of visibleShifts) {
    ;(byDate[s.date] = byDate[s.date] || []).push(s)
  }

  const weekEnd = data?.week_end || addDays(weekStart, 6)
  const days    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const fmtRange = () => {
    const s = new Date(weekStart + 'T12:00:00')
    const e = new Date(weekEnd   + 'T12:00:00')
    return (
      s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' – ' +
      e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Shift Scheduler</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Plan and manage staff shifts for the week</div>
        </div>
        <button onClick={() => { setCopyOpen(true); setErr('') }} style={{
          padding: '8px 16px', borderRadius: 8, border: `1px solid ${c}`,
          background: 'transparent', color: c, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
        }}>
          Copy Week
        </button>
      </div>

      {/* Staff type toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['all','All Staff'],['payroll','Payroll'],['subcontract','Subcontractors']].map(([v,l]) => (
          <button key={v} onClick={() => setTypeFilter(v)} style={{
            padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12,
            border: `1px solid ${typeFilter===v ? '#1565c0' : 'var(--border)'}`,
            background: typeFilter===v ? 'rgba(21,101,192,.12)' : 'transparent',
            color: typeFilter===v ? '#1565c0' : 'var(--text-muted)', fontWeight: typeFilter===v ? 700 : 400,
          }}>{l}</button>
        ))}
      </div>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={prevWeek} style={navBtn}>‹ Prev</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 180 }}>
          {fmtRange()}
        </div>
        <button onClick={goToday} style={navBtn}>Today</button>
        <button onClick={nextWeek} style={navBtn}>Next ›</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#fca5a5', fontSize: 14 }}>Failed to load shift data.</div>
      ) : (
        <>
          {/* Week grid */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(138px, 1fr))', gap: 6, minWidth: 980 }}>
              {days.map(dayIso => {
                const { weekday, date } = fmtDay(dayIso)
                const dayShifts = byDate[dayIso] || []
                const today = isToday(dayIso)
                return (
                  <div key={dayIso} style={{
                    background: 'var(--navy-mid)',
                    border: `1px solid ${today ? c : 'var(--border)'}`,
                    borderRadius: 10, overflow: 'hidden',
                    boxShadow: today ? `0 0 0 1px ${c}` : 'none',
                  }}>
                    {/* Day header */}
                    <div style={{
                      padding: '8px 10px', borderBottom: '1px solid var(--border)',
                      background: today ? c + '22' : 'transparent',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: today ? c : 'var(--text-muted)' }}>
                        {weekday}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: today ? c : 'var(--text)' }}>
                        {date}
                      </div>
                    </div>

                    {/* Shifts */}
                    <div style={{ padding: '6px 6px 4px' }}>
                      {dayShifts.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0' }}>No shifts</div>
                      ) : dayShifts.map(shift => {
                        const st = STATUS[shift.status] || STATUS.scheduled
                        return (
                          <div key={shift.id} onClick={() => openEdit(shift)} style={{
                            background: st.bg,
                            border: `1px solid ${st.border}44`,
                            borderLeft: `3px solid ${st.border}`,
                            borderRadius: 7, padding: '7px 8px', marginBottom: 5,
                            cursor: 'pointer', transition: 'opacity .15s',
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: st.text, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
                              {st.label}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {shift.user_name}
                            </div>
                            <div style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)', marginTop: 1 }}>
                              {shift.start_time}{shift.end_time ? ` – ${shift.end_time}` : ''}
                            </div>
                            {shift.site_name && (
                              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {shift.site_name}
                              </div>
                            )}
                            {shift.no_show_alerted && (
                              <div style={{ fontSize: 9, color: '#fca5a5', marginTop: 3, fontWeight: 700 }}>HR alerted</div>
                            )}
                          </div>
                        )
                      })}

                      {/* Add shift button */}
                      <button onClick={() => openAdd(dayIso)} style={{
                        width: '100%', padding: '5px', borderRadius: 6,
                        border: '1px dashed var(--border)', background: 'transparent',
                        color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer',
                        fontFamily: 'DM Sans,sans-serif', marginBottom: 2,
                      }}>
                        + Add
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer stats */}
          <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{data.shifts.length} shift(s) this week</span>
            <span>·</span>
            <span>{data.staff.length} active staff</span>
            <span>·</span>
            <span>{data.sites.length} site(s)</span>
            {/* Status key */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {Object.entries(STATUS).map(([, st]) => (
                <span key={st.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: st.border, display: 'inline-block' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{st.label}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Add / Edit modal ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {modal.type === 'add' ? 'Add Shift' : 'Edit Shift'}
            </h3>

            {err && (
              <div style={{ background: '#2d1515', border: '1px solid #e05555', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5', marginBottom: 14 }}>
                {err}
              </div>
            )}

            {modal.type === 'add' && (
              <Field label="Staff Member">
                <select style={inp} value={form.user_id} onChange={set('user_id')}>
                  <option value="">Select staff…</option>
                  {data?.staff.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </Field>
            )}

            {modal.type === 'edit' && (
              <div style={{ marginBottom: 14, padding: '8px 10px', background: 'var(--navy)', borderRadius: 7, fontSize: 13, color: 'var(--text)' }}>
                {modal.shift.user_name}
              </div>
            )}

            <Field label="Date">
              <input style={inp} type="date" value={form.date} onChange={set('date')} />
            </Field>

            <Field label="Site">
              <select style={inp} value={form.site_id} onChange={set('site_id')}>
                <option value="">No specific site</option>
                {data?.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Start Time">
                <input style={inp} type="time" value={form.start_time} onChange={set('start_time')} />
              </Field>
              <Field label="End Time">
                <input style={inp} type="time" value={form.end_time} onChange={set('end_time')} placeholder="Optional" />
              </Field>
            </div>

            <Field label="Notes">
              <textarea style={{ ...inp, height: 66, resize: 'vertical' }} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" />
            </Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {modal.type === 'edit' && (
                <button onClick={handleDelete} disabled={saving} style={{
                  padding: '10px 14px', borderRadius: 8, border: '1px solid #ef4444',
                  background: 'transparent', color: '#fca5a5', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                }}>Delete</button>
              )}
              <button onClick={() => setModal(null)} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: 13,
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
              }}>Cancel</button>
              <button onClick={saveShift} disabled={saving} style={{
                flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                background: c, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans,sans-serif', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving…' : (modal.type === 'add' ? 'Add Shift' : 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Copy week modal ── */}
      {copyOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 380, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Copy Week</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Copy all shifts from <strong style={{ color: 'var(--text)' }}>{fmtRange()}</strong> to another week. Duplicate shifts (same staff + date + time) are skipped.
            </p>

            {err && (
              <div style={{ background: '#2d1515', border: '1px solid #e05555', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5', marginBottom: 14 }}>{err}</div>
            )}

            <Field label="Any date in the target week">
              <input style={inp} type="date" value={copyForm.to_week} onChange={e => setCopyForm({ to_week: e.target.value })} />
            </Field>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setCopyOpen(false); setErr('') }} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: 13,
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
              }}>Cancel</button>
              <button onClick={handleCopyWeek} disabled={saving} style={{
                flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                background: c, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans,sans-serif', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Copying…' : 'Copy Shifts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
