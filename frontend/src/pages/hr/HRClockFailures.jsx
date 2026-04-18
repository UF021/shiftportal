// HRClockFailures.jsx
import { useEffect, useState } from 'react'
import { getClockFailures, reinstateUser, getAllStaff } from '../../api/client'
import { fmtDate } from '../../api/utils'

const REASON_LABELS = {
  gps_mismatch:     lbl => `Wrong Location (${Math.round(lbl)}m away)`,
  id_not_found:     () => 'Staff ID Not Found',
  name_mismatch:    () => 'Name Mismatch',
  account_blocked:  () => 'Account Suspended',
}

function reasonLabel(row) {
  if (row.failure_reason === 'gps_mismatch' && row.distance_metres != null) {
    return `Wrong Location (${Math.round(row.distance_metres)} metres away)`
  }
  const fn = REASON_LABELS[row.failure_reason]
  return fn ? fn() : row.failure_reason
}

function F({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{label}</div>
      {children}
    </div>
  )
}

export default function HRClockFailures() {
  const [rows,      setRows]      = useState(null)
  const [staff,     setStaff]     = useState([])
  const [fil,       setFil]       = useState({ staff_id:'', from_date:'' })
  const [reinstating, setReinstating] = useState(null)

  useEffect(() => {
    load()
    getAllStaff().then(r => setStaff(r.data || [])).catch(() => {})
  }, [])

  function load() {
    getClockFailures()
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
  }

  async function reinstate(userId, name) {
    if (!window.confirm(`Reinstate ${name} and clear their GPS failure count?`)) return
    setReinstating(userId)
    try {
      await reinstateUser(userId)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to reinstate')
    } finally {
      setReinstating(null)
    }
  }

  const filtered = (rows || []).filter(r => {
    if (fil.staff_id && r.user_id !== Number(fil.staff_id)) return false
    if (fil.from_date && r.attempted_at && r.attempted_at.split('T')[0] < fil.from_date) return false
    return true
  })

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Clock Alerts</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Failed clock-in attempts — wrong location, ID errors, suspended accounts</p>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'flex-end' }}>
        <F label="Staff Member">
          <select value={fil.staff_id} onChange={e => setFil(f => ({ ...f, staff_id: e.target.value }))}
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
            <option value="">All Staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </F>
        <F label="From Date">
          <input type="date" value={fil.from_date} onChange={e => setFil(f => ({ ...f, from_date: e.target.value }))}
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Mono,sans-serif', fontSize:13 }} />
        </F>
        <button onClick={load} className="btn btn-brand">🔄 Refresh</button>
      </div>

      {/* Summary chips */}
      {rows !== null && (
        <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
          {[
            { label:'Total Alerts', val: rows.length, col:'var(--text-muted)' },
            { label:'GPS Mismatches', val: rows.filter(r => r.failure_reason === 'gps_mismatch').length, col:'#f0a030' },
            { label:'Accounts Suspended', val: rows.filter(r => r.failure_reason === 'account_blocked').length, col:'#e05555' },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px' }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:'DM Mono,monospace', color:col }}>{val}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding:0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Site</th>
                <th>Failure Reason</th>
                <th>Distance</th>
                <th>Date / Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No failure records found.</td></tr>
              ) : filtered.map(r => {
                const isBlocked   = r.failure_reason === 'account_blocked'
                const isGps       = r.failure_reason === 'gps_mismatch'
                const label       = reasonLabel(r)
                const when        = r.attempted_at ? new Date(r.attempted_at) : null
                const dateStr     = when ? when.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—'
                const timeStr     = when ? when.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : ''

                return (
                  <tr key={r.id} style={{ background: isBlocked ? 'rgba(224,85,85,.07)' : 'transparent' }}>
                    <td>
                      <strong>{r.user_name || r.staff_id || '—'}</strong>
                      {r.staff_id && <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'DM Mono,monospace' }}>{r.staff_id}</div>}
                    </td>
                    <td style={{ fontSize:13, color:'var(--text-muted)' }}>{r.site_name || '—'}</td>
                    <td>
                      {isBlocked ? (
                        <span className="badge badge-red" style={{ fontWeight:700 }}>🔴 {label}</span>
                      ) : isGps ? (
                        <span className="badge badge-amber">{label}</span>
                      ) : (
                        <span className="badge badge-blue">{label}</span>
                      )}
                    </td>
                    <td style={{ fontFamily:'DM Mono,monospace', fontSize:13 }}>
                      {r.distance_metres != null ? `${Math.round(r.distance_metres)} metres` : '—'}
                    </td>
                    <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>
                      <div>{dateStr}</div>
                      <div style={{ color:'var(--text-muted)', fontSize:11 }}>{timeStr}</div>
                    </td>
                    <td>
                      {r.user_id && r.user_is_active === false ? (
                        <button
                          onClick={() => reinstate(r.user_id, r.user_name)}
                          disabled={reinstating === r.user_id}
                          className="btn btn-brand"
                          style={{ fontSize:12, padding:'5px 10px' }}
                        >
                          {reinstating === r.user_id ? '…' : '✅ Reinstate'}
                        </button>
                      ) : (
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
