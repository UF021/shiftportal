// CaptureGPS.jsx — Generic public GPS capture page
// Route: /capture-gps  (single link, no slug or site_code)
import { useEffect, useRef, useState } from 'react'
import { submitGpsCapture } from '../../api/client'

const ACCURACY_TARGET = 20   // metres
const TIMEOUT_MS      = 30000

// ── Tiny helpers ─────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0') }

function fmtTime(d) {
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

const field = {
  width: '100%', padding: '14px 16px', borderRadius: 10,
  border: '1.5px solid #d1d5db', background: '#fff',
  fontSize: 16, fontFamily: 'DM Sans, sans-serif',
  outline: 'none', boxSizing: 'border-box', color: '#111827',
}

const GREEN  = '#6abf3f'
const CARD   = {
  background: '#fff', borderRadius: 20,
  padding: '36px 28px', width: '100%', maxWidth: 420,
  boxShadow: '0 8px 40px rgba(0,0,0,.15)',
}

function Btn({ onClick, disabled, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '16px 0', borderRadius: 12, border: 'none',
        background: disabled ? '#9ca3af' : GREEN, color: '#fff',
        fontSize: 16, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'DM Sans, sans-serif', letterSpacing: '.02em',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function GhostBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '14px 0', borderRadius: 12,
        border: '1.5px solid #d1d5db', background: 'transparent',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif', color: '#6b7280',
        marginTop: 10,
      }}
    >
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CaptureGPS() {
  const [phase,      setPhase]    = useState('details')   // details | capturing | confirm | submitting | done | denied
  const [name,       setName]     = useState('')
  const [siteName,   setSiteName] = useState('')
  const [gps,        setGps]      = useState(null)         // { lat, lng, accuracy }
  const [bestGps,    setBestGps]  = useState(null)
  const [capturedAt, setCapturedAt] = useState(null)
  const [timedOut,   setTimedOut] = useState(false)
  const [errMsg,     setErrMsg]   = useState('')
  const watchId  = useRef(null)
  const timerRef = useRef(null)

  // Clean up on unmount
  useEffect(() => () => {
    if (watchId.current != null)  navigator.geolocation.clearWatch(watchId.current)
    if (timerRef.current != null) clearTimeout(timerRef.current)
  }, [])

  function startCapture() {
    if (!name.trim() || !siteName.trim()) return

    if (!navigator.geolocation) {
      setErrMsg('This device does not support GPS.')
      setPhase('denied')
      return
    }

    setTimedOut(false)
    setBestGps(null)
    setGps(null)
    setPhase('capturing')

    // 30-second hard timeout
    timerRef.current = setTimeout(() => {
      setTimedOut(true)
    }, TIMEOUT_MS)

    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords
        const reading = { lat: latitude, lng: longitude, accuracy }
        setGps(reading)
        setBestGps(prev => (!prev || accuracy < prev.accuracy) ? reading : prev)

        if (accuracy <= ACCURACY_TARGET) {
          clearTimeout(timerRef.current)
          navigator.geolocation.clearWatch(watchId.current)
          const now = new Date()
          setCapturedAt(now)
          setGps(reading)
          setPhase('confirm')
        }
      },
      err => {
        clearTimeout(timerRef.current)
        if (err.code === 1) {
          setPhase('denied')
        } else {
          setErrMsg(
            err.code === 2
              ? 'Unable to determine your location. Move to an open area and try again.'
              : 'GPS timed out. Please try again.'
          )
          setPhase('denied')
        }
      },
      { enableHighAccuracy: true, timeout: 35000, maximumAge: 0 },
    )
  }

  function submitBest() {
    clearTimeout(timerRef.current)
    navigator.geolocation.clearWatch(watchId.current)
    const reading = bestGps || gps
    const now     = new Date()
    setGps(reading)
    setCapturedAt(now)
    setPhase('confirm')
  }

  function retry() {
    clearTimeout(timerRef.current)
    navigator.geolocation.clearWatch(watchId.current)
    setTimedOut(false)
    setGps(null)
    setBestGps(null)
    startCapture()
  }

  async function confirm() {
    const reading = gps || bestGps
    setPhase('submitting')
    try {
      await submitGpsCapture({
        captured_by: name.trim(),
        site_name:   siteName.trim(),
        latitude:    reading.lat,
        longitude:   reading.lng,
        accuracy:    reading.accuracy,
      })
      setPhase('done')
    } catch {
      setErrMsg('Submission failed. Please try again.')
      setPhase('denied')
    }
  }

  const displayGps = gps || bestGps

  // ── Wrapper ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4a9e1f 0%, #6abf3f 50%, #3d8a18 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 16px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <img
          src="https://portal.ikanfm.co.uk/logo.png"
          alt="Ikan FM"
          height={44}
          style={{ filter: 'brightness(0) invert(1)', objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>

      <div style={CARD}>

        {/* ── PHASE 1: Details ────────────────────────────────────────── */}
        {phase === 'details' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6, textAlign: 'center' }}>
              Site Location Capture
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 28, lineHeight: 1.5 }}>
              Please stand at the <strong>main entrance</strong> of your site before continuing.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Smith"
                style={field}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Cinema / Site Name
              </label>
              <input
                type="text"
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                placeholder="e.g. Showcase Avonmeads"
                style={field}
              />
            </div>

            <Btn onClick={startCapture} disabled={!name.trim() || !siteName.trim()}>
              CAPTURE MY LOCATION
            </Btn>
          </>
        )}

        {/* ── PHASE 2: Capturing ──────────────────────────────────────── */}
        {phase === 'capturing' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Getting Your Location…
            </h2>

            {/* Spinner */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: `5px solid #e5e7eb`,
                borderTopColor: GREEN,
                animation: 'spin 1s linear infinite',
              }} />
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              {displayGps ? (
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: displayGps.accuracy <= ACCURACY_TARGET ? GREEN
                       : displayGps.accuracy <= 50 ? '#f59e0b' : '#ef4444',
                }}>
                  Accuracy: {Math.round(displayGps.accuracy)}m
                </div>
              ) : (
                <div style={{ fontSize: 15, color: '#6b7280' }}>Waiting for GPS signal…</div>
              )}
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
                Target: under {ACCURACY_TARGET} metres
              </div>
            </div>

            {/* Timed-out state */}
            {timedOut && bestGps && (
              <div style={{
                background: '#fffbeb', border: '1.5px solid #fcd34d',
                borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400e',
              }}>
                Best accuracy achieved: <strong>{Math.round(bestGps.accuracy)}m</strong> — this may be less precise.
                Submit anyway or move closer to the entrance and retry.
              </div>
            )}

            {timedOut && (
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn onClick={retry} style={{ flex: 1 }}>Retry</Btn>
                <Btn onClick={submitBest} disabled={!bestGps} style={{ flex: 1, background: '#374151' }}>
                  Submit Anyway
                </Btn>
              </div>
            )}
          </>
        )}

        {/* ── PHASE 3: Confirm ────────────────────────────────────────── */}
        {phase === 'confirm' && displayGps && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Confirm Your Details
            </h2>

            <div style={{
              background: '#f9fafb', border: '1.5px solid #e5e7eb',
              borderRadius: 12, padding: '18px 20px', marginBottom: 24,
            }}>
              {[
                ['👤', 'Name',        name],
                ['🎬', 'Site',        siteName],
                ['📍', 'Coordinates', `${displayGps.lat.toFixed(6)}, ${displayGps.lng.toFixed(6)}`],
                ['🎯', 'Accuracy',    `${Math.round(displayGps.accuracy)} metres`],
                ['🕐', 'Captured at', capturedAt ? fmtTime(capturedAt) : '—'],
              ].map(([icon, label, val]) => (
                <div key={label} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
                    <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, marginTop: 1, fontFamily: label === 'Coordinates' ? 'DM Mono, monospace' : 'inherit' }}>{val}</div>
                  </div>
                </div>
              ))}
            </div>

            <Btn onClick={confirm}>CONFIRM & SUBMIT</Btn>
            <GhostBtn onClick={() => setPhase('details')}>Go Back</GhostBtn>
          </>
        )}

        {/* ── PHASE: Submitting ───────────────────────────────────────── */}
        {phase === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 16, color: '#6b7280' }}>Submitting…</div>
          </div>
        )}

        {/* ── PHASE 4: Done ───────────────────────────────────────────── */}
        {phase === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 72, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: GREEN, marginBottom: 8 }}>
              Thank you, {name.trim().split(' ')[0]}!
            </h2>
            <p style={{ fontSize: 15, color: '#374151', marginBottom: 6 }}>
              Location captured for <strong>{siteName}</strong>.
            </p>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              HR has been notified and will review this shortly.
            </p>
            <div style={{
              background: '#f0fdf4', border: '1.5px solid #bbf7d0',
              borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#166534',
            }}>
              📸 Please screenshot this confirmation for your records.
            </div>
          </div>
        )}

        {/* ── PHASE: Denied / Error ───────────────────────────────────── */}
        {phase === 'denied' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>📵</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 12 }}>
              Location Access Needed
            </h2>

            {!errMsg ? (
              <>
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                  To capture your site location, you need to allow location access.
                </p>
                <div style={{
                  background: '#f9fafb', border: '1.5px solid #e5e7eb',
                  borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#374151',
                  textAlign: 'left', marginBottom: 24, lineHeight: 1.7,
                }}>
                  <strong>On iPhone:</strong> Settings → Safari → Location → Allow<br />
                  <strong>On Android:</strong> Tap the lock icon in your browser → Site Settings → Location → Allow<br />
                  Then <strong>reload this page</strong> and try again.
                </div>
              </>
            ) : (
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>{errMsg}</p>
            )}

            <Btn onClick={() => { setPhase('details'); setErrMsg('') }}>Try Again</Btn>
          </div>
        )}

      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
        Powered by ShiftPortal
      </div>
    </div>
  )
}
