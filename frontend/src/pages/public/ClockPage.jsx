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
  const [form,       setForm]       = useState({ staffId: '', fullName: '', scheduledStart: '' })
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
    if (!form.scheduledStart) {
      setFormError('Please enter your scheduled start time.')
      return
    }
    setAction(targetAction)
    setSubmitting(true)
    setFormError('')
    try {
      const endpoint = targetAction === 'in' ? 'in' : 'out'
      const body = {
        staff_id:        form.staffId.trim(),
        full_name:       form.fullName.trim(),
        gps_lat:         gpsCoords?.lat ?? null,
        gps_lng:         gpsCoords?.lng ?? null,
        scheduled_start: form.scheduledStart || null,
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
        staff_id:         form.staffId.trim(),
        full_name:        form.fullName.trim(),
        gps_lat:          null,
        gps_lng:          null,
        manager_override: true,
        manager_name:     overrideForm.managerName.trim(),
        override_reason:  overrideForm.reason,
        scheduled_start:  overrideForm.scheduledStart || null,
        manual_time:      overrideForm.clockTime || null,
      }
      console.log('[Override] submitting to', `${BASE}/clock/${slug}/${siteCode}/${endpoint}`, body)
      const r    = await fetch(`${BASE}/clock/${slug}/${siteCode}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      console.log('[Override] response', r.status, data)
      if (!r.ok) {
        setOverrideError(data.detail || 'Override failed. Please try again.')
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
    setForm({ staffId: '', fullName: '', scheduledStart: '' })
    setFormError('')
    setAction('in')
    setResult(null)
    setOverrideError('')
    setPhase('form')
  }

  const timeStr = tick.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ── Override button (reusable) ────────────────────────────────────────────

  const OverrideBtn = () => (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {['in', 'out'].map(act => (
        <button
          key={act}
          onClick={() => openOverride(act)}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            border: `2px solid ${AMBER}`, background: 'rgba(208,128,32,.08)',
            color: AMBER, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}
        >
          🔑 Override Sign {act === 'in' ? 'In' : 'Out'}
        </button>
      ))}
    </div>
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
        <OverrideBtn />
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
        <OverrideBtn />
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
        <OverrideBtn />
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
        <OverrideBtn />
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
              style={{ ...inp, fontSize: 14, fontFamily: 'DM Mono, monospace' }}
              value={form.staffId}
              onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>
              {overrideAction === 'in' ? 'Clock In Time' : 'Clock Out Time'}
            </label>
            <input
              type="time"
              style={{ ...inp, fontSize: 15, fontFamily: 'DM Mono, monospace' }}
              value={overrideForm.clockTime}
              onChange={e => setOverrideForm(f => ({ ...f, clockTime: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>Scheduled Start</label>
            <input
              type="time"
              style={{ ...inp, fontSize: 15, fontFamily: 'DM Mono, monospace' }}
              value={overrideForm.scheduledStart}
              onChange={e => setOverrideForm(f => ({ ...f, scheduledStart: e.target.value }))}
            />
          </div>
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

  if (phase === 'form') {
    const nowMins   = tick.getHours() * 60 + tick.getMinutes()
    const schedMins = form.scheduledStart
      ? Number(form.scheduledStart.split(':')[0]) * 60 + Number(form.scheduledStart.split(':')[1])
      : null
    const minsLate  = schedMins != null ? nowMins - schedMins : null

    const fieldLabel = {
      display: 'block', fontSize: 11, fontWeight: 700, color: '#5a7a5a',
      textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6,
    }
    const fieldInput = {
      width: '100%', padding: '13px 14px', fontSize: 15, borderRadius: 8,
      border: '1px solid #d8e8d8', outline: 'none', background: '#fff',
      fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', color: '#1a2a1a',
    }

    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, system-ui, sans-serif', background: '#f0f4f0' }}>

        {/* Green header */}
        <div style={{ background: '#1B5E20', flex: '0 0 auto' }}>

          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#69F0AE', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontFamily: 'DM Mono, monospace' }}>
              portal.ikanfm.co.uk
            </span>
          </div>

          {/* Shield + site info */}
          <div style={{ padding: '24px 20px 32px', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 64, height: 64, borderRadius: 16,
              background: 'rgba(105,240,174,.15)', border: '1px solid rgba(105,240,174,.3)',
              fontSize: 30, marginBottom: 16,
            }}>🛡</div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#69F0AE', marginBottom: 8 }}>
              CLOCKING IN AT
            </div>

            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>
              {siteInfo?.site_name}
            </div>

            {siteInfo?.site_address && (
              <div style={{ fontSize: 13, color: 'rgba(105,240,174,.7)', lineHeight: 1.4 }}>
                {siteInfo.site_address}
              </div>
            )}
          </div>
        </div>

        {/* White card — rounded top corners */}
        <div style={{
          flex: 1, background: '#fff', borderRadius: '20px 20px 0 0',
          marginTop: -16, padding: '28px 20px 32px',
          overflowY: 'auto',
        }}>

          {/* Fields */}
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Full Name</label>
            <input
              type="text" inputMode="text" autoComplete="name" placeholder="e.g. John Smith"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              style={fieldInput}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Staff ID</label>
            <input
              type="text" inputMode="text" autoCapitalize="none" placeholder="e.g. IFM-045"
              value={form.staffId}
              onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
              style={{ ...fieldInput, fontFamily: 'DM Mono, monospace', fontSize: 18, letterSpacing: '.08em', textTransform: 'uppercase' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabel}>Scheduled start time</label>
            <input
              type="time"
              value={form.scheduledStart}
              onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))}
              style={{ ...fieldInput, fontFamily: 'DM Mono, monospace', fontSize: 17 }}
            />
            {minsLate != null && minsLate > 0 && (
              <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 8, background: '#fde8e8', border: '1px solid #f0aaaa', fontSize: 13, color: '#a02020', fontWeight: 700 }}>
                ⚠️ You are {minsLate} minute{minsLate !== 1 ? 's' : ''} late
              </div>
            )}
            {minsLate != null && minsLate <= 0 && (
              <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 8, background: '#E8F5E9', border: '1px solid #A5D6A7', fontSize: 13, color: '#2E7D32', fontWeight: 700 }}>
                ✅ On time
              </div>
            )}
          </div>

          {/* Error message */}
          {formError && (
            <div style={{
              background: '#fde8e8', border: '1px solid #f0aaaa', borderRadius: 8,
              padding: '12px 14px', fontSize: 13, color: '#a02020',
              marginBottom: 16, lineHeight: 1.5, fontWeight: 600,
            }}>
              {formError}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => submit('in')}
              disabled={submitting}
              style={{
                width: '100%', padding: '16px', fontSize: 16, fontWeight: 500,
                borderRadius: 8, border: 'none',
                background: submitting && action === 'in' ? '#aaa' : '#2E7D32',
                color: '#fff', cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {submitting && action === 'in' ? '…' : 'CLOCK IN'}
            </button>

            <button
              onClick={() => submit('out')}
              disabled={submitting}
              style={{
                width: '100%', padding: '16px', fontSize: 16, fontWeight: 500,
                borderRadius: 8, border: 'none',
                background: submitting && action === 'out' ? '#aaa' : '#C62828',
                color: '#fff', cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {submitting && action === 'out' ? '…' : 'CLOCK OUT'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => openOverride('in')}
                style={{
                  flex: 1, padding: '12px', fontSize: 12, fontWeight: 600,
                  borderRadius: 8, border: '0.5px solid #FFD54F',
                  background: '#FFECB3', color: '#6D4C00',
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                🔑 Override Sign In
              </button>
              <button
                onClick={() => openOverride('out')}
                style={{
                  flex: 1, padding: '12px', fontSize: 12, fontWeight: 600,
                  borderRadius: 8, border: '0.5px solid #FFD54F',
                  background: '#FFECB3', color: '#6D4C00',
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                🔑 Override Sign Out
              </button>
            </div>
          </div>

          {/* Server time */}
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9aaa9a', fontFamily: 'DM Mono, monospace' }}>
            {timeStr}
          </div>
        </div>
      </div>
    )
  }

  // ── CONFIRMATION ──────────────────────────────────────────────────────────

  if (phase === 'confirm' && result) {
    const isIn = result.submittedAction === 'in'
    const sia  = siaInfo(result.sia_expiry)
    const ts   = result.timestamp ? new Date(result.timestamp) : new Date()
    const fmtTs = ts.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
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
            result.is_late ? (
              <div style={{ marginTop: 14, padding: '18px 16px', borderRadius: 10, textAlign: 'center', background: '#fde8e8', border: '2px solid #e05555' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#a02020', lineHeight: 1.1 }}>
                  ⚠️ {result.minutes_late} {result.minutes_late === 1 ? 'minute' : 'minutes'} late
                </div>
                <div style={{ fontSize: 13, color: '#c05050', marginTop: 6, fontWeight: 600 }}>
                  Please ensure you arrive on time for future shifts
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14, padding: '18px 16px', borderRadius: 10, textAlign: 'center', background: '#e8f8e0', border: '2px solid #6abf3f' }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#1a6a1a' }}>
                  ✅ On Time
                </div>
              </div>
            )
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
