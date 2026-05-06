import { useEffect, useState } from 'react'
import { getMyClockHistory } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const fmtMins = m => {
  if (m == null) return '—'
  return `${parseFloat((m / 60).toFixed(2))}h`
}

const fmtDate = d => {
  if (!d) return '—'
  const dt      = new Date(d + 'T12:00:00')
  const weekday = dt.toLocaleDateString('en-GB', { weekday: 'short' })
  const date    = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${weekday} ${date}`
}

export default function StaffTimelog() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  const [data, setData] = useState(null)

  useEffect(() => {
    getMyClockHistory()
      .then(r => setData(r.data))
      .catch(() => setData({ open_in: null, shifts: [] }))
  }, [])

  const shifts    = data?.shifts   || []
  const openIn    = data?.open_in  || null
  const totalMins = shifts.reduce((sum, s) => sum + (s.shift_minutes || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2a1a' }}>My Shifts</div>
        <div style={{ fontSize: 12, color: '#6a8a6a' }}>Your complete clock-in / clock-out history</div>
      </div>

      {/* Total hours summary */}
      <div className="s-card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'DM Mono,monospace', color: c, marginBottom: 2 }}>
          {data ? fmtMins(totalMins) : '…'}
        </div>
        <div style={{ fontSize: 12, color: '#6a8a6a' }}>
          Total across {shifts.length} completed shift{shifts.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Open clock-in banner */}
      {openIn && (
        <div style={{ background: 'rgba(106,191,63,.12)', border: '1px solid rgba(106,191,63,.4)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: c }}>⏱ Currently clocked in</span>
          {openIn.site_name && <> at <strong>{openIn.site_name}</strong></>}
          {' '}since{' '}
          <strong>
            {new Date(openIn.timestamp).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}
          </strong>
        </div>
      )}

      {/* Shifts table */}
      <div className="s-card" style={{ padding: 0, overflowX: 'auto' }}>
        {data === null ? (
          <p style={{ padding: 20, color: '#8aaa8a', fontSize: 13 }}>Loading…</p>
        ) : shifts.length === 0 ? (
          <p style={{ padding: 20, color: '#8aaa8a', fontSize: 13 }}>No shifts recorded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0ead0' }}>
                {['Date', 'Scheduled', 'Start', 'End', 'Site', 'Hours', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f0f4f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1a2a1a', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {fmtDate(s.date)}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono,monospace', fontSize: 12, color: '#6a8a6a' }}>
                    {s.scheduled_start || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono,monospace', fontSize: 12, color: c, fontWeight: 700 }}>
                    {s.start_time}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono,monospace', fontSize: 12, color: '#e05555', fontWeight: 700 }}>
                    {s.end_time || <span style={{ color: '#aaa' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6a8a6a' }}>
                    {s.site_name || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono,monospace', fontWeight: 700, color: s.shift_minutes > 720 ? '#b54708' : c, whiteSpace: 'nowrap' }}>
                    {fmtMins(s.shift_minutes)}
                    {s.shift_minutes > 720 && (
                      <span title="Shift exceeds 12 hours — please check with HR" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#b54708', background: '#fef3e2', padding: '1px 5px', borderRadius: 4 }}>⚠ 12h+</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {s.is_late
                      ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(224,85,85,.12)', color: '#a02020' }}>
                          Late {s.minutes_late}m
                        </span>
                      : s.scheduled_start
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(106,191,63,.12)', color: '#2e7d32' }}>
                            On time
                          </span>
                        : <span style={{ fontSize: 11, color: '#aaa' }}>—</span>
                    }
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
