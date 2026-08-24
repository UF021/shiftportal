import { useEffect, useState } from 'react'
import { useBrand } from '../../api/BrandContext'
import api from '../../api/client'

function fmtMins(m) {
  if (m == null) return '—'
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function ManagerDashboard() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/manager/dashboard')
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
          {data?.site_name ? `${data.site_name} — Dashboard` : 'Dashboard'}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{today}</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { val: data?.currently_working ?? 0, label: 'Currently Working', col: c },
          { val: data?.completed_today   ?? 0, label: 'Completed Today',   col: '#86efac' },
          { val: data?.total_today       ?? 0, label: 'Total Today',        col: 'var(--text-muted)' },
        ].map(({ val, label, col }) => (
          <div key={label} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: col }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Attendance table */}
      <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          Today's Attendance
        </div>
        {!data?.attendance?.length ? (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            No clock-ins recorded at your site today.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Site', 'Clock In', 'Clock Out', 'Duration', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.attendance.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text)', fontWeight: 600 }}>{a.user_name}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{a.site_name || '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'DM Mono,monospace', color: 'var(--text)' }}>{a.clock_in}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)' }}>{a.clock_out || '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'DM Mono,monospace', color: c }}>{fmtMins(a.minutes)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                      background: a.status === 'working' ? `${c}22` : 'rgba(22,163,74,.15)',
                      color: a.status === 'working' ? c : '#86efac',
                    }}>
                      {a.status === 'working' ? 'Working' : 'Completed'}
                    </span>
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
