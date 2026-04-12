import { useEffect, useState } from 'react'
import { getMyOrg, updateBranding, getMySites, createSite, deleteSite } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

export default function HRSettings() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  const [org,      setOrg]    = useState(null)
  const [brand,    setBrand]  = useState({})
  const [sites,    setSites]  = useState([])
  const [newSite,  setNSite]  = useState({ code:'', name:'', group:'', address:'' })
  const [saving,   setSaving] = useState(false)
  const [msg,      setMsg]    = useState('')
  const [tab,      setTab]    = useState('branding')

  function load() {
    getMyOrg().then(r => { setOrg(r.data); setBrand({ brand_name:r.data.brand_name||'', brand_colour:r.data.brand_colour||'#6abf3f', brand_email:r.data.brand_email||'', contract_employer_name:r.data.contract_employer_name||'', contract_employer_address:r.data.contract_employer_address||'', contract_employer_email:r.data.contract_employer_email||'', contract_employer_phone:r.data.contract_employer_phone||'', contract_signatory_name:r.data.contract_signatory_name||'', contract_signatory_role:r.data.contract_signatory_role||'', contract_min_pay:r.data.contract_min_pay||'', contract_max_pay:r.data.contract_max_pay||'' }) }).catch(()=>{})
    getMySites().then(r=>setSites(r.data||[])).catch(()=>{})
  }
  useEffect(load,[])

  async function saveBranding() {
    setSaving(true); setMsg('')
    try { await updateBranding(brand); setMsg('✅ Settings saved'); load() }
    catch { setMsg('❌ Save failed') }
    finally { setSaving(false) }
  }

  async function addSite() {
    if (!newSite.code||!newSite.name) return alert('Code and name are required')
    try { await createSite(newSite); setNSite({code:'',name:'',group:'',address:''}); load() }
    catch(ex) { alert(ex.response?.data?.detail||'Failed') }
  }

  async function removeSite(id) {
    if (!confirm('Remove this site?')) return
    try { await deleteSite(id); load() } catch {}
  }

  const F = ({id,label,type='text',hint}) => (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={brand[id]||''} onChange={e=>setBrand(b=>({...b,[id]:e.target.value}))} />
      {hint && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{hint}</div>}
    </div>
  )

  const regLink = org ? `${window.location.origin}/register/${org.slug}` : '…'

  return (
    <>
      <div style={{marginBottom:26}}>
        <h2 style={{fontSize:23,fontWeight:700,marginBottom:4}}>Settings</h2>
        <p style={{fontSize:14,color:'var(--text-muted)'}}>Manage your organisation branding, contract details, and sites</p>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:22}}>
        {[['branding','🎨 Branding & Contract'],['sites','📍 Sites'],['links','🔗 Registration Links']].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{
            padding:'9px 18px',borderRadius:8,cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:13,
            border:`1px solid ${tab===v?c:'var(--border)'}`,
            background:tab===v?c+'18':'transparent',
            color:tab===v?c:'var(--text-muted)',fontWeight:tab===v?700:400,
          }}>{l}</button>
        ))}
      </div>

      {/* Branding tab */}
      {tab==='branding' && (
        <div className="card">
          <div className="card-title">🎨 Portal Branding</div>
          <div className="form-row">
            <F id="brand_name"  label="Organisation Display Name" hint="Shown in the portal header and login page"/>
            <div className="field">
              <label>Brand Colour</label>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input type="color" value={brand.brand_colour||'#6abf3f'} onChange={e=>setBrand(b=>({...b,brand_colour:e.target.value}))} style={{width:50,height:40,padding:2,borderRadius:6,border:'1px solid var(--border)',background:'var(--navy-light)',cursor:'pointer'}}/>
                <input value={brand.brand_colour||''} onChange={e=>setBrand(b=>({...b,brand_colour:e.target.value}))} placeholder="#6abf3f" style={{flex:1,padding:'11px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--navy-light)',color:'var(--text)',fontFamily:'DM Mono,monospace',fontSize:14,outline:'none'}}/>
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Used for buttons, active states, and contract header</div>
            </div>
          </div>
          <F id="brand_email" label="HR Contact Email" hint="Shown on contract and registration pending page"/>

          <div style={{borderTop:'1px solid var(--border)',margin:'20px 0',paddingTop:20}}>
            <div className="card-title">📄 Contract Details</div>
            <div className="form-row">
              <F id="contract_employer_name"    label="Employer Name on Contract"/>
              <F id="contract_employer_email"   label="Employer Email on Contract"/>
            </div>
            <F id="contract_employer_address"   label="Employer Address on Contract"/>
            <F id="contract_employer_phone"     label="Employer Phone on Contract"/>
            <div className="form-row">
              <F id="contract_signatory_name"   label="Signatory Name" hint="Person who signs contracts"/>
              <F id="contract_signatory_role"   label="Signatory Role" hint="e.g. Director, CEO"/>
            </div>
            <div className="form-row">
              <F id="contract_min_pay"  label="Minimum Pay (clause 5)" hint="e.g. National Minimum Wage (NMW)"/>
              <F id="contract_max_pay"  label="Maximum Pay (clause 5)" hint="e.g. £14"/>
            </div>
          </div>

          {msg && <div className={`alert ${msg.startsWith('✅')?'alert-green':'alert-red'}`}>{msg}</div>}
          <button onClick={saveBranding} className="btn btn-brand btn-lg" disabled={saving}>{saving?'Saving…':'Save Settings'}</button>
        </div>
      )}

      {/* Sites tab */}
      {tab==='sites' && (
        <>
          <div className="card">
            <div className="card-title">➕ Add New Site</div>
            <div className="form-row">
              <div className="field"><label>Site Code *</label><input value={newSite.code} onChange={e=>setNSite(s=>({...s,code:e.target.value.toLowerCase().replace(/\s+/g,'-')}))} placeholder="e.g. vc-harrow"/></div>
              <div className="field"><label>Site Name *</label><input value={newSite.name} onChange={e=>setNSite(s=>({...s,name:e.target.value}))} placeholder="e.g. Vue Cinema — Harrow"/></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Group</label><input value={newSite.group} onChange={e=>setNSite(s=>({...s,group:e.target.value}))} placeholder="e.g. Vue, Showcase"/></div>
              <div className="field"><label>Address</label><input value={newSite.address} onChange={e=>setNSite(s=>({...s,address:e.target.value}))}/></div>
            </div>
            <button onClick={addSite} className="btn btn-brand">+ Add Site</button>
          </div>

          <div className="card" style={{padding:0}}>
            <div className="tw">
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Group</th><th>Address</th><th>Actions</th></tr></thead>
                <tbody>
                  {sites.map(s=>(
                    <tr key={s.id}>
                      <td style={{fontFamily:'DM Mono,monospace',fontSize:12}}>{s.code}</td>
                      <td><strong>{s.name}</strong></td>
                      <td style={{fontSize:12,color:'var(--text-muted)'}}>{s.group||'—'}</td>
                      <td style={{fontSize:12,color:'var(--text-muted)'}}>{s.address||'—'}</td>
                      <td><button onClick={()=>removeSite(s.id)} className="btn btn-danger" style={{fontSize:11,padding:'4px 10px'}}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Registration Links tab */}
      {tab==='links' && (
        <div className="card">
          <div className="card-title">🔗 Staff Registration Link</div>
          <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>
            Send this link to new staff members so they can register for the portal. Once they complete the registration, you will see them in the <strong>Registrations</strong> tab for approval.
          </p>
          <div style={{background:'var(--navy-light)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px',fontFamily:'DM Mono,monospace',fontSize:13,wordBreak:'break-all',color:'var(--green)'}}>
            {regLink}
          </div>
          <button onClick={()=>{ navigator.clipboard.writeText(regLink); setMsg('✅ Link copied to clipboard!') }} className="btn btn-brand" style={{marginTop:14}}>
            📋 Copy Link
          </button>
          {msg && <div className="alert alert-green" style={{marginTop:12}}>{msg}</div>}

          <div style={{borderTop:'1px solid var(--border)',marginTop:20,paddingTop:20}}>
            <div className="card-title">📱 QR Code</div>
            <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:14}}>
              Staff can also scan this QR code on their phone to access the registration page directly.
            </p>
            <div style={{background:'#fff',borderRadius:10,padding:16,display:'inline-block'}}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(regLink)}`} alt="Registration QR" style={{display:'block',width:180,height:180}}/>
            </div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:10}}>Right-click → Save image to download and print</div>
          </div>
        </div>
      )}
    </>
  )
}
