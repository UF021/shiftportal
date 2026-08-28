import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'

const G = '#6abf3f'

const toSlug = name =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

const inp = {
  width: '100%', padding: '10px 13px', borderRadius: 8,
  border: '1px solid #d1d5db', background: '#fff', color: '#111',
  fontFamily: 'DM Sans,sans-serif', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
}
const lbl = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' }

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
}

export default function SignupPage() {
  const [form, setForm] = useState({
    name: '', slug: '', contact_email: '',
    hr_first_name: '', hr_last_name: '',
    hr_password: '', hr_password2: '',
  })
  const [slugEdited, setSlugEdited] = useState(false)
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState('')
  const [result, setResult] = useState(null)

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'name' && !slugEdited) next.slug = toSlug(v)
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (form.hr_password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (form.hr_password !== form.hr_password2) { setErr('Passwords do not match.'); return }
    setBusy(true)
    try {
      const res = await api.post('/orgs/signup', {
        name: form.name, slug: form.slug, contact_email: form.contact_email,
        hr_first_name: form.hr_first_name, hr_last_name: form.hr_last_name,
        hr_password: form.hr_password,
      })
      setResult(res.data)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0fdf4', padding:20 }}>
        <div style={{ background:'#fff', borderRadius:16, padding:'44px 40px', width:460, maxWidth:'100%', boxShadow:'0 4px 32px rgba(0,0,0,.08)', textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#111', marginBottom:8 }}>You're all set!</h2>
          <p style={{ fontSize:14, color:'#6b7280', marginBottom:6 }}>
            Your 30-day free trial for <strong>{form.name}</strong> is ready.
          </p>
          <p style={{ fontSize:13, color:'#9ca3af', marginBottom:24 }}>
            Log in to your portal to get started.
          </p>
          <a href={result.login_url} style={{
            display:'block', padding:'12px 24px', borderRadius:8,
            background:G, color:'#fff', fontWeight:700, fontSize:14,
            textDecoration:'none', marginBottom:16,
          }}>
            Go to my portal →
          </a>
          <div style={{ padding:'12px 16px', borderRadius:8, background:'#f9fafb', border:'1px solid #e5e7eb', fontSize:12, color:'#6b7280' }}>
            Bookmark your login page:<br />
            <strong style={{ color:'#374151' }}>
              {window.location.origin}/login/{result.slug}
            </strong>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f7f5', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px 40px 32px', width:520, maxWidth:'100%', boxShadow:'0 4px 32px rgba(0,0,0,.08)' }}>

        {/* Branding */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:26, fontWeight:900, color:G, letterSpacing:'-0.5px', marginBottom:8 }}>ikan</div>
          <span style={{ display:'inline-block', padding:'4px 14px', borderRadius:20, background:'#f0fdf4', border:'1px solid #bbf7d0', fontSize:12, fontWeight:700, color:'#166534' }}>
            30-day free trial · No credit card required
          </span>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#111', margin:'10px 0 2px' }}>Start your free trial</h1>
          <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>Workforce management ready in under 2 minutes</p>
        </div>

        {err && (
          <div style={{ padding:'10px 14px', borderRadius:8, background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', fontSize:13, marginBottom:16 }}>
            {err}
          </div>
        )}

        <form onSubmit={submit}>
          <Field label="Company name">
            <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Security Ltd" required />
          </Field>

          <Field label={<>Portal address <span style={{ fontWeight:400, color:'#9ca3af' }}>(your unique login URL)</span></>}>
            <div style={{ display:'flex', alignItems:'center', border:'1px solid #d1d5db', borderRadius:8, overflow:'hidden' }}>
              <span style={{ padding:'10px 12px', background:'#f9fafb', borderRight:'1px solid #d1d5db', fontSize:12, color:'#6b7280', whiteSpace:'nowrap' }}>
                portal.ikanfm.co.uk/login/
              </span>
              <input
                style={{ ...inp, border:'none', borderRadius:0, flex:1, minWidth:0 }}
                value={form.slug}
                onChange={e => { setSlugEdited(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
                placeholder="acme-security"
                required
              />
            </div>
          </Field>

          <Field label="Work email">
            <input style={inp} type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="you@company.com" required />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:15 }}>
            <div>
              <label style={lbl}>First name</label>
              <input style={inp} value={form.hr_first_name} onChange={e => set('hr_first_name', e.target.value)} placeholder="Jane" required />
            </div>
            <div>
              <label style={lbl}>Last name</label>
              <input style={inp} value={form.hr_last_name} onChange={e => set('hr_last_name', e.target.value)} placeholder="Smith" required />
            </div>
          </div>

          <Field label="Password">
            <input style={inp} type="password" value={form.hr_password} onChange={e => set('hr_password', e.target.value)} placeholder="At least 8 characters" required />
          </Field>

          <Field label="Confirm password">
            <input style={inp} type="password" value={form.hr_password2} onChange={e => set('hr_password2', e.target.value)} placeholder="Repeat password" required />
          </Field>

          <button type="submit" disabled={busy} style={{
            width:'100%', padding:'12px', borderRadius:8, border:'none',
            background: busy ? '#9ca3af' : G, color:'#fff',
            fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700,
            cursor: busy ? 'not-allowed' : 'pointer', marginTop:4,
          }}>
            {busy ? 'Creating your portal…' : 'Start free trial →'}
          </button>
        </form>

        {/* Trial features */}
        <div style={{ marginTop:20, padding:'14px 16px', borderRadius:10, background:'#f9fafb', border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Included in your trial</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 0' }}>
            {[
              'Up to 10 active staff',
              'Time reporting',
              '1 site with QR clock-in',
              'Holidays & leave',
              'HR dashboard',
              'Staff messaging',
              'Incident log',
              'Document hub',
            ].map(f => (
              <div key={f} style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ color:G, fontWeight:700 }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign:'center', fontSize:13, color:'#9ca3af', marginTop:16, marginBottom:0 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color:G, fontWeight:600, textDecoration:'none' }}>Sign in</Link>
        </p>

        <p style={{ textAlign:'center', fontSize:11, color:'#d1d5db', marginTop:10, marginBottom:0 }}>
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
