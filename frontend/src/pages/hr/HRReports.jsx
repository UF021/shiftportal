import { useEffect, useState } from 'react'
import { useBrand } from '../../api/BrandContext'
import api from '../../api/client'

const PERIODS = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

function KpiCard({ label, value, sub, col, wide }) {
  return (
    <div style={{
      background: 'var(--navy-mid)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px',
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: col || 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '28px 0 12px' }}>
      {children}
    </div>
  )
}

function ProgressBar({ pct, col, label, value }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{label}</span>
        <span style={{ color: col, fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ background: 'var(--navy)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, background: col, height: '100%', borderRadius: 4, transition: 'width .5s ease' }} />
      </div>
    </div>
  )
}

function SiaPill({ count, label, col, bg }) {
  return (
    <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center', flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 24, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: col, background: bg, borderRadius: 6, padding: '4px 0', marginBottom: 6 }}>{count}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </div>
  )
}

function AttendanceChart({ daily, c }) {
  const [hover, setHover] = useState(null)
  const maxShifts = Math.max(...daily.map(d => d.shifts), 1)

  if (daily.every(d => d.shifts === 0)) {
    return <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No attendance data for this period.</div>
  }

  const fmt = iso => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  // Show every Nth label to avoid crowding
  const n = daily.length <= 14 ? 1 : daily.length <= 31 ? 3 : 7

  return (
    <div style={{ position: 'relative', padding: '12px 12px 0' }}>
      {hover && (
        <div style={{
          position: 'absolute', top: 8, right: 16, zIndex: 10,
          background: 'var(--navy)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 14px', fontSize: 12, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{fmt(hover.date)}</div>
          <div style={{ color: c }}>{hover.shifts} shifts · {hover.hours}h</div>
          {hover.late > 0 && <div style={{ color: '#fca5a5' }}>{hover.late} late</div>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, overflowX: 'auto' }}>
        {daily.map((d, i) => {
          const barH = d.shifts === 0 ? 2 : Math.max(4, Math.round((d.shifts / maxShifts) * 108))
          const isHov = hover?.date === d.date
          return (
            <div
              key={d.date}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 8, cursor: 'default' }}
            >
              <div style={{
                width: '100%', maxWidth: 28,
                height: barH,
                background: d.shifts === 0 ? 'var(--navy)' : isHov ? '#fff' : c,
                borderRadius: '3px 3px 0 0',
                transition: 'background .1s',
                opacity: d.shifts === 0 ? 0.3 : 1,
              }} />
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {daily.map((d, i) => (
          <div key={d.date} style={{ flex: 1, minWidth: 8, fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', overflow: 'hidden' }}>
            {i % n === 0 ? fmt(d.date).replace(' ', ' ') : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HRReports() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [days,    setDays]    = useState(30)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')

  async function load(d) {
    setLoading(true); setErr('')
    try {
      const r = await api.get('/reports/overview', { params: { days: d } })
      setData(r.data)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to load report data.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load(days) }, [])

  function changePeriod(d) { setDays(d); load(d) }

  const fmtNum = n => Number(n).toLocaleString('en-GB')

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Reporting Dashboard</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {data ? `Data as of ${new Date(data.generated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Loading…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => changePeriod(p.days)} style={{
              padding: '7px 16px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: days === p.days ? 700 : 400,
              border: `1px solid ${days === p.days ? c : 'var(--border)'}`,
              background: days === p.days ? c + '18' : 'transparent',
              color: days === p.days ? c : 'var(--text-muted)',
            }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => load(days)} disabled={loading} style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 12,
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
          }}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {err && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {loading && !data && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading report…</div>
      )}

      {data && (
        <>
          {/* ── Workforce ── */}
          <SectionTitle>Workforce</SectionTitle>
          <div className="grid-5" style={{ }}>
            <KpiCard label="Active Staff"         value={fmtNum(data.workforce.total_active)}    col={c} />
            <KpiCard label="Payroll"              value={fmtNum(data.workforce.payroll_count)}   col="var(--text)" />
            <KpiCard label="Subcontract"          value={fmtNum(data.workforce.subcontract_count)} col="var(--text)" />
            <KpiCard label={`New (${days}d)`}     value={fmtNum(data.workforce.new_this_period)} col={c} />
            <KpiCard label="Archived"             value={fmtNum(data.workforce.archived_count)}  col="var(--text-muted)" />
          </div>

          {/* ── Attendance ── */}
          <SectionTitle>Attendance · {days}-day period</SectionTitle>
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <KpiCard label="Shifts Completed" value={fmtNum(data.attendance.total_shifts)} col={c} />
            <KpiCard label="Hours Worked"     value={`${fmtNum(data.attendance.total_hours)}h`} col={c} />
            <KpiCard label="Late Arrivals"    value={fmtNum(data.attendance.late_count)} col={data.attendance.late_count > 0 ? '#fca5a5' : 'var(--text-muted)'} sub={`${data.attendance.late_rate_pct}% of clock-ins`} />
            <KpiCard label="Avg Shift Length" value={`${data.attendance.avg_shift_hours}h`} col="var(--text)" />
          </div>
          <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 4, padding: '16px 0 8px' }}>
            <div style={{ padding: '0 16px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Shifts per day
            </div>
            <AttendanceChart daily={data.attendance.daily} c={c} />
          </div>

          {/* ── Holidays ── */}
          <SectionTitle>Holidays</SectionTitle>
          <div className="grid-4" style={{ }}>
            <KpiCard label="Pending Approval" value={fmtNum(data.holidays.pending)} col={data.holidays.pending > 0 ? '#fcd34d' : 'var(--text-muted)'} />
            <KpiCard label="Approved (period)" value={fmtNum(data.holidays.approved_period)} col={c} />
            <KpiCard label="Days Taken (period)" value={fmtNum(data.holidays.approved_days)} col={c} />
            <KpiCard label="On Holiday Today" value={fmtNum(data.holidays.on_holiday_today)} col={data.holidays.on_holiday_today > 0 ? '#86efac' : 'var(--text-muted)'} />
          </div>

          {/* ── SIA & Training side-by-side ── */}
          <div className="grid-2" style={{ marginTop: 0 }}>
            <div>
              <SectionTitle>SIA Compliance</SectionTitle>
              <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <SiaPill count={data.sia.expired}      label="Expired"     col="#fca5a5" bg="rgba(239,68,68,.12)" />
                  <SiaPill count={data.sia.expiring_30d} label="Exp ≤30d"   col="#fcd34d" bg="rgba(234,179,8,.12)" />
                  <SiaPill count={data.sia.expiring_60d} label="Exp ≤60d"   col="#fde68a" bg="rgba(234,179,8,.06)" />
                  <SiaPill count={data.sia.valid}        label="Valid"       col="#86efac" bg="rgba(22,163,74,.12)" />
                  <SiaPill count={data.sia.no_sia}       label="No SIA"      col="var(--text-dim)" bg="transparent" />
                </div>
                {data.sia.expired + data.sia.expiring_30d > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,.08)', borderRadius: 6, padding: '8px 12px' }}>
                    {data.sia.expired} expired · {data.sia.expiring_30d} expiring within 30 days — action required
                  </div>
                )}
              </div>
            </div>

            <div>
              <SectionTitle>Training Compliance</SectionTitle>
              <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                {data.training.map(t => (
                  <ProgressBar
                    key={t.module}
                    label={t.label}
                    value={`${t.passed}/${t.eligible} · ${t.pct}%`}
                    pct={t.pct}
                    col={t.pct >= 80 ? '#86efac' : t.pct >= 50 ? '#fcd34d' : '#fca5a5'}
                  />
                ))}
                {data.training.every(t => t.pct === 100) && (
                  <div style={{ fontSize: 12, color: '#86efac', marginTop: 8 }}>All staff have completed all modules.</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Incidents ── */}
          <SectionTitle>Incidents · {days}-day period</SectionTitle>
          <div className="grid-3" style={{ gap: 10 }}>
            <KpiCard label="Total Reported" value={fmtNum(data.incidents.total)} col={data.incidents.total > 0 ? '#fca5a5' : 'var(--text-muted)'} />
            <KpiCard label="Reviewed"       value={fmtNum(data.incidents.reviewed)} col="#86efac" />
            <KpiCard label="Awaiting Review" value={fmtNum(data.incidents.unreviewed)} col={data.incidents.unreviewed > 0 ? '#fcd34d' : 'var(--text-muted)'} />
          </div>

          <div style={{ height: 32 }} />
        </>
      )}
    </div>
  )
}
