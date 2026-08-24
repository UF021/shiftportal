import { useEffect, useState } from 'react'
import { useBrand } from '../../api/BrandContext'
import api from '../../api/client'

function isoToday() { return new Date().toISOString().slice(0, 10) }

function fmtMins(m) {
  if (m == null) return '—'
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function ManagerAttendance() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [events,   setEvents]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [from,     setFrom]     = useState(isoToday())
  const [to,       setTo]       = useState(isoToday())

  function load(fd, td) {
    setLoading(true)
    api.get('/manager/clock', { params: { from_date: fd, to_date: td } })
      .then(r => setEvents(r.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(from, to) }, [])

  function search() { load(from, to) }

  const clockIns  = (events || []).filter(e => e.event_type === 'clock_in')
  const clockOuts = (events || []).filter(e => e.event_type === 'clock_out')
  const late      = clockIns.filter(e => e.is_late).length

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Attendance Log</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Clock events at your site</div>
      </div>

      {/* Date filter */}
      <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[['From', from, setFrom], ['To', to, setTo]].map(([label, val, set]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            <input type="date" value={val} onChange={e => set(e.target.value)} style={{
              padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--navy)', color: 'var(--text)', fontSize: 13,
              fontFamily: 'DM Mono,monospace', outline: 'none',
            }} />
          </div>
        ))}
        <button onClick={search} style={{
          padding: '8px 16px', borderRadius: 7, border: 'none', background: c,
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
        }}>Search</button>
        <button onClick={() => { const t = isoToday(); setFrom(t); setTo(t); load(t, t) }} style={{
          padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
        }}>Today</button>
      </div>

      {/* Stats row */}
      {!loading && events !== null && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { val: clockIns.length,  label: 'Clock-ins',  col: c },
            { val: clockOuts.length, label: 'Clock-outs', col: '#86efac' },
            { val: late,             label: 'Late',        col: late > 0 ? '#fca5a5' : 'var(--text-dim)' },
          ].map(({ val, label, col }) => (
            <div key={label} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', minWidth: 90, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: col }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Events table */}
      <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : !events?.length ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No events for this period.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Event', 'Time', 'Site', 'Duration', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 14px', color: 'var(--text)', fontWeight: 600 }}>{e.user_name}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      background: e.event_type === 'clock_in' ? `${c}22` : 'rgba(99,102,241,.15)',
                      color: e.event_type === 'clock_in' ? c : '#a5b4fc',
                    }}>
                      {e.event_type === 'clock_in' ? 'Clock In' : 'Clock Out'}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: 'DM Mono,monospace', color: 'var(--text)', fontSize: 12 }}>{e.timestamp_uk}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>{e.site_name || '—'}</td>
                  <td style={{ padding: '9px 14px', fontFamily: 'DM Mono,monospace', color: c }}>{fmtMins(e.shift_minutes)}</td>
                  <td style={{ padding: '9px 14px' }}>
                    {e.event_type === 'clock_in' && e.is_late && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5', background: 'rgba(239,68,68,.12)', padding: '2px 7px', borderRadius: 4 }}>
                        Late {e.minutes_late}m
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
