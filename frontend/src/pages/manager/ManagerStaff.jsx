import { useEffect, useState } from 'react'
import { useBrand } from '../../api/BrandContext'
import api from '../../api/client'

function siaStatus(exp) {
  if (!exp) return null
  const days = Math.ceil((new Date(exp) - new Date()) / 86400000)
  if (days < 0)  return { label: 'Expired', col: '#fca5a5', bg: 'rgba(239,68,68,.12)' }
  if (days < 60) return { label: `${days}d`, col: '#fcd34d', bg: 'rgba(234,179,8,.12)' }
  return { label: 'Valid', col: '#86efac', bg: 'rgba(22,163,74,.12)' }
}

export default function ManagerStaff() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [staff,   setStaff]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    api.get('/manager/staff')
      .then(r => setStaff(r.data || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = (staff || []).filter(s =>
    !search || [s.full_name, s.email, s.sia_licence].some(f => f?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>My Staff</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {!loading && staff !== null ? `${staff.length} staff at your site` : 'Loading…'}
        </div>
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, email or SIA…"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 9,
          border: '1px solid var(--border)', background: 'var(--navy-mid)',
          color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13,
          outline: 'none', boxSizing: 'border-box', marginBottom: 14,
        }}
      />

      {/* List */}
      <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No staff found.</div>
        ) : filtered.map((s, i) => {
          const sia = siaStatus(s.sia_expiry)
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: c + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: c, flexShrink: 0 }}>
                {s.full_name?.[0] || '?'}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.full_name}
                  {s.is_blocked && <span style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5', background: 'rgba(239,68,68,.12)', padding: '1px 6px', borderRadius: 4 }}>Blocked</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {s.phone || '—'} · {s.email}
                </div>
              </div>

              {/* SIA badge */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {s.sia_licence && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{s.sia_licence}</div>
                )}
                {sia ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: sia.bg, color: sia.col }}>
                    {sia.label}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>No SIA</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
