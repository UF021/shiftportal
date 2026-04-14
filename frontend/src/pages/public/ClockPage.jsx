import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'
import AnalogTimePicker from '../../components/AnalogTimePicker'

const BASE = import.meta.env.VITE_API_URL || '/api'

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ClockPage() {
  const { slug, site_code } = useParams()
  const brand = useBrand()
  const c = brand?.colour || '#6abf3f'

  const [phase,          setPhase]         = useState('loading')
  const [siteInfo,       setSiteInfo]      = useState(null)
  const [gps,            setGps]           = useState(null)
  const [scheduledStart, setScheduledStart] = useState('09:00')
  const [result,         setResult]        = useState(null)
  const [openClockIn,    setOpenClockIn]   = useState(null)
  const [elapsed,        setElapsed]       = useState(0)
  const [loginEmail,     setLoginEmail]    = useState('')
  const [loginPass,      setLoginPass]     = useState('')
  const [loginBusy,      setLoginBusy]     = useState(false)
  const [loginErr,       setLoginErr]      = useState('')
  const [busy,           setBusy]          = useState(false)
  const [err,            setErr]           = useState('')

  // Fetch site info on mount
  useEffect(() => {
    fetch(`${BASE}/clock/${slug}/${site_code}`)
      .then(r => r.json())
      .then(data => {
        if (data.detail) { setPhase('error'); setErr(data.detail); return }
        setSiteInfo(data)
        setPhase(localStorage.getItem('sp_token') ? 'gps' : 'login')
      })
      .catch(() => { setPhase('error'); setErr('Could not load site information.') })
  }, [slug, site_code])

  // Elapsed timer while clocked in
  useEffect(() => {
    if (phase !== 'clock_out' || !openClockIn) return
    const update = () => setElapsed(Math.floor((Date.now() - new Date(openClockIn.timestamp)) / 60000))
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [phase, openClockIn])

  const checkClockStatus = useCallback(async (tok, lat, lng, info) => {
    // Client-side GPS check
    if (info?.site_lat != null && info?.site_lng != null) {
      const dist = haversine(lat, lng, info.site_lat, info.site_lng)
      if (dist > 50) { setPhase('too_far'); return }
    }
    // Check open clock-in from history
    try {
      const r = await fetch(`${BASE}/clock/my/history`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) { setPhase('login'); return }
      const events = await r.json()
      const lastIn = [...events].filter(e => e.event_type === 'clock_in').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
      if (lastIn) {
        const hasOut = events.some(e => e.event_type === 'clock_out' && new Date(e.timestamp) > new Date(lastIn.timestamp))
        if (!hasOut) { setOpenClockIn(lastIn); setPhase('clock_out'); return }
      }
      setPhase('clock_in')
    } catch { setPhase('clock_in') }
  }, [])

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) { setPhase('gps_denied'); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setGps({ lat, lng })
        const tok = localStorage.getItem('sp_token')
        await checkClockStatus(tok, lat, lng, siteInfo)
      },
      () => setPhase('gps_denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [siteInfo, checkClockStatus])

  async function handleLogin(e) {
    e.preventDefault()
    setLoginBusy(true); setLoginErr('')
    try {
      const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      })
      const data = await r.json()
      if (!r.ok) { setLoginErr(data.detail || 'Login failed'); return }
      localStorage.setItem('sp_token', data.access_token)
      localStorage.setItem('sp_user', JSON.stringify(data))
      setPhase('gps')
    } catch { setLoginErr('Login failed. Please try again.') }
    finally { setLoginBusy(false) }
  }

  async function handleClockIn() {
    setBusy(true); setErr('')
    try {
      const tok = localStorage.getItem('sp_token')
      const r = await fetch(`${BASE}/clock/${slug}/${site_code}/in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ scheduled_start: scheduledStart, gps_lat: gps?.lat, gps_lng: gps?.lng }),
      })
      const data = await r.json()
      if (!r.ok) { setErr(data.detail || 'Clock in failed'); return }
      setResult(data); setPhase('clocked_in')
    } catch { setErr('Clock in failed. Please try again.') }
    finally { setBusy(false) }
  }

  async function handleClockOut() {
    setBusy(true); setErr('')
    try {
      const tok = localStorage.getItem('sp_token')
      const r = await fetch(`${BASE}/clock/${slug}/${site_code}/out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ gps_lat: gps?.lat, gps_lng: gps?.lng }),
      })
      const data = await r.json()
      if (!r.ok) { setErr(data.detail || 'Clock out failed'); return }
      setResult(data); setPhase('clocked_out')
    } catch { setErr('Clock out failed. Please try again.') }
    finally { setBusy(false) }
  }

  // ── Layout wrapper ────────────────────────────────────────────────────────

  const Wrap = ({ children }) => (
    <div style={{ minHeight:'100vh', background:'#f5f7f5', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 16px' }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
          <OrgLogo dark={false} />
        </div>
        {siteInfo && (
          <p style={{ textAlign:'center', fontSize:13, color:'#6a8a6a', marginBottom:20 }}>{siteInfo.site_name}</p>
        )}
        {children}
      </div>
    </div>
  )

  // ── Phases ────────────────────────────────────────────────────────────────

  if (phase === 'loading') return (
    <Wrap><div style={{ textAlign:'center', color:'#6a8a6a', padding:40 }}>Loading…</div></Wrap>
  )

  if (phase === 'error') return (
    <Wrap>
      <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:12, padding:24, textAlign:'center', color:'#a02020', fontSize:14 }}>
        ⚠ {err}
      </div>
    </Wrap>
  )

  if (phase === 'login') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#1a2a1a', marginBottom:4 }}>Sign In to Clock</h2>
        <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:22 }}>Sign in with your staff account to continue.</p>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Email</label>
            <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required autoFocus
              style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:18 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Password</label>
            <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required
              style={{ width:'100%', padding:'11px 14px', borderRadius:9, border:'1.5px solid #d0e0d0', background:'#f8fbf8', color:'#1a2a1a', fontFamily:'DM Sans,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' }} />
          </div>
          {loginErr && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginBottom:14 }}>⚠ {loginErr}</div>}
          <button type="submit" disabled={loginBusy}
            style={{ width:'100%', padding:13, borderRadius:9, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:15, fontWeight:700, cursor:'pointer', opacity:loginBusy?.7:1 }}>
            {loginBusy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </Wrap>
  )

  if (phase === 'gps') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'36px 28px', boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>📍</div>
        <h3 style={{ fontSize:18, fontWeight:700, color:'#1a2a1a', marginBottom:8 }}>Location Required</h3>
        <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:26, lineHeight:1.6 }}>We need to confirm you are on site before clocking in.</p>
        <button onClick={requestGps}
          style={{ width:'100%', padding:13, borderRadius:9, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:15, fontWeight:700, cursor:'pointer' }}>
          Allow Location Access
        </button>
      </div>
    </Wrap>
  )

  if (phase === 'gps_denied') return (
    <div style={{ minHeight:'100vh', background:'#0f0606', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ textAlign:'center', color:'#fff', maxWidth:340 }}>
        <div style={{ fontSize:64, marginBottom:20 }}>🚫</div>
        <h2 style={{ fontSize:22, fontWeight:700, marginBottom:14 }}>Location Required</h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,.7)', lineHeight:1.75 }}>
          You must enable location services to clock in. Please enable GPS in your phone settings and try again.
        </p>
        <button onClick={() => setPhase('gps')}
          style={{ marginTop:28, padding:'12px 32px', borderRadius:9, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Try Again
        </button>
      </div>
    </div>
  )

  if (phase === 'too_far') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>📍</div>
        <h3 style={{ fontSize:18, fontWeight:700, color:'#a02020', marginBottom:10 }}>Not On Site</h3>
        <p style={{ fontSize:13, color:'#6a8a6a', lineHeight:1.65 }}>
          You are not at {siteInfo?.site_name}. Please ensure you are on site before clocking in.
        </p>
        <button onClick={requestGps}
          style={{ marginTop:22, width:'100%', padding:13, borderRadius:9, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Check Again
        </button>
      </div>
    </Wrap>
  )

  if (phase === 'clock_in') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'24px 20px', boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <h3 style={{ fontSize:18, fontWeight:700, color:'#1a2a1a', marginBottom:4, textAlign:'center' }}>Clock In</h3>
        <p style={{ fontSize:13, color:'#6a8a6a', marginBottom:20, textAlign:'center' }}>
          What time was your shift scheduled to start?
        </p>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
          <AnalogTimePicker value={scheduledStart} onChange={setScheduledStart} />
        </div>
        {err && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginBottom:12 }}>⚠ {err}</div>}
        <button onClick={handleClockIn} disabled={busy}
          style={{ width:'100%', padding:15, borderRadius:9, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:17, fontWeight:700, cursor:'pointer', opacity:busy?.7:1, letterSpacing:'.04em' }}>
          {busy ? 'Clocking in…' : '✓  CLOCK IN'}
        </button>
      </div>
    </Wrap>
  )

  if (phase === 'clock_out') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:4 }}>Clocked in at</div>
        <div style={{ fontSize:26, fontWeight:700, fontFamily:'DM Mono,monospace', color:'#1a2a1a', marginBottom:4 }}>
          {openClockIn ? new Date(openClockIn.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—'}
        </div>
        <div style={{ fontSize:13, color:'#6a8a6a', marginBottom:18 }}>{siteInfo?.site_name}</div>
        <div style={{ background:'#f0f8f0', border:'1px solid #c8e8c8', borderRadius:12, padding:'16px 24px', marginBottom:22 }}>
          <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Shift duration so far</div>
          <div style={{ fontSize:36, fontWeight:700, fontFamily:'DM Mono,monospace', color:c }}>{fmtDuration(elapsed)}</div>
        </div>
        {err && <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginBottom:12 }}>⚠ {err}</div>}
        <button onClick={handleClockOut} disabled={busy}
          style={{ width:'100%', padding:15, borderRadius:9, border:'none', background:'#c0392b', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:17, fontWeight:700, cursor:'pointer', opacity:busy?.7:1, letterSpacing:'.04em' }}>
          {busy ? 'Clocking out…' : '✕  CLOCK OUT'}
        </button>
      </div>
    </Wrap>
  )

  if (phase === 'clocked_in') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'36px 28px', boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>{result?.is_late ? '🟡' : '✅'}</div>
        <h3 style={{ fontSize:20, fontWeight:700, color:'#1a2a1a', marginBottom:10 }}>
          {result?.is_late ? 'Clocked In — Late' : 'Clocked In — On Time'}
        </h3>
        <div style={{ fontSize:38, fontWeight:700, fontFamily:'DM Mono,monospace', color:c, marginBottom:14 }}>
          {result?.timestamp ? new Date(result.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—'}
        </div>
        <p style={{ fontSize:14, color:'#4a6a4a', lineHeight:1.7 }}>
          {result?.is_late
            ? `You are ${result.minutes_late} minute${result.minutes_late !== 1 ? 's' : ''} late.`
            : 'On time. Have a great shift!'}
        </p>
      </div>
    </Wrap>
  )

  if (phase === 'clocked_out') return (
    <Wrap>
      <div style={{ background:'#fff', borderRadius:16, padding:'36px 28px', boxShadow:'0 4px 24px rgba(0,0,0,.08)', textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🏁</div>
        <h3 style={{ fontSize:20, fontWeight:700, color:'#1a2a1a', marginBottom:10 }}>Shift Complete</h3>
        <div style={{ fontSize:38, fontWeight:700, fontFamily:'DM Mono,monospace', color:c, marginBottom:14 }}>
          {result?.shift_minutes != null ? fmtDuration(result.shift_minutes) : '—'}
        </div>
        <p style={{ fontSize:14, color:'#4a6a4a' }}>Well done! See you next shift.</p>
      </div>
    </Wrap>
  )

  return null
}
