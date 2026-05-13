import { useEffect, useState } from 'react'
import { getIncidents, reviewIncident } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const BASE = (import.meta.env.VITE_API_URL || '/api')

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

function Badge({ children, colour = '#6a8a6a', bg = '#f0f4f0' }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 4, background: bg, color: colour,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

function PhotoThumb({ src, label }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={label}
        onClick={() => setOpen(true)}
        style={{
          width: 70, height: 55, objectFit: 'cover', borderRadius: 6,
          cursor: 'zoom-in', border: '1px solid #e0ead0',
        }}
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={src}
            alt={label}
            style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, objectFit: 'contain' }}
          />
          <button
            style={{
              position: 'absolute', top: 16, right: 20, background: 'none', border: 'none',
              color: '#fff', fontSize: 28, cursor: 'pointer',
            }}
            onClick={() => setOpen(false)}
          >✕</button>
        </div>
      )}
    </>
  )
}

function IncidentDetail({ inc, onClose, onReview, colour }) {
  const c = colour || '#6abf3f'
  const token = localStorage.getItem('sp_token')
  const photoUrl = (n) =>
    `${BASE}/incidents/${inc.id}/photo/${n}?token=${token}`

  function Section({ title, children }) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
          {title}
        </div>
        {children}
      </div>
    )
  }

  function Row({ label, value, mono }) {
    return (
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 160, fontSize: 12, color: '#8a9a8a', flexShrink: 0 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? 'DM Mono,monospace' : 'inherit' }}>{value ?? '—'}</div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '24px 16px',
    }}>
      <div style={{
        background: 'var(--navy-mid)', borderRadius: 16, border: '1px solid var(--border)',
        width: '100%', maxWidth: 720, padding: '28px 28px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Incident Report #{inc.id}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Submitted {fmtDt(inc.submitted_at)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {!inc.reviewed && (
              <button
                onClick={() => onReview(inc.id)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: c, color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                }}
              >Mark Reviewed</button>
            )}
            {inc.reviewed && (
              <Badge colour="#2e7d32" bg="rgba(106,191,63,.12)">✓ Reviewed {fmtDt(inc.reviewed_at)}</Badge>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
            >✕</button>
          </div>
        </div>

        <Section title="Staff Details">
          <Row label="Staff Name"  value={inc.staff_name} />
          <Row label="Staff ID"    value={inc.staff_id}   mono />
        </Section>

        <Section title="Incident Details">
          <Row label="Date"          value={fmtDate(inc.date_of_incident)} />
          <Row label="Time"          value={inc.time_of_incident} mono />
          <Row label="Site Location" value={inc.site_location} />
        </Section>

        <Section title="Emergency Services">
          <Row
            label="Police / emergency services called"
            value={inc.police_called
              ? <Badge colour="#a02020" bg="rgba(224,85,85,.12)">Yes</Badge>
              : <Badge>No</Badge>}
          />
          {inc.police_called && (
            <>
              <Row label="Officer Name"    value={inc.officer_name} />
              <Row label="Collar / Badge"  value={inc.collar_number} mono />
            </>
          )}
        </Section>

        <Section title="Duty Manager">
          <Row
            label="Duty Manager called"
            value={inc.duty_manager_called
              ? <Badge colour="#b45309" bg="rgba(251,191,36,.12)">Yes</Badge>
              : <Badge>No</Badge>}
          />
          {inc.duty_manager_called && (
            <Row label="Manager Name" value={inc.duty_manager_name} />
          )}
        </Section>

        <Section title="Injuries">
          <Row
            label="Injuries reported"
            value={inc.injuries
              ? <Badge colour="#a02020" bg="rgba(224,85,85,.12)">Yes</Badge>
              : <Badge>No</Badge>}
          />
          {inc.injuries && inc.injury_description && (
            <div style={{ padding: '10px 12px', background: 'rgba(224,85,85,.06)', borderRadius: 8, border: '1px solid rgba(224,85,85,.2)', fontSize: 13, lineHeight: 1.6 }}>
              {inc.injury_description}
            </div>
          )}
        </Section>

        {/* Photos */}
        {(inc.has_photo_1 || inc.has_photo_2 || inc.has_photo_3) && (
          <Section title="Attached Photos">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {inc.has_photo_1 && <PhotoThumb src={photoUrl(1)} label="Photo 1" />}
              {inc.has_photo_2 && <PhotoThumb src={photoUrl(2)} label="Photo 2" />}
              {inc.has_photo_3 && <PhotoThumb src={photoUrl(3)} label="Photo 3" />}
            </div>
          </Section>
        )}

        {/* Statement */}
        <Section title="Staff Statement">
          <div style={{
            padding: '14px 16px', background: 'var(--navy-light)', borderRadius: 10,
            border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.8,
            whiteSpace: 'pre-wrap', color: 'var(--text)',
          }}>
            {inc.statement}
          </div>
        </Section>
      </div>
    </div>
  )
}

export default function HRIncidents() {
  const { colour } = useBrand()
  const c          = colour || '#6abf3f'

  const [data,     setData]    = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter,   setFilter]  = useState('all')   // 'all' | 'pending' | 'reviewed'
  const [search,   setSearch]  = useState('')

  const load = () =>
    getIncidents()
      .then(r => setData(r.data))
      .catch(() => setData([]))

  useEffect(() => { load() }, [])

  async function handleReview(id) {
    await reviewIncident(id)
    await load()
    setSelected(s => s ? { ...s, reviewed: true, reviewed_at: new Date().toISOString() } : s)
  }

  const filtered = (data || []).filter(r => {
    if (filter === 'pending'  && r.reviewed)  return false
    if (filter === 'reviewed' && !r.reviewed) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        r.staff_name?.toLowerCase().includes(q) ||
        r.staff_id?.toLowerCase().includes(q) ||
        r.site_location?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const pending  = (data || []).filter(r => !r.reviewed).length
  const reviewed = (data || []).filter(r => r.reviewed).length

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h1 className="hr-page-title">Incident Reports</h1>
          <p className="hr-page-subtitle">Review and manage staff-submitted incident reports</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Reports',     val: data?.length ?? '…', col: c },
          { label: 'Awaiting Review',   val: data ? pending : '…',  col: pending > 0 ? '#e05555' : '#6a8a6a' },
          { label: 'Reviewed',          val: data ? reviewed : '…', col: '#2e7d32' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: col, fontFamily: 'DM Mono,monospace' }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name, staff ID, or site…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--navy-light)',
            color: 'var(--text)', fontSize: 13,
          }}
        />
        {['all', 'pending', 'reviewed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: '1px solid var(--border)',
              background: filter === f ? c : 'var(--navy-light)',
              color: filter === f ? '#fff' : 'var(--text-muted)',
            }}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Reviewed'}
          </button>
        ))}
      </div>

      {/* Table */}
      {data === null ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No incident reports found.</p>
      ) : (
        <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Staff', 'Date / Time', 'Site', 'Police', 'Injuries', 'Photos', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--navy-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700 }}>{r.staff_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>{r.staff_id}</div>
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600 }}>{fmtDate(r.date_of_incident)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>{r.time_of_incident}</div>
                  </td>
                  <td style={{ padding: '12px 14px', maxWidth: 180 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.site_location}</div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.police_called
                      ? <Badge colour="#a02020" bg="rgba(224,85,85,.15)">Yes</Badge>
                      : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.injuries
                      ? <Badge colour="#a02020" bg="rgba(224,85,85,.15)">Yes</Badge>
                      : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {[r.has_photo_1, r.has_photo_2, r.has_photo_3].filter(Boolean).length > 0
                      ? <span style={{ fontSize: 12 }}>📷 {[r.has_photo_1, r.has_photo_2, r.has_photo_3].filter(Boolean).length}</span>
                      : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.reviewed
                      ? <Badge colour="#2e7d32" bg="rgba(106,191,63,.12)">Reviewed</Badge>
                      : <Badge colour="#b45309" bg="rgba(251,191,36,.12)">Pending</Badge>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setSelected(r) }}
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)', fontSize: 12,
                        cursor: 'pointer', fontWeight: 600,
                      }}
                    >View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <IncidentDetail
          inc={selected}
          onClose={() => setSelected(null)}
          onReview={handleReview}
          colour={c}
        />
      )}
    </div>
  )
}
