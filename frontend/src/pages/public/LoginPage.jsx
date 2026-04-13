import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'

export default function LoginPage() {
  const { signIn }  = useAuth()
  const brand       = useBrand()
  const nav         = useNavigate()
  const { slug }    = useParams()

  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [showPass, setShowPass] = useState(false)
  const [err, setErr]         = useState('')
  const [busy, setBusy]       = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const user = await signIn(email, pass)
      nav(user.role === 'superadmin' ? '/super' : user.role === 'hr' ? '/hr' : '/staff', { replace: true })
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Login failed. Please check your email and password.')
    } finally { setBusy(false) }
  }

  const c = brand.colour || '#6abf3f'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f7f5', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '44px 40px', width: 420,
        maxWidth: '100%', boxShadow: '0 4px 32px rgba(0,0,0,.08)',
        border: '1px solid #e8eee8',
      }}>

        {/* Brand logo */}
        <div style={{ marginBottom: 28 }}>
          <OrgLogo dark={false} />
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a2a1a', marginBottom: 4 }}>Sign In</h2>
        <p style={{ fontSize: 13, color: '#6a8a6a', marginBottom: 24 }}>
          {brand.name ? `Access your ${brand.name} staff dashboard` : 'Access your staff dashboard'}
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', border: '1px solid #d0ddd0',
              borderRadius: 8, overflow: 'hidden', background: '#f8fbf8',
            }}>
              <div style={{ padding: '11px 14px', color: '#8aaa8a', borderRight: '1px solid #d0ddd0' }}>👤</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email Id" required autoFocus
                style={{ flex: 1, padding: '11px 14px', border: 'none', background: 'transparent', fontFamily: 'DM Sans,sans-serif', fontSize: 14, color: '#1a2a1a', outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', border: '1px solid #d0ddd0',
              borderRadius: 8, overflow: 'hidden', background: '#f8fbf8',
            }}>
              <div style={{ padding: '11px 14px', color: '#8aaa8a', borderRight: '1px solid #d0ddd0' }}>🔑</div>
              <input type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Password" required
                style={{ flex: 1, padding: '11px 14px', border: 'none', background: 'transparent', fontFamily: 'DM Sans,sans-serif', fontSize: 14, color: '#1a2a1a', outline: 'none' }} />
              <button type="button" onClick={() => setShowPass(v => !v)}
                style={{ padding: '0 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#8aaa8a', fontSize: 16, lineHeight: 1 }}
                aria-label={showPass ? 'Hide password' : 'Show password'}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4a6a4a', cursor: 'pointer' }}>
              <input type="checkbox" style={{ accentColor: c }} /> Remember me
            </label>
            <a href="#" style={{ fontSize: 13, color: c, textDecoration: 'none' }}>Forgot Password?</a>
          </div>

          {err && (
            <div style={{ background: '#fde8e8', border: '1px solid #e08080', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#a02020', marginBottom: 16 }}>
              ⚠ {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link to={slug ? `/register/${slug}` : '/register'} style={{ fontSize: 13, color: c, fontWeight: 600 }}>
              CREATE NEW ACCOUNT to register.
            </Link>
            <button type="submit" disabled={busy} style={{
              padding: '10px 24px', borderRadius: 20, border: 'none',
              background: c, color: '#fff', fontFamily: 'DM Sans,sans-serif',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              {busy ? '…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px', textAlign: 'center', fontSize: 12, color: '#6a8a6a', background: '#fff', borderTop: '1px solid #e8eee8' }}>
        Copyright {new Date().getFullYear()} {brand.name || 'Staff Portal'}. All rights reserved.
      </div>
    </div>
  )
}
