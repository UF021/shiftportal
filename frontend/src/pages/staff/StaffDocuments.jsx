import { useEffect, useState } from 'react'
import { getOrgDocs } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const BASE = import.meta.env.VITE_API_URL || '/api'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB')
}

// ── Per-document card with its own viewer state ──────────────────────────────

function DocCard({ doc, c }) {
  const [blobUrl,  setBlobUrl]  = useState(null)
  const [fetching, setFetching] = useState(false)
  const [err,      setErr]      = useState('')

  function openFile() {
    if (blobUrl) return          // already fetched — just re-open
    setFetching(true); setErr('')
    const tok = localStorage.getItem('sp_token')
    fetch(`${BASE}/orgs/me/documents/${doc.doc_key}/file`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.blob()
      })
      .then(blob => setBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setErr('Could not load document. Please try again.'))
      .finally(() => setFetching(false))
  }

  function closeModal() {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    setBlobUrl(null)
  }

  const hasFile = doc.has_file
  const hasUrl  = !!doc.doc_url
  const canView = hasFile || hasUrl

  return (
    <>
      <div style={{
        background: '#fff', border: '1px solid #e0ead0', borderRadius: 14,
        padding: '20px', marginBottom: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
        display: 'flex', alignItems: 'flex-start', gap: 16,
      }}>
        <div style={{
          fontSize: 28, lineHeight: 1, flexShrink: 0,
          background: '#f0f8f0', borderRadius: 10, padding: '10px 12px',
        }}>📄</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2a1a', marginBottom: 4, lineHeight: 1.35 }}>
            {doc.doc_name}
          </div>
          <div style={{ fontSize: 12, color: '#8aaa8a', marginBottom: 14 }}>
            {fmtDate(doc.updated_at)
              ? `Last updated: ${fmtDate(doc.updated_at)}`
              : 'Not yet uploaded'}
          </div>

          {err && (
            <div style={{ fontSize: 12, color: '#e05555', marginBottom: 10 }}>⚠ {err}</div>
          )}

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
          {/* Modal header */}
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

          {/* PDF iframe */}
          <iframe
            src={blobUrl}
            title={doc.doc_name}
            style={{ flex: 1, border: 'none', width: '100%', background: '#525659' }}
          />
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8aaa8a', fontSize: 14 }}>
          Loading documents…
        </div>
      ) : (
        docs.map(doc => <DocCard key={doc.doc_key} doc={doc} c={c} />)
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
