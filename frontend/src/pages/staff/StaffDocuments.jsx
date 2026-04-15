import { useEffect, useState } from 'react'
import { getOrgDocs } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB')
}

function DocCard({ doc, c }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0ead0', borderRadius: 14,
      padding: '20px 20px', marginBottom: 14,
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

        {doc.doc_url ? (
          <a href={doc.doc_url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: c, color: '#fff',
              fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
              textDecoration: 'none', cursor: 'pointer',
            }}>
            View Document →
          </a>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
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
  )
}

export default function StaffDocuments() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  const [docs, setDocs] = useState([])
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
