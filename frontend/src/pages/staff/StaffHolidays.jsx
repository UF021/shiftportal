// StaffHolidays.jsx
import { useEffect, useState } from 'react'
import { getMyHols, requestHol, getMyHolidayStats } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const POLICY_TEXT = `The holiday year runs from 1 April to 31 March. You are entitled to four weeks of paid holiday per year. Each week of holiday is equivalent to your working week. If you work four days a week, you will be entitled to four days multiplied by four weeks, totaling 16 days holiday a year. The holiday must be accrued before it can be taken. This equates to 2.3 days of paid holiday (or an equivalent) per full month of employment. Holiday pay will be calculated on your average hours worked over the previous 3 months.`

export function StaffHolidays() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [data,    setData]   = useState(null)
  const [stats,   setStats]  = useState(null)
  const [form,    setForm]   = useState({ from_date:'', to_date:'', note:'' })
  const [err,     setErr]    = useState('')
  const [ok,      setOk]     = useState('')
  const [infoOpen, setInfo]  = useState(false)

  // Calculator state
  const [daysInput,  setDaysInput]  = useState('')
  const [takenInput, setTakenInput] = useState('')
  const [calcResult, setCalcResult] = useState(null)

  const load = () => getMyHols().then(r => setData(r.data)).catch(() => setData({ remaining_days:20, approved_days:0, pending_days:0, requests:[] }))

  useEffect(() => {
    load()
    getMyHolidayStats()
      .then(r => {
        setStats(r.data)
        setDaysInput(String(r.data.avg_days_per_week ?? ''))
        setTakenInput(String(r.data.holidays_taken_since_april ?? 0))
      })
      .catch(() => {})
  }, [])

  function calculate() {
    const days    = parseFloat(daysInput) || 0
    const taken   = parseFloat(takenInput) || 0
    const months  = stats?.months_employed ?? 0
    const entitlement = round1(days * 4)
    const accrued     = round1(Math.min((entitlement / 12) * 2.3 * months, entitlement))
    const remaining   = round1(accrued - taken)
    setCalcResult({ days, taken, months, entitlement, accrued, remaining })
  }

  function round1(n) { return Math.round(n * 10) / 10 }

  async function submit() {
    setErr(''); setOk('')
    if (!form.from_date || !form.to_date) return setErr('Please select both dates.')
    if (form.to_date < form.from_date)    return setErr('End date must be after start.')
    try {
      await requestHol({ from_date: form.from_date, to_date: form.to_date, note: form.note })
      setOk('✅ Request submitted. HR will respond within 2 working days.')
      setForm({ from_date:'', to_date:'', note:'' }); load()
    } catch(ex) { setErr(ex.response?.data?.detail || 'Request failed.') }
  }

  const inp = (id, type='date', label) => (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</label>
      <input type={type} value={form[id]} onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
        style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none' }} />
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:20, fontWeight:700, color:'#1a2a1a', marginBottom:16 }}>My Holidays</div>

      {/* Info modal */}
      {infoOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setInfo(false)}>
          <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', maxWidth:480, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#1a2a1a' }}>Holiday Entitlement Policy</div>
              <button onClick={() => setInfo(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#6a8a6a' }}>✕</button>
            </div>
            <p style={{ fontSize:13, color:'#4a6a4a', lineHeight:1.8 }}>{POLICY_TEXT}</p>
          </div>
        </div>
      )}

      {/* Holiday Calculator card */}
      <div className="s-card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="s-card-title" style={{ marginBottom:0 }}>📅 Holiday Entitlement Calculator</div>
          <button onClick={() => setInfo(true)} title="How is this calculated?"
            style={{ background:'#e8f5fd', border:'1px solid #b8dcf0', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:14, color:'#1a4a6a', flexShrink:0 }}>
            ℹ
          </button>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
            Average days worked per week (last 3 months)
          </label>
          <input type="number" value={daysInput} onChange={e => setDaysInput(e.target.value)}
            min="1" max="7" step="0.5"
            style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Mono,sans-serif', fontSize:15, outline:'none' }} />
          {stats && <div style={{ fontSize:11, color:'#8aaa8a', marginTop:4 }}>Based on your clock-in records (pre-filled, editable)</div>}
        </div>

        <div style={{ marginBottom:18 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
            Paid holidays taken since April 1st
          </label>
          <input type="number" value={takenInput} onChange={e => setTakenInput(e.target.value)}
            min="0" step="1"
            style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Mono,sans-serif', fontSize:15, outline:'none' }} />
          {stats && <div style={{ fontSize:11, color:'#8aaa8a', marginTop:4 }}>Based on approved holidays in current holiday year (pre-filled, editable)</div>}
        </div>

        <button onClick={calculate}
          style={{ width:'100%', padding:13, borderRadius:10, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom: calcResult ? 18 : 0 }}>
          Calculate
        </button>

        {calcResult && (
          <div>
            <div style={{ textAlign:'center', padding:'16px 0 8px' }}>
              <div style={{ fontSize:44, fontWeight:700, fontFamily:'DM Mono,monospace', color: calcResult.remaining >= 0 ? c : '#c0392b', lineHeight:1 }}>
                {calcResult.remaining}
              </div>
              <div style={{ fontSize:15, color:'#4a6a4a', marginTop:6 }}>
                days of holiday remaining
              </div>
            </div>
            <div style={{ background:'#f0f8f0', border:'1px solid #c8e8c8', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#4a6a4a', lineHeight:1.8, marginTop:10 }}>
              Based on <strong>{calcResult.days} days/week × 4 weeks = {calcResult.entitlement} days</strong> annual entitlement,
              accrued <strong>{calcResult.accrued} days</strong> in <strong>{calcResult.months} months</strong> employment
            </div>
          </div>
        )}

        <div style={{ background:'#e8f5fd', border:'1px solid #b8dcf0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1a4a6a', marginTop:16 }}>
          ℹ️ Requests must be 4+ weeks in advance. Do not book travel until formally approved.
        </div>
      </div>

      {/* Request form */}
      <div className="s-card">
        <div className="s-card-title">➕ Request Holiday</div>
        {inp('from_date', 'date', 'From Date')}
        {inp('to_date',   'date', 'To Date')}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Notes (optional)</label>
          <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
            style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', resize:'vertical' }} />
        </div>
        {err && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px', fontSize:13, color:'#a02020', marginBottom:12 }}>⚠ {err}</div>}
        {ok  && <div style={{ background:'#e8f8e0', border:'1px solid #a0d080', borderRadius:8, padding:'10px', fontSize:13, color:'#3a7a20', marginBottom:12 }}>{ok}</div>}
        <button onClick={submit}
          style={{ width:'100%', padding:14, borderRadius:12, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:15, fontWeight:700, cursor:'pointer' }}>
          Submit Request
        </button>
      </div>

      {/* My requests */}
      <div className="s-card">
        <div className="s-card-title">📋 My Requests</div>
        {data?.requests?.length ? data.requests.map(h => (
          <div key={h.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 0', borderBottom:'1px solid #f0f4f0', flexWrap:'wrap' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#1a2a1a' }}>{h.from_date} → {h.to_date} ({h.days} day{h.days !== 1 ? 's' : ''})</div>
              {h.note && <div style={{ fontSize:12, color:'#6a8a6a', marginTop:2 }}>{h.note}</div>}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
              {h.holiday_pay_hours > 0 && (
                <span style={{ padding:'3px 8px', borderRadius:12, fontSize:11, fontWeight:700, background:'#e8f8e0', color:'#3a7a20' }}>
                  💰 {h.holiday_pay_hours}h pay
                </span>
              )}
              <span style={{ padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700,
                background: h.status==='approved'?'#e8f8e0':h.status==='rejected'?'#fde8e8':'#fef6e0',
                color:      h.status==='approved'?'#3a7a20':h.status==='rejected'?'#a02020':'#7a5000' }}>
                {h.status==='approved'?'✓ Approved':h.status==='rejected'?'✗ Rejected':'⏳ Pending'}
              </span>
            </div>
          </div>
        )) : <p style={{ color:'#8aaa8a', fontSize:13 }}>No requests yet</p>}
      </div>
    </div>
  )
}

export default StaffHolidays
