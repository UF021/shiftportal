import { useEffect, useState } from 'react'
import { getTrainingAdmin, sendTrainingReminder } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const MODULES = ['module1', 'module2', 'module3']
const MODULE_LABELS = { module1: 'Company Policies', module2: 'SIA Door Supervisor', module3: "Martyn's Law" }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB')
}

function isExpired(iso) {
  if (!iso) return false
  return new Date(iso) < new Date()
}

function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24))
}

function ModuleBadge({ prog }) {
  if (!prog) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
  if (prog.passed && !isExpired(prog.expires_at)) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: '#6abf3f', background: 'rgba(106,191,63,.15)', padding: '2px 8px', borderRadius: 20 }}>✓ {prog.score}/10</span>
  }
  if (prog.passed && isExpired(prog.expires_at)) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: '#e65100', background: 'rgba(230,81,0,.12)', padding: '2px 8px', borderRadius: 20 }}>⚠ Expired</span>
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#e53935', background: 'rgba(229,57,53,.1)', padding: '2px 8px', borderRadius: 20 }}>✗ {prog.score}/10</span>
}

function OverallBadge({ row }) {
  const allPassed = MODULES.every(m => row[m]?.passed && !isExpired(row[m]?.expires_at))
  const anyExpired = MODULES.some(m => row[m]?.passed && isExpired(row[m]?.expires_at))
  const anyStarted = MODULES.some(m => row[m])
  if (allPassed) return <span className="badge badge-green">✓ Complete</span>
  if (anyExpired) return <span className="badge badge-amber">⚠ Refresh needed</span>
  if (anyStarted) return <span className="badge badge-grey">In progress</span>
  return <span className="badge badge-grey">Not started</span>
}

export default function HRTraining() {
  const { colour }       = useBrand()
  const c                = colour || '#6abf3f'
  const [data,      setData]      = useState([])
  const [loading,   setLoad]      = useState(true)
  const [filter,    setFilter]    = useState('all')   // all | complete | incomplete | overdue
  const [search,    setSearch]    = useState('')
  const [detail,    setDetail]    = useState(null)
  const [reminding, setReminding] = useState(false)
  const [remindMsg, setRemindMsg] = useState('')

  useEffect(() => {
    getTrainingAdmin()
      .then(r => setData(r.data || []))
      .catch(() => {})
      .finally(() => setLoad(false))
  }, [])

  const filtered = data.filter(row => {
    const allPassed  = MODULES.every(m => row[m]?.passed && !isExpired(row[m]?.expires_at))
    const anyExpired = MODULES.some(m => row[m]?.passed && isExpired(row[m]?.expires_at))
    const days       = daysUntil(row.deadline)
    const overdue    = days !== null && days < 0 && !allPassed
    if (filter === 'complete'   && !allPassed) return false
    if (filter === 'incomplete' && allPassed)  return false
    if (filter === 'overdue'    && !overdue)   return false
    if (search && !row.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !row.staff_id?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Stats
  const total    = data.length
  const complete = data.filter(r => MODULES.every(m => r[m]?.passed && !isExpired(r[m]?.expires_at))).length
  const overdue  = data.filter(r => {
    const days = daysUntil(r.deadline)
    const allPassed = MODULES.every(m => r[m]?.passed && !isExpired(r[m]?.expires_at))
    return days !== null && days < 0 && !allPassed
  }).length

  const FILTERS = [
    { key: 'all',        label: `All (${total})` },
    { key: 'complete',   label: `Complete (${complete})` },
    { key: 'incomplete', label: `Incomplete (${total - complete})` },
    { key: 'overdue',    label: `Overdue (${overdue})` },
  ]

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 26, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Training Monitor</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Track staff completion of the Security Officer Training Programme</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button
            onClick={async () => {
              setReminding(true); setRemindMsg('')
              try {
                const res = await sendTrainingReminder()
                setRemindMsg(`✅ ${res.data.message}`)
              } catch (ex) {
                setRemindMsg(`❌ ${ex.response?.data?.detail || 'Failed to send reminders'}`)
              } finally { setReminding(false) }
            }}
            disabled={reminding || loading}
            className="btn"
            style={{ background: '#e65100', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}
          >
            {reminding ? '⏳ Sending…' : '📧 Send Training Reminders'}
          </button>
          {remindMsg && (
            <div style={{ fontSize: 12, fontWeight: 600, color: remindMsg.startsWith('✅') ? '#2e7d32' : '#c62828', maxWidth: 300, textAlign: 'right' }}>
              {remindMsg}
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Staff', value: total, icon: '👥', col: c },
          { label: 'Fully Complete', value: complete, icon: '✅', col: '#2e7d32' },
          { label: 'Overdue', value: overdue, icon: '🚨', col: '#c62828' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.col }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or staff ID…"
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--navy-light)', color: 'var(--text)', fontSize: 13,
            fontFamily: 'DM Sans,sans-serif', outline: 'none', flex: 1, minWidth: 180,
          }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '7px 14px', borderRadius: 20, border: `1px solid ${filter === f.key ? c : 'var(--border)'}`,
              background: filter === f.key ? c + '22' : 'transparent',
              color: filter === f.key ? c : 'var(--text-muted)',
              fontWeight: filter === f.key ? 700 : 400, fontSize: 12, cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--navy-light)', borderBottom: '1px solid var(--border)' }}>
                  {['Staff Member', 'Deadline', 'Company Policies', 'SIA Training', "Martyn's Law", 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const days = daysUntil(row.deadline)
                  const allPassed = MODULES.every(m => row[m]?.passed && !isExpired(row[m]?.expires_at))
                  const overdue = days !== null && days < 0 && !allPassed
                  return (
                    <tr key={row.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700 }}>{row.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>{row.staff_id || '—'}</div>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {row.deadline ? (
                          <span style={{ fontSize: 12, color: overdue ? '#c62828' : days <= 3 ? '#e65100' : 'var(--text-muted)' }}>
                            {fmtDate(row.deadline)}
                            {!allPassed && days !== null && (
                              <span style={{ display: 'block', fontSize: 10 }}>
                                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days}d left`}
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}><ModuleBadge prog={row.module1} /></td>
                      <td style={{ padding: '12px 14px' }}><ModuleBadge prog={row.module2} /></td>
                      <td style={{ padding: '12px 14px' }}><ModuleBadge prog={row.module3} /></td>
                      <td style={{ padding: '12px 14px' }}><OverallBadge row={row} /></td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={() => setDetail(row)} style={{
                          padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                          background: 'transparent', color: 'var(--text-muted)', fontSize: 11,
                          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                        }}>View</button>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No staff found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ width: 560 }}>
            <h3>{detail.full_name}</h3>
            <p className="sub">{detail.email} &nbsp;·&nbsp; Staff ID: {detail.staff_id || '—'}</p>

            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--navy-light)', borderRadius: 8, fontSize: 12 }}>
              <div>Activated: {fmtDate(detail.activated_at)}</div>
              <div style={{ marginTop: 4 }}>Training Deadline: <strong>{fmtDate(detail.deadline)}</strong>
                {detail.deadline && (() => {
                  const d = daysUntil(detail.deadline)
                  const allPassed = MODULES.every(m => detail[m]?.passed && !isExpired(detail[m]?.expires_at))
                  if (allPassed) return null
                  return <span style={{ marginLeft: 8, color: d < 0 ? '#c62828' : d <= 3 ? '#e65100' : 'var(--text-muted)', fontWeight: 700 }}>
                    {d < 0 ? `(${Math.abs(d)}d overdue)` : d === 0 ? '(Today!)' : `(${d}d left)`}
                  </span>
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MODULES.map(m => {
                const prog = detail[m]
                const passed = prog?.passed && !isExpired(prog?.expires_at)
                const expired = prog?.passed && isExpired(prog?.expires_at)
                return (
                  <div key={m} style={{ padding: '12px 16px', background: 'var(--navy-light)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{MODULE_LABELS[m]}</div>
                    {!prog ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not started</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
                        <span>Score: <strong>{prog.score}/10</strong></span>
                        <span>Attempts: <strong>{prog.attempts}</strong></span>
                        {prog.completed_at && <span>Completed: <strong>{fmtDate(prog.completed_at)}</strong></span>}
                        {prog.expires_at && <span style={{ color: expired ? '#c62828' : 'var(--text-muted)' }}>
                          {expired ? '⚠ Expired' : `Expires: ${fmtDate(prog.expires_at)}`}
                        </span>}
                        <ModuleBadge prog={prog} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="modal-footer">
              <button onClick={() => setDetail(null)} className="btn btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
