// HRApplications.jsx
import { useEffect, useState } from 'react'
import { getApplications, getApplication, updateAppStatus } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

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
              {data?.submitted_at && <> · Submitted {new Date(data.submitted_at).toLocaleDateString('en-GB')}</>}
            </div>
          </div>
          {data && <SBadge status={data.status} />}
        </div>

        {err && <div className="alert alert-red" style={{ marginBottom:12 }}>{err}</div>}

        {!data ? <p style={{ color:'var(--text-muted)' }}>Loading…</p> : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px', marginBottom:16 }}>
              {[
                ['Date of Birth',    data.date_of_birth],
                ['Address',         data.address],
                ['NI Number',       data.ni_number],
                ['SIA Licence',     data.sia_licence],
                ['SIA Expiry',      data.sia_expiry],
                ['Nationality',     data.nationality],
                ['Right to Work',   data.right_to_work ? 'Yes' : 'No'],
                ['Commute Method',  data.commute_method],
                ['Next of Kin',     data.nok_name],
                ['NOK Phone',       data.nok_phone],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{lbl}</div>
                  <div style={{ fontSize:13 }}>{val || '—'}</div>
                </div>
              ))}
            </div>

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
              {data.registration_sent_at && (
                <div style={{ fontSize:12, color:'var(--green)', marginBottom:12 }}>
                  📧 Registration link sent to {data.email} on {new Date(data.registration_sent_at).toLocaleDateString('en-GB')}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-footer" style={{ marginTop:16 }}>
          <button onClick={onClose} className="btn btn-outline">Close</button>
          <button onClick={save} disabled={saving} className="btn btn-brand">
            {saving ? 'Saving…' : 'Update Status'}
          </button>
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

  function load() {
    getApplications().then(r => setApps(r.data || [])).catch(() => setApps([]))
  }

  useEffect(() => { load() }, [])

  const filtered = (apps || []).filter(a => activeTab === 'all' || a.status === activeTab)

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
                <th>Applicant</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps === null ? (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No applications found.</td></tr>
              ) : filtered.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.full_name}</strong></td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{a.email}</td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{a.phone}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>
                    {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-GB') : '—'}
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
