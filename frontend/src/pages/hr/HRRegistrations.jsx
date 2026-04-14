import { useEffect, useState } from 'react'
import { getPending, activateUser, rejectUser, getMySites } from '../../api/client'

const PRESET_PAY = ['12.71','12.80','12.90','13.00']

export default function HRRegistrations() {
  const [regs,        setRegs]       = useState([])
  const [sites,       setSites]      = useState([])
  const [loading,     setLoad]       = useState(true)
  const [selected,    setSel]        = useState(null)
  const [act,         setAct]        = useState({ staff_id:'TBC', employment_start_date:'', pay_rate:'', assigned_site_id:'' })
  const [customPay,   setCustomPay]  = useState('')
  const [busy,        setBusy]       = useState(false)
  const [msg,         setMsg]        = useState('')

  const load = () => {
    setLoad(true)
    getPending().then(r => setRegs(r.data||[])).catch(()=>setRegs([])).finally(()=>setLoad(false))
  }
  useEffect(() => {
    load()
    getMySites().then(r=>setSites(r.data||[])).catch(()=>{})
  }, [])

  async function activate() {
    setBusy(true); setMsg('')
    try {
      const payValue = act.pay_rate === 'other' ? (customPay ? parseFloat(customPay) : null) : (act.pay_rate ? parseFloat(act.pay_rate) : null)
      await activateUser(selected.id, {
        ...act,
        pay_rate: payValue,
        assigned_site_id: act.assigned_site_id ? parseInt(act.assigned_site_id) : null,
        employment_start_date: act.employment_start_date || null,
      })
      setMsg(`✅ ${selected.full_name} has been activated.`)
      setSel(null); load()
    } catch(ex) { setMsg('❌ ' + (ex.response?.data?.detail||'Activation failed')) }
    finally { setBusy(false) }
  }

  async function reject(id, name) {
    if (!confirm(`Reject registration for ${name}? This cannot be undone.`)) return
    try { await rejectUser(id); load() } catch {}
  }

  const pf = (l,v) => (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{l}</div>
      <div style={{ fontSize:13, fontWeight:500 }}>{v||'—'}</div>
    </div>
  )

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Staff Registrations</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Review submissions and activate accounts before staff can sign in</p>
      </div>

      {msg && <div className={`alert ${msg.startsWith('✅')?'alert-green':'alert-red'}`} style={{ marginBottom:16 }}>{msg}</div>}

      {loading ? <p style={{ color:'var(--text-muted)' }}>Loading…</p>
      : !regs.length ? (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <p style={{ color:'var(--text-muted)' }}>No pending registrations</p>
        </div>
      ) : (
        <div className="card">
          {regs.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 0', borderBottom:'1px solid var(--border)', gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{r.full_name}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{r.email} · {r.phone}</div>
                <div style={{ fontSize:12, marginTop:4 }}>
                  SIA: <span style={{ fontFamily:'DM Mono,monospace' }}>{r.sia_licence||'—'}</span>
                  {r.sia_expiry && ` · Exp: ${r.sia_expiry}`}
                  {' · '}NI: <span style={{ fontFamily:'DM Mono,monospace' }}>{r.ni_number||'—'}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:2 }}>
                  Submitted: {r.registered_at ? new Date(r.registered_at).toLocaleDateString('en-GB') : '—'}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button onClick={() => { setSel(r); setMsg('') }} className="btn btn-brand" style={{ fontSize:12, padding:'6px 14px' }}>Review →</button>
                <button onClick={() => reject(r.id, r.full_name)} className="btn btn-danger" style={{ fontSize:12, padding:'6px 12px' }}>✗</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review modal */}
      {selected && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSel(null)}>
          <div className="modal" style={{ width:620 }}>
            <h3>Review Registration</h3>
            <p className="sub">Check all details carefully before activating this account.</p>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, marginBottom:16 }}>
              {pf('Full Name',    selected.full_name)}
              {pf('Email',       selected.email)}
              {pf('Phone',       selected.phone)}
              {pf('Date of Birth',selected.date_of_birth)}
              {pf('Nationality', selected.nationality)}
              {pf('Right to Work',selected.right_to_work?'Yes':'No')}
            </div>
            {pf('Address', selected.full_address)}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, marginBottom:16 }}>
              {pf('NI Number',   selected.ni_number)}
              {pf('SIA Licence', selected.sia_licence)}
              {pf('SIA Expiry',  selected.sia_expiry)}
              {pf('Next of Kin', `${selected.nok_name||'—'} (${selected.nok_phone||'—'})`)}
            </div>

            <div style={{ fontSize:12, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>
              Activation Settings
            </div>
            <div className="form-row">
              <div className="field"><label>Staff ID</label>
                <input value={act.staff_id} onChange={e=>setAct(a=>({...a,staff_id:e.target.value}))} placeholder="e.g. IFM-045 or TBC"/></div>
              <div className="field"><label>Employment Start Date</label>
                <input type="date" value={act.employment_start_date} onChange={e=>setAct(a=>({...a,employment_start_date:e.target.value}))}/></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Pay Rate (£/hr)</label>
                <select value={act.pay_rate} onChange={e=>setAct(a=>({...a,pay_rate:e.target.value}))}>
                  <option value="">— Select pay rate —</option>
                  {PRESET_PAY.map(p=><option key={p} value={p}>£{p}/hr</option>)}
                  <option value="other">Other</option>
                </select>
                {act.pay_rate === 'other' && (
                  <input type="number" step="0.01" min="0" value={customPay} onChange={e=>setCustomPay(e.target.value)}
                    placeholder="Enter amount e.g. 14.50"
                    style={{ marginTop:6, width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }} />
                )}
              </div>
              <div className="field"><label>Assign to Site</label>
                <select value={act.assigned_site_id} onChange={e=>setAct(a=>({...a,assigned_site_id:e.target.value}))}>
                  <option value="">— Unassigned —</option>
                  {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
            </div>

            {msg && <div className={`alert ${msg.startsWith('✅')?'alert-green':'alert-red'}`}>{msg}</div>}

            <div className="modal-footer">
              <button onClick={()=>reject(selected.id,selected.full_name)} className="btn btn-danger">✗ Reject</button>
              <button onClick={()=>setSel(null)} className="btn btn-outline">Cancel</button>
              <button onClick={activate} className="btn btn-brand" disabled={busy}>{busy?'Activating…':'✓ Activate Account'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
