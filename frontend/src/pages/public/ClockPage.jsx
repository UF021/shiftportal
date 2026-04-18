import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const BASE  = import.meta.env.VITE_API_URL || '/api'
const GREEN  = '#6abf3f'
const AMBER  = '#d08020'
const DARK   = '#1a3a1a'

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

function formatDistance(metres) {
  return Math.round(metres).toLocaleString('en-GB') + ' metres'
}

function fmtDur(mins) {
  if (!mins) return '—'
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

const inp = {
  width: '100%', padding: '15px 14px', fontSize: 16, borderRadius: 10,
  border: '1.5px solid #ddd', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
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
  const [action,     setAction]     = useState('in')
  const [tick,       setTick]       = useState(new Date())

  // Manager override state
  const [overrideAction, setOverrideAction] = useState('in')
  const [overrideError,  setOverrideError]  = useState('')
  const [overrideForm,   setOverrideForm]   = useState({
    managerName:    '',
    clockTime:      '',
    scheduledStart: '',
    reason:         'GPS unavailable',
  })

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
          setPhase(dist > 70 ? 'too_far' : 'form')
        } else {
          setPhase('form')
        }
      },
      err => {
        if (!data.gps_enabled) { setPhase('form'); return }
        if (err.code === 3) setPhase('gps_timeout')
        else                setPhase('gps_denied')
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    )
  }

  // ── Open override form ────────────────────────────────────────────────────

  function openOverride(targetAction) {
    setOverrideAction(targetAction)
    setOverrideError('')
    setOverrideForm(f => ({ ...f, clockTime: nowHHMM() }))
    setPhase('override')
  }

  // ── Normal submit ────────────────────────────────────────────────────────

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

  // ── Override submit ───────────────────────────────────────────────────────

  async function submitOverride() {
    if (!form.fullName.trim() || !form.staffId.trim()) {
      setOverrideError('Staff full name and ID are required.')
      return
    }
    if (!overrideForm.managerName.trim()) {
      setOverrideError('Duty Manager full name is required.')
      return
    }

    setSubmitting(true)
    setOverrideError('')
    try {
      const endpoint = overrideAction === 'in' ? 'in' : 'out'
      const body = {
        staff_id:         form.staffId.trim().toUpperCase(),
        full_name:        form.fullName.trim(),
        gps_lat:          null,
        gps_lng:          null,
        manager_override: true,
        manager_name:     overrideForm.managerName.trim(),
        override_reason:  overrideForm.reason,
        ...(overrideAction === 'in' ? {
          scheduled_start: overrideForm.scheduledStart || null,
          manual_time:     overrideForm.clockTime || null,
        } : {}),
      }
      const r    = await fetch(`${BASE}/clock/${slug}/${siteCode}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) {
        setOverrideError(data.detail || 'Override failed. Please check the authorisation code.')
      } else {
        setResult({
          ...data,
          submittedAction: overrideAction,
          is_override:     true,
          manager_name:    overrideForm.managerName.trim(),
        })
        setPhase('confirm')
      }
    } catch {
      setOverrideError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setForm({ staffId: '', fullName: '' })
    setFormError('')
    setAction('in')
    setResult(null)
    setOverrideError('')
    setPhase('form')
  }

  const timeStr = tick.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ── Override button (reusable) ────────────────────────────────────────────

  const OverrideBtn = ({ targetAction = 'in' }) => (
    <button
      onClick={() => openOverride(targetAction)}
      style={{
        width: '100%', padding: '13px 0', borderRadius: 12,
        border: `2px solid ${AMBER}`, background: 'rgba(208,128,32,.08)',
        color: AMBER, fontSize: 15, fontWeight: 700,
        cursor: 'pointer', marginTop: 12,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      🔑 Request Manager Override
    </button>
  )

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

  // ── GPS DENIED ────────────────────────────────────────────────────────────

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
        <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>🍎 iPhone</div>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
            <strong>Settings</strong> → <strong>Privacy &amp; Security</strong> → <strong>Location Services</strong> → <strong>Safari</strong> → <strong>While Using</strong>
          </div>
        </div>
        <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>🤖 Android</div>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
            <strong>Settings</strong> → <strong>Apps</strong> → <strong>Chrome</strong> → <strong>Permissions</strong> → <strong>Location</strong> → <strong>Allow</strong>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: GREEN, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', marginBottom: 10 }}
        >
          Try Again
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
          <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>Still unable to enable GPS?</span>
          <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
        </div>
        <OverrideBtn targetAction="in" />
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
          style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: GREEN, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', marginBottom: 10 }}
        >
          Retry
        </button>
        <OverrideBtn targetAction="in" />
      </div>
    </Screen>
  )

  // ── GPS UNAVAILABLE ───────────────────────────────────────────────────────

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
        <OverrideBtn targetAction="in" />
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
          Your current distance: <strong>{distance != null ? formatDistance(distance) : '—'}</strong> away
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 18, width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#777', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
        >
          Try Again
        </button>
        <OverrideBtn targetAction="in" />
      </div>
    </Screen>
  )

  // ── MANAGER OVERRIDE FORM ─────────────────────────────────────────────────

  if (phase === 'override') return (
    <Screen>
      <ShieldLogo />
      {siteInfo?.site_name && (
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
          {siteInfo.site_name}
        </div>
      )}

      <div style={{ ...card, maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🔑</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#333', marginBottom: 4 }}>
            Manager Override Sign-In
          </div>
          <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
            A Duty Manager must be present and authorise this sign-{overrideAction}
          </div>
        </div>

        {/* Staff details (pre-filled, editable) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Staff Full Name</label>
            <input
              style={{ ...inp, fontSize: 14 }}
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. John Smith"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Staff ID</label>
            <input
              style={{ ...inp, fontSize: 14, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}
              value={form.staffId}
              onChange={e => setForm(f => ({ ...f, staffId: e.target.value.toUpperCase() }))}
              placeholder="e.g. ZZ123"
            />
          </div>
        </div>

        {/* Manager details */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
            Duty Manager Details
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>Duty Manager Full Name *</label>
            <input
              style={{ ...inp, fontSize: 15 }}
              value={overrideForm.managerName}
              onChange={e => setOverrideForm(f => ({ ...f, managerName: e.target.value }))}
              placeholder="e.g. Jane Wilson"
            />
          </div>
        </div>

        {/* Time + reason */}
        <div style={{ display: 'grid', gridTemplateColumns: overrideAction === 'in' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 14 }}>
          {overrideAction === 'in' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>Clock In Time</label>
              <input
                type="time"
                style={{ ...inp, fontSize: 15, fontFamily: 'DM Mono, monospace' }}
                value={overrideForm.clockTime}
                onChange={e => setOverrideForm(f => ({ ...f, clockTime: e.target.value }))}
              />
            </div>
          )}
          {overrideAction === 'in' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>Scheduled Start</label>
              <input
                type="time"
                style={{ ...inp, fontSize: 15, fontFamily: 'DM Mono, monospace' }}
                value={overrideForm.scheduledStart}
                onChange={e => setOverrideForm(f => ({ ...f, scheduledStart: e.target.value }))}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>Reason</label>
          <select
            style={{ ...inp, fontSize: 14, background: '#fff' }}
            value={overrideForm.reason}
            onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
          >
            <option>GPS unavailable</option>
            <option>Phone GPS fault</option>
            <option>QR code damaged</option>
            <option>Other</option>
          </select>
        </div>

        {/* Error */}
        {overrideError && (
          <div style={{
            background: '#fde8e8', border: '1px solid #f0aaaa', borderRadius: 10,
            padding: '12px 14px', fontSize: 14, color: '#a02020', marginBottom: 14,
          }}>
            {overrideError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submitOverride}
          disabled={submitting}
          style={{
            width: '100%', padding: '17px 0', fontSize: 17, fontWeight: 800,
            letterSpacing: '.06em', borderRadius: 12, border: 'none',
            background: submitting ? '#aaa' : AMBER,
            color: '#fff', cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? '…' : `AUTHORISE SIGN ${overrideAction.toUpperCase()}`}
        </button>

        <button
          onClick={() => setPhase('form')}
          style={{
            width: '100%', padding: '13px 0', fontSize: 14, fontWeight: 600,
            borderRadius: 12, border: '1.5px solid #ddd', background: 'transparent',
            color: '#888', cursor: 'pointer', marginTop: 10,
          }}
        >
          ← Go Back
        </button>
      </div>
    </Screen>
  )

  // ── FORM ──────────────────────────────────────────────────────────────────

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
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#444', marginBottom: 7 }}>Full Name</label>
          <input
            type="text" inputMode="text" autoComplete="name" placeholder="e.g. John Smith"
            value={form.fullName}
            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            style={inp}
          />
        </div>

        {/* Staff ID */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#444', marginBottom: 7 }}>Staff ID</label>
          <input
            type="text" inputMode="text" autoCapitalize="characters" placeholder="e.g. ZZ123"
            value={form.staffId}
            onChange={e => setForm(f => ({ ...f, staffId: e.target.value.toUpperCase() }))}
            style={{ ...inp, fontSize: 20, fontFamily: 'DM Mono, monospace', letterSpacing: '.1em', textTransform: 'uppercase' }}
          />
        </div>

        {/* Error + override button */}
        {formError && (
          <>
            <div style={{
              background: '#fde8e8', border: '1px solid #f0aaaa', borderRadius: 10,
              padding: '12px 14px', fontSize: 14, color: '#a02020',
              marginBottom: 4, lineHeight: 1.55,
            }}>
              {formError}
            </div>
            <OverrideBtn targetAction={action} />
            <div style={{ height: 14 }} />
          </>
        )}

        {/* Clock In */}
        <button
          onClick={() => submit('in')}
          disabled={submitting}
          style={{
            width: '100%', padding: '17px 0', fontSize: 20, fontWeight: 900,
            letterSpacing: '.08em', borderRadius: 12, border: 'none',
            background: submitting && action === 'in' ? '#aaa' : GREEN,
            color: '#fff', cursor: submitting ? 'wait' : 'pointer', transition: 'background .2s',
          }}
        >
          {submitting && action === 'in' ? '…' : 'CLOCK IN'}
        </button>

        {/* Clock Out */}
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

  // ── CONFIRMATION ──────────────────────────────────────────────────────────

  if (phase === 'confirm' && result) {
    const isIn = result.submittedAction === 'in'
    const sia  = siaInfo(result.sia_expiry)
    const ts   = result.timestamp ? new Date(result.timestamp) : new Date()
    const fmtTs = ts.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

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

          {result.sia_expiry && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#666', fontWeight: 600 }}>✅ SIA Status</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: sia.col }}>{sia.icon} {sia.label}</span>
            </div>
          )}

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

          {/* Manager override banner */}
          {result.is_override && (
            <div style={{
              marginTop: 12, padding: '12px 14px', borderRadius: 10,
              background: '#fff8e8', border: `1.5px solid ${AMBER}`,
              fontSize: 14, color: '#7a5500', fontWeight: 700, textAlign: 'center',
            }}>
              ⚠️ Manager Override — Authorised by {result.manager_name}
            </div>
          )}

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
