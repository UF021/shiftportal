import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard, acknowledgeProfileChange } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

function Stat({ label, value, col, sub }) {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'
  return (
    <div className="card" style={{ padding:18 }}>
      <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:30, fontWeight:700, fontFamily:'DM Mono,monospace', color: col||c }}>{value??'…'}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function ChangeEntry({ entry, onAck }) {
  const [busy, setBusy] = useState(false)
  const changes = Object.values(entry.changes)

  const ts = entry.changed_at
    ? new Date(entry.changed_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—'

  async function dismiss() {
    setBusy(true)
    try { await acknowledgeProfileChange(entry.id); onAck(entry.id) }
    catch { setBusy(false) }
  }

  return (
    <div style={{
      padding:'12px 14px', borderRadius:9, marginBottom:10,
      background:'rgba(99,132,255,.07)', border:'1px solid rgba(99,132,255,.2)',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:2 }}>
            {entry.full_name}
            {entry.staff_id && entry.staff_id !== 'TBC' && (
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'DM Mono,monospace', marginLeft:7 }}>{entry.staff_id}</span>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>Updated {ts}</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {changes.map((ch, i) => (
              <div key={i} style={{
                fontSize:11, padding:'4px 9px', borderRadius:6,
                background:'rgba(99,132,255,.1)', color:'#4050cc',
                fontWeight:600,
              }}>
                {ch.label}: {ch.old ? <span style={{ textDecoration:'line-through', opacity:.7, marginRight:4 }}>{ch.old}</span> : <span style={{ opacity:.5, marginRight:4 }}>empty</span>}→ {ch.new || <span style={{ opacity:.5 }}>cleared</span>}
              </div>
            ))}
          </div>
        </div>
        <button onClick={dismiss} disabled={busy} style={{
          padding:'5px 12px', borderRadius:6, border:'1px solid rgba(99,132,255,.3)',
          background:'transparent', color:'#4050cc', fontSize:11, fontWeight:700,
          cursor:busy?'not-allowed':'pointer', whiteSpace:'nowrap', flexShrink:0,
        }}>{busy ? '…' : 'Dismiss'}</button>
      </div>
    </div>
  )
}

export default function HRDashboard() {
  const nav            = useNavigate()
  const { colour }     = useBrand()
  const c              = colour || '#6abf3f'
  const [stats, setSt] = useState(null)
  const [changes, setChanges] = useState([])

  useEffect(() => {
    getDashboard().then(r => {
      setSt(r.data)
      setChanges(r.data?.profile_change_list || [])
    }).catch(() => {})
  }, [])

  function removeChange(id) {
    setChanges(prev => prev.filter(x => x.id !== id))
    setSt(prev => prev ? { ...prev, profile_changes: Math.max(0, (prev.profile_changes||1) - 1) } : prev)
  }

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Dashboard</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-GB',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <Stat label="Total Staff"       value={stats?.total_staff}        sub="Active employees" />
        <Stat label="Pending Approvals" value={stats?.pending_regs}       col="var(--amber)" sub="Awaiting HR review" />
        <Stat label="SIA Expiring"      value={stats?.sia_expiring_soon}  col="var(--amber)" sub="Within 60 days" />
        <Stat label="SIA Expired"       value={stats?.sia_expired}        col="var(--red)"   sub="Action required" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        {/* SIA Alerts */}
        <div className="card">
          <div className="card-title">⚠️ SIA Alerts</div>
          {stats?.sia_alerts?.length ? stats.sia_alerts.map(s => {
            const gone = s.expired
            return (
              <div key={s.id} style={{
                display:'flex', alignItems:'flex-start', gap:9,
                padding:'10px 12px', borderRadius:8, marginBottom:8,
                background: gone ? 'rgba(224,85,85,.1)' : 'rgba(240,160,48,.1)',
                border:`1px solid ${gone ? 'rgba(224,85,85,.25)' : 'rgba(240,160,48,.25)'}`,
              }}>
                <span>{gone ? '🔴' : '⚠️'}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color: gone ? 'var(--red)' : 'var(--amber)' }}>{s.full_name}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {gone ? `EXPIRED on ${s.sia_expiry}` : `Expires ${s.sia_expiry}`}
                  </div>
                </div>
              </div>
            )
          }) : <p style={{ color:c, fontSize:13 }}>✅ All SIA licences valid</p>}
        </div>

        {/* Pending regs */}
        <div className="card">
          <div className="card-title">📋 Pending Registrations</div>
          {stats?.pending_regs > 0 ? (
            <>
              <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:14 }}>
                {stats.pending_regs} registration{stats.pending_regs !== 1 ? 's' : ''} awaiting your review
              </p>
              <button onClick={() => nav('/hr/registrations')} className="btn btn-brand">
                Review Now →
              </button>
            </>
          ) : (
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>No pending registrations</p>
          )}
        </div>
      </div>

      {/* Profile Change Notices */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="card-title" style={{ marginBottom:0 }}>
            📝 Staff Detail Updates
            {changes.length > 0 && (
              <span style={{
                marginLeft:8, background:'#4050cc', color:'#fff',
                fontSize:11, fontWeight:700, borderRadius:10,
                padding:'2px 8px', verticalAlign:'middle',
              }}>{changes.length}</span>
            )}
          </div>
          {changes.length > 0 && (
            <button onClick={() => nav('/hr/staff')} className="btn btn-outline" style={{ fontSize:12, padding:'4px 12px' }}>
              View in Staff Records →
            </button>
          )}
        </div>
        {changes.length > 0 ? (
          changes.map(entry => (
            <ChangeEntry key={entry.id} entry={entry} onAck={removeChange} />
          ))
        ) : (
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>No pending detail update notices</p>
        )}
      </div>
    </>
  )
}
