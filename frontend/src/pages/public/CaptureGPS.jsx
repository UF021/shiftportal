// CaptureGPS.jsx — Public GPS coordinate capture page
// URL: /capture-gps/:slug/:site_code
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useBrand } from '../../api/BrandContext'
import { submitGpsCapture } from '../../api/client'
import OrgLogo from '../../components/OrgLogo'

const ACCURACY_TARGET = 20   // metres — aim for this before allowing submit

export default function CaptureGPS() {
  const { slug, site_code } = useParams()
  const { colour, name }    = useBrand()
  const c = colour || '#6abf3f'

  const [phase,      setPhase]      = useState('watching')   // watching | ready | submitting | done | error
  const [gps,        setGps]        = useState(null)          // { lat, lng, accuracy }
  const [capturedBy, setCapturedBy] = useState('')
  const [notes,      setNotes]      = useState('')
  const [errMsg,     setErrMsg]     = useState('')
  const [siteName,   setSiteName]   = useState(site_code)
  const watchId = useRef(null)

  // Resolve site name from public org endpoint
  useEffect(() => {
    fetch(`/api/orgs/${slug}/public`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
  }, [slug])

  // Start GPS watch
  useEffect(() => {
    if (!navigator.geolocation) {
      setPhase('error')
      setErrMsg('This device does not support GPS.')
      return
    }
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords
        setGps({ lat: latitude, lng: longitude, accuracy })
        if (accuracy <= ACCURACY_TARGET) {
          setPhase(p => p === 'watching' ? 'ready' : p)
        }
      },
      err => {
        setPhase('error')
        setErrMsg(
          err.code === 1 ? 'Location permission denied. Please allow location access and try again.' :
          err.code === 2 ? 'Unable to determine your location. Move to an open area and try again.' :
          'GPS timed out. Please try again.'
        )
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    )
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  async function submit() {
    if (!gps) return
    setPhase('submitting')
    try {
      await submitGpsCapture(slug, site_code, {
        latitude:    gps.lat,
        longitude:   gps.lng,
        accuracy:    gps.accuracy,
        captured_by: capturedBy.trim() || null,
        notes:       notes.trim()      || null,
      })
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      setPhase('done')
    } catch (ex) {
      setPhase('error')
      setErrMsg(ex.response?.data?.detail || 'Submission failed. Please try again.')
    }
  }

  const accuracyColour = !gps ? '#888'
    : gps.accuracy <= ACCURACY_TARGET  ? '#6abf3f'
    : gps.accuracy <= 50               ? '#f59e0b'
    : '#ef4444'

  const input = (value, onChange, placeholder, type = 'text') => (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '12px 14px', borderRadius: 8,
        border: '1px solid #334', background: '#111827',
        color: '#e5e7eb', fontSize: 15, fontFamily: 'DM Sans, sans-serif',
        outline: 'none', boxSizing: 'border-box',
      }}
    />
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117', color: '#e5e7eb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 16px', fontFamily: 'DM Sans, sans-serif',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <OrgLogo height={40} dark={true} />
        <div style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>GPS Coordinate Capture</div>
      </div>

      <div style={{
        width: '100%', maxWidth: 440,
        background: '#161b22', border: '1px solid #21262d',
        borderRadius: 16, padding: '32px 28px',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#f0f6fc' }}>
          📍 Capture Site Location
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 28 }}>
          {site_code} — stand at the exact spot where staff clock in, then submit your coordinates.
        </p>

        {/* GPS accuracy meter */}
        <div style={{
          background: '#0d1117', border: '1px solid #21262d',
          borderRadius: 10, padding: '16px 18px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>GPS Signal</div>
          {!gps ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 14 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%', background: '#374151',
                animation: 'pulse 1.5s infinite',
              }} />
              Waiting for GPS signal…
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: accuracyColour }} />
                  <span style={{ fontSize: 14, color: accuracyColour, fontWeight: 700 }}>
                    ±{Math.round(gps.accuracy)} m accuracy
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {gps.accuracy <= ACCURACY_TARGET ? '✅ Ready' : 'Improving…'}
                </span>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#6b7280' }}>
                {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
              </div>
            </>
          )}
        </div>

        {/* Form — shown when GPS is available */}
        {(phase === 'ready' || phase === 'watching') && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6, display: 'block' }}>Your name (optional)</label>
              {input(capturedBy, setCapturedBy, 'e.g. John Smith')}
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6, display: 'block' }}>Notes (optional)</label>
              {input(notes, setNotes, 'e.g. Front entrance, near main doors')}
            </div>

            {phase === 'watching' && gps && (
              <div style={{
                background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f59e0b', marginBottom: 16,
              }}>
                Accuracy is ±{Math.round(gps.accuracy)} m — waiting for ≤{ACCURACY_TARGET} m to submit.
                You can still submit now if signal won't improve.
              </div>
            )}

            <button
              onClick={submit}
              disabled={!gps}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                background: gps ? c : '#374151', color: '#fff',
                fontSize: 16, fontWeight: 700, cursor: gps ? 'pointer' : 'not-allowed',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              📍 Submit My Location
            </button>
          </>
        )}

        {phase === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>
            Submitting coordinates…
          </div>
        )}

        {phase === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c, marginBottom: 8 }}>Location Submitted</div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>
              Your GPS coordinates have been sent to HR for review. Once approved, they will be used to verify clock-ins at this site.
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Error</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{errMsg}</div>
            <button
              onClick={() => { setPhase('watching'); setErrMsg('') }}
              style={{
                padding: '10px 24px', borderRadius: 8, border: `1px solid ${c}`,
                background: 'transparent', color: c, fontSize: 14, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#374151' }}>
        Powered by ShiftPortal
      </div>
    </div>
  )
}
