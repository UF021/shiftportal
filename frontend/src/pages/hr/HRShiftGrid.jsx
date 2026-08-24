/**
 * Grid-view shift scheduler: rows = sites, columns = Mon-Sun.
 * Each cell can have multiple guard entries, each with independent start/end time + staff.
 * Changes are held locally; "Save All" commits to the DB.
 */
import { useState, useRef, useCallback } from 'react'
import { createScheduledShift, updateScheduledShift, deleteScheduledShift } from '../../api/client'

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtColHeader(iso) {
  const d = new Date(iso + 'T12:00:00')
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date:    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
  }
}

function isToday(iso) {
  return iso === new Date().toISOString().slice(0, 10)
}

let _uid = 0
const uid = () => `local-${++_uid}`

/** Transform API shifts array into grid rows */
function buildGridRows(shifts, sites) {
  const siteMap = {}
  for (const sh of shifts) {
    if (!siteMap[sh.site_id]) {
      siteMap[sh.site_id] = {
        site_id:   sh.site_id,
        site_name: sh.site_name,
        days:      {},
      }
    }
    const day = siteMap[sh.site_id].days
    if (!day[sh.date]) day[sh.date] = []
    day[sh.date].push({
      localId:    uid(),
      dbId:       sh.id,
      user_id:    sh.user_id,
      start_time: sh.start_time,
      end_time:   sh.end_time || '',
      _dirty:     false,
      _new:       false,
      _deleted:   false,
    })
  }
  return Object.values(siteMap).sort((a, b) => a.site_name.localeCompare(b.site_name))
}

/** Parse CSV text → array of { site_name, start_time, end_time, staff_email } */
function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const col = key => headers.indexOf(key)
  const si = col('site name'), st = col('start time'), et = col('end time'), em = col('staff email')
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim())
    return {
      site_name:   cells[si] || '',
      start_time:  cells[st] || '',
      end_time:    cells[et] || '',
      staff_email: em >= 0 ? (cells[em] || '') : '',
    }
  }).filter(r => r.site_name)
}

const inp = {
  padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--navy)', color: 'var(--text)', fontFamily: 'DM Mono,monospace',
  fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
}

const cellW = 168

export default function HRShiftGrid({ weekStart, data, onRefresh }) {
  const staffList  = data?.staff  || []
  const sitesList  = data?.sites  || []
  const days       = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const [rows,       setRows]       = useState(() => buildGridRows(data?.shifts || [], sitesList))
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState('')
  const [csvOpen,    setCsvOpen]    = useState(false)
  const [csvText,    setCsvText]    = useState('')
  const [csvErr,     setCsvErr]     = useState('')
  const [addSiteOpen, setAddSiteOpen] = useState(false)
  const [newSiteId,  setNewSiteId]  = useState('')
  const fileRef = useRef(null)

  // Rebuild when week changes (parent re-mounts with new data)
  const prevWeekRef = useRef(weekStart)
  if (prevWeekRef.current !== weekStart) {
    prevWeekRef.current = weekStart
    setRows(buildGridRows(data?.shifts || [], sitesList))
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function updateEntry(siteId, date, localId, patch) {
    setRows(prev => prev.map(r =>
      r.site_id !== siteId ? r : {
        ...r,
        days: {
          ...r.days,
          [date]: (r.days[date] || []).map(e =>
            e.localId !== localId ? e : { ...e, ...patch, _dirty: !e._new }
          ),
        },
      }
    ))
  }

  function addEntry(siteId, date) {
    setRows(prev => prev.map(r =>
      r.site_id !== siteId ? r : {
        ...r,
        days: {
          ...r.days,
          [date]: [
            ...(r.days[date] || []),
            { localId: uid(), dbId: undefined, user_id: null, start_time: '', end_time: '', _dirty: false, _new: true, _deleted: false },
          ],
        },
      }
    ))
  }

  function deleteEntry(siteId, date, localId, dbId) {
    setRows(prev => prev.map(r => {
      if (r.site_id !== siteId) return r
      const updated = (r.days[date] || []).map(e =>
        e.localId !== localId ? e : { ...e, _deleted: true }
      )
      return { ...r, days: { ...r.days, [date]: updated } }
    }))
  }

  function addSiteRow() {
    if (!newSiteId) return
    const site = sitesList.find(s => s.id === Number(newSiteId))
    if (!site) return
    if (rows.find(r => r.site_id === site.id)) { setAddSiteOpen(false); return }
    setRows(prev => [...prev, { site_id: site.id, site_name: site.name, days: {} }])
    setNewSiteId('')
    setAddSiteOpen(false)
  }

  // ── CSV import ────────────────────────────────────────────────────────────────

  function handleCSVFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText(ev.target.result)
    reader.readAsText(file)
  }

  function applyCSV() {
    setCsvErr('')
    const parsed = parseCSV(csvText)
    if (!parsed.length) { setCsvErr('No valid rows found. Check the CSV format.'); return }

    const newRows = [...rows]

    for (const row of parsed) {
      // Match site (case-insensitive)
      const site = sitesList.find(s => s.name.toLowerCase() === row.site_name.toLowerCase())
      if (!site) { setCsvErr(`Site not found: "${row.site_name}". Check spelling matches your sites list.`); return }

      // Match staff by email (optional)
      let userId = null
      if (row.staff_email) {
        const staffMember = staffList.find(s => s.email?.toLowerCase() === row.staff_email.toLowerCase())
        if (!staffMember) { setCsvErr(`Staff email not found: "${row.staff_email}". Leave blank to assign later.`); return }
        userId = staffMember.id
      }

      let siteRow = newRows.find(r => r.site_id === site.id)
      if (!siteRow) {
        siteRow = { site_id: site.id, site_name: site.name, days: {} }
        newRows.push(siteRow)
      }

      // Add one entry per day of the week
      for (const day of days) {
        if (!siteRow.days[day]) siteRow.days[day] = []
        siteRow.days[day].push({
          localId:    uid(),
          dbId:       undefined,
          user_id:    userId,
          start_time: row.start_time,
          end_time:   row.end_time,
          _dirty:     false,
          _new:       true,
          _deleted:   false,
        })
      }
    }

    setRows(newRows)
    setCsvOpen(false)
    setCsvText('')
    setSaveMsg('CSV imported — review and click Save All to commit.')
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function saveAll() {
    setSaving(true); setSaveMsg('')
    let ops = 0, errors = 0

    for (const siteRow of rows) {
      for (const date of Object.keys(siteRow.days)) {
        for (const entry of siteRow.days[date]) {
          try {
            if (entry._deleted && entry.dbId) {
              await deleteScheduledShift(entry.dbId); ops++
            } else if (entry._deleted) {
              // was new, never saved — nothing to do
            } else if (entry._new && !entry._deleted) {
              if (!entry.start_time || !entry.user_id) continue  // skip incomplete rows
              await createScheduledShift({
                site_id: siteRow.site_id, user_id: entry.user_id,
                date, start_time: entry.start_time, end_time: entry.end_time || null,
              }); ops++
            } else if (entry._dirty && entry.dbId) {
              await updateScheduledShift(entry.dbId, {
                user_id: entry.user_id, start_time: entry.start_time, end_time: entry.end_time || null,
              }); ops++
            }
          } catch { errors++ }
        }
      }
    }

    setSaving(false)
    setSaveMsg(errors ? `⚠ ${ops} saved, ${errors} failed` : `✅ ${ops} change${ops !== 1 ? 's' : ''} saved`)
    onRefresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const hasChanges = rows.some(r => Object.values(r.days).flat().some(e => e._new || e._dirty || e._deleted))

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setCsvOpen(true)} style={{
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13,
          border: '1px solid var(--border)', background: 'var(--navy-mid)', color: 'var(--text-muted)',
        }}>📂 Import CSV</button>
        <button onClick={() => setAddSiteOpen(true)} style={{
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13,
          border: '1px solid var(--border)', background: 'var(--navy-mid)', color: 'var(--text-muted)',
        }}>＋ Add Site Row</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {saveMsg && <span style={{ fontSize: 13, color: saveMsg.startsWith('✅') ? '#6abf3f' : '#f0a030' }}>{saveMsg}</span>}
          <button
            onClick={saveAll}
            disabled={saving || !hasChanges}
            style={{
              padding: '8px 20px', borderRadius: 8, cursor: hasChanges && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
              border: 'none',
              background: hasChanges ? '#6abf3f' : 'var(--navy-mid)',
              color: hasChanges ? '#fff' : 'var(--text-dim)',
              opacity: saving ? 0.7 : 1,
            }}
          >{saving ? '⏳ Saving…' : '💾 Save All'}</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{
                padding: '10px 14px', textAlign: 'left', background: 'var(--navy-mid)',
                border: '1px solid var(--border)', fontSize: 11, fontWeight: 700,
                color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em',
                minWidth: 160, position: 'sticky', left: 0, zIndex: 2,
              }}>Site</th>
              {days.map(day => {
                const { weekday, date } = fmtColHeader(day)
                const today = isToday(day)
                return (
                  <th key={day} style={{
                    padding: '10px 8px', textAlign: 'center', width: cellW,
                    background: today ? 'rgba(106,191,63,.12)' : 'var(--navy-mid)',
                    border: `1px solid ${today ? 'rgba(106,191,63,.4)' : 'var(--border)'}`,
                    fontSize: 11, fontWeight: 700, color: today ? '#6abf3f' : 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap',
                  }}>
                    <div>{weekday}</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{date}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px solid var(--border)' }}>
                  No sites yet. Import a CSV or click <strong>+ Add Site Row</strong> to begin.
                </td>
              </tr>
            )}
            {rows.map(siteRow => (
              <tr key={siteRow.site_id}>
                {/* Site name column */}
                <td style={{
                  padding: '10px 14px', verticalAlign: 'top',
                  background: 'var(--navy-mid)', border: '1px solid var(--border)',
                  fontSize: 13, fontWeight: 700, color: 'var(--text)',
                  position: 'sticky', left: 0, zIndex: 1,
                  minWidth: 160,
                }}>
                  {siteRow.site_name}
                </td>

                {/* Day cells */}
                {days.map(day => {
                  const entries = (siteRow.days[day] || []).filter(e => !e._deleted)
                  const today = isToday(day)
                  return (
                    <td key={day} style={{
                      padding: '6px', verticalAlign: 'top', width: cellW,
                      background: today ? 'rgba(106,191,63,.04)' : 'var(--navy-card)',
                      border: `1px solid ${today ? 'rgba(106,191,63,.2)' : 'var(--border)'}`,
                    }}>
                      {entries.map(entry => (
                        <div key={entry.localId} style={{
                          marginBottom: 6, padding: '6px 7px', borderRadius: 7,
                          background: entry._new ? 'rgba(106,191,63,.08)' : entry._dirty ? 'rgba(240,160,48,.08)' : 'var(--navy-light)',
                          border: `1px solid ${entry._new ? 'rgba(106,191,63,.25)' : entry._dirty ? 'rgba(240,160,48,.25)' : 'var(--border)'}`,
                          position: 'relative',
                        }}>
                          {/* Delete button */}
                          <button
                            onClick={() => deleteEntry(siteRow.site_id, day, entry.localId, entry.dbId)}
                            title="Remove this shift"
                            style={{
                              position: 'absolute', top: 4, right: 4,
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-dim)', fontSize: 12, lineHeight: 1, padding: '0 2px',
                            }}
                          >✕</button>

                          {/* Time range */}
                          <div style={{ display: 'flex', gap: 4, marginBottom: 5, paddingRight: 14 }}>
                            <input
                              type="time"
                              value={entry.start_time}
                              onChange={e => updateEntry(siteRow.site_id, day, entry.localId, { start_time: e.target.value })}
                              style={{ ...inp, width: '48%' }}
                            />
                            <span style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: '28px' }}>→</span>
                            <input
                              type="time"
                              value={entry.end_time}
                              onChange={e => updateEntry(siteRow.site_id, day, entry.localId, { end_time: e.target.value })}
                              style={{ ...inp, width: '48%' }}
                            />
                          </div>

                          {/* Staff dropdown */}
                          <select
                            value={entry.user_id || ''}
                            onChange={e => updateEntry(siteRow.site_id, day, entry.localId, { user_id: Number(e.target.value) || null })}
                            style={{ ...inp, fontFamily: 'DM Sans,sans-serif', fontSize: 12 }}
                          >
                            <option value="">— Assign guard —</option>
                            {staffList.map(s => (
                              <option key={s.id} value={s.id}>{s.full_name}</option>
                            ))}
                          </select>
                        </div>
                      ))}

                      {/* Add guard button */}
                      <button
                        onClick={() => addEntry(siteRow.site_id, day)}
                        style={{
                          width: '100%', padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                          border: '1px dashed rgba(106,191,63,.3)', background: 'transparent',
                          color: 'var(--text-dim)', fontSize: 11, fontFamily: 'DM Sans,sans-serif',
                          marginTop: entries.length ? 2 : 0,
                        }}
                      >+ Add guard</button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CSV import modal */}
      {csvOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCsvOpen(false)}>
          <div className="modal" style={{ width: 520 }}>
            <h3>📂 Import Shifts from CSV</h3>
            <p className="sub">Upload a CSV file to pre-populate the grid. Staff are matched by email address.</p>

            <div style={{ background: 'var(--navy-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'DM Sans,sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Expected format</div>
              Site Name,Start Time,End Time,Staff Email<br/>
              Westfield Shopping Centre,08:00,18:00,john.smith@example.com<br/>
              Oxford Street,22:00,06:00,<br/>
              Heathrow T2,06:00,14:00,alice.jones@example.com
            </div>

            <div style={{ marginBottom: 14 }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '9px 18px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)',
                  background: 'var(--navy-light)', color: 'var(--text-muted)', fontFamily: 'DM Sans,sans-serif', fontSize: 13,
                }}
              >📁 Choose CSV file</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSVFile} />
              {csvText && <span style={{ marginLeft: 10, fontSize: 12, color: '#6abf3f' }}>✓ File loaded ({csvText.split('\n').length - 1} data rows)</span>}
            </div>

            {csvText && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Preview</div>
                <pre style={{ background: 'var(--navy)', borderRadius: 7, padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', overflowX: 'auto', maxHeight: 140, fontFamily: 'DM Mono,monospace' }}>
                  {csvText.slice(0, 600)}{csvText.length > 600 ? '…' : ''}
                </pre>
              </div>
            )}

            {csvErr && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(224,85,85,.1)', color: '#e05555', fontSize: 12, marginBottom: 10 }}>{csvErr}</div>}

            <div className="modal-footer">
              <button onClick={() => { setCsvOpen(false); setCsvText(''); setCsvErr('') }} className="btn btn-outline">Cancel</button>
              <button onClick={applyCSV} disabled={!csvText} className="btn btn-brand">Apply to Grid</button>
            </div>
          </div>
        </div>
      )}

      {/* Add site row modal */}
      {addSiteOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAddSiteOpen(false)}>
          <div className="modal" style={{ width: 380 }}>
            <h3>＋ Add Site Row</h3>
            <p className="sub">Select a site to add as a new row in the grid.</p>
            <div className="field">
              <label>Site</label>
              <select value={newSiteId} onChange={e => setNewSiteId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy-light)', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 14 }}>
                <option value="">Select a site…</option>
                {sitesList.filter(s => !rows.find(r => r.site_id === s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button onClick={() => setAddSiteOpen(false)} className="btn btn-outline">Cancel</button>
              <button onClick={addSiteRow} disabled={!newSiteId} className="btn btn-brand">Add Row</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
