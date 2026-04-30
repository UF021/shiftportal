import { useEffect, useState } from 'react'
import { getOrgDocs, confirmDocRead } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const BASE = import.meta.env.VITE_API_URL || '/api'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB')
}

// ── Per-document card ─────────────────────────────────────────────────────────

function DocCard({ doc, c, onConfirmed }) {
  const [blobUrl,    setBlobUrl]    = useState(null)
  const [fetching,   setFetching]   = useState(false)
  const [err,        setErr]        = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed,  setConfirmed]  = useState(doc.confirmed)
  const [confirmedAt,setConfirmedAt]= useState(doc.confirmed_at)

  function openFile() {
    if (blobUrl) return
    setFetching(true); setErr('')
    const tok = localStorage.getItem('sp_token')
    fetch(`${BASE}/orgs/me/documents/${doc.doc_key}/file`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then(r => { if (!r.ok) throw new Error('not found'); return r.blob() })
      .then(blob => setBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setErr('Could not load document. Please try again.'))
      .finally(() => setFetching(false))
  }

  function closeModal() {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    setBlobUrl(null)
  }

  async function handleConfirm() {
    setConfirming(true)
    try {
      await confirmDocRead(doc.doc_key)
      const now = new Date().toISOString()
      setConfirmed(true)
      setConfirmedAt(now)
      onConfirmed(doc.doc_key)
      closeModal()
    } catch {
      setErr('Could not save confirmation. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const hasFile = doc.has_file
  const hasUrl  = !!doc.doc_url
  const canView = hasFile || hasUrl

  return (
    <>
      <div style={{
        background: '#fff',
        border: confirmed ? '1px solid #b0d0b0' : '1px solid #f0d0a0',
        borderRadius: 14,
        padding: '20px',
        marginBottom: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
        display: 'flex', alignItems: 'flex-start', gap: 16,
      }}>
        <div style={{
          fontSize: 28, lineHeight: 1, flexShrink: 0,
          background: confirmed ? '#f0f8f0' : '#fdf6ee',
          borderRadius: 10, padding: '10px 12px',
        }}>📄</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2a1a', lineHeight: 1.35 }}>
              {doc.doc_name}
            </div>
            {confirmed ? (
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(106,191,63,.15)', color: '#2e7d32', whiteSpace: 'nowrap',
              }}>
                ✓ Confirmed {fmtDate(confirmedAt)}
              </span>
            ) : canView ? (
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(208,128,32,.12)', color: '#8a5a00', whiteSpace: 'nowrap',
              }}>
                ⚠ Action Required
              </span>
            ) : null}
          </div>

          <div style={{ fontSize: 12, color: '#8aaa8a', marginBottom: 14 }}>
            {fmtDate(doc.updated_at) ? `Last updated: ${fmtDate(doc.updated_at)}` : 'Not yet uploaded'}
          </div>

          {err && <div style={{ fontSize: 12, color: '#e05555', marginBottom: 10 }}>⚠ {err}</div>}

          {canView ? (
            hasFile ? (
              <button onClick={openFile} disabled={fetching} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: fetching ? '#aaa' : c, color: '#fff',
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
                cursor: fetching ? 'wait' : 'pointer',
              }}>
                {fetching ? 'Loading…' : 'View Document →'}
              </button>
            ) : (
              <a href={doc.doc_url} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: c, color: '#fff',
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
                textDecoration: 'none',
              }}>
                View Document →
              </a>
            )
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '8px 18px', borderRadius: 8,
              background: '#f0f0f0', color: '#aaa',
              fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600,
              cursor: 'not-allowed',
            }}>
              Awaiting Upload
            </span>
          )}
        </div>
      </div>

      {/* PDF viewer modal */}
      {blobUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,.75)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1a2a1a', padding: '10px 20px', flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{doc.doc_name}</span>
            <button onClick={closeModal} style={{
              background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff',
              borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
            }}>✕ Close</button>
          </div>

          {/* PDF */}
          <iframe
            src={blobUrl}
            title={doc.doc_name}
            style={{ flex: 1, border: 'none', width: '100%', background: '#525659' }}
          />

          {/* Confirmation footer */}
          <div style={{
            background: confirmed ? '#f0f8f0' : '#fffbf0',
            borderTop: `2px solid ${confirmed ? '#b0d0b0' : '#f0c060'}`,
            padding: '16px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            flexShrink: 0,
          }}>
            {confirmed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#2e7d32', fontWeight: 700, fontSize: 14 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                You confirmed you have read and understood this document on {fmtDate(confirmedAt)}.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#6a4a00', lineHeight: 1.5 }}>
                  <strong>Please read the full document above before confirming.</strong><br />
                  This confirmation is required by HR and forms part of your employment record.
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  style={{
                    flexShrink: 0, padding: '12px 22px', borderRadius: 10, border: 'none',
                    background: confirming ? '#aaa' : '#2e7d32',
                    color: '#fff', fontFamily: 'DM Sans,sans-serif',
                    fontSize: 14, fontWeight: 800, cursor: confirming ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {confirming ? 'Saving…' : '✓ I have read and understood this document'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StaffDocuments() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  const [docs,    setDocs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOrgDocs()
      .then(r => setDocs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleConfirmed(doc_key) {
    setDocs(prev => prev.map(d =>
      d.doc_key === doc_key ? { ...d, confirmed: true, confirmed_at: new Date().toISOString() } : d
    ))
  }

  const availableDocs    = docs.filter(d => d.has_file || d.doc_url)
  const unconfirmedCount = availableDocs.filter(d => !d.confirmed).length

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2a1a', marginBottom: 4 }}>
          Employment Particulars
        </h2>
        <p style={{ fontSize: 13, color: '#6a8a6a', lineHeight: 1.5 }}>
          Company policies and documents issued by Ikan Facilities Management
        </p>
      </div>

      {/* Warning banner */}
      {!loading && unconfirmedCount > 0 && (
        <div style={{
          background: '#fffbf0', border: '1px solid #f0c060', borderRadius: 10,
          padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#6a4000', marginBottom: 4 }}>
              Action Required — {unconfirmedCount} document{unconfirmedCount !== 1 ? 's' : ''} awaiting confirmation
            </div>
            <div style={{ fontSize: 13, color: '#7a5000', lineHeight: 1.6 }}>
              You are required to read and confirm all employment documents below. Open each document and click
              <strong> "I have read and understood this document"</strong> at the bottom of the viewer.
              Your HR team has been notified of any outstanding confirmations.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8aaa8a', fontSize: 14 }}>
          Loading documents…
        </div>
      ) : (
        docs.map(doc => (
          <DocCard key={doc.doc_key} doc={doc} c={c} onConfirmed={handleConfirmed} />
        ))
      )}

      <div style={{
        background: '#f8fbf8', border: '1px solid #e0ead0', borderRadius: 10,
        padding: '12px 16px', fontSize: 12, color: '#8aaa8a', marginTop: 8, lineHeight: 1.6,
      }}>
        These documents are managed by HR. Contact{' '}
        <a href="mailto:hr@ikanfm.co.uk" style={{ color: c, fontWeight: 600, textDecoration: 'none' }}>
          hr@ikanfm.co.uk
        </a>{' '}
        if you have any questions.
      </div>
    </div>
  )
}
