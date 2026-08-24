import { useState } from 'react'
import { useBrand } from '../../api/BrandContext'
import api from '../../api/client'

function isoToday() { return new Date().toISOString().slice(0, 10) }

function isoMonday(d = new Date()) {
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day + 1)
  return mon.toISOString().slice(0, 10)
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function isoMonthStart(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d.toISOString().slice(0, 10)
}

function isoMonthEnd(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset + 1)
  d.setDate(0)
  return d.toISOString().slice(0, 10)
}

function fmtCurrency(n) {
  return `£${Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function fmtHours(h) {
  const total = Math.round(h * 60)
  return `${Math.floor(total / 60)}h ${total % 60}m`
}

const QUICK_PERIODS = [
  { label: 'This Week',   from: () => isoMonday(),            to: () => addDays(isoMonday(), 6) },
  { label: 'Last Week',   from: () => addDays(isoMonday(), -7), to: () => addDays(isoMonday(), -1) },
  { label: 'This Month',  from: () => isoMonthStart(0),       to: () => isoMonthEnd(0) },
  { label: 'Last Month',  from: () => isoMonthStart(-1),      to: () => isoMonthEnd(-1) },
  { label: 'Last 3 Months', from: () => isoMonthStart(-3),   to: () => isoMonthEnd(0) },
]

function TypeBadge({ type }) {
  const isPayroll = type === 'payroll'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: isPayroll ? 'rgba(99,102,241,.15)' : 'rgba(234,179,8,.12)',
      color: isPayroll ? '#a5b4fc' : '#fcd34d',
    }}>
      {isPayroll ? 'Payroll' : 'Subcontract'}
    </span>
  )
}

export default function HRPayroll() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [from, setFrom]   = useState(isoMonthStart(0))
  const [to,   setTo]     = useState(isoMonthEnd(0))
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,  setErr]    = useState('')
  const [dlBusy, setDlBusy] = useState(false)

  async function load() {
    if (!from || !to) return
    setLoading(true); setErr(''); setData(null)
    try {
      const r = await api.get('/payroll/summary', { params: { from_date: from, to_date: to } })
      setData(r.data)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to load payroll data.')
    } finally { setLoading(false) }
  }

  async function downloadCSV() {
    setDlBusy(true)
    try {
      const r = await api.get('/payroll/export.csv', {
        params: { from_date: from, to_date: to },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(r.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `payroll_${from}_${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { setErr('Export failed.') }
    finally { setDlBusy(false) }
  }

  function applyQuick(p) {
    setFrom(p.from()); setTo(p.to()); setData(null)
  }

  const payrollStaff    = (data?.employees || []).filter(e => e.staff_type === 'payroll')
  const subcontractStaff = (data?.employees || []).filter(e => e.staff_type !== 'payroll')

  const TH = ({ children, right }) => (
    <th style={{
      padding: '8px 14px', textAlign: right ? 'right' : 'left',
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '.05em',
    }}>{children}</th>
  )

  const TD = ({ children, mono, right, bold, col }) => (
    <td style={{
      padding: '10px 14px', textAlign: right ? 'right' : 'left',
      fontFamily: mono ? 'DM Mono,monospace' : 'inherit',
      fontSize: 13, fontWeight: bold ? 700 : 400,
      color: col || 'var(--text)',
    }}>{children}</td>
  )

  function EmployeeTable({ rows, sectionLabel }) {
    if (!rows.length) return null
    const sectionHours = rows.reduce((s, e) => s + e.hours, 0)
    const sectionGross = rows.reduce((s, e) => s + e.gross_pay, 0)
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--navy)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {sectionLabel} · {rows.length} {rows.length === 1 ? 'employee' : 'employees'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <TH>Name</TH>
              <TH>Staff ID</TH>
              <TH>Type</TH>
              <TH right>Pay Rate</TH>
              <TH right>Shifts</TH>
              <TH right>Hours</TH>
              <TH right>Gross Pay</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <TD bold>{e.name}</TD>
                <TD mono>{e.staff_id}</TD>
                <TD><TypeBadge type={e.staff_type} /></TD>
                <TD mono right col="var(--text-muted)">{e.pay_rate > 0 ? `£${e.pay_rate.toFixed(2)}/hr` : '—'}</TD>
                <TD mono right col="var(--text-muted)">{e.shifts}</TD>
                <TD mono right col={c}>{fmtHours(e.hours)}</TD>
                <TD mono right bold col={c}>{e.gross_pay > 0 ? fmtCurrency(e.gross_pay) : '—'}</TD>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid var(--border)`, background: 'var(--navy)' }}>
              <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Subtotal</td>
              <TD mono right bold col={c}>{fmtHours(sectionHours)}</TD>
              <TD mono right bold col={c}>{fmtCurrency(sectionGross)}</TD>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Payroll Calculator</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Hours × pay rate per employee · export to CSV for Xero / QuickBooks
        </div>
      </div>

      {/* Period selector */}
      <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 14 }}>
        {/* Quick buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {QUICK_PERIODS.map(p => (
            <button key={p.label} onClick={() => applyQuick(p)} style={{
              padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 12, fontFamily: 'DM Sans,sans-serif',
              transition: 'all .12s',
            }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom range + run */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[['From', from, setFrom], ['To', to, setTo]].map(([label, val, set]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
              <input type="date" value={val} onChange={e => { set(e.target.value); setData(null) }} style={{
                padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--navy)', color: 'var(--text)', fontSize: 13,
                fontFamily: 'DM Mono,monospace', outline: 'none',
              }} />
            </div>
          ))}
          <button onClick={load} disabled={loading} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none',
            background: c, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif',
            opacity: loading ? .7 : 1,
          }}>
            {loading ? 'Loading…' : 'Calculate'}
          </button>
        </div>
      </div>

      {err && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {/* Summary stats */}
      {data && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            {[
              { val: data.employees.length,       label: 'Employees',        col: 'var(--text)',     mono: true },
              { val: `${data.total_hours} hrs`,   label: 'Total Hours',      col: c,                  mono: true },
              { val: fmtCurrency(data.total_gross), label: 'Total Gross Pay', col: c,                mono: true },
              { val: `${data.period.from} → ${data.period.to}`, label: 'Period', col: 'var(--text-muted)', mono: false },
            ].map(({ val, label, col, mono }) => (
              <div key={label} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: mono ? 'DM Mono,monospace' : 'DM Sans,sans-serif', color: col, marginBottom: 4 }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Export button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={downloadCSV} disabled={dlBusy} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 8, border: `1px solid ${c}`,
              background: c + '18', color: c, fontSize: 13, fontWeight: 700,
              cursor: dlBusy ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif',
            }}>
              {dlBusy ? '⏳ Exporting…' : '📥 Export CSV'}
            </button>
          </div>

          {/* Results table */}
          {data.employees.length === 0 ? (
            <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No completed shifts found for this period.</div>
            </div>
          ) : (
            <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <EmployeeTable rows={payrollStaff}     sectionLabel="Payroll Staff" />
              <EmployeeTable rows={subcontractStaff} sectionLabel="Subcontract Staff" />

              {/* Grand total */}
              <div style={{ padding: '14px 18px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--navy)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Grand Total — {data.employees.length} {data.employees.length === 1 ? 'employee' : 'employees'}</div>
                <div style={{ display: 'flex', gap: 32 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: c }}>{data.total_hours} hrs</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Hours</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: c }}>{fmtCurrency(data.total_gross)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross Payroll</div>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
                Gross pay = hours worked × pay rate. Does not include NI, pension, tax, or deductions. Export CSV for import into Xero, QuickBooks, or your payroll processor.
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !err && (
        <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💷</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Select a period and click Calculate</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Payroll is calculated from completed clock-out events with recorded hours.</div>
        </div>
      )}
    </div>
  )
}
