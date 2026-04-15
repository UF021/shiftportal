import { useEffect, useState } from 'react'
import { getMyOrg, updateBranding, getMySites, createSite, deleteSite, getOrgDocs, updateOrgDoc } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

function BrandField({ label, type='text', hint, value, onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value||''} onChange={onChange} />
      {hint && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{hint}</div>}
    </div>
  )
}

export default function HRSettings() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  const [org,      setOrg]    = useState(null)
  const [brand,    setBrand]  = useState({})
  const [sites,    setSites]  = useState([])
  const [docs,     setDocs]   = useState([])
  const [docUrls,  setDocUrls]  = useState({})  // { doc_key: draftUrl }
  const [docMsgs,  setDocMsgs]  = useState({})  // { doc_key: message }
  const [docBusy,  setDocBusy]  = useState({})  // { doc_key: bool }
  const [newSite,  setNSite]  = useState({ code:'', name:'', group:'', address:'' })
  const [saving,   setSaving] = useState(false)
  const [msg,      setMsg]    = useState('')
  const [tab,      setTab]    = useState('branding')

  function load() {
    getMyOrg().then(r => { setOrg(r.data); setBrand({ brand_name:r.data.brand_name||'', brand_colour:r.data.brand_colour||'#6abf3f', brand_email:r.data.brand_email||'', contract_employer_name:r.data.contract_employer_name||'', contract_employer_address:r.data.contract_employer_address||'', contract_employer_email:r.data.contract_employer_email||'', contract_employer_phone:r.data.contract_employer_phone||'', contract_signatory_name:r.data.contract_signatory_name||'', contract_signatory_role:r.data.contract_signatory_role||'', contract_min_pay:r.data.contract_min_pay||'', contract_max_pay:r.data.contract_max_pay||'' }) }).catch(()=>{})
    getMySites().then(r=>setSites(r.data||[])).catch(()=>{})
    getOrgDocs().then(r => {
      const d = r.data || []
      setDocs(d)
      const urls = {}
      d.forEach(doc => { urls[doc.doc_key] = doc.doc_url || '' })
      setDocUrls(urls)
    }).catch(()=>{})
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

  async function saveDoc(doc) {
    const url = docUrls[doc.doc_key] || ''
    setDocBusy(b => ({ ...b, [doc.doc_key]: true }))
    setDocMsgs(m => ({ ...m, [doc.doc_key]: '' }))
    try {
      await updateOrgDoc(doc.doc_key, { doc_name: doc.doc_name, doc_url: url })
      setDocMsgs(m => ({ ...m, [doc.doc_key]: '✅ Link saved — all staff can now view this document' }))
      load()
    } catch {
      setDocMsgs(m => ({ ...m, [doc.doc_key]: '❌ Save failed' }))
    } finally {
      setDocBusy(b => ({ ...b, [doc.doc_key]: false }))
    }
  }

  const regLink = org ? `${window.location.origin}/register/${org.slug}` : '…'

  return (
    <>
      <div style={{marginBottom:26}}>
        <h2 style={{fontSize:23,fontWeight:700,marginBottom:4}}>Settings</h2>
        <p style={{fontSize:14,color:'var(--text-muted)'}}>Manage your organisation branding, contract details, and sites</p>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:22}}>
        {[['branding','🎨 Branding & Contract'],['sites','📍 Sites'],['links','🔗 Registration Links'],['documents','📋 Staff Documents']].map(([v,l])=>(
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
            <BrandField label="Organisation Display Name" hint="Shown in the portal header and login page" value={brand.brand_name} onChange={e=>setBrand(b=>({...b,brand_name:e.target.value}))}/>
            <div className="field">
              <label>Brand Colour</label>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input type="color" value={brand.brand_colour||'#6abf3f'} onChange={e=>setBrand(b=>({...b,brand_colour:e.target.value}))} style={{width:50,height:40,padding:2,borderRadius:6,border:'1px solid var(--border)',background:'var(--navy-light)',cursor:'pointer'}}/>
                <input value={brand.brand_colour||''} onChange={e=>setBrand(b=>({...b,brand_colour:e.target.value}))} placeholder="#6abf3f" style={{flex:1,padding:'11px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--navy-light)',color:'var(--text)',fontFamily:'DM Mono,monospace',fontSize:14,outline:'none'}}/>
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Used for buttons, active states, and contract header</div>
            </div>
          </div>
          <BrandField label="HR Contact Email" hint="Shown on contract and registration pending page" value={brand.brand_email} onChange={e=>setBrand(b=>({...b,brand_email:e.target.value}))}/>

          <div style={{borderTop:'1px solid var(--border)',margin:'20px 0',paddingTop:20}}>
            <div className="card-title">📄 Contract Details</div>
            <div className="form-row">
              <BrandField label="Employer Name on Contract"  value={brand.contract_employer_name}  onChange={e=>setBrand(b=>({...b,contract_employer_name:e.target.value}))}/>
              <BrandField label="Employer Email on Contract" value={brand.contract_employer_email} onChange={e=>setBrand(b=>({...b,contract_employer_email:e.target.value}))}/>
            </div>
            <BrandField label="Employer Address on Contract" value={brand.contract_employer_address} onChange={e=>setBrand(b=>({...b,contract_employer_address:e.target.value}))}/>
            <BrandField label="Employer Phone on Contract"   value={brand.contract_employer_phone}   onChange={e=>setBrand(b=>({...b,contract_employer_phone:e.target.value}))}/>
            <div className="form-row">
              <BrandField label="Signatory Name" hint="Person who signs contracts" value={brand.contract_signatory_name} onChange={e=>setBrand(b=>({...b,contract_signatory_name:e.target.value}))}/>
              <BrandField label="Signatory Role" hint="e.g. Director, CEO"         value={brand.contract_signatory_role} onChange={e=>setBrand(b=>({...b,contract_signatory_role:e.target.value}))}/>
            </div>
            <div className="form-row">
              <BrandField label="Minimum Pay (clause 5)" hint="e.g. National Minimum Wage (NMW)" value={brand.contract_min_pay} onChange={e=>setBrand(b=>({...b,contract_min_pay:e.target.value}))}/>
              <BrandField label="Maximum Pay (clause 5)" hint="e.g. £14"                          value={brand.contract_max_pay} onChange={e=>setBrand(b=>({...b,contract_max_pay:e.target.value}))}/>
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

      {/* Staff Documents tab */}
      {tab==='documents' && (
        <>
          <div style={{marginBottom:18,fontSize:13,color:'var(--text-muted)'}}>
            Upload links to shared documents so staff can access them from their portal. Use Google Drive or Dropbox — make sure sharing is set to <strong>Anyone with the link can view</strong>.
          </div>
          <div style={{background:'rgba(240,160,48,.08)',border:'1px solid rgba(240,160,48,.25)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--amber)',marginBottom:20}}>
            ⚠️ For Google Drive: open the file → Share → Change to <strong>Anyone with the link</strong> → Copy link → paste below.
          </div>
          {docs.map(doc => (
            <div key={doc.doc_key} className="card" style={{marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{doc.doc_name}</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>
                {doc.doc_url
                  ? <span>Current: <a href={doc.doc_url} target="_blank" rel="noopener noreferrer" style={{color:'var(--brand)',wordBreak:'break-all'}}>{doc.doc_url}</a></span>
                  : <span style={{color:'var(--amber)'}}>Not uploaded</span>
                }
              </div>
              <div className="field" style={{marginBottom:10}}>
                <label>Google Drive or Dropbox link</label>
                <input
                  value={docUrls[doc.doc_key]||''}
                  onChange={e=>setDocUrls(u=>({...u,[doc.doc_key]:e.target.value}))}
                  placeholder="https://drive.google.com/file/d/..."
                />
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  Make sure sharing is set to <em>Anyone with the link can view</em>
                </div>
              </div>
              {docMsgs[doc.doc_key] && (
                <div className={`alert ${docMsgs[doc.doc_key].startsWith('✅')?'alert-green':'alert-red'}`} style={{marginBottom:10}}>
                  {docMsgs[doc.doc_key]}
                </div>
              )}
              <button onClick={()=>saveDoc(doc)} className="btn btn-brand" disabled={docBusy[doc.doc_key]}>
                {docBusy[doc.doc_key]?'Saving…':'💾 Save Link'}
              </button>
            </div>
          ))}
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
