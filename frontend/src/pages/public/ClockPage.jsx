import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const BASE  = import.meta.env.VITE_API_URL || '/api'
const GREEN = '#6abf3f'
const DARK  = '#1a3a1a'

// ── Utilities ─────────────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6_371_000
  const r = d => d * Math.PI / 180
  const dLat = r(lat2 - lat1)
  const dLon = r(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function siaInfo(expiry) {
  if (!expiry) return { label: 'No SIA data', icon: '❓', col: '#888' }
  const days = Math.ceil((new Date(expiry) - new Date()) / 86_400_000)
  if (days < 0)  return { label: `Expired — ${expiry}`,                  icon: '❌', col: '#e05555' }
  if (days < 60) return { label: `Expiring soon — ${expiry} (${days}d)`, icon: '⚠️', col: '#d08020' }
  return               { label: `Valid — expires ${expiry}`,              icon: '✅', col: '#2e7d32' }
}

function fmtDur(mins) {
  if (!mins) return '—'
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function Screen({ children }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${DARK} 0%, #2a5a1a 55%, ${GREEN}cc 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 16px',
      fontFamily: 'DM Sans, system-ui, sans-serif',
    }}>
      {children}
    </div>
  )
}

function ShieldLogo() {
  return (
    <div style={{
      width: 68, height: 68, borderRadius: '50%',
      background: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 32, marginBottom: 14, flexShrink: 0,
    }}>🛡</div>
  )
}

const card = {
  background: '#fff', borderRadius: 18, padding: '26px 22px',
  width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,.28)',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClockPage() {
  const { slug, site_code: siteCode } = useParams()

  const [phase,      setPhase]      = useState('loading')
  const [siteInfo,   setSiteInfo]   = useState(null)
  const [gpsCoords,  setGpsCoords]  = useState(null)
  const [distance,   setDistance]   = useState(null)
  const [form,       setForm]       = useState({ staffId: '', fullName: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState('')
  const [result,     setResult]     = useState(null)
  const [action,     setAction]     = useState('in')   // 'in' | 'out'
  const [tick,       setTick]       = useState(new Date())

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load site info, then start GPS
  useEffect(() => {
    fetch(`${BASE}/clock/${slug}/${siteCode}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setSiteInfo(data); startGPS(data) })
      .catch(() => setPhase('site_error'))
  }, [])

  function startGPS(data) {
    if (!navigator.geolocation) {
      // Geolocation API not available on this device/browser
      setPhase(data.gps_enabled ? 'gps_unavailable' : 'form')
      return
    }
    setPhase('gps_checking')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setGpsCoords({ lat, lng })
        if (data.gps_enabled && data.site_lat && data.site_lng) {
          const dist = Math.round(haversine(lat, lng, data.site_lat, data.site_lng))
          setDistance(dist)
          setPhase(dist > 50 ? 'too_far' : 'form')
        } else {
          setPhase('form')
        }
      },
      err => {
        if (!data.gps_enabled) { setPhase('form'); return }
        // err.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (err.code === 3) setPhase('gps_timeout')
        else                setPhase('gps_denied')
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    )
  }

  async function submit(targetAction) {
    if (!form.staffId.trim() || !form.fullName.trim()) {
      setFormError('Please enter both your full name and staff ID.')
      return
    }
    setAction(targetAction)
    setSubmitting(true)
    setFormError('')
    try {
      const endpoint = targetAction === 'in' ? 'in' : 'out'
      const body = {
        staff_id:  form.staffId.trim().toUpperCase(),
        full_name: form.fullName.trim(),
        gps_lat:   gpsCoords?.lat ?? null,
        gps_lng:   gpsCoords?.lng ?? null,
        ...(targetAction === 'in' ? { scheduled_start: null } : {}),
      }
      const r    = await fetch(`${BASE}/clock/${slug}/${siteCode}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()

      if (r.status === 409 && data.detail === 'already_clocked_in') {
        setFormError('You are already clocked in. Please use CLOCK OUT.')
      } else if (!r.ok) {
        const detail = data.detail || ''
        if (targetAction === 'out' && detail.toLowerCase().includes('no active clock-in')) {
          setFormError('You are not currently clocked in.')
        } else {
          setFormError(detail || 'An error occurred. Please try again.')
        }
      } else {
        setResult({ ...data, submittedAction: targetAction })
        setPhase('confirm')
      }
    } catch {
      setFormError('Network error — please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setForm({ staffId: '', fullName: '' })
    setFormError('')
    setAction('in')
    setResult(null)
    setPhase('form')
  }

  const timeStr = tick.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ── LOADING / GPS CHECKING ────────────────────────────────────────────────

  if (phase === 'loading' || phase === 'gps_checking') return (
    <Screen>
      <ShieldLogo />
      <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
        {phase === 'loading' ? 'Loading…' : 'Checking your location…'}
      </div>
      {siteInfo && (
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 15, marginTop: 8, textAlign: 'center' }}>
          {siteInfo.site_name}
        </div>
      )}
    </Screen>
  )

  // ── SITE ERROR ────────────────────────────────────────────────────────────

  if (phase === 'site_error') return (
    <Screen>
      <div style={{ fontSize: 56 }}>❌</div>
      <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginTop: 14, textAlign: 'center' }}>
        Site Not Found
      </div>
      <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 15, marginTop: 10, textAlign: 'center', maxWidth: 320 }}>
        This QR code is invalid or the site has been deactivated. Please contact your supervisor.
      </div>
    </Screen>
  )

  // ── GPS DENIED (permission refused) ──────────────────────────────────────

  if (phase === 'gps_denied') return (
    <Screen>
      <ShieldLogo />
      {siteInfo?.site_name && (
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
          {siteInfo.site_name}
        </div>
      )}
      <div style={{ ...card }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#c0392b', marginBottom: 12, textAlign: 'center' }}>
          Location Access Required
        </div>
        <div style={{ fontSize: 15, color: '#333', lineHeight: 1.65, marginBottom: 16 }}>
          GPS is required to verify you are on site. Please enable location services and try again.
        </div>

        {/* iPhone */}
        <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            🍎 iPhone
          </div>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
            <strong>Settings</strong> → <strong>Privacy &amp; Security</strong> → <strong>Location Services</strong> → <strong>Safari</strong> → <strong>While Using</strong>
          </div>
        </div>

        {/* Android */}
        <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            🤖 Android
          </div>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
            <strong>Settings</strong> → <strong>Apps</strong> → <strong>Chrome</strong> → <strong>Permissions</strong> → <strong>Location</strong> → <strong>Allow</strong>
          </div>
        </div>

        <button
          onClick={() => window.location.reload()}
          style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: GREEN, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', marginBottom: 18 }}
        >
          Try Again
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
          <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>Still unable to enable GPS?</span>
          <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
        </div>

        {/* Supervisor instruction */}
        <div style={{ background: '#fff8e8', border: '1px solid #e8c840', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#7a5500', lineHeight: 1.6 }}>
          ⚠️ Please contact your <strong>line supervisor</strong> immediately and report that you are unable to clock in.
        </div>
      </div>
    </Screen>
  )

  // ── GPS TIMEOUT ───────────────────────────────────────────────────────────

  if (phase === 'gps_timeout') return (
    <Screen>
      <ShieldLogo />
      {siteInfo?.site_name && (
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
          {siteInfo.site_name}
        </div>
      )}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#c0392b', marginBottom: 12 }}>
          ⏱ Location Signal Weak
        </div>
        <div style={{ fontSize: 15, color: '#333', lineHeight: 1.65, marginBottom: 16 }}>
          Move outside or near a window, ensure Location Services is on, then tap Retry.
        </div>
        <button
          onClick={() => { setSiteInfo(s => s); startGPS(siteInfo) }}
          style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: GREEN, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', marginBottom: 18 }}
        >
          Retry
        </button>
        <div style={{ background: '#fff8e8', border: '1px solid #e8c840', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#7a5500', lineHeight: 1.6, textAlign: 'left' }}>
          ⚠️ Still having issues? Contact your <strong>line supervisor</strong> immediately.
        </div>
      </div>
    </Screen>
  )

  // ── GPS UNAVAILABLE (no Geolocation API) ─────────────────────────────────

  if (phase === 'gps_unavailable') return (
    <Screen>
      <ShieldLogo />
      {siteInfo?.site_name && (
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
          {siteInfo.site_name}
        </div>
      )}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#c0392b', marginBottom: 12 }}>
          📵 GPS Not Available
        </div>
        <div style={{ fontSize: 15, color: '#333', lineHeight: 1.65, marginBottom: 16 }}>
          GPS is not available on this device or browser.
        </div>
        <div style={{ background: '#fff8e8', border: '1px solid #e8c840', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#7a5500', lineHeight: 1.6, textAlign: 'left' }}>
          ⚠️ Please use a smartphone with GPS enabled, or contact your <strong>line supervisor</strong> immediately.
        </div>
      </div>
    </Screen>
  )

  // ── TOO FAR ────────────────────────────────────────────────────────────────

  if (phase === 'too_far') return (
    <Screen>
      <ShieldLogo />
      {siteInfo?.site_name && (
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
          {siteInfo.site_name}
        </div>
      )}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#c0392b', marginBottom: 14 }}>
          Not On Site
        </div>
        <div style={{ fontSize: 16, color: '#333', lineHeight: 1.65 }}>
          You are not at <strong>{siteInfo?.site_name}</strong>.
        </div>
        <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>
          You must be on site to clock in.
        </div>
        <div style={{ marginTop: 18, padding: '14px 16px', background: '#fde8e8', borderRadius: 10, fontSize: 16, color: '#a02020', fontWeight: 700 }}>
          Your current distance: <strong>{distance}m</strong> away
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 18, width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#777', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
        >
          Try Again
        </button>
      </div>
    </Screen>
  )

  // ── FORM (Phase 3) ────────────────────────────────────────────────────────

  if (phase === 'form') return (
    <Screen>
      <ShieldLogo />
      <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
        {action === 'in' ? 'Clocking in at' : 'Clocking out at'}
      </div>
      <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, textAlign: 'center', marginBottom: 22, lineHeight: 1.2 }}>
        {siteInfo?.site_name}
      </div>

      <div style={card}>
        {/* Full name */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#444', marginBottom: 7 }}>
            Full Name
          </label>
          <input
            type="text"
            inputMode="text"
            autoComplete="name"
            placeholder="e.g. John Smith"
            value={form.fullName}
            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            style={{
              width: '100%', padding: '15px 14px', fontSize: 17, borderRadius: 10,
              border: '1.5px solid #ddd', outline: 'none',
              fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Staff ID */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#444', marginBottom: 7 }}>
            Staff ID
          </label>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="e.g. ZZ123"
            value={form.staffId}
            onChange={e => setForm(f => ({ ...f, staffId: e.target.value.toUpperCase() }))}
            style={{
              width: '100%', padding: '15px 14px', fontSize: 20, borderRadius: 10,
              border: '1.5px solid #ddd', outline: 'none',
              fontFamily: 'DM Mono, monospace', letterSpacing: '.1em',
              textTransform: 'uppercase', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Error */}
        {formError && (
          <div style={{
            background: '#fde8e8', border: '1px solid #f0aaaa', borderRadius: 10,
            padding: '12px 14px', fontSize: 14, color: '#a02020',
            marginBottom: 16, lineHeight: 1.55,
          }}>
            {formError}
          </div>
        )}

        {/* Clock In button */}
        <button
          onClick={() => submit('in')}
          disabled={submitting}
          style={{
            width: '100%', padding: '17px 0', fontSize: 20, fontWeight: 900,
            letterSpacing: '.08em', borderRadius: 12, border: 'none',
            background: submitting && action === 'in' ? '#aaa' : '#6abf3f',
            color: '#fff', cursor: submitting ? 'wait' : 'pointer',
            transition: 'background .2s',
          }}
        >
          {submitting && action === 'in' ? '…' : 'CLOCK IN'}
        </button>

        {/* Clock Out button */}
        <button
          onClick={() => submit('out')}
          disabled={submitting}
          style={{
            width: '100%', padding: '17px 0', fontSize: 20, fontWeight: 900,
            letterSpacing: '.08em', borderRadius: 12, border: 'none',
            background: submitting && action === 'out' ? '#aaa' : '#e05555',
            color: '#fff', cursor: submitting ? 'wait' : 'pointer',
            transition: 'background .2s', marginTop: 12,
          }}
        >
          {submitting && action === 'out' ? '…' : 'CLOCK OUT'}
        </button>
      </div>

      <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, marginTop: 22, fontFamily: 'DM Mono, monospace' }}>
        Server time: {timeStr}
      </div>
    </Screen>
  )

  // ── CONFIRMATION (Phase 4) ────────────────────────────────────────────────

  if (phase === 'confirm' && result) {
    const isIn = result.submittedAction === 'in'
    const sia  = siaInfo(result.sia_expiry)
    const ts   = result.timestamp ? new Date(result.timestamp) : new Date()
    const fmtTs = ts.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

    // Distance: prefer backend value, fall back to pre-calculated frontend distance
    const distMetres = result.distance_metres != null
      ? result.distance_metres
      : (gpsCoords && siteInfo?.site_lat != null
          ? Math.round(haversine(gpsCoords.lat, gpsCoords.lng, siteInfo.site_lat, siteInfo.site_lng))
          : null)
    const distStr = distMetres != null ? `${distMetres} metres` : null

    const Row = ({ label, value, valueColor }) => value == null ? null : (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f0f0f0', gap: 12 }}>
        <span style={{ fontSize: 14, color: '#666', fontWeight: 600, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 14, color: valueColor || '#1a2a1a', fontWeight: 700, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
      </div>
    )

    return (
      <Screen>
        <div style={{ fontSize: 76, marginBottom: 10, lineHeight: 1 }}>{isIn ? '✅' : '🔔'}</div>
        <div style={{ color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '.05em', marginBottom: 22, textAlign: 'center' }}>
          {isIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
        </div>

        <div style={{ ...card, maxWidth: 440 }}>
          <Row label="👤 Name"       value={result.full_name} />
          <Row label="🪪 Staff ID"   value={result.staff_id} />
          <Row label="📍 Site"       value={result.site_name} />
          <Row label="🗺 Distance from site" value={distStr} valueColor="#1a6a1a" />
          <Row label="🕐 Time"       value={fmtTs} />
          <Row label="🛡 SIA Licence" value={result.sia_licence} />

          {/* SIA status */}
          {result.sia_expiry && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#666', fontWeight: 600 }}>✅ SIA Status</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: sia.col }}>{sia.icon} {sia.label}</span>
            </div>
          )}

          {/* Punctuality (clock-in) or shift duration (clock-out) */}
          {isIn ? (
            <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, textAlign: 'center', fontSize: 16, fontWeight: 700, background: result.is_late ? '#fde8e8' : '#e8f8e0', color: result.is_late ? '#a02020' : '#1a6a1a' }}>
              {result.scheduled_start != null
                ? result.is_late
                  ? `⚠️ Late by ${result.minutes_late} minute${result.minutes_late !== 1 ? 's' : ''}`
                  : '✅ On Time'
                : '✅ Clock-in recorded'}
            </div>
          ) : (
            <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, textAlign: 'center', fontSize: 16, fontWeight: 700, background: '#e8f0ff', color: '#1a3a8a' }}>
              🕐 Shift duration: {fmtDur(result.shift_minutes)}
              {result.clock_in_time && (
                <div style={{ fontWeight: 400, fontSize: 13, marginTop: 4 }}>Clocked in at {result.clock_in_time}</div>
              )}
            </div>
          )}

          {/* Screenshot reminder */}
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#fffbe8', border: '1px solid #e8d060', fontSize: 13, color: '#7a6000', textAlign: 'center', lineHeight: 1.55 }}>
            📸 Please <strong>screenshot this confirmation</strong> for your records
          </div>

          <button
            onClick={reset}
            style={{ marginTop: 18, width: '100%', padding: '15px 0', fontSize: 17, fontWeight: 700, borderRadius: 12, border: `2px solid ${GREEN}`, background: '#fff', color: GREEN, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </Screen>
    )
  }

  return null
}
