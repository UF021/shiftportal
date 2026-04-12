import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrg } from '../../api/client'

export default function SuperNewOrg() {
  const nav = useNavigate()
  const [form, setForm] = useState({
    name:'', slug:'', contact_email:'', contact_phone:'', address:'',
    hr_first_name:'', hr_last_name:'', hr_password:'',
  })
  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState('')
  const [result, setResult] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-generate slug from name
  function handleNameChange(v) {
    set('name', v)
    if (!form.slug || form.slug === slugify(form.name)) {
      set('slug', slugify(v))
    }
  }

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
  }

  async function submit() {
    setMsg('')
    if (!form.name || !form.slug || !form.contact_email || !form.hr_first_name || !form.hr_last_name || !form.hr_password)
      return setMsg('❌ Please fill in all required fields.')
    if (form.hr_password.length < 8)
      return setMsg('❌ HR password must be at least 8 characters.')

    setBusy(true)
    try {
      const r = await createOrg(form)
      setResult(r.data)
    } catch(ex) {
      setMsg('❌ ' + (ex.response?.data?.detail || 'Failed to create organisation'))
    } finally { setBusy(false) }
  }

  if (result) return (
    <div>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Organisation Created ✅</h2>
      </div>
      <div style={{ background:'rgba(106,191,63,.1)', border:'1px solid rgba(106,191,63,.3)', borderRadius:12, padding:24, marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, color:'#6abf3f', marginBottom:12 }}>🎉 {result.org_id ? form.name : 'New Organisation'} is live!</div>
        <div style={{ display:'grid', gap:12 }}>
          {[
            ['Portal URL',    `${window.location.origin}/login/${result.slug}`],
            ['Register URL',  `${window.location.origin}/register/${result.slug}`],
            ['HR Login',      result.hr_email],
            ['HR Password',   form.hr_password],
            ['Trial Period',  '30 days — unlimited seats'],
          ].map(([label, value]) => (
            <div key={label} style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em', width:110, flexShrink:0, paddingTop:2 }}>{label}</div>
              <div style={{ fontFamily:'DM Mono,monospace', fontSize:13, color:'#e8f0e0', wordBreak:'break-all' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:'rgba(240,160,48,.1)', border:'1px solid rgba(240,160,48,.3)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#f0a030', marginBottom:20 }}>
        ⚠️ Share the HR login credentials securely. The HR admin should change their password on first login.
      </div>
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={() => nav('/super/orgs')} style={{ padding:'10px 20px', borderRadius:8, border:'1px solid rgba(106,191,63,.3)', background:'transparent', color:'#6abf3f', fontFamily:'DM Sans,sans-serif', fontSize:14, cursor:'pointer' }}>
          View All Organisations
        </button>
        <button onClick={() => { setResult(null); setForm({ name:'', slug:'', contact_email:'', contact_phone:'', address:'', hr_first_name:'', hr_last_name:'', hr_password:'' }) }} style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'#6abf3f', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          + Create Another
        </button>
      </div>
    </div>
  )

  const F = ({ id, label, type='text', placeholder='', hint, required=false }) => (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
        {label}{required && <span style={{ color:'#6abf3f' }}> *</span>}
      </label>
      <input type={type} value={form[id]} onChange={e => set(id, id==='name'?e.target.value:id==='slug'?e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''):e.target.value)}
        placeholder={placeholder}
        style={{ width:'100%', padding:'11px 14px', borderRadius:8, border:'1px solid rgba(106,191,63,.2)', background:'#0f1923', color:'#e8f0e0', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none' }}/>
      {hint && <div style={{ fontSize:11, color:'#4a6a4a', marginTop:5 }}>{hint}</div>}
    </div>
  )

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>New Organisation</h2>
        <p style={{ fontSize:14, color:'#7a9a7a' }}>Onboard a new client. They get a 30-day free trial with unlimited seats.</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, maxWidth:900 }}>
        {/* Left col */}
        <div>
          <div style={{ background:'#0f1923', border:'1px solid rgba(106,191,63,.18)', borderRadius:12, padding:24, marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:18 }}>Organisation Details</div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
                Organisation Name <span style={{ color:'#6abf3f' }}>*</span>
              </label>
              <input value={form.name} onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g. Ikan Facilities Management Limited"
                style={{ width:'100%', padding:'11px 14px', borderRadius:8, border:'1px solid rgba(106,191,63,.2)', background:'#0f1923', color:'#e8f0e0', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', marginBottom:16 }}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
                URL Slug <span style={{ color:'#6abf3f' }}>*</span>
              </label>
              <div style={{ display:'flex', alignItems:'center', border:'1px solid rgba(106,191,63,.2)', borderRadius:8, overflow:'hidden', background:'#0f1923' }}>
                <span style={{ padding:'11px 10px 11px 14px', color:'#4a6a4a', fontSize:13, whiteSpace:'nowrap', borderRight:'1px solid rgba(106,191,63,.15)' }}>/login/</span>
                <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
                  placeholder="ikan-fm"
                  style={{ flex:1, padding:'11px 14px', border:'none', background:'transparent', color:'#6abf3f', fontFamily:'DM Mono,monospace', fontSize:14, outline:'none' }}/>
              </div>
              <div style={{ fontSize:11, color:'#4a6a4a', marginTop:5 }}>Staff will register at: /register/{form.slug||'…'}</div>
            </div>
            <F id="contact_email" label="Contact Email"  type="email" placeholder="hr@company.co.uk" required />
            <F id="contact_phone" label="Contact Phone"  placeholder="+44..." />
            <F id="address"       label="Business Address" />
          </div>
        </div>

        {/* Right col */}
        <div>
          <div style={{ background:'#0f1923', border:'1px solid rgba(106,191,63,.18)', borderRadius:12, padding:24, marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:18 }}>HR Admin Account</div>
            <p style={{ fontSize:13, color:'#7a9a7a', marginBottom:16 }}>
              This person will be the HR administrator for this organisation. They can add sites, activate staff, and view all reports.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <F id="hr_first_name" label="First Name" required />
              <F id="hr_last_name"  label="Last Name"  required />
            </div>
            <F id="hr_password" label="Temporary Password" type="password" hint="At least 8 characters. HR should change this on first login." required />
          </div>

          <div style={{ background:'rgba(106,191,63,.06)', border:'1px solid rgba(106,191,63,.2)', borderRadius:10, padding:16, marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#6abf3f', marginBottom:8 }}>📋 What happens next</div>
            <div style={{ fontSize:12, color:'#7a9a7a', lineHeight:1.75 }}>
              ✅ Organisation created instantly<br/>
              ✅ 30-day trial — unlimited seats<br/>
              ✅ HR admin account ready to sign in<br/>
              ✅ Registration link generated automatically<br/>
              ✅ Staff can register immediately
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ padding:'12px 16px', borderRadius:8, marginBottom:16, fontSize:13, background:'rgba(224,85,85,.1)', border:'1px solid rgba(224,85,85,.3)', color:'#e05555', maxWidth:900 }}>
          {msg}
        </div>
      )}

      <div style={{ display:'flex', gap:10 }}>
        <button onClick={() => nav('/super')} style={{ padding:'12px 22px', borderRadius:9, border:'1px solid rgba(106,191,63,.25)', background:'transparent', color:'#7a9a7a', fontFamily:'DM Sans,sans-serif', fontSize:14, cursor:'pointer' }}>
          Cancel
        </button>
        <button onClick={submit} disabled={busy} style={{ padding:'12px 28px', borderRadius:9, border:'none', background:'#6abf3f', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer', opacity:busy?.6:1 }}>
          {busy ? 'Creating…' : '🚀 Create Organisation'}
        </button>
      </div>
    </>
  )
}
