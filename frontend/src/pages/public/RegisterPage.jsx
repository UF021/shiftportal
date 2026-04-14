import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { register } from '../../api/client'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'

const STEPS = ['Personal Details','Employment Docs','Emergency Contact','Declarations','Set Password']
const DECLS = [
  ['decl_policy',       'I have read and understood the Working Procedures / Company Policy document.'],
  ['decl_portal',       'I know how to accurately report my hours using the online staff portal.'],
  ['decl_line_manager', 'I know who my line manager is and have their contact details.'],
  ['decl_pay_schedule', 'I have the monthly pay schedule for the current year.'],
  ['decl_trained',      'I have been adequately trained to do my job.'],
  ['decl_accurate',     'I confirm that all information provided is accurate and true to the best of my knowledge.'],
  ['decl_contact',      'I consent to my employer contacting me via my provided contact details on matters relating to my employment.'],
]

const EMPTY = {
  title:'Mr', first_name:'', last_name:'', date_of_birth:'', nationality:'',
  email:'', phone:'', address_line1:'', address_line2:'', city:'', postcode:'',
  ni_number:'', right_to_work:true, sia_licence:'', sia_expiry:'',
  nok_name:'', nok_phone:'', nok_relation:'',
  decl_policy:false, decl_portal:false, decl_line_manager:false,
  decl_pay_schedule:false, decl_trained:false, decl_accurate:false, decl_contact:false,
  password:'', confirm_password:'',
}

function Field({ id, label, type='text', placeholder='', style={}, form, set, ...rest }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</label>
      <input type={type} value={form[id]} onChange={e => set(id, e.target.value)} placeholder={placeholder}
        style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', ...style }}
        {...rest} />
    </div>
  )
}

function Row2({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>{children}</div>
}

export default function RegisterPage() {
  const brand    = useBrand()
  const { slug } = useParams()
  const nav      = useNavigate()
  const [step, setStep]     = useState(0)
  const [form, setForm]     = useState(EMPTY)
  const [siaRaw, setSiaRaw] = useState('')
  const [err, setErr]       = useState('')
  const [busy, setBusy]     = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const c = brand.colour || '#6abf3f'

  function handleSiaInput(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16)
    setSiaRaw(digits)
    const formatted = digits.match(/.{1,4}/g)?.join('-') || digits
    set('sia_licence', formatted)
  }

  function validate() {
    setErr('')
    if (step === 0) {
      if (!form.first_name || !form.last_name || !form.email || !form.phone || !form.address_line1 || !form.city || !form.postcode)
        return setErr('Please fill in all required fields.'), false
    }
    if (step === 1) {
      if (!form.ni_number || !form.sia_licence || !form.sia_expiry)
        return setErr('Please fill in NI number, SIA licence number and expiry date.'), false
      if (!/^[A-Z]{2}\d{6}[A-Z]$/i.test(form.ni_number.replace(/\s/g, '')))
        return setErr('NI Number must be in the format AB123456C (2 letters, 6 digits, 1 letter).'), false
      if (siaRaw.length !== 16)
        return setErr('SIA Licence Number must be exactly 16 digits.'), false
      const expiry = new Date(form.sia_expiry)
      const minExpiry = new Date()
      minExpiry.setMonth(minExpiry.getMonth() + 3)
      if (expiry < minExpiry)
        return setErr('SIA Licence must be valid for at least 3 months from today.'), false
    }
    if (step === 2 && (!form.nok_name || !form.nok_phone))
      return setErr('Please provide next of kin name and phone number.'), false
    if (step === 3 && !DECLS.every(([k]) => form[k]))
      return setErr('Please confirm all declarations before proceeding.'), false
    if (step === 4) {
      if (form.password.length < 8) return setErr('Password must be at least 8 characters.'), false
      if (form.password !== form.confirm_password) return setErr('Passwords do not match.'), false
    }
    return true
  }

  async function next() {
    if (!validate()) return
    if (step < 4) { setStep(s => s + 1); return }
    setBusy(true)
    try {
      const payload = { ...form, org_slug: slug }
      delete payload.confirm_password
      if (!payload.date_of_birth) delete payload.date_of_birth
      if (!payload.sia_expiry)    delete payload.sia_expiry
      await register(payload)
      nav('/pending', { state: { email: form.email, org: brand.name } })
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Registration failed. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 16px', background:'#f5f7f5' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px', width:640, maxWidth:'100%', boxShadow:'0 4px 32px rgba(0,0,0,.08)' }}>

        <div style={{ marginBottom: 22 }}><OrgLogo dark={false} /></div>

        {/* Progress */}
        <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:8 }}>
          Step {step+1} of {STEPS.length} — <strong style={{ color:'#1a2a1a' }}>{STEPS[step]}</strong>
        </div>
        <div style={{ display:'flex', gap:4, marginBottom:24 }}>
          {STEPS.map((_,i) => (
            <div key={i} style={{ flex:1, height:4, borderRadius:2, background: i<step ? c : i===step ? c+'aa' : '#e0ead0', transition:'background .3s' }} />
          ))}
        </div>

        {/* Step 1 */}
        {step === 0 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Personal Details</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Enter your details exactly as they appear on your ID documents.</p>
          <Row2>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Title</label>
              <select value={form.title} onChange={e=>set('title',e.target.value)} style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none' }}>
                {['Mr','Mrs','Ms','Miss','Dr'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <Field id="first_name" label="First Name *" placeholder="First name(s)" form={form} set={set} />
          </Row2>
          <Field id="last_name" label="Last Name *" placeholder="Last name" form={form} set={set} />
          <Row2>
            <Field id="date_of_birth" label="Date of Birth" type="date" form={form} set={set} />
            <Field id="nationality"   label="Nationality"  placeholder="e.g. British" form={form} set={set} />
          </Row2>
          <Row2>
            <Field id="email" label="Email Address *" type="email" form={form} set={set} />
            <Field id="phone" label="Phone Number *"  type="tel" placeholder="+44..." form={form} set={set} />
          </Row2>
          <Field id="address_line1" label="Address Line 1 *" placeholder="House number and street" form={form} set={set} />
          <Field id="address_line2" label="Address Line 2"   placeholder="Area / district (optional)" form={form} set={set} />
          <Row2>
            <Field id="city"     label="City *" form={form} set={set} />
            <Field id="postcode" label="Postcode *" placeholder="e.g. B9 4NW" style={{ textTransform:'uppercase' }} form={form} set={set} />
          </Row2>
        </>}

        {/* Step 2 */}
        {step === 1 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Employment Documents</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Your SIA licence details, NI number and right to work status.</p>
          <Row2>
            <Field id="ni_number" label="NI Number *" placeholder="e.g. AB123456C" style={{ textTransform:'uppercase' }} form={form} set={set} />
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Right to Work? *</label>
              <select value={form.right_to_work} onChange={e=>set('right_to_work',e.target.value==='true')} style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none' }}>
                <option value="true">Yes</option><option value="false">No</option>
              </select>
            </div>
          </Row2>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>SIA Licence Number *</label>
            <input
              type="text"
              value={form.sia_licence}
              onChange={handleSiaInput}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              maxLength={19}
              style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', letterSpacing:'0.05em' }}
            />
          </div>
          <Field id="sia_expiry" label="SIA Licence Expiry Date *" type="date" form={form} set={set} />
          <div style={{ background:'#e8f5fd', border:'1px solid #b8dcf0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1a4a6a', marginTop:4 }}>
            ℹ️ Please have your SIA badge ready for upload. Your SIA badge photo will be required at this stage.
          </div>
        </>}

        {/* Step 3 */}
        {step === 2 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Emergency Contact</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Your next of kin or emergency contact person.</p>
          <Field id="nok_name"     label="Full Name *" form={form} set={set} />
          <Field id="nok_relation" label="Relationship to You" placeholder="e.g. Spouse, Parent, Sibling" form={form} set={set} />
          <Field id="nok_phone"    label="Phone Number *" type="tel" placeholder="+44..." form={form} set={set} />
        </>}

        {/* Step 4 — Declarations */}
        {step === 3 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Declarations</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Tap anywhere on a row to confirm each statement.</p>
          {DECLS.map(([key, label]) => (
            <div key={key} onClick={() => set(key, !form[key])} style={{
              display:'flex', alignItems:'flex-start', gap:12, padding:12,
              border:`1.5px solid ${form[key] ? c : '#d0e0d0'}`,
              borderRadius:10, marginBottom:10, cursor:'pointer',
              background: form[key] ? c + '18' : 'transparent',
              transition:'all .15s', userSelect:'none',
            }}>
              <div style={{
                width:20, height:20, borderRadius:4, flexShrink:0, marginTop:1,
                background: form[key] ? c : 'transparent',
                border: `2px solid ${form[key] ? c : '#8aaa8a'}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all .15s',
              }}>
                {form[key] && <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, lineHeight:1.55, color:'#1a2a1a' }}>{label}</span>
            </div>
          ))}
        </>}

        {/* Step 5 */}
        {step === 4 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Create Your Password</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>You will sign in with your email address and this password.</p>
          <Field id="password"         label="Password * (minimum 8 characters)" type="password" form={form} set={set} />
          <Field id="confirm_password" label="Confirm Password *"                  type="password" form={form} set={set} />
          <div style={{ background:'#e8f5fd', border:'1px solid #b8dcf0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1a4a6a', marginTop:4 }}>
            ℹ️ After registering, your account will be reviewed by HR. You will be notified once activated.
          </div>
        </>}

        {err && (
          <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginTop:12 }}>⚠ {err}</div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', marginTop:24, paddingTop:18, borderTop:'1px solid #e0ead0' }}>
          {step > 0
            ? <button onClick={() => setStep(s => s-1)} style={{ padding:'10px 20px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#fff', color:'#6a8a6a', fontFamily:'DM Sans,sans-serif', fontSize:14, cursor:'pointer' }}>← Back</button>
            : <span />
          }
          <button onClick={next} disabled={busy} style={{ padding:'10px 24px', borderRadius:9, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer', opacity:busy?.6:1 }}>
            {busy ? 'Submitting…' : step === 4 ? 'Submit Registration' : 'Next →'}
          </button>
        </div>

        <p style={{ textAlign:'center', marginTop:14, fontSize:13, color:'#6a8a6a' }}>
          Already registered? <Link to={slug ? `/login/${slug}` : '/login'} style={{ color:c, fontWeight:600 }}>Sign in →</Link>
        </p>
      </div>
    </div>
  )
}
