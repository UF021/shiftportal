import { useEffect, useState, useCallback } from 'react'
import { getTrainingAdmin, sendTrainingReminder, getReminderLogs } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const MODULES = ['module1', 'module2', 'module3']
const MODULE_LABELS = { module1: 'Company Policies', module2: 'SIA Door Supervisor', module3: "Martyn's Law" }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB')
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

function targetLabel(t) {
  if (t === 'payroll')      return { text: 'Payroll staff',       col: '#1565c0', bg: 'rgba(21,101,192,.12)' }
  if (t === 'subcontract')  return { text: 'Subcontractors',      col: '#6a1b9a', bg: 'rgba(106,27,154,.12)' }
  if (t === 'individual')   return { text: 'Individual',          col: '#00695c', bg: 'rgba(0,105,92,.12)' }
  if (t === 'auto')         return { text: 'Auto (payroll)',       col: '#e65100', bg: 'rgba(230,81,0,.12)' }
  return                           { text: t,                     col: '#555',    bg: '#eee' }
}

export default function HRTraining() {
  const { colour }              = useBrand()
  const c                       = colour || '#6abf3f'
  const [data,      setData]    = useState([])
  const [loading,   setLoad]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search,    setSearch]  = useState('')
  const [detail,    setDetail]  = useState(null)

  // Reminder modal state
  const [showModal,    setShowModal]    = useState(false)
  const [mode,         setMode]         = useState('payroll')  // 'payroll' | 'subcontract' | 'individual'
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [sending,      setSending]      = useState(false)
  const [sendResult,   setSendResult]   = useState(null)

  // Reminder logs
  const [logs,        setLogs]        = useState([])
  const [logsLoading, setLogsLoading] = useState(true)

  const loadData = useCallback(() => {
    setLoad(true)
    getTrainingAdmin()
      .then(r => setData(r.data || []))
      .catch(() => {})
      .finally(() => setLoad(false))
  }, [])

  const loadLogs = useCallback(() => {
    setLogsLoading(true)
    getReminderLogs()
      .then(r => setLogs(r.data || []))
      .catch(() => {})
      .finally(() => setLogsLoading(false))
  }, [])

  useEffect(() => { loadData(); loadLogs() }, [loadData, loadLogs])

  // Incomplete staff (for individual picker)
  const incomplete = data.filter(row =>
    !MODULES.every(m => row[m]?.passed && !isExpired(row[m]?.expires_at))
  )

  // Estimated recipient count for modal preview
  function recipientCount() {
    if (mode === 'individual') return selectedIds.size
    const pool = incomplete.filter(row => {
      if (mode === 'payroll')     return !row.staff_type || row.staff_type === 'payroll'
      if (mode === 'subcontract') return row.staff_type === 'subcontract'
      return true
    })
    return pool.length
  }

  async function doSend() {
    setSending(true); setSendResult(null)
    try {
      const body = {}
      if (mode === 'individual') {
        body.user_ids = [...selectedIds]
      } else {
        body.staff_type = mode
      }
      const res = await sendTrainingReminder(body)
      setSendResult({ ok: true, msg: res.data.message })
      loadLogs()
    } catch (ex) {
      setSendResult({ ok: false, msg: ex.response?.data?.detail || 'Failed to send reminders' })
    } finally {
      setSending(false)
    }
  }

  function openModal() {
    setMode('payroll'); setSelectedIds(new Set()); setSendResult(null); setShowModal(true)
  }

  const filtered = data.filter(row => {
    const allPassed = MODULES.every(m => row[m]?.passed && !isExpired(row[m]?.expires_at))
    const days      = daysUntil(row.deadline)
    const overdue   = days !== null && days < 0 && !allPassed
    if (filter === 'complete'   && !allPassed) return false
    if (filter === 'incomplete' && allPassed)  return false
    if (filter === 'overdue'    && !overdue)   return false
    const sType = row.staff_type || 'payroll'
    if (typeFilter !== 'all' && sType !== typeFilter) return false
    if (search && !row.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !row.staff_id?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const total    = data.length
  const complete = data.filter(r => MODULES.every(m => r[m]?.passed && !isExpired(r[m]?.expires_at))).length
  const overdueN = data.filter(r => {
    const days = daysUntil(r.deadline)
    const allPassed = MODULES.every(m => r[m]?.passed && !isExpired(r[m]?.expires_at))
    return days !== null && days < 0 && !allPassed
  }).length

  const FILTERS = [
    { key: 'all',        label: `All (${total})` },
    { key: 'complete',   label: `Complete (${complete})` },
    { key: 'incomplete', label: `Incomplete (${total - complete})` },
    { key: 'overdue',    label: `Overdue (${overdueN})` },
  ]

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 26, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Training Monitor</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Track staff completion of the Security Officer Training Programme</p>
        </div>
        <button
          onClick={openModal}
          disabled={loading}
          className="btn"
          style={{ background: '#e65100', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}
        >
          📧 Send Training Reminders
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Staff', value: total,     icon: '👥', col: c },
          { label: 'Fully Complete', value: complete, icon: '✅', col: '#2e7d32' },
          { label: 'Overdue', value: overdueN,       icon: '🚨', col: '#c62828' },
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
        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
          {[['all','All'],['payroll','Payroll'],['subcontract','Sub']].map(([v,l]) => (
            <button key={v} onClick={() => setTypeFilter(v)} style={{
              padding: '7px 13px', borderRadius: 20, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12,
              border: `1px solid ${typeFilter === v ? '#1565c0' : 'var(--border)'}`,
              background: typeFilter === v ? 'rgba(21,101,192,.12)' : 'transparent',
              color: typeFilter === v ? '#1565c0' : 'var(--text-muted)', fontWeight: typeFilter === v ? 700 : 400,
            }}>{l}</button>
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
                  {['Staff Member', 'Type', 'Deadline', 'Company Policies', 'SIA Training', "Martyn's Law", 'Status', ''].map(h => (
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
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                          background: row.staff_type === 'subcontract' ? 'rgba(106,27,154,.15)' : 'rgba(21,101,192,.12)',
                          color: row.staff_type === 'subcontract' ? '#6a1b9a' : '#1565c0',
                        }}>
                          {row.staff_type === 'subcontract' ? 'Sub' : 'Payroll'}
                        </span>
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
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No staff found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reminder log */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          📋 Reminder History
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>— last 50 sends</span>
        </h3>
        {logsLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading log…</p>
        ) : logs.length === 0 ? (
          <div className="card" style={{ padding: '20px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
            No reminders have been sent yet.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--navy-light)', borderBottom: '1px solid var(--border)' }}>
                    {['Date & Time', 'Sent by', 'Target', 'Recipients', 'Source'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => {
                    const tl = targetLabel(l.target_type)
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid rgba(106,191,63,.06)' }}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>{fmtDateTime(l.sent_at)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{l.sent_by}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: tl.bg, color: tl.col }}>
                            {tl.text}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{l.recipient_count}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: l.triggered_by === 'auto' ? 'rgba(230,81,0,.12)' : 'rgba(46,125,50,.12)',
                            color: l.triggered_by === 'auto' ? '#e65100' : '#2e7d32',
                          }}>
                            {l.triggered_by === 'auto' ? '⚙ Automated' : '👤 Manual'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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

      {/* Reminder modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !sending && setShowModal(false)}>
          <div className="modal" style={{ width: 580 }}>
            <h3>📧 Send Training Reminders</h3>
            <p className="sub">Staff with incomplete training will receive an urgent email with a 7-day suspension warning.</p>

            {/* Mode selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Who to remind</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'payroll',     label: '👷 Payroll Staff' },
                  { key: 'subcontract', label: '🔖 Subcontractors' },
                  { key: 'individual',  label: '👤 Individual' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => { setMode(opt.key); setSelectedIds(new Set()); setSendResult(null) }} style={{
                    padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${mode === opt.key ? '#e65100' : 'var(--border)'}`,
                    background: mode === opt.key ? 'rgba(230,81,0,.1)' : 'transparent',
                    color: mode === opt.key ? '#e65100' : 'var(--text-muted)',
                    fontWeight: mode === opt.key ? 700 : 400,
                    fontFamily: 'DM Sans,sans-serif', fontSize: 13,
                    transition: 'all .15s',
                  }}>{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Individual picker */}
            {mode === 'individual' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  Select staff with incomplete training
                </div>
                {incomplete.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>✅ All staff have completed their training.</p>
                ) : (
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--navy-light)' }}>
                    {/* Select all toggle */}
                    <div
                      onClick={() => {
                        if (selectedIds.size === incomplete.length) {
                          setSelectedIds(new Set())
                        } else {
                          setSelectedIds(new Set(incomplete.map(r => r.user_id)))
                        }
                      }}
                      style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, border: '2px solid',
                        borderColor: selectedIds.size === incomplete.length ? '#e65100' : 'var(--border)',
                        background: selectedIds.size === incomplete.length ? '#e65100' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {selectedIds.size === incomplete.length && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                      </div>
                      {selectedIds.size === incomplete.length ? 'Deselect all' : `Select all (${incomplete.length})`}
                    </div>

                    {incomplete.map(row => {
                      const checked = selectedIds.has(row.user_id)
                      const missing = MODULES.filter(m => !(row[m]?.passed && !isExpired(row[m]?.expires_at)))
                      return (
                        <div
                          key={row.user_id}
                          onClick={() => {
                            const next = new Set(selectedIds)
                            checked ? next.delete(row.user_id) : next.add(row.user_id)
                            setSelectedIds(next)
                          }}
                          style={{ padding: '10px 14px', borderBottom: '1px solid rgba(106,191,63,.07)', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', transition: 'background .1s', background: checked ? 'rgba(230,81,0,.06)' : 'transparent' }}
                        >
                          <div style={{
                            width: 16, height: 16, borderRadius: 4, border: '2px solid', flexShrink: 0, marginTop: 1,
                            borderColor: checked ? '#e65100' : 'var(--border)',
                            background: checked ? '#e65100' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{row.full_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              Missing: {missing.map(m => MODULE_LABELS[m]).join(', ')}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0,
                            background: row.staff_type === 'subcontract' ? 'rgba(106,27,154,.15)' : 'rgba(21,101,192,.12)',
                            color: row.staff_type === 'subcontract' ? '#6a1b9a' : '#1565c0',
                          }}>{row.staff_type === 'subcontract' ? 'Sub' : 'Payroll'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Recipient preview */}
            <div style={{
              padding: '12px 16px', borderRadius: 8, marginBottom: 16,
              background: recipientCount() > 0 ? 'rgba(230,81,0,.08)' : 'rgba(120,140,120,.08)',
              border: `1px solid ${recipientCount() > 0 ? 'rgba(230,81,0,.3)' : 'var(--border)'}`,
              fontSize: 13, fontWeight: 600,
              color: recipientCount() > 0 ? '#e65100' : 'var(--text-muted)',
            }}>
              {recipientCount() > 0
                ? `📤 ${recipientCount()} staff member${recipientCount() !== 1 ? 's' : ''} will receive a reminder email`
                : mode === 'individual'
                  ? 'Select at least one staff member'
                  : '✅ No incomplete training found for this group'}
            </div>

            {/* Result feedback */}
            {sendResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600,
                background: sendResult.ok ? 'rgba(46,125,50,.1)' : 'rgba(198,40,40,.1)',
                border: `1px solid ${sendResult.ok ? 'rgba(46,125,50,.3)' : 'rgba(198,40,40,.3)'}`,
                color: sendResult.ok ? '#2e7d32' : '#c62828',
              }}>
                {sendResult.ok ? '✅' : '❌'} {sendResult.msg}
              </div>
            )}

            <div className="modal-footer">
              <button onClick={() => setShowModal(false)} disabled={sending} className="btn btn-outline">
                {sendResult?.ok ? 'Close' : 'Cancel'}
              </button>
              {!sendResult?.ok && (
                <button
                  onClick={doSend}
                  disabled={sending || recipientCount() === 0}
                  className="btn"
                  style={{ background: '#e65100', color: '#fff', border: 'none' }}
                >
                  {sending ? '⏳ Sending…' : `📧 Send to ${recipientCount()} Staff`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
