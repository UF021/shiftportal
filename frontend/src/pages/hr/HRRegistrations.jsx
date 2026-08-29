import { useEffect, useState } from 'react'
import { getPending, activateUser, rejectUser, getRejected, reconsiderUser, getMySites } from '../../api/client'
import { fmtDate, fmtDateTime } from '../../api/utils'

const PRESET_PAY = ['12.71','12.80','12.90','13.00']

export default function HRRegistrations() {
  const [tab,         setTab]        = useState('pending')
  const [regs,        setRegs]       = useState([])
  const [rejected,    setRejected]   = useState([])
  const [sites,       setSites]      = useState([])
  const [loading,     setLoad]       = useState(true)
  const [selected,    setSel]        = useState(null)
  const [act,         setAct]        = useState({ employment_start_date:'', pay_rate:'' })
  const [selSites,    setSelSites]   = useState([])
  const [otherSiteOn, setOtherOn]    = useState(false)
  const [otherSiteText,setOtherText] = useState('')
  const [customPay,   setCustomPay]  = useState('')
  const [busy,        setBusy]       = useState(false)
  const [msg,         setMsg]        = useState('')

  const loadAll = () => {
    setLoad(true)
    Promise.all([
      getPending().catch(() => ({ data: [] })),
      getRejected().catch(() => ({ data: [] })),
    ]).then(([p, r]) => {
      setRegs(p.data || [])
      setRejected(r.data || [])
    }).finally(() => setLoad(false))
  }

  useEffect(() => {
    loadAll()
    getMySites().then(r => setSites(r.data || [])).catch(() => {})
  }, [])

  function openReview(r) {
    setSel(r)
    setMsg('')
    setSelSites([])
    setOtherOn(false)
    setOtherText('')
    setAct({ employment_start_date:'', pay_rate:'' })
    setCustomPay('')
  }

  async function activate() {
    setBusy(true); setMsg('')
    try {
      const payValue = act.pay_rate === 'other'
        ? (customPay ? parseFloat(customPay) : null)
        : (act.pay_rate ? parseFloat(act.pay_rate) : null)

      const allSiteNames = [
        ...selSites,
        ...(otherSiteOn && otherSiteText.trim()
          ? otherSiteText.split(',').map(x => x.trim()).filter(Boolean)
          : []),
      ]
      const assignedSites  = allSiteNames.length ? allSiteNames.join(', ') : null
      const firstSite      = sites.find(s => s.name === selSites[0])
      const assignedSiteId = firstSite ? firstSite.id : null

      const res = await activateUser(selected.id, {
        pay_rate:              payValue,
        assigned_site_id:      assignedSiteId,
        assigned_sites:        assignedSites,
        employment_start_date: act.employment_start_date || null,
      })
      const sid = res.data?.staff_id || ''
      setMsg(`✅ ${selected.full_name} has been activated. Staff ID: ${sid}`)
      setSel(null); loadAll()
    } catch(ex) { setMsg('❌ ' + (ex.response?.data?.detail || 'Activation failed')) }
    finally { setBusy(false) }
  }

  async function reject(id, name, isPreviouslyActive) {
    const warn = isPreviouslyActive
      ? `⚠ ${name} has recent clock history — they are likely still employed.\n\nReject anyway? They will be moved to the Rejected tab and can be reinstated.`
      : `Reject registration for ${name}? They will be moved to the Rejected tab and can be reconsidered later.`
    if (!confirm(warn)) return
    try { await rejectUser(id); setSel(null); loadAll() } catch {}
  }

  async function reconsider(id) {
    try { await reconsiderUser(id); loadAll() } catch {}
  }

  const pf = (l, v) => (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{l}</div>
      <div style={{ fontSize:13, fontWeight:500 }}>{v || '—'}</div>
    </div>
  )

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
    fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600,
    background: tab === t ? 'var(--green)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-muted)',
  })

  return (
    <>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Staff Registrations</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Review submissions and activate accounts before staff can sign in</p>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <button style={tabStyle('pending')} onClick={() => setTab('pending')}>
          Pending {regs.length > 0 && <span style={{ background:'var(--red)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, marginLeft:6 }}>{regs.length}</span>}
        </button>
        <button style={tabStyle('rejected')} onClick={() => setTab('rejected')}>
          Rejected {rejected.length > 0 && <span style={{ background:'#888', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, marginLeft:6 }}>{rejected.length}</span>}
        </button>
      </div>

      {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-green' : 'alert-red'}`} style={{ marginBottom:16 }}>{msg}</div>}

      {loading ? <p style={{ color:'var(--text-muted)' }}>Loading…</p>

      : tab === 'pending' ? (
        !regs.length ? (
          <div className="card" style={{ textAlign:'center', padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
            <p style={{ color:'var(--text-muted)' }}>No pending registrations</p>
          </div>
        ) : (
          <div className="card">
            {regs.map(r => {
              const prevActive = r.is_previously_active
              return (
                <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 0', borderBottom:'1px solid var(--border)', gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontWeight:700, fontSize:14 }}>{r.full_name}</span>
                      {prevActive && (
                        <span style={{ background:'#fff3cd', color:'#856404', border:'1px solid #ffc107', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
                          Previously Active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{r.email} · {r.phone}</div>
                    {prevActive && r.staff_id && r.staff_id !== 'TBC' && (
                      <div style={{ fontSize:12, color:'#856404', marginTop:2 }}>
                        Staff ID: <strong>{r.staff_id}</strong> · Last clock-in: {r.last_clock_in ? fmtDateTime(r.last_clock_in) : '—'}
                      </div>
                    )}
                    <div style={{ fontSize:12, marginTop:4 }}>
                      SIA: <span style={{ fontFamily:'DM Mono,monospace' }}>{r.sia_licence || '—'}</span>
                      {r.sia_expiry && ` · Exp: ${fmtDate(r.sia_expiry)}`}
                      {' · '}NI: <span style={{ fontFamily:'DM Mono,monospace' }}>{r.ni_number || '—'}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:2 }}>
                      Submitted: {fmtDateTime(r.registered_at)}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    <button onClick={() => openReview(r)} className="btn btn-brand" style={{ fontSize:12, padding:'6px 14px' }}>Review →</button>
                    {prevActive
                      ? (
                        <button
                          title="This person has recent clock history — use Review to re-activate or reject from inside the review panel"
                          disabled
                          className="btn btn-danger"
                          style={{ fontSize:12, padding:'6px 12px', opacity:0.4, cursor:'not-allowed' }}>✗</button>
                      ) : (
                        <button onClick={() => reject(r.id, r.full_name, false)} className="btn btn-danger" style={{ fontSize:12, padding:'6px 12px' }}>✗</button>
                      )
                    }
                  </div>
                </div>
              )
            })}
          </div>
        )

      ) : (
        !rejected.length ? (
          <div className="card" style={{ textAlign:'center', padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📁</div>
            <p style={{ color:'var(--text-muted)' }}>No rejected registrations</p>
          </div>
        ) : (
          <div className="card">
            {rejected.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 0', borderBottom:'1px solid var(--border)', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{r.full_name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{r.email} · {r.phone}</div>
                  <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:2 }}>
                    Registered: {r.registered_at ? fmtDateTime(r.registered_at) : '—'}
                    {r.staff_id && r.staff_id !== 'TBC' && ` · Staff ID: ${r.staff_id}`}
                  </div>
                </div>
                <button onClick={() => reconsider(r.id)} className="btn btn-outline" style={{ fontSize:12, padding:'6px 14px' }}>
                  Reconsider
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Review modal */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSel(null)}>
          <div className="modal" style={{ width:620, maxHeight:'90vh', overflowY:'auto' }}>
            <h3>Review Registration</h3>
            {selected.is_previously_active && (
              <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#856404' }}>
                ⚠ <strong>Previously Active</strong> — This person has recent clock history (Staff ID: {selected.staff_id}).
                Re-activating will preserve their existing QR code and staff ID.
              </div>
            )}
            <p className="sub">Check all details carefully before activating this account.</p>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, marginBottom:16 }}>
              {pf('Full Name',    selected.full_name)}
              {pf('Email',       selected.email)}
              {pf('Phone',       selected.phone)}
              {pf('Date of Birth', fmtDate(selected.date_of_birth))}
              {pf('Nationality', selected.nationality)}
              {pf('Right to Work', selected.right_to_work ? 'Yes' : 'No')}
            </div>
            {pf('Address', selected.full_address)}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, marginBottom:16 }}>
              {pf('NI Number',   selected.ni_number)}
              {pf('SIA Licence', selected.sia_licence)}
              {pf('SIA Expiry',  fmtDate(selected.sia_expiry))}
              {pf('Next of Kin', `${selected.nok_name || '—'} (${selected.nok_phone || '—'})`)}
            </div>

            <div style={{ fontSize:12, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>
              Activation Settings
            </div>
            {selected.is_previously_active
              ? (
                <div style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12, color:'var(--text-muted)' }}>
                  🆔 Staff ID <strong>{selected.staff_id}</strong> will be preserved — their existing QR code will continue to work.
                </div>
              ) : (
                <div style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12, color:'var(--text-muted)' }}>
                  🆔 A Staff ID will be auto-generated on activation (e.g. ZZ123 — initials + 3 digits)
                </div>
              )
            }

            <div className="form-row">
              <div className="field"><label>Employment Start Date</label>
                <input type="date" value={act.employment_start_date} onChange={e => setAct(a => ({ ...a, employment_start_date: e.target.value }))} /></div>
            </div>

            <div className="field" style={{ marginBottom:12 }}><label>Pay Rate (£/hr)</label>
              <select value={act.pay_rate} onChange={e => setAct(a => ({ ...a, pay_rate: e.target.value }))}>
                <option value="">— Select pay rate —</option>
                {PRESET_PAY.map(p => <option key={p} value={p}>£{p}/hr</option>)}
                <option value="other">Other</option>
              </select>
              {act.pay_rate === 'other' && (
                <input type="number" step="0.01" min="0" value={customPay} onChange={e => setCustomPay(e.target.value)}
                  placeholder="Enter amount e.g. 14.50"
                  style={{ marginTop:6, width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }} />
              )}
            </div>

            <div className="field" style={{ marginBottom:16 }}><label>Assign to Sites</label>
              <div style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', maxHeight:180, overflowY:'auto' }}>
                {sites.length === 0 && (
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>No sites configured yet.</p>
                )}
                {sites.map(s => {
                  const checked = selSites.includes(s.name)
                  return (
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={checked}
                        onChange={e => setSelSites(prev => e.target.checked ? [...prev, s.name] : prev.filter(n => n !== s.name))}
                        style={{ accentColor:'var(--green)', width:15, height:15 }} />
                      {s.name}
                    </label>
                  )
                })}
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', cursor:'pointer', fontSize:13, borderTop:'1px solid var(--border)', marginTop:6, paddingTop:8 }}>
                  <input type="checkbox" checked={otherSiteOn} onChange={e => setOtherOn(e.target.checked)}
                    style={{ accentColor:'var(--green)', width:15, height:15 }} />
                  Other
                </label>
                {otherSiteOn && (
                  <input value={otherSiteText} onChange={e => setOtherText(e.target.value)}
                    placeholder="Enter site name(s), comma-separated"
                    style={{ marginTop:6, width:'100%', padding:'7px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--navy)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                )}
              </div>
              {(selSites.length > 0 || (otherSiteOn && otherSiteText.trim())) && (
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                  Selected: {[...selSites, ...(otherSiteOn && otherSiteText.trim() ? [otherSiteText.trim()] : [])].join(', ')}
                </div>
              )}
            </div>

            {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-green' : 'alert-red'}`}>{msg}</div>}

            <div className="modal-footer">
              <button
                onClick={() => reject(selected.id, selected.full_name, selected.is_previously_active)}
                className="btn btn-danger">✗ Reject</button>
              <button onClick={() => setSel(null)} className="btn btn-outline">Cancel</button>
              <button onClick={activate} className="btn btn-brand" disabled={busy}>{busy ? 'Activating…' : '✓ Activate Account'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
