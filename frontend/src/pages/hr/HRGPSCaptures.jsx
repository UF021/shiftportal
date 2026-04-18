// HRGPSCaptures.jsx — HR GPS capture review page
import { useEffect, useState } from 'react'
import { getGpsCaptures, approveGpsCapture, rejectGpsCapture, getMySites } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const CAPTURE_LINK = 'https://portal.ikanfm.co.uk/capture-gps'

function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

export default function HRGPSCaptures() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [captures,  setCaptures]  = useState([])
  const [sites,     setSites]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(null)
  const [toast,     setToast]     = useState('')
  const [matches,   setMatches]   = useState({})    // { captureId: siteId }
  const [linkCopied, setLinkCopied] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([getGpsCaptures(), getMySites()])
      .then(([cr, sr]) => {
        setCaptures(cr.data || [])
        setSites(sr.data   || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  function setMatch(captureId, siteId) {
    setMatches(m => ({ ...m, [captureId]: siteId }))
  }

  async function approve(capture) {
    const siteId = matches[capture.id]
    if (!siteId) { showToast('⚠️ Please select a site to match first'); return }
    setBusy(capture.id)
    try {
      await approveGpsCapture(capture.id, { site_id: Number(siteId) })
      showToast(`✅ GPS set for selected site`)
      load()
    } catch (ex) {
      showToast('❌ ' + (ex.response?.data?.detail || 'Failed'))
    } finally {
      setBusy(null)
    }
  }

  async function reject(capture) {
    if (!confirm(`Reject submission from ${capture.captured_by || 'unknown'} for "${capture.site_name}"?`)) return
    setBusy(capture.id)
    try {
      await rejectGpsCapture(capture.id)
      showToast('🗑️ Submission rejected')
      load()
    } catch (ex) {
      showToast('❌ ' + (ex.response?.data?.detail || 'Failed'))
    } finally {
      setBusy(null)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(CAPTURE_LINK).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40 }}>Loading…</p>

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: '#1e2530', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 20px', fontSize: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,.5)', color: 'var(--text)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>GPS Captures</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Review GPS coordinates submitted by staff — match each to a site and approve.
        </p>
      </div>

      {/* Capture link banner */}
      <div className="card" style={{ marginBottom: 28, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>📍 Staff Capture Link</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Share this single link with any staff member. They enter their name and site, then submit their GPS location.
          </div>
          <div style={{
            fontFamily: 'DM Mono, monospace', fontSize: 13, color: c,
            background: 'var(--navy-light)', borderRadius: 8, padding: '8px 12px',
            wordBreak: 'break-all',
          }}>
            {CAPTURE_LINK}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={copyLink} className="btn btn-brand" style={{ fontSize: 13 }}>
            {linkCopied ? '✅ Copied' : '📋 Copy Link'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent('Please open this link, stand at the main entrance, and submit your GPS location: ' + CAPTURE_LINK)}`}
            target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: '1px solid #25D366',
              color: '#25D366', fontSize: 13, textDecoration: 'none', fontFamily: 'DM Sans, sans-serif',
              fontWeight: 600,
            }}
          >
            📱 WhatsApp
          </a>
        </div>
      </div>

      {/* Pending submissions */}
      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        Pending Review — {captures.length}
      </div>

      {captures.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No pending GPS submissions.
        </div>
      ) : (
        captures.map(cap => (
          <div key={cap.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>

              {/* Submission info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
                  {cap.captured_by || <span style={{ color: 'var(--text-muted)' }}>Unknown</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                  📍 "{cap.site_name}"
                </div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: c, marginBottom: 4 }}>
                  {cap.latitude.toFixed(6)}, {cap.longitude.toFixed(6)}
                </div>
                {cap.accuracy != null && (
                  <div style={{
                    fontSize: 12,
                    color: cap.accuracy <= 20 ? '#6abf3f' : cap.accuracy <= 50 ? '#f59e0b' : '#ef4444',
                    marginBottom: 4,
                  }}>
                    ±{Math.round(cap.accuracy)} metres accuracy
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(cap.captured_at)}</div>
              </div>

              {/* Site matcher + actions */}
              <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>
                  Match to site:
                </div>
                <select
                  value={matches[cap.id] || ''}
                  onChange={e => setMatch(cap.id, e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--navy-light)',
                    color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                    outline: 'none',
                  }}
                >
                  <option value="">— Select a site —</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => approve(cap)}
                    disabled={busy === cap.id || !matches[cap.id]}
                    className="btn btn-brand"
                    style={{ flex: 1, fontSize: 13, padding: '9px 14px' }}
                  >
                    {busy === cap.id ? '…' : '✅ Approve & Set'}
                  </button>
                  <button
                    onClick={() => reject(cap)}
                    disabled={busy === cap.id}
                    className="btn btn-danger"
                    style={{ flex: 1, fontSize: 13, padding: '9px 14px' }}
                  >
                    🗑️ Reject
                  </button>
                </div>

                <a
                  href={`https://www.google.com/maps?q=${cap.latitude},${cap.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}
                >
                  🗺️ View on Google Maps
                </a>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  )
}
