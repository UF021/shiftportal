import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrand } from '../../api/BrandContext'
import { getMyClockHistory } from '../../api/client'

function fmtDuration(mins) {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const dt = new Date(dateStr + 'T12:00:00')
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

function isoNDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export default function StaffShifts() {
  const { colour } = useBrand()
  const nav        = useNavigate()
  const c          = colour || '#6abf3f'

  const [shifts,   setShifts]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const [applied,  setApplied]  = useState({ from: '', to: '' })

  function load(from, to) {
    setLoading(true)
    const params = {}
    if (from) params.from_date = from
    if (to)   params.to_date   = to
    getMyClockHistory(params)
      .then(r => setShifts(r.data?.shifts || []))
      .catch(() => setShifts([]))
      .finally(() => setLoading(false))
  }

  // On mount: load all records (no date filter)
  useEffect(() => { load('', '') }, [])

  function handleSearch() {
    setApplied({ from: fromDate, to: toDate })
    load(fromDate, toDate)
  }

  function handleClear() {
    setFromDate(''); setToDate('')
    setApplied({ from: '', to: '' })
    load('', '')
  }

  function setQuick(days) {
    const from = isoNDaysAgo(days)
    const to   = isoToday()
    setFromDate(from); setToDate(to)
    setApplied({ from, to })
    load(from, to)
  }

  const totalMins  = (shifts || []).reduce((sum, s) => sum + (s.shift_minutes || 0), 0)
  const totalHours = (totalMins / 60).toFixed(2)
  const onTime     = (shifts || []).filter(s => s.scheduled_start && !s.is_late).length
  const late       = (shifts || []).filter(s => s.is_late).length

  const periodLabel = applied.from || applied.to
    ? [applied.from && `From ${fmtDate(applied.from)}`, applied.to && `To ${fmtDate(applied.to)}`].filter(Boolean).join(' · ')
    : 'All recorded shifts'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => nav('/staff')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 20, color: '#6a8a6a', padding: '4px 8px 4px 0',
        }}>←</button>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Shift History</h2>
          <div style={{ fontSize: 12, color: '#6a8a6a', marginTop: 2 }}>Full record from when records began</div>
        </div>
      </div>

      {/* Date range filter */}
      <div style={{ background: '#fff', border: '1.5px solid #d0e8d0', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#6a8a6a', marginBottom: 10 }}>Filter by date</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a8a6a', marginBottom: 4 }}>From</div>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid #d0e8d0',
              fontFamily: 'DM Mono,monospace', fontSize: 13, background: '#f8fdf8', color: '#1a2a1a',
            }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a8a6a', marginBottom: 4 }}>To</div>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid #d0e8d0',
              fontFamily: 'DM Mono,monospace', fontSize: 13, background: '#f8fdf8', color: '#1a2a1a',
            }} />
          </div>
          <button onClick={handleSearch} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: c, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>Search</button>
          {(applied.from || applied.to) && (
            <button onClick={handleClear} style={{
              padding: '8px 14px', borderRadius: 8, border: `1px solid ${c}`,
              background: '#fff', color: c, fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>Clear</button>
          )}
        </div>

        {/* Quick select buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['Last 7 days', 7], ['Last 14 days', 14], ['Last 30 days', 30], ['Last 90 days', 90]].map(([label, days]) => (
            <button key={days} onClick={() => setQuick(days)} style={{
              padding: '5px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${c}44`, background: '#f0faf0', color: c, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Totals bar */}
      {!loading && shifts !== null && (
        <div style={{
          background: `linear-gradient(135deg,#0f1923,#1a3a1a)`,
          borderRadius: 12, padding: '14px 18px', marginBottom: 14,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12,
        }}>
          {[
            { val: shifts.length, lbl: 'Shifts' },
            { val: `${totalHours}h`, lbl: 'Total hours' },
            { val: onTime, lbl: 'On time', col: c },
            { val: late, lbl: 'Late', col: late > 0 ? '#e05555' : 'rgba(255,255,255,.5)' },
          ].map(({ val, lbl, col }) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: col || c }}>{val}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>{lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* Period label */}
      <div style={{ fontSize: 12, color: '#6a8a6a', marginBottom: 10, fontWeight: 600 }}>{periodLabel} · {shifts?.length ?? '…'} shifts</div>

      {/* Shift list */}
      <div style={{ background: '#fff', border: '1.5px solid #d0e8d0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8aaa8a', fontSize: 13 }}>Loading…</div>
        ) : shifts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8aaa8a', fontSize: 13 }}>No shifts found for this period.</div>
        ) : shifts.map((s, i) => (
          <div key={s.id} style={{
            padding: '12px 16px',
            borderBottom: i < shifts.length - 1 ? '1px solid #f0f4f0' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Date block */}
              <div style={{ minWidth: 80, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2a1a' }}>
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </div>
                <div style={{ fontSize: 11, color: '#6a8a6a' }}>
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}
                </div>
              </div>

              {/* Site + times */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.site_name || '—'}
                </div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: '#6a8a6a', marginTop: 2 }}>
                  {s.start_time}{s.end_time ? ` → ${s.end_time}` : ' → —'}
                </div>
              </div>

              {/* Duration */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'DM Mono,monospace', color: c }}>
                  {fmtDuration(s.shift_minutes)}
                </div>
                {s.is_manual && (
                  <div style={{ fontSize: 10, color: '#1565c0', fontWeight: 700, marginTop: 2 }}>✏ Manual</div>
                )}
              </div>
            </div>

            {/* Badge row */}
            <div style={{ display: 'flex', gap: 5, marginTop: 6, marginLeft: 90, flexWrap: 'wrap' }}>
              {s.scheduled_start != null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  color: s.is_late ? '#c0392b' : '#2e7d32',
                  background: s.is_late ? '#fde8e8' : '#e8f8e0',
                }}>
                  {s.is_late ? `Late ${s.minutes_late}m` : '✓ On time'}
                </span>
              )}
              {s.shift_minutes > 720 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#b54708', background: '#fef3e2', padding: '2px 7px', borderRadius: 4 }}>
                  ⚠ Over 12h
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom totals */}
      {!loading && shifts !== null && shifts.length > 0 && (
        <div style={{ marginTop: 12, padding: '12px 16px', background: '#f0faf0', border: `1px solid ${c}44`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1a2a1a' }}>{shifts.length} shifts · {periodLabel}</span>
          <span style={{ fontSize: 16, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: c }}>{totalHours}h total</span>
        </div>
      )}
    </div>
  )
}
