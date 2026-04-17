// HRGPSCaptures.jsx — HR page for reviewing GPS coordinate submissions
import { useEffect, useState } from 'react'
import { getGpsCaptures, approveGpsCapture, rejectGpsCapture } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
}

export default function HRGPSCaptures() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [captures, setCaptures] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busy,     setBusy]     = useState(null)    // capture id currently being actioned
  const [toast,    setToast]    = useState('')

  function load() {
    setLoading(true)
    getGpsCaptures()
      .then(r => setCaptures(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  async function approve(capture) {
    setBusy(capture.id)
    try {
      await approveGpsCapture(capture.site_id, capture.id)
      showToast(`✅ GPS set for ${capture.site_name}`)
      load()
    } catch (ex) {
      showToast('❌ ' + (ex.response?.data?.detail || 'Failed'))
    } finally {
      setBusy(null)
    }
  }

  async function reject(capture) {
    if (!confirm(`Reject this submission for ${capture.site_name}?`)) return
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

  function exportCsv() {
    const rows = [
      ['Site', 'Code', 'Latitude', 'Longitude', 'Accuracy (m)', 'Captured By', 'Notes', 'Status', 'Submitted At'],
      ...captures.map(c => [
        c.site_name, c.site_code,
        c.latitude, c.longitude,
        c.accuracy != null ? Math.round(c.accuracy) : '',
        c.captured_by || '',
        c.notes || '',
        c.approved ? 'Approved' : 'Pending',
        c.captured_at ? new Date(c.captured_at).toISOString() : '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `GPS-Captures-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const pending  = captures.filter(c => !c.approved)
  const approved = captures.filter(c =>  c.approved)

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
      <div style={{ marginBottom: 26, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>GPS Captures</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Review GPS coordinates submitted by staff — approve to update a site's location
          </p>
        </div>
        {captures.length > 0 && (
          <button onClick={exportCsv} className="btn btn-outline" style={{ fontSize: 13 }}>
            📥 Export CSV
          </button>
        )}
      </div>

      {/* Pending captures */}
      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        Pending Review — {pending.length}
      </div>

      {pending.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', marginBottom: 24 }}>
          No pending submissions.
        </div>
      ) : (
        <div style={{ marginBottom: 32 }}>
          {pending.map(cap => (
            <div key={cap.id} className="card" style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              {/* Site + meta */}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{cap.site_name}</div>
                <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 4 }}>
                  {cap.site_code}
                </div>
                <div style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: c, marginBottom: 4 }}>
                  {cap.latitude.toFixed(6)}, {cap.longitude.toFixed(6)}
                </div>
                {cap.accuracy != null && (
                  <div style={{ fontSize: 12, color: cap.accuracy <= 20 ? '#6abf3f' : cap.accuracy <= 50 ? '#f59e0b' : '#ef4444' }}>
                    ±{Math.round(cap.accuracy)} m accuracy
                  </div>
                )}
              </div>

              {/* Captured by + notes + time */}
              <div style={{ flex: 1, minWidth: 200 }}>
                {cap.captured_by && (
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>By: </span>{cap.captured_by}
                  </div>
                )}
                {cap.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{cap.notes}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(cap.captured_at)}</div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, alignSelf: 'center' }}>
                <button
                  onClick={() => approve(cap)}
                  disabled={busy === cap.id}
                  className="btn btn-brand"
                  style={{ fontSize: 13, padding: '8px 16px' }}
                >
                  {busy === cap.id ? '…' : '✅ Approve & Set'}
                </button>
                <button
                  onClick={() => reject(cap)}
                  disabled={busy === cap.id}
                  className="btn btn-danger"
                  style={{ fontSize: 13, padding: '8px 16px' }}
                >
                  🗑️ Reject
                </button>
              </div>

              {/* Google Maps preview link */}
              <a
                href={`https://www.google.com/maps?q=${cap.latitude},${cap.longitude}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}
              >
                🗺️ View map
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Approved captures */}
      {approved.length > 0 && (
        <>
          <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Approved — {approved.length}
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Coordinates</th>
                    <th>Accuracy</th>
                    <th>Captured By</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map(cap => (
                    <tr key={cap.id}>
                      <td>
                        <strong>{cap.site_name}</strong>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{cap.site_code}</div>
                      </td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: c }}>
                        {cap.latitude.toFixed(6)}, {cap.longitude.toFixed(6)}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {cap.accuracy != null ? `±${Math.round(cap.accuracy)} m` : '—'}
                      </td>
                      <td style={{ fontSize: 13 }}>{cap.captured_by || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(cap.captured_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
