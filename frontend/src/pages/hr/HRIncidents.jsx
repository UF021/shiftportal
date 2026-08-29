import { useEffect, useState } from 'react'
import {
  getIncidents, reviewIncident, forwardIncident, triggerIncidentReminders,
  getAutoForwards, upsertAutoForward, deleteAutoForward, getMySites,
} from '../../api/client'
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
      <img src={src} alt={label} onClick={() => setOpen(true)}
        style={{ width: 70, height: 55, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #e0ead0' }} />
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={src} alt={label} style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, objectFit: 'contain' }} />
          <button style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}
            onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
    </>
  )
}

function IncidentDetail({ inc, onClose, onReview, onForward, colour }) {
  const c = colour || '#6abf3f'
  const token = localStorage.getItem('sp_token')
  const photoUrl = (n) => `${BASE}/incidents/${inc.id}/photo/${n}?token=${token}`

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}>
      <div style={{ background: 'var(--navy-mid)', borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 720, padding: '28px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Incident Report #{inc.id}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Submitted {fmtDt(inc.submitted_at)}</div>
            {inc.forwarded_to && (
              <div style={{ fontSize: 11, color: '#6abf3f', marginTop: 4 }}>
                ↗ Forwarded to: {inc.forwarded_to}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onForward(inc)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              ↗ Forward</button>
            {!inc.reviewed && (
              <button onClick={() => onReview(inc.id)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: c, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Mark Reviewed</button>
            )}
            {inc.reviewed && (
              <Badge colour="#2e7d32" bg="rgba(106,191,63,.12)">✓ Reviewed {fmtDt(inc.reviewed_at)}</Badge>
            )}
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <Section title="Staff Details">
          <Row label="Staff Name" value={inc.staff_name} />
          <Row label="Staff ID"   value={inc.staff_id}   mono />
        </Section>
        <Section title="Incident Details">
          <Row label="Date"          value={fmtDate(inc.date_of_incident)} />
          <Row label="Time"          value={inc.time_of_incident} mono />
          <Row label="Site Location" value={inc.site_location} />
        </Section>
        <Section title="Emergency Services">
          <Row label="Police / emergency services called"
            value={inc.police_called
              ? <Badge colour="#a02020" bg="rgba(224,85,85,.12)">Yes</Badge>
              : <Badge>No</Badge>} />
          {inc.police_called && (<>
            <Row label="Officer Name"   value={inc.officer_name} />
            <Row label="Collar / Badge" value={inc.collar_number} mono />
          </>)}
        </Section>
        <Section title="Duty Manager">
          <Row label="Duty Manager called"
            value={inc.duty_manager_called
              ? <Badge colour="#b45309" bg="rgba(251,191,36,.12)">Yes</Badge>
              : <Badge>No</Badge>} />
          {inc.duty_manager_called && <Row label="Manager Name" value={inc.duty_manager_name} />}
        </Section>
        <Section title="Injuries">
          <Row label="Injuries reported"
            value={inc.injuries
              ? <Badge colour="#a02020" bg="rgba(224,85,85,.12)">Yes</Badge>
              : <Badge>No</Badge>} />
          {inc.injuries && inc.injury_description && (
            <div style={{ padding: '10px 12px', background: 'rgba(224,85,85,.06)', borderRadius: 8, border: '1px solid rgba(224,85,85,.2)', fontSize: 13, lineHeight: 1.6 }}>
              {inc.injury_description}
            </div>
          )}
        </Section>
        {(inc.has_photo_1 || inc.has_photo_2 || inc.has_photo_3) && (
          <Section title="Attached Photos">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {inc.has_photo_1 && <PhotoThumb src={photoUrl(1)} label="Photo 1" />}
              {inc.has_photo_2 && <PhotoThumb src={photoUrl(2)} label="Photo 2" />}
              {inc.has_photo_3 && <PhotoThumb src={photoUrl(3)} label="Photo 3" />}
            </div>
          </Section>
        )}
        <Section title="Staff Statement">
          <div style={{ padding: '14px 16px', background: 'var(--navy-light)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {inc.statement}
          </div>
        </Section>
      </div>
    </div>
  )
}

function AutoForwardSettings({ colour }) {
  const c = colour || '#6abf3f'
  const [open,      setOpen]   = useState(false)
  const [rules,     setRules]  = useState([])
  const [sites,     setSites]  = useState([])
  const [selIds,    setSelIds] = useState(new Set())   // selected site IDs (numbers)
  const [emails,    setEmails] = useState('')
  const [saving,    setSaving] = useState(false)
  const [msg,       setMsg]    = useState('')

  const loadRules = () =>
    getAutoForwards().then(r => setRules(r.data || [])).catch(() => {})

  useEffect(() => {
    getMySites().then(r => setSites(r.data || [])).catch(() => {})
    loadRules()
  }, [])

  function toggleSite(id) {
    setSelIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!selIds.size || !emails.trim()) return
    setSaving(true); setMsg('')
    try {
      await Promise.all(
        [...selIds].map(id => {
          const site = sites.find(s => s.id === id)
          return upsertAutoForward({ site_id: site.id, site_name: site.name, emails: emails.trim() })
        })
      )
      setMsg(`Saved ${selIds.size} rule${selIds.size > 1 ? 's' : ''}`)
      setSelIds(new Set()); setEmails('')
      loadRules()
    } catch (ex) {
      setMsg(ex.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  async function handleDelete(id) {
    await deleteAutoForward(id).catch(() => {})
    loadRules()
  }

  const allSelected = sites.length > 0 && sites.every(s => selIds.has(s.id))

  function toggleAll() {
    if (allSelected) {
      setSelIds(new Set())
    } else {
      setSelIds(new Set(sites.map(s => s.id)))
    }
  }

  return (
    <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700 }}>
        <span>⚙ Auto-Forward Settings</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
          {rules.length} rule{rules.length !== 1 ? 's' : ''} configured {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '12px 0 16px' }}>
            Incident reports submitted from a matching site are automatically emailed to the configured address(es) the moment they are filed.
          </p>

          {/* Existing rules */}
          {rules.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {rules.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.site_name}</div>
                    <div style={{ fontSize: 12, color: '#6abf3f', marginTop: 2 }}>{r.emails}</div>
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(224,85,85,.4)', background: 'rgba(224,85,85,.08)', color: '#e05555', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add rule form */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* Site multi-select checkbox list */}
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }}>
                Sites {selIds.size > 0 && <span style={{ color: c }}>({selIds.size} selected)</span>}
              </label>
              <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', padding: '6px 0' }}>
                {sites.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, padding: '8px 12px' }}>No sites configured</p>
                )}
                {sites.length > 1 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      style={{ accentColor: c, width: 14, height: 14 }} />
                    Select all
                  </label>
                )}
                {sites.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px', cursor: 'pointer', fontSize: 13, background: selIds.has(s.id) ? `${c}18` : 'transparent' }}>
                    <input type="checkbox" checked={selIds.has(s.id)} onChange={() => toggleSite(s.id)}
                      style={{ accentColor: c, width: 14, height: 14 }} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Email + save */}
            <div style={{ flex: '2 1 220px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }}>Email address(es)</label>
                <input
                  type="text" value={emails} onChange={e => setEmails(e.target.value)}
                  placeholder="manager@site.com, client@example.com"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy)', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !selIds.size || !emails.trim()}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: c, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (saving || !selIds.size || !emails.trim()) ? 0.5 : 1, fontFamily: 'DM Sans,sans-serif' }}>
                {saving ? 'Saving…' : `Save Rule${selIds.size > 1 ? 's' : ''}`}
              </button>
              {msg && <p style={{ fontSize: 12, color: msg.startsWith('Saved') ? '#6abf3f' : '#e05555', margin: 0 }}>{msg}</p>}
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Separate multiple emails with commas. Saving a rule for a site that already has one updates it.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HRIncidents() {
  const { colour } = useBrand()
  const c          = colour || '#6abf3f'

  const [data,          setData]         = useState(null)
  const [selected,      setSelected]     = useState(null)
  const [filter,        setFilter]       = useState('all')
  const [search,        setSearch]       = useState('')
  const [forwardInc,    setForwardInc]   = useState(null)
  const [forwardEmails, setForwardEmails] = useState('')
  const [forwarding,    setForwarding]   = useState(false)
  const [forwardResult, setForwardResult] = useState(null)
  const [triggerBusy,   setTriggerBusy]  = useState(false)
  const [triggerMsg,    setTriggerMsg]   = useState('')

  const load = () =>
    getIncidents()
      .then(r => setData(r.data))
      .catch(() => setData([]))

  useEffect(() => { load() }, [])

  async function handleReview(id) {
    await reviewIncident(id)
    await load()
    setSelected(null)
  }

  function openForward(inc) {
    setForwardInc(inc)
    setForwardEmails('')
    setForwardResult(null)
  }

  async function handleForward() {
    if (!forwardEmails.trim()) return
    setForwarding(true); setForwardResult(null)
    try {
      await forwardIncident(forwardInc.id, forwardEmails)
      setForwardResult({ ok: true, msg: `Forwarded to ${forwardEmails}` })
      await load()
      setTimeout(() => { setForwardInc(null); setForwardResult(null) }, 2500)
    } catch (ex) {
      setForwardResult({ ok: false, msg: ex.response?.data?.detail || 'Forward failed.' })
    } finally {
      setForwarding(false)
    }
  }

  async function handleTriggerReminders() {
    setTriggerBusy(true); setTriggerMsg('')
    try {
      await triggerIncidentReminders()
      setTriggerMsg('Reminder emails are being sent to qualifying staff.')
    } catch {
      setTriggerMsg('Failed to trigger reminders.')
    } finally {
      setTriggerBusy(false)
      setTimeout(() => setTriggerMsg(''), 6000)
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {triggerMsg && (
            <span style={{ fontSize: 12, color: triggerMsg.includes('Fail') ? '#fca5a5' : '#6abf3f' }}>{triggerMsg}</span>
          )}
          <button onClick={handleTriggerReminders} disabled={triggerBusy}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--navy-mid)', color: 'var(--text-muted)', cursor: triggerBusy ? 'not-allowed' : 'pointer', opacity: triggerBusy ? 0.6 : 1 }}>
            {triggerBusy ? 'Sending…' : 'Send Filing Reminders'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Reports',   val: data?.length ?? '…', col: c },
          { label: 'Awaiting Review', val: data ? pending : '…', col: pending > 0 ? '#e05555' : '#6a8a6a' },
          { label: 'Reviewed',        val: data ? reviewed : '…', col: '#2e7d32' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: col, fontFamily: 'DM Mono,monospace' }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Auto-forward settings */}
      <AutoForwardSettings colour={c} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search by name, staff ID, or site…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy-light)', color: 'var(--text)', fontSize: 13 }} />
        {['all', 'pending', 'reviewed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: filter === f ? c : 'var(--navy-light)', color: filter === f ? '#fff' : 'var(--text-muted)' }}>
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
                {['Staff', 'Date / Time', 'Site', 'Police', 'Injuries', 'Photos', 'Forwarded To', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onClick={() => setSelected(r)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--navy-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700 }}>{r.staff_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>{r.staff_id}</div>
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600 }}>{fmtDate(r.date_of_incident)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>{r.time_of_incident}</div>
                  </td>
                  <td style={{ padding: '12px 14px', maxWidth: 160 }}>
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
                  <td style={{ padding: '12px 14px', maxWidth: 180 }}>
                    {r.forwarded_to
                      ? (
                        <div title={r.forwarded_to}>
                          <span style={{ fontSize: 11, color: '#6abf3f', fontWeight: 600 }}>↗ </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 140, verticalAlign: 'middle' }}>
                            {r.forwarded_to}
                          </span>
                        </div>
                      )
                      : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.reviewed
                      ? <Badge colour="#2e7d32" bg="rgba(106,191,63,.12)">Reviewed</Badge>
                      : <Badge colour="#b45309" bg="rgba(251,191,36,.12)">Pending</Badge>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={e => { e.stopPropagation(); setSelected(r) }}
                      style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      View
                    </button>
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
          onForward={inc => { setSelected(null); openForward(inc) }}
          colour={c}
        />
      )}

      {/* Forward modal */}
      {forwardInc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Forward Incident Report #{forwardInc.id}
            </h3>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-muted)' }}>
              {forwardInc.date_of_incident} · {forwardInc.site_location}
            </p>
            {forwardInc.forwarded_to && (
              <p style={{ margin: '0 0 14px', fontSize: 11, color: '#6abf3f' }}>
                Already forwarded to: {forwardInc.forwarded_to}
              </p>
            )}

            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
              Recipient Email Addresses
            </label>
            <textarea value={forwardEmails} onChange={e => setForwardEmails(e.target.value)}
              placeholder="e.g. manager@site.com, client@example.com" rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--navy)', color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
              Separate multiple addresses with commas. All incident fields and photos will be included.
            </p>

            {forwardResult && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: forwardResult.ok ? 'rgba(106,191,63,.1)' : '#2d1515', border: `1px solid ${forwardResult.ok ? '#6abf3f' : '#e05555'}`, color: forwardResult.ok ? '#6abf3f' : '#fca5a5' }}>
                {forwardResult.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => { setForwardInc(null); setForwardResult(null) }}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                Cancel
              </button>
              <button onClick={handleForward} disabled={forwarding || !forwardEmails.trim()}
                style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: c, color: '#fff', fontSize: 13, fontWeight: 700, cursor: (forwarding || !forwardEmails.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif', opacity: (forwarding || !forwardEmails.trim()) ? 0.6 : 1 }}>
                {forwarding ? 'Sending…' : 'Forward Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
