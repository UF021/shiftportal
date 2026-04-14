import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../../api/client'
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

export default function HRDashboard() {
  const nav            = useNavigate()
  const { colour }     = useBrand()
  const c              = colour || '#6abf3f'
  const [stats, setSt] = useState(null)

  useEffect(() => {
    getDashboard().then(r => setSt(r.data)).catch(() => {})
  }, [])

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

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
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
    </>
  )
}
