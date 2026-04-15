// HRTimelogs.jsx
import { useEffect, useState } from 'react'
import { getAllClockEvents, getAllStaff, getAllHols } from '../../api/client'
import { fmtDate } from '../../api/utils'

const fmtM = m => m != null ? `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m` : '—'

function F({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{label}</div>
      {children}
    </div>
  )
}

export function HRTimelogs() {
  const [data,    setData]   = useState(null)
  const [staff,   setStaff]  = useState([])
  const [hols,    setHols]   = useState([])
  const [fil,     setFil]    = useState({ staff_id:'', from_date:'', to_date:'' })
  const [mode,    setMode]   = useState('timelogs')  // 'timelogs' | 'holiday_pay'

  useEffect(() => {
    getAllStaff().then(r => setStaff(r.data || [])).catch(() => {})
    getAllHols({ status_filter:'approved' }).then(r => setHols(r.data || [])).catch(() => {})
    run()
  }, [])

  function run() {
    const p = {}
    if (fil.staff_id)  p.staff_id  = fil.staff_id
    if (fil.from_date) p.from_date = fil.from_date
    if (fil.to_date)   p.to_date   = fil.to_date
    getAllClockEvents(p).then(r => setData(r.data)).catch(() => setData({ entries:[], total_mins:0 }))
  }

  function exportCSV() {
    if (!data?.entries?.length) return
    const rows = [['Employee','Date','Start','End','Site','Hours','Source','Late?','Notes']]
    data.entries.forEach(e => {
      rows.push([
        e.user_name || '—',
        e.date,
        e.start_time,
        e.end_time || '—',
        e.site_name || '—',
        fmtM(e.shift_minutes),
        e.is_manual ? 'Manual' : 'QR',
        e.scheduled_start ? (e.is_late ? `Late ${e.minutes_late}m` : 'On time') : '—',
        e.entry_notes || '',
      ])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
    a.download = `timelogs-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  // Holiday pay entries: approved holidays with holiday_pay_flagged = true
  const holPayEntries = hols.filter(h => h.holiday_pay_flagged && h.holiday_pay_hours > 0)

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Time Report</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>All staff shifts — manual entries and QR clock-ins</p>
      </div>

      {/* Mode tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:18 }}>
        {[['timelogs','⏱ Timelogs'],['holiday_pay','💰 Holiday Pay']].map(([v,l]) => (
          <button key={v} onClick={() => setMode(v)} style={{
            padding:'8px 16px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13,
            border:`1px solid ${mode===v?'var(--green)':'var(--border)'}`,
            background:mode===v?'var(--green-muted)':'transparent',
            color:mode===v?'var(--green)':'var(--text-muted)', fontWeight:mode===v?700:400,
          }}>{l}</button>
        ))}
      </div>

      {mode === 'timelogs' && <>
        <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'flex-end' }}>
          <F label="Employee">
            <select value={fil.staff_id} onChange={e => setFil(f => ({ ...f, staff_id:e.target.value }))}
              style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
              <option value="">All Staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </F>
          <F label="From">
            <input type="date" value={fil.from_date} onChange={e => setFil(f => ({ ...f, from_date:e.target.value }))}
              style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Mono,sans-serif', fontSize:13 }} />
          </F>
          <F label="To">
            <input type="date" value={fil.to_date} onChange={e => setFil(f => ({ ...f, to_date:e.target.value }))}
              style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Mono,sans-serif', fontSize:13 }} />
          </F>
          <button onClick={run} className="btn btn-brand">🔍 Search</button>
          <button onClick={exportCSV} className="btn btn-outline">📥 Export CSV</button>
        </div>

        {data && (
          <div style={{ display:'flex', gap:20, marginBottom:14 }}>
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>Total: <strong style={{ color:'var(--green)', fontFamily:'DM Mono,monospace' }}>{fmtM(data.total_mins)}</strong></span>
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>Shifts: <strong style={{ color:'var(--green)' }}>{data.entries?.length || 0}</strong></span>
          </div>
        )}

        <div className="card" style={{ padding:0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Site</th>
                  <th>Hours</th>
                  <th>Source</th>
                  <th>Punctuality</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries?.length ? data.entries.map(e => (
                  <tr key={e.id} style={e.shift_minutes > 720 ? { background:'rgba(181,71,8,.06)' } : {}}>
                    <td>
                      <strong>{e.user_name || '—'}</strong>
                      {e.entry_notes && (
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>📝 {e.entry_notes}</div>
                      )}
                    </td>
                    <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(e.date)}</td>
                    <td style={{ color:'var(--green)', fontFamily:'DM Mono,monospace' }}>{e.start_time}</td>
                    <td style={{ color:'var(--red)', fontFamily:'DM Mono,monospace' }}>{e.end_time || '—'}</td>
                    <td style={{ fontSize:12, color:'var(--text-muted)' }}>{e.site_name || '—'}</td>
                    <td>
                      <span style={{ fontFamily:'DM Mono,monospace', fontWeight:700, color: e.shift_minutes > 720 ? '#b54708' : 'var(--green)' }}>
                        {fmtM(e.shift_minutes)}
                      </span>
                      {e.shift_minutes > 720 && (
                        <span title="Shift exceeds 12 hours" style={{
                          marginLeft:6, fontSize:10, fontWeight:700,
                          color:'#b54708', background:'#fef3e2',
                          padding:'1px 6px', borderRadius:4,
                        }}>⚠ 12h+</span>
                      )}
                    </td>
                    <td>
                      {e.is_manual
                        ? <span className="badge badge-blue">✏️ Manual</span>
                        : <span className="badge badge-green">📱 QR</span>
                      }
                    </td>
                    <td>
                      {e.scheduled_start
                        ? e.is_late
                          ? <span className="badge badge-red">Late {e.minutes_late}m</span>
                          : <span className="badge badge-green">On time</span>
                        : <span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>
                      }
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
                    {data ? 'No records for selected filters' : 'Select filters and click Search'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {mode === 'holiday_pay' && <>
        <div style={{ marginBottom:14, fontSize:13, color:'var(--text-muted)' }}>
          Approved holidays with calculated holiday pay (based on average shift hours over 3 months)
        </div>
        <div className="card" style={{ padding:0 }}>
          <div className="tw">
            <table>
              <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Days</th><th>Pay Rate</th><th>Pay Hours</th><th>Est. Amount</th></tr></thead>
              <tbody>
                {holPayEntries.length ? holPayEntries.map(h => {
                  const s = staff.find(x => x.id === (h.user_id || h.staff_id)) || {}
                  const payRate = s.pay_rate || null
                  const estAmt  = payRate && h.holiday_pay_hours ? (payRate * h.holiday_pay_hours).toFixed(2) : null
                  return (
                    <tr key={h.id}>
                      <td><strong>{s.full_name || '—'}</strong></td>
                      <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(h.from_date)}</td>
                      <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(h.to_date)}</td>
                      <td style={{ fontWeight:700 }}>{h.days}</td>
                      <td style={{ fontFamily:'DM Mono,monospace', color:'var(--green)' }}>{payRate ? `£${payRate}/hr` : '—'}</td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          💰 <strong style={{ fontFamily:'DM Mono,monospace', color:'var(--green)' }}>{h.holiday_pay_hours}h</strong>
                        </span>
                      </td>
                      <td style={{ fontFamily:'DM Mono,monospace', fontWeight:700, color:'var(--green)', fontSize:14 }}>
                        {estAmt ? `£${estAmt}` : '—'}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
                    No holiday pay records yet. Holiday pay is calculated when HR approves a holiday request.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </>
  )
}

export default HRTimelogs
