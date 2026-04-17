import { useEffect, useState } from 'react'
import { getMyOrg, updateBranding, getMySites, createSite, deleteSite, getOrgDocs, uploadOrgDoc } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const APP_URL = import.meta.env.VITE_APP_URL || 'https://portal.ikanfm.co.uk'

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
  const [docs,     setDocs]     = useState([])
  const [docFiles, setDocFiles]  = useState({})  // { doc_key: File }
  const [docMsgs,  setDocMsgs]  = useState({})   // { doc_key: message }
  const [docBusy,  setDocBusy]  = useState({})   // { doc_key: bool }
  const [newSite,  setNSite]  = useState({ code:'', name:'', group:'', address:'' })
  const [saving,   setSaving] = useState(false)
  const [msg,      setMsg]    = useState('')
  const [tab,      setTab]    = useState('branding')
  const [gpsModal, setGpsModal] = useState(null)   // site object or null

  function load() {
    getMyOrg().then(r => { setOrg(r.data); setBrand({ brand_name:r.data.brand_name||'', brand_colour:r.data.brand_colour||'#6abf3f', brand_email:r.data.brand_email||'', contract_employer_name:r.data.contract_employer_name||'', contract_employer_address:r.data.contract_employer_address||'', contract_employer_email:r.data.contract_employer_email||'', contract_employer_phone:r.data.contract_employer_phone||'', contract_signatory_name:r.data.contract_signatory_name||'', contract_signatory_role:r.data.contract_signatory_role||'', contract_min_pay:r.data.contract_min_pay||'', contract_max_pay:r.data.contract_max_pay||'' }) }).catch(()=>{})
    getMySites().then(r=>setSites(r.data||[])).catch(()=>{})
    getOrgDocs().then(r => setDocs(r.data || [])).catch(()=>{})
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

  async function uploadDoc(doc) {
    const file = docFiles[doc.doc_key]
    if (!file) return
    setDocBusy(b => ({ ...b, [doc.doc_key]: true }))
    setDocMsgs(m => ({ ...m, [doc.doc_key]: '' }))
    try {
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload  = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      await uploadOrgDoc(doc.doc_key, b64)
      setDocMsgs(m => ({ ...m, [doc.doc_key]: '✅ PDF uploaded — all staff can now view this document' }))
      setDocFiles(f => ({ ...f, [doc.doc_key]: null }))
      load()
    } catch (ex) {
      setDocMsgs(m => ({ ...m, [doc.doc_key]: '❌ ' + (ex.response?.data?.detail || 'Upload failed') }))
    } finally {
      setDocBusy(b => ({ ...b, [doc.doc_key]: false }))
    }
  }

  const regLink = org ? `${window.location.origin}/register/${org.slug}` : '…'

  const GPS_LINK = `${APP_URL}/capture-gps`

  return (
    <>
      {/* GPS Capture modal */}
      {gpsModal && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16,
        }} onClick={()=>setGpsModal(null)}>
          <div style={{
            background:'var(--navy-mid)',border:'1px solid var(--border)',borderRadius:16,
            padding:'28px 28px',width:'100%',maxWidth:440,
          }} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>📍 GPS Capture Link</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>
              Send this link to a staff member standing at <strong>{gpsModal.name}</strong>. They enter their name and site, then submit their GPS location.
            </div>

            {/* URL */}
            <div style={{
              background:'var(--navy-light)',border:'1px solid var(--border)',
              borderRadius:8,padding:'12px 14px',fontFamily:'DM Mono,monospace',
              fontSize:12,wordBreak:'break-all',color:'var(--green)',marginBottom:14,
            }}>
              {GPS_LINK}
            </div>

            {/* QR */}
            <div style={{display:'flex',justifyContent:'center',marginBottom:18}}>
              <div style={{background:'#fff',borderRadius:10,padding:10}}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(GPS_LINK)}`}
                  alt="GPS capture QR"
                  width={180} height={180}
                />
              </div>
            </div>

            {/* Buttons */}
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <button
                onClick={()=>{ navigator.clipboard.writeText(GPS_LINK); setMsg('✅ GPS capture link copied!') }}
                className="btn btn-brand" style={{flex:1,fontSize:13}}
              >
                📋 Copy Link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent('Please open this link, stand at the main entrance of ' + gpsModal.name + ', and submit your GPS location: ' + GPS_LINK)}`}
                target="_blank" rel="noreferrer"
                style={{
                  flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                  gap:6,padding:'10px 16px',borderRadius:8,border:'1px solid #25D366',
                  color:'#25D366',fontSize:13,fontFamily:'DM Sans,sans-serif',textDecoration:'none',
                  background:'transparent',cursor:'pointer',fontWeight:600,
                }}
              >
                📱 WhatsApp
              </a>
              <button onClick={()=>setGpsModal(null)} className="btn btn-outline" style={{flex:1,fontSize:13}}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <td style={{display:'flex',gap:6}}>
                        <button onClick={()=>setGpsModal(s)} className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}}>📍 GPS</button>
                        <button onClick={()=>removeSite(s.id)} className="btn btn-danger" style={{fontSize:11,padding:'4px 10px'}}>Remove</button>
                      </td>
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
            Upload PDF files to make them available to all staff in their Employment Particulars section. Files are stored securely in the database and served directly — no external sharing required.
          </div>
          {docs.map(doc => (
            <div key={doc.doc_key} className="card" style={{marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>{doc.doc_name}</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14}}>
                {doc.has_file
                  ? <span style={{color:'var(--brand)'}}>✅ PDF uploaded — visible to all staff</span>
                  : <span style={{color:'var(--amber)'}}>No PDF uploaded yet</span>
                }
              </div>

              {/* File picker */}
              <div className="field" style={{marginBottom:10}}>
                <label>Select PDF to upload</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={e => setDocFiles(f => ({ ...f, [doc.doc_key]: e.target.files[0] || null }))}
                  style={{padding:'8px 0', color:'var(--text)'}}
                />
                {docFiles[doc.doc_key] && (
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                    Selected: {docFiles[doc.doc_key].name} ({(docFiles[doc.doc_key].size/1024).toFixed(0)} KB)
                  </div>
                )}
              </div>

              {docMsgs[doc.doc_key] && (
                <div className={`alert ${docMsgs[doc.doc_key].startsWith('✅')?'alert-green':'alert-red'}`} style={{marginBottom:10}}>
                  {docMsgs[doc.doc_key]}
                </div>
              )}
              <button
                onClick={() => uploadDoc(doc)}
                className="btn btn-brand"
                disabled={docBusy[doc.doc_key] || !docFiles[doc.doc_key]}
              >
                {docBusy[doc.doc_key] ? 'Uploading…' : '📤 Upload PDF'}
              </button>
            </div>
          ))}
        </>
      )}

      {/* Registration Links tab */}
      {tab==='links' && (
        <>
          {/* Staff registration link */}
          <div className="card" style={{marginBottom:18}}>
            <div className="card-title">🔗 Staff Registration Link</div>
            <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>
              Send this link to new staff members so they can register for the portal. Once they complete the registration, you will see them in the <strong>Registrations</strong> tab for approval.
            </p>
            <div style={{background:'var(--navy-light)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px',fontFamily:'DM Mono,monospace',fontSize:13,wordBreak:'break-all',color:'var(--green)'}}>
              {regLink}
            </div>
            <div style={{display:'flex',gap:10,marginTop:14,flexWrap:'wrap',alignItems:'center'}}>
              <button onClick={()=>{ navigator.clipboard.writeText(regLink); setMsg('✅ Registration link copied!') }} className="btn btn-brand">
                📋 Copy Link
              </button>
              <div style={{background:'#fff',borderRadius:8,padding:10,display:'inline-block',border:'1px solid var(--border)'}}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(regLink)}`} alt="Registration QR" style={{display:'block',width:130,height:130}}/>
              </div>
            </div>
            {msg && <div className="alert alert-green" style={{marginTop:12}}>{msg}</div>}
          </div>

          {/* Site clock-in QR codes */}
          <div className="card-title" style={{marginBottom:14}}>📱 Site Clock-In QR Codes</div>
          <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:18}}>
            Print and display these QR codes at each site. Staff scan them to clock in/out using their Staff ID — no app required.
          </p>
          {sites.length === 0 ? (
            <div style={{fontSize:13,color:'var(--text-muted)'}}>No sites yet. Add sites in the Sites tab first.</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
              {sites.map(site => {
                const clockUrl = `${window.location.origin}/clock/${org?.slug || 'ikan-fm'}/${site.code}`
                const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(clockUrl)}`
                return (
                  <div key={site.id} className="card" style={{padding:20,textAlign:'center'}}>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:4,color:'var(--text)'}}>{site.name}</div>
                    {site.group && <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12}}>{site.group}</div>}
                    <div style={{background:'#fff',borderRadius:10,padding:14,display:'inline-block',border:'1px solid var(--border)',marginBottom:12}}>
                      <img src={qrUrl} alt={`QR for ${site.name}`} style={{display:'block',width:180,height:180}}/>
                    </div>
                    <div style={{fontSize:11,fontFamily:'DM Mono,monospace',color:'var(--text-muted)',wordBreak:'break-all',marginBottom:12}}>
                      {clockUrl}
                    </div>
                    <button
                      onClick={()=>{ navigator.clipboard.writeText(clockUrl); setMsg(`✅ Link copied for ${site.name}`) }}
                      className="btn btn-outline"
                      style={{fontSize:12,padding:'6px 14px',width:'100%'}}
                    >
                      📋 Copy Link
                    </button>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:8}}>Right-click QR → Save image to download and print</div>
                  </div>
                )
              })}
            </div>
          )}
          {msg && <div className="alert alert-green" style={{marginTop:16}}>{msg}</div>}
        </>
      )}
    </>
  )
}
