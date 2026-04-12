// StaffHolidays.jsx
import { useEffect, useState } from 'react'
import { getMyHols, requestHol } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

export function StaffHolidays() {
  const { colour } = useBrand(); const c = colour||'#6abf3f'
  const [data, setData] = useState(null)
  const [form, setForm] = useState({from_date:'',to_date:'',note:''})
  const [err,  setErr]  = useState(''); const [ok, setOk] = useState('')

  const load = () => getMyHols().then(r=>setData(r.data)).catch(()=>setData({remaining_days:20,approved_days:0,pending_days:0,requests:[]}))
  useEffect(load,[])

  async function submit() {
    setErr(''); setOk('')
    if (!form.from_date||!form.to_date) return setErr('Please select both dates.')
    if (form.to_date<form.from_date)    return setErr('End date must be after start.')
    try {
      await requestHol({from_date:form.from_date,to_date:form.to_date,note:form.note})
      setOk('✅ Request submitted. HR will respond within 2 working days.')
      setForm({from_date:'',to_date:'',note:''}); load()
    } catch(ex) { setErr(ex.response?.data?.detail||'Request failed.') }
  }

  const total=20, used=data?.approved_days||0, pend=data?.pending_days||0, rem=data?.remaining_days??20
  const inp = (id,type='date',label) => (
    <div style={{marginBottom:14}}>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:'#6a8a6a',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{label}</label>
      <input type={type} value={form[id]} onChange={e=>setForm(f=>({...f,[id]:e.target.value}))}
        style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #d0e0d0',background:'#f8fbf8',color:'#1a2a1a',fontFamily:'DM Sans,sans-serif',fontSize:14,outline:'none'}}/>
    </div>
  )

  return <div>
    <div style={{fontSize:20,fontWeight:700,color:'#1a2a1a',marginBottom:16}}>My Holidays</div>
    <div className="s-card">
      <div className="s-card-title">📅 Allowance (1 Apr – 31 Mar)</div>
      <div style={{textAlign:'center',padding:'12px 0'}}>
        <div style={{fontSize:52,fontWeight:700,fontFamily:'DM Mono,monospace',color:c,lineHeight:1}}>{rem}</div>
        <div style={{fontSize:12,color:'#6a8a6a',marginTop:4}}>days remaining of {total}</div>
      </div>
      <div style={{height:10,borderRadius:5,background:'#e0ead0',overflow:'hidden',margin:'12px 0'}}>
        <div style={{height:'100%',borderRadius:5,background:c,width:`${Math.round(used/total*100)}%`,transition:'width .5s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-around',fontSize:12,color:'#6a8a6a'}}>
        <span>✅ {used} approved</span><span>⏳ {pend} pending</span><span>📅 {rem} remaining</span>
      </div>
      <div style={{background:'#e8f5fd',border:'1px solid #b8dcf0',borderRadius:8,padding:'10px 12px',fontSize:12,color:'#1a4a6a',marginTop:14}}>
        ℹ️ Requests must be 4+ weeks in advance. Do not book travel until formally approved.
      </div>
    </div>

    <div className="s-card">
      <div className="s-card-title">➕ Request Holiday</div>
      {inp('from_date','date','From Date')}
      {inp('to_date','date','To Date')}
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:11,fontWeight:700,color:'#6a8a6a',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Notes (optional)</label>
        <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2}
          style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #d0e0d0',background:'#f8fbf8',color:'#1a2a1a',fontFamily:'DM Sans,sans-serif',fontSize:14,outline:'none',resize:'vertical'}}/>
      </div>
      {err && <div style={{background:'#fde8e8',border:'1px solid #e08080',borderRadius:8,padding:'10px',fontSize:13,color:'#a02020',marginBottom:12}}>⚠ {err}</div>}
      {ok  && <div style={{background:'#e8f8e0',border:'1px solid #a0d080',borderRadius:8,padding:'10px',fontSize:13,color:'#3a7a20',marginBottom:12}}>{ok}</div>}
      <button onClick={submit} style={{width:'100%',padding:14,borderRadius:12,border:'none',background:c,color:'#fff',fontFamily:'DM Sans,sans-serif',fontSize:15,fontWeight:700,cursor:'pointer'}}>Submit Request</button>
    </div>

    <div className="s-card">
      <div className="s-card-title">📋 My Requests</div>
      {data?.requests?.length ? data.requests.map(h=>(
        <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderBottom:'1px solid #f0f4f0'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:'#1a2a1a'}}>{h.from_date} → {h.to_date} ({h.days} day{h.days!==1?'s':''})</div>
            {h.note&&<div style={{fontSize:12,color:'#6a8a6a',marginTop:2}}>{h.note}</div>}
          </div>
          <span style={{padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:700,background:h.status==='approved'?'#e8f8e0':h.status==='rejected'?'#fde8e8':'#fef6e0',color:h.status==='approved'?'#3a7a20':h.status==='rejected'?'#a02020':'#7a5000'}}>
            {h.status==='approved'?'✓ Approved':h.status==='rejected'?'✗ Rejected':'⏳ Pending'}
          </span>
        </div>
      )):<p style={{color:'#8aaa8a',fontSize:13}}>No requests yet</p>}
    </div>
  </div>
}

export default StaffHolidays
