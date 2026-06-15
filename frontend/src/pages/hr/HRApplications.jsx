// HRApplications.jsx
import { useEffect, useState } from 'react'
import { getApplications, getApplication, updateAppStatus, resendRegistrationEmail, deleteApplication } from '../../api/client'
import { useBrand } from '../../api/BrandContext'
import { fmtDateTime } from '../../api/utils'

const BASE = import.meta.env.VITE_API_URL || '/api'

const STATUS_CFG = {
  submitted:    { label:'📋 Submitted',    bg:'rgba(120,140,120,.15)', col:'#5a7a5a' },
  under_review: { label:'🔍 Under Review', bg:'rgba(240,160,48,.15)',  col:'#8a5a00' },
  accepted:     { label:'✅ Accepted',     bg:'rgba(106,191,63,.15)',  col:'#2e7d32' },
  rejected:     { label:'✗ Rejected',     bg:'rgba(224,85,85,.15)',   col:'#a02020' },
}

const TABS = [
  { key:'all',          label:'All' },
  { key:'submitted',    label:'Submitted' },
  { key:'under_review', label:'Under Review' },
  { key:'accepted',     label:'Accepted' },
  { key:'rejected',     label:'Rejected' },
]

function Section({ label, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid var(--border)', paddingBottom:5, marginBottom:10 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, mono }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13, fontFamily: mono ? 'DM Mono,monospace' : undefined }}>{value || '—'}</div>
    </div>
  )
}

function Row2({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>{children}</div>
}

function SBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.submitted
  return <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, background:cfg.bg, color:cfg.col }}>{cfg.label}</span>
}

function DetailModal({ appId, onClose, onUpdated }) {
  const { colour }    = useBrand()
  const c             = colour || '#6abf3f'
  const [data,        setData]      = useState(null)
  const [siaBlobUrl,  setSiaBlobUrl]= useState(null)
  const [status,      setStatus]    = useState('')
  const [notes,       setNotes]     = useState('')
  const [saving,      setSaving]    = useState(false)
  const [savedMsg,    setSavedMsg]  = useState('')
  const [err,         setErr]       = useState('')
  const [resending,   setResending] = useState(false)
  const [confirmDel,  setConfirmDel]= useState(false)
  const [deleting,    setDeleting]  = useState(false)

  const token = localStorage.getItem('sp_token')

  useEffect(() => {
    getApplication(appId).then(r => {
      setData(r.data)
      setStatus(r.data.status)
      setNotes(r.data.hr_notes || '')
    }).catch(() => setErr('Failed to load application'))

    // Load SIA badge image
    if (!appId) return
    fetch(`${BASE}/applications/${appId}/sia-badge`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => blob && setSiaBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {})

    return () => { if (siaBlobUrl) URL.revokeObjectURL(siaBlobUrl) }
  }, [appId])

  async function downloadDoc() {
    const res = await fetch(`${BASE}/applications/${appId}/immigration-doc`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = data?.immigration_doc_filename || 'immigration_doc'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteApplication(appId)
      onUpdated()
      onClose()
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to delete application')
      setConfirmDel(false)
    } finally { setDeleting(false) }
  }

  async function resendRegistration() {
    setResending(true); setErr(''); setSavedMsg('')
    try {
      await resendRegistrationEmail(appId)
      setSavedMsg(`📧 Registration email resent to ${data.email}`)
      getApplication(appId).then(r => setData(r.data))
    } catch (ex) {
      setErr(ex.response?.data?.detail || ex.message || 'Failed to resend email')
    } finally { setResending(false) }
  }

  async function save() {
    setSaving(true); setErr(''); setSavedMsg('')
    try {
      const res = await updateAppStatus(appId, { status, notes })
      if (status === 'accepted' && res.data.email) {
        setSavedMsg(`📧 Registration link sent to ${res.data.email}`)
      } else {
        setSavedMsg('Status updated.')
      }
      onUpdated()
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to update')
    } finally { setSaving(false) }
  }

  const ipt = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, boxSizing:'border-box' }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:720, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <h3 style={{ marginBottom:4 }}>{data?.full_name || '…'}</h3>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>
              {data?.email} · {data?.phone}
              {data?.submitted_at && <> · Submitted {fmtDateTime(data.submitted_at)}</>}
            </div>
            {data?.reference && (
              <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6, background:'var(--green-muted)', border:'1px solid rgba(106,191,63,.3)', borderRadius:6, padding:'3px 10px' }}>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Ref</span>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:15, fontWeight:900, color:'var(--green)' }}>{data.reference}</span>
              </div>
            )}
          </div>
          {data && <SBadge status={data.status} />}
        </div>

        {err && <div className="alert alert-red" style={{ marginBottom:12 }}>{err}</div>}

        {!data ? <p style={{ color:'var(--text-muted)' }}>Loading…</p> : (
          <>
            {/* ── Personal Details ── */}
            <Section label="Personal Details">
              <Row2>
                <Field label="Date of Birth"  value={data.date_of_birth} />
                <Field label="Phone"          value={data.phone} />
              </Row2>
              <Row2>
                <Field label="Nationality"    value={data.nationality} />
                <Field label="Right to Work"  value={data.right_to_work ? 'Yes ✓' : 'No ✗'} />
              </Row2>
              <Field label="Area of Employment" value={data.area_of_employment} />
            </Section>

            {/* ── Address ── */}
            <Section label="Address">
              <Field label="Address Line 1" value={data.address}       />
              {data.address_line2 && <Field label="Address Line 2" value={data.address_line2} />}
              <Row2>
                <Field label="City / Town" value={data.city} />
                <Field label="Postcode"    value={data.postcode} mono />
              </Row2>
            </Section>

            {/* ── SIA & Compliance ── */}
            <Section label="SIA & Compliance">
              <Row2>
                <Field label="NI Number"   value={data.ni_number}   mono />
                <Field label="SIA Licence" value={data.sia_licence} mono />
              </Row2>
              <Row2>
                <Field label="SIA Expiry"       value={data.sia_expiry} />
                <Field label="Commute Method"    value={data.commute_method} />
              </Row2>
            </Section>

            {/* ── Emergency Contact ── */}
            <Section label="Emergency Contact">
              <Row2>
                <Field label="Name"  value={data.nok_name} />
                <Field label="Phone" value={data.nok_phone} />
              </Row2>
            </Section>

            {/* Employment history */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>5-Year Employment History</div>
              <pre style={{ fontSize:12, color:'var(--text)', fontFamily:'DM Sans,sans-serif', whiteSpace:'pre-wrap', background:'var(--navy-light)', borderRadius:8, padding:'10px 12px', margin:0, lineHeight:1.6 }}>{data.employment_history}</pre>
            </div>

            {/* Files */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>SIA Badge</div>
                {siaBlobUrl
                  ? <img src={siaBlobUrl} alt="SIA badge" style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)' }} />
                  : <div style={{ background:'var(--navy-light)', borderRadius:8, padding:'20px', textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>
                      {data.has_sia_badge ? 'Loading…' : 'Not uploaded'}
                    </div>
                }
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Immigration Doc</div>
                {data.has_immigration_doc
                  ? <button onClick={downloadDoc} className="btn btn-outline" style={{ width:'100%' }}>
                      📥 Download {data.immigration_doc_filename || 'Document'}
                    </button>
                  : <div style={{ fontSize:12, color:'var(--text-muted)' }}>Not uploaded</div>
                }
              </div>
            </div>

            {/* Status update */}
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Update Status</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} style={ipt}>
                    <option value="submitted">📋 Submitted</option>
                    <option value="under_review">🔍 Under Review</option>
                    <option value="accepted">✅ Accepted</option>
                    <option value="rejected">✗ Rejected</option>
                  </select>
                </div>
                <div />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>HR Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal notes…"
                  style={{ ...ipt, resize:'vertical' }} />
              </div>
              {savedMsg && (
                <div style={{ background:'rgba(106,191,63,.12)', border:'1px solid rgba(106,191,63,.4)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'var(--green)', marginBottom:12 }}>
                  {savedMsg}
                </div>
              )}
              {data.status === 'accepted' && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                    {data.registration_sent_at
                      ? <span style={{ fontSize:12, color:'var(--green)' }}>
                          📧 Registration link sent on {new Date(data.registration_sent_at).toLocaleDateString('en-GB')}
                        </span>
                      : <span style={{ fontSize:12, color:'#a04000' }}>
                          ⚠️ Registration email not yet sent
                        </span>
                    }
                    <button
                      onClick={resendRegistration}
                      disabled={resending}
                      className="btn btn-outline"
                      style={{ fontSize:12, padding:'4px 12px' }}
                    >
                      {resending ? 'Sending…' : 'Resend Email'}
                    </button>
                  </div>
                  {err && <div className="alert alert-red" style={{ fontSize:12, padding:'6px 10px' }}>{err}</div>}
                  {savedMsg && <div className="alert alert-green" style={{ fontSize:12, padding:'6px 10px' }}>{savedMsg}</div>}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-footer" style={{ marginTop:16, justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:8 }}>
            {!confirmDel ? (
              <button onClick={() => setConfirmDel(true)}
                style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(224,85,85,.4)', background:'rgba(224,85,85,.08)', color:'#e05555', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                🗑️ Delete Application
              </button>
            ) : (
              <>
                <span style={{ fontSize:12, color:'#e05555', alignSelf:'center', fontWeight:600 }}>Permanently delete?</span>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#e05555', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button onClick={() => setConfirmDel(false)} className="btn btn-outline" style={{ fontSize:12, padding:'4px 10px' }}>Cancel</button>
              </>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} className="btn btn-outline">Close</button>
            <button onClick={save} disabled={saving} className="btn btn-brand">
              {saving ? 'Saving…' : 'Update Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HRApplications() {
  const { colour }    = useBrand()
  const c             = colour || '#6abf3f'
  const [apps,        setApps]      = useState(null)
  const [activeTab,   setActiveTab] = useState('all')
  const [selectedId,  setSelectedId]= useState(null)
  const [sortField,   setSortField] = useState('submitted_at')
  const [sortDir,     setSortDir]   = useState('desc')

  function load() {
    getApplications().then(r => setApps(r.data || [])).catch(() => setApps([]))
  }

  useEffect(() => { load() }, [])

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function sortIndicator(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const filtered = (apps || [])
    .filter(a => activeTab === 'all' || a.status === activeTab)
    .sort((a, b) => {
      let va, vb
      if (sortField === 'city' || sortField === 'full_name') {
        va = (a[sortField] || '').toLowerCase()
        vb = (b[sortField] || '').toLowerCase()
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      } else {
        va = a.submitted_at ? new Date(a.submitted_at).getTime() : 0
        vb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0
        return sortDir === 'asc' ? va - vb : vb - va
      }
    })

  function counts() {
    if (!apps) return {}
    return apps.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})
  }
  const cnt = counts()

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Applications</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Job applications submitted via the public apply form</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
        {TABS.map(t => {
          const count  = t.key === 'all' ? (apps?.length || 0) : (cnt[t.key] || 0)
          const active = activeTab === t.key
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding:'7px 14px', borderRadius:8, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13,
              border:`1px solid ${active ? c : 'var(--border)'}`,
              background: active ? 'var(--green-muted)' : 'transparent',
              color: active ? c : 'var(--text-muted)', fontWeight: active ? 700 : 400,
              display:'flex', alignItems:'center', gap:6,
            }}>
              {t.label}
              <span style={{ background: active ? c : 'var(--navy-light)', color: active ? '#fff' : 'var(--text-muted)', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, minWidth:18, textAlign:'center' }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="card" style={{ padding:0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th
                  onClick={() => handleSort('full_name')}
                  style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
                >
                  Name{sortIndicator('full_name')}
                </th>
                <th
                  onClick={() => handleSort('city')}
                  style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
                >
                  City{sortIndicator('city')}
                </th>
                <th>Postcode</th>
                <th>Email</th>
                <th>Tel</th>
                <th
                  onClick={() => handleSort('submitted_at')}
                  style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
                >
                  Submitted{sortIndicator('submitted_at')}
                </th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps === null ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No applications found.</td></tr>
              ) : filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12, fontWeight:700, color:'var(--green)', whiteSpace:'nowrap' }}>{a.reference || '—'}</td>
                  <td style={{ fontWeight:600, whiteSpace:'nowrap' }}>{a.full_name}</td>
                  <td style={{ fontSize:12 }}>{a.city || '—'}</td>
                  <td style={{ fontSize:12, fontFamily:'DM Mono,monospace', whiteSpace:'nowrap' }}>{a.postcode || '—'}</td>
                  <td style={{ fontSize:12 }}>{a.email}</td>
                  <td style={{ fontSize:12, fontFamily:'DM Mono,monospace', whiteSpace:'nowrap' }}>{a.phone || '—'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12, whiteSpace:'nowrap' }}>
                    {a.submitted_at ? fmtDateTime(a.submitted_at) : '—'}
                  </td>
                  <td><SBadge status={a.status} /></td>
                  <td>
                    <button onClick={() => setSelectedId(a.id)} className="btn btn-outline" style={{ fontSize:12, padding:'5px 12px' }}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <DetailModal
          appId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => { load(); }}
        />
      )}
    </>
  )
}
