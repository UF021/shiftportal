// ApplyPage.jsx — public job application form
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'

const BASE = import.meta.env.VITE_API_URL || '/api'

const STEPS = [
  'Personal Details',
  'Employment Documents',
  'Work History',
  'Immigration & Right to Work',
  'Emergency Contact & Declarations',
]

const TITLES    = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Other']
const COMMUTES  = ['Own transport — car/motorbike', 'Public transport', 'Walk / cycle', 'Other']

const EMPTY = {
  title: 'Mr', first_name: '', last_name: '', date_of_birth: '',
  email: '', phone: '', address: '',
  ni_number: '', sia_licence: '', sia_expiry: '', commute_method: '',
  employment_history: '',
  nationality: '', right_to_work: 'true',
  nok_name: '', nok_phone: '',
  info_accurate: false, consent_references: false,
}

function Lbl({ children }) {
  return (
    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
      {children}
    </label>
  )
}

function FInput({ label, value, onChange, type='text', placeholder='', style={}, ...rest }) {
  return (
    <div style={{ marginBottom:16 }}>
      <Lbl>{label}</Lbl>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ width:'100%', padding:'12px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', ...style }}
        {...rest}
      />
    </div>
  )
}

function FSelect({ label, value, onChange, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <Lbl>{label}</Lbl>
      <select
        value={value}
        onChange={onChange}
        style={{ width:'100%', padding:'12px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' }}
      >
        {children}
      </select>
    </div>
  )
}

function FFile({ label, accept, onChange, filename, note }) {
  return (
    <div style={{ marginBottom:16 }}>
      <Lbl>{label}</Lbl>
      <div style={{ border:'1.5px dashed #b0d0b0', borderRadius:9, padding:'14px', background:'#f8fbf8', cursor:'pointer' }}
           onClick={() => document.getElementById(`file-${label.replace(/\W/g,'')}`).click()}>
        <input id={`file-${label.replace(/\W/g,'')}`} type="file" accept={accept} onChange={onChange} style={{ display:'none' }} />
        <div style={{ fontSize:13, color: filename ? '#2e7d32' : '#6a8a6a', textAlign:'center' }}>
          {filename ? `✅ ${filename}` : '📎 Click to upload file'}
        </div>
      </div>
      {note && <div style={{ fontSize:11, color:'#8a9a8a', marginTop:4 }}>{note}</div>}
    </div>
  )
}

export default function ApplyPage() {
  const { slug } = useParams()
  const brand    = useBrand()
  const c        = brand.colour || '#6abf3f'

  const [step,    setStep]    = useState(0)
  const [form,    setForm]    = useState(EMPTY)
  const [siaRaw,  setSiaRaw]  = useState('')
  const [siaBadge,     setSiaBadge]     = useState(null)
  const [immigDoc,     setImmigDoc]     = useState(null)
  const [err,     setErr]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [done,    setDone]    = useState(null)   // { application_id }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSia(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16)
    setSiaRaw(digits)
    set('sia_licence', digits.match(/.{1,4}/g)?.join('-') || digits)
  }

  function validate() {
    setErr('')
    if (step === 0) {
      const { title, first_name, last_name, date_of_birth, email, phone, address } = form
      if (!title || !first_name || !last_name || !date_of_birth || !email || !phone || !address)
        return setErr('Please fill in all fields.'), false
    }
    if (step === 1) {
      if (!form.ni_number || !form.sia_licence || !form.sia_expiry || !form.commute_method)
        return setErr('Please fill in all fields.'), false
      if (!/^[A-Z]{2}\d{6}[A-Z]$/i.test(form.ni_number.replace(/\s/g, '')))
        return setErr('NI Number must be in the format AB123456C.'), false
      if (siaRaw.length !== 16)
        return setErr('SIA Licence Number must be exactly 16 digits.'), false
      const exp = new Date(form.sia_expiry)
      const min = new Date(); min.setMonth(min.getMonth() + 3)
      if (exp < min)
        return setErr('SIA Licence must be valid for at least 3 months from today.'), false
      if (!siaBadge)
        return setErr('Please upload a picture of your SIA badge.'), false
    }
    if (step === 2) {
      if (!form.employment_history.trim())
        return setErr('Please provide your 5-year employment history.'), false
    }
    if (step === 3) {
      if (!form.nationality.trim())
        return setErr('Please enter your nationality.'), false
      if (!immigDoc)
        return setErr('Please upload proof of immigration status / right to work.'), false
    }
    if (step === 4) {
      if (!form.nok_name.trim() || !form.nok_phone.trim())
        return setErr('Please provide emergency contact details.'), false
      if (!form.info_accurate)
        return setErr('Please confirm that all information provided is accurate.'), false
      if (!form.consent_references)
        return setErr('Please confirm consent to contact previous employers for references.'), false
    }
    return true
  }

  async function next() {
    if (!validate()) return
    if (step < STEPS.length - 1) { setStep(s => s + 1); return }
    // Final submit
    setBusy(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)))
      if (siaBadge)  fd.append('sia_badge',       siaBadge)
      if (immigDoc)  fd.append('immigration_doc',  immigDoc)
      const res  = await fetch(`${BASE}/applications/${slug}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Submission failed')
      setDone(data)
    } catch (ex) {
      setErr(ex.message || 'An error occurred. Please try again.')
    } finally { setBusy(false) }
  }

  const brandEmail = brand.email || 'hr@ikanfm.co.uk'

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 16px', background:'#f5f7f5' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'48px 40px', width:540, maxWidth:'100%', boxShadow:'0 4px 32px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ marginBottom:20 }}><OrgLogo dark={false} /></div>
        <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
        <h2 style={{ fontSize:22, fontWeight:700, color:'#1a2a1a', marginBottom:10 }}>Application Received!</h2>
        <p style={{ fontSize:15, color:'#4a6a4a', lineHeight:1.7, marginBottom:20 }}>
          Thank you for applying. We will be in touch within <strong>5 working days</strong>.
        </p>
        <div style={{ background:'#f0f8f0', border:'1px solid #c0e0c0', borderRadius:10, padding:'14px 18px', marginBottom:20 }}>
          <div style={{ fontSize:12, color:'#6a8a6a', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Application Reference</div>
          <div style={{ fontSize:26, fontWeight:900, fontFamily:'DM Mono,monospace', color:c }}>#{done.application_id}</div>
        </div>
        <p style={{ fontSize:13, color:'#6a8a6a' }}>
          If you have any questions, contact <a href={`mailto:${brandEmail}`} style={{ color:c, fontWeight:600 }}>{brandEmail}</a>
        </p>
      </div>
    </div>
  )

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 16px', background:'#f5f7f5' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px', width:660, maxWidth:'100%', boxShadow:'0 4px 32px rgba(0,0,0,.08)' }}>

        <div style={{ marginBottom:22 }}><OrgLogo dark={false} /></div>

        <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:8 }}>
          Step {step + 1} of {STEPS.length} — <strong style={{ color:'#1a2a1a' }}>{STEPS[step]}</strong>
        </div>
        <div style={{ display:'flex', gap:4, marginBottom:24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex:1, height:4, borderRadius:2, background: i < step ? c : i === step ? c + 'aa' : '#e0ead0', transition:'background .3s' }} />
          ))}
        </div>

        {/* Step 1 — Personal Details */}
        {step === 0 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Personal Details</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Enter your details exactly as they appear on your ID documents.</p>
          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12 }}>
            <FSelect label="Title *" value={form.title} onChange={e => set('title', e.target.value)}>
              {TITLES.map(t => <option key={t}>{t}</option>)}
            </FSelect>
            <FInput label="First Name *" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name(s)" />
          </div>
          <FInput label="Last Name *" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name" />
          <FInput label="Date of Birth *" type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FInput label="Email Address *" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" />
            <FInput label="Preferred Telephone Number *" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+44..." />
          </div>
          <div style={{ marginBottom:16 }}>
            <Lbl>Current Address *</Lbl>
            <textarea
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="Full address including postcode"
              rows={3}
              style={{ width:'100%', padding:'12px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', resize:'vertical' }}
            />
          </div>
        </>}

        {/* Step 2 — Employment Documents */}
        {step === 1 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Employment Documents</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Your SIA licence and right-to-work documents.</p>
          <FInput label="National Insurance Number *" value={form.ni_number}
            onChange={e => set('ni_number', e.target.value.toUpperCase())}
            placeholder="e.g. AB123456C" style={{ textTransform:'uppercase' }} />
          <div style={{ marginBottom:16 }}>
            <Lbl>SIA Licence Number * (16 digits)</Lbl>
            <input
              type="text"
              value={form.sia_licence}
              onChange={handleSia}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              maxLength={19}
              style={{ width:'100%', padding:'12px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Mono,monospace', fontSize:14, outline:'none', boxSizing:'border-box', letterSpacing:'.05em' }}
            />
          </div>
          <FInput label="SIA Licence Expiry Date *" type="date" value={form.sia_expiry} onChange={e => set('sia_expiry', e.target.value)} />
          <FFile
            label="Upload Picture of SIA Badge *"
            accept="image/*"
            filename={siaBadge?.name}
            onChange={e => setSiaBadge(e.target.files[0] || null)}
            note="Accepted: JPG, PNG, WEBP"
          />
          <FSelect label="Method of Commuting to Work *" value={form.commute_method} onChange={e => set('commute_method', e.target.value)}>
            <option value="">— Select —</option>
            {COMMUTES.map(c => <option key={c}>{c}</option>)}
          </FSelect>
        </>}

        {/* Step 3 — Work History */}
        {step === 2 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>5-Year Employment History</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>List all employment, self-employment, education, or periods of unemployment in the last 5 years. Include employer name, role, dates, and reason for leaving.</p>
          <textarea
            value={form.employment_history}
            onChange={e => set('employment_history', e.target.value)}
            rows={12}
            placeholder={`Example:\nJan 2022 – Present: Security Officer, ABC Security Ltd, Birmingham. Redundancy.\nMar 2020 – Dec 2021: Door supervisor, XYZ Venues. Career change.\n...`}
            style={{ width:'100%', padding:'14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', resize:'vertical', lineHeight:1.7 }}
          />
        </>}

        {/* Step 4 — Immigration */}
        {step === 3 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Immigration &amp; Right to Work</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>We are required by law to verify your right to work in the UK.</p>
          <FInput label="Nationality *" value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. British" />
          <div style={{ marginBottom:16 }}>
            <Lbl>Do you have the right to paid employment in the UK? *</Lbl>
            {[['true', 'Yes'], ['false', 'No']].map(([val, lbl]) => (
              <label key={val} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border:`1.5px solid ${form.right_to_work === val ? c : '#d0e0d0'}`, borderRadius:9, marginBottom:8, cursor:'pointer', background: form.right_to_work === val ? c + '12' : '#f8fbf8' }}>
                <input type="radio" name="rtw" value={val} checked={form.right_to_work === val} onChange={() => set('right_to_work', val)} style={{ accentColor: c }} />
                <span style={{ fontSize:14, color:'#1a2a1a', fontWeight: form.right_to_work === val ? 700 : 400 }}>{lbl}</span>
              </label>
            ))}
          </div>
          <FFile
            label="Upload Proof of Immigration Status / Right to Work *"
            accept="image/*,application/pdf"
            filename={immigDoc?.name}
            onChange={e => setImmigDoc(e.target.files[0] || null)}
            note="Accepted: passport, BRP, share code screenshot, visa — JPG, PNG, PDF"
          />
        </>}

        {/* Step 5 — Emergency Contact & Declarations */}
        {step === 4 && <>
          <h3 style={{ fontSize:18, fontWeight:700, marginBottom:4, color:'#1a2a1a' }}>Emergency Contact &amp; Declarations</h3>
          <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20 }}>Please provide an emergency contact and confirm the declarations below.</p>
          <FInput label="Name of Next of Kin / Emergency Contact *" value={form.nok_name} onChange={e => set('nok_name', e.target.value)} placeholder="Full name" />
          <FInput label="Contact Telephone Number (Next of Kin) *" type="tel" value={form.nok_phone} onChange={e => set('nok_phone', e.target.value)} placeholder="+44..." />

          <div style={{ borderTop:'1px solid #e0ead0', paddingTop:18, marginTop:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1a2a1a', marginBottom:12 }}>Declarations</div>
            {[
              ['info_accurate',      'I confirm that all information provided is accurate and true to the best of my knowledge.'],
              ['consent_references', 'I consent to Ikan Facilities Management Ltd contacting previous employers for an employment reference.'],
            ].map(([key, label]) => (
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
                  border:`2px solid ${form[key] ? c : '#8aaa8a'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {form[key] && <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:13, lineHeight:1.6, color:'#1a2a1a' }}>{label}</span>
              </div>
            ))}
          </div>
        </>}

        {err && (
          <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginTop:12 }}>
            ⚠ {err}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', marginTop:24, paddingTop:18, borderTop:'1px solid #e0ead0' }}>
          {step > 0
            ? <button onClick={() => { setStep(s => s - 1); setErr('') }} style={{ padding:'10px 20px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#fff', color:'#6a8a6a', fontFamily:'DM Sans,sans-serif', fontSize:14, cursor:'pointer' }}>← Back</button>
            : <span />
          }
          <button onClick={next} disabled={busy} style={{ padding:'10px 24px', borderRadius:9, border:'none', background: busy ? '#aaa' : c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Submitting…' : step === STEPS.length - 1 ? 'Submit Application' : 'Next →'}
          </button>
        </div>

        <p style={{ textAlign:'center', marginTop:14, fontSize:13, color:'#6a8a6a' }}>
          Already have an account? <a href={`/login/${slug}`} style={{ color:c, fontWeight:600 }}>Sign in →</a>
        </p>
      </div>
    </div>
  )
}
