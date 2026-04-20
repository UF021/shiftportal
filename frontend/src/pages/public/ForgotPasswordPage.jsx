import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBrand } from '../../api/BrandContext'
import { verifyIdentity, resetPassword } from '../../api/client'
import OrgLogo from '../../components/OrgLogo'

export default function ForgotPasswordPage() {
  const { slug }      = useParams()
  const effectiveSlug = slug || 'ikan-fm'
  const brand         = useBrand()
  const nav           = useNavigate()
  const c             = brand.colour || '#6abf3f'

  // step: 'verify' | 'reset' | 'done'
  const [step, setStep]       = useState('verify')
  const [email, setEmail]     = useState('')
  const [dob,   setDob]       = useState('')
  const [token, setToken]     = useState('')
  const [pass,  setPass]      = useState('')
  const [pass2, setPass2]     = useState('')
  const [showP, setShowP]     = useState(false)
  const [showP2, setShowP2]   = useState(false)
  const [busy, setBusy]       = useState(false)
  const [err,  setErr]        = useState('')

  async function handleVerify(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await verifyIdentity({ email, date_of_birth: dob, org_slug: effectiveSlug })
      setToken(res.data.reset_token)
      setStep('reset')
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Verification failed. Please check your details.')
    } finally { setBusy(false) }
  }

  async function handleReset(e) {
    e.preventDefault()
    setErr('')
    if (pass !== pass2) return setErr('Passwords do not match.')
    if (pass.length < 8) return setErr('Password must be at least 8 characters.')
    setBusy(true)
    try {
      await resetPassword({ token, new_password: pass })
      setStep('done')
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to reset password.')
    } finally { setBusy(false) }
  }

  const inputRow = (icon, child) => (
    <div style={{
      display: 'flex', alignItems: 'center', border: '1px solid #d0ddd0',
      borderRadius: 8, overflow: 'hidden', background: '#f8fbf8', marginBottom: 14,
    }}>
      <div style={{ padding: '11px 14px', color: '#8aaa8a', borderRight: '1px solid #d0ddd0' }}>{icon}</div>
      {child}
    </div>
  )

  const inputStyle = {
    flex: 1, padding: '11px 14px', border: 'none', background: 'transparent',
    fontFamily: 'DM Sans,sans-serif', fontSize: 14, color: '#1a2a1a', outline: 'none',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f7f5', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '44px 40px', width: 420,
        maxWidth: '100%', boxShadow: '0 4px 32px rgba(0,0,0,.08)', border: '1px solid #e8eee8',
      }}>
        <div style={{ marginBottom: 28 }}>
          <div onClick={() => nav(`/login/${effectiveSlug}`)} style={{ cursor: 'pointer', display: 'inline-block' }}>
            <OrgLogo dark={false} />
          </div>
        </div>

        {/* ── Step 1: Verify identity ── */}
        {step === 'verify' && <>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a2a1a', marginBottom: 4 }}>Reset Password</h2>
          <p style={{ fontSize: 13, color: '#6a8a6a', marginBottom: 24 }}>
            Enter your registered email and date of birth to verify your identity.
          </p>
          <form onSubmit={handleVerify}>
            {inputRow('👤',
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email address" required autoFocus style={inputStyle} />
            )}
            <div style={{ marginBottom: 6, fontSize: 12, color: '#6a8a6a' }}>Date of Birth</div>
            {inputRow('🎂',
              <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                required style={{ ...inputStyle, fontFamily: 'DM Mono,monospace' }} />
            )}
            {err && (
              <div style={{ background: '#fde8e8', border: '1px solid #e08080', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#a02020', marginBottom: 16 }}>
                ⚠ {err}
              </div>
            )}
            <button type="submit" disabled={busy} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: c, color: '#fff', fontFamily: 'DM Sans,sans-serif',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16,
            }}>
              {busy ? 'Verifying…' : 'Verify Identity'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <span
                onClick={() => nav(`/login/${effectiveSlug}`)}
                style={{ fontSize: 13, color: c, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Back to Sign In
              </span>
            </div>
          </form>
        </>}

        {/* ── Step 2: Set new password ── */}
        {step === 'reset' && <>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a2a1a', marginBottom: 4 }}>Set New Password</h2>
          <p style={{ fontSize: 13, color: '#6a8a6a', marginBottom: 24 }}>
            Choose a new password. It must be at least 8 characters.
          </p>
          <form onSubmit={handleReset}>
            {inputRow('🔑',
              <>
                <input type={showP ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
                  placeholder="New password" required autoFocus style={inputStyle} />
                <button type="button" onClick={() => setShowP(v => !v)}
                  style={{ padding: '0 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#8aaa8a', fontSize: 16 }}>
                  {showP ? '🙈' : '👁️'}
                </button>
              </>
            )}
            {inputRow('🔑',
              <>
                <input type={showP2 ? 'text' : 'password'} value={pass2} onChange={e => setPass2(e.target.value)}
                  placeholder="Confirm new password" required style={inputStyle} />
                <button type="button" onClick={() => setShowP2(v => !v)}
                  style={{ padding: '0 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#8aaa8a', fontSize: 16 }}>
                  {showP2 ? '🙈' : '👁️'}
                </button>
              </>
            )}
            {pass && pass2 && pass !== pass2 && (
              <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 10, marginTop: -8 }}>Passwords do not match</div>
            )}
            {err && (
              <div style={{ background: '#fde8e8', border: '1px solid #e08080', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#a02020', marginBottom: 16 }}>
                ⚠ {err}
              </div>
            )}
            <button type="submit" disabled={busy || !pass || !pass2} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: c, color: '#fff', fontFamily: 'DM Sans,sans-serif',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              {busy ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        </>}

        {/* ── Step 3: Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a2a1a', marginBottom: 8 }}>Password Updated</h2>
            <p style={{ fontSize: 14, color: '#6a8a6a', marginBottom: 28 }}>
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button onClick={() => nav(`/login/${effectiveSlug}`)} style={{
              padding: '12px 32px', borderRadius: 10, border: 'none',
              background: c, color: '#fff', fontFamily: 'DM Sans,sans-serif',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              Sign In →
            </button>
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px', textAlign: 'center', fontSize: 12, color: '#6a8a6a', background: '#fff', borderTop: '1px solid #e8eee8' }}>
        Copyright {new Date().getFullYear()} {brand.name || 'Staff Portal'}. All rights reserved.
      </div>
    </div>
  )
}
