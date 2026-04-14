import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { superDashboard } from '../../api/client'

const PLAN_COLOUR = { trial:'#f0a030', starter:'#4a9fd4', growth:'#6abf3f', enterprise:'#a855f7', none:'#6a8a6a' }
const STATUS_COLOUR = { trial:'#f0a030', active:'#6abf3f', past_due:'#e05555', cancelled:'#6a8a6a' }

function Stat({ label, value, col = '#6abf3f', sub }) {
  return (
    <div style={{ background:'#0f1923', border:'1px solid rgba(106,191,63,.18)', borderRadius:12, padding:18 }}>
      <div style={{ fontSize:11, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:30, fontWeight:700, fontFamily:'DM Mono,monospace', color:col }}>{value ?? '…'}</div>
      {sub && <div style={{ fontSize:11, color:'#4a6a4a', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

export default function SuperDash() {
  const nav = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    superDashboard().then(r => setData(r.data)).catch(() => {})
  }, [])

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Platform Dashboard</h2>
        <p style={{ fontSize:14, color:'#7a9a7a' }}>
          {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:28 }}>
        <Stat label="Total Organisations" value={data?.total_orgs}   sub="All tenants" />
        <Stat label="Active"              value={data?.active_orgs}  sub="Paid + trial" />
        <Stat label="On Trial"            value={data?.trial_orgs}   col="#f0a030" sub="30-day trial" />
        <Stat label="Total Staff"         value={data?.total_staff}  sub="Across all orgs" />
      </div>

      {/* Organisations table */}
      <div style={{ background:'#0f1923', border:'1px solid rgba(106,191,63,.18)', borderRadius:12, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(106,191,63,.12)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#7a9a7a', textTransform:'uppercase', letterSpacing:'.06em' }}>All Organisations</div>
          <button onClick={() => nav('/super/new')} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#6abf3f', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            + New Organisation
          </button>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                {['Organisation','Slug','Plan','Status','Staff','Created','Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid rgba(106,191,63,.12)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.orgs?.map(org => (
                <tr key={org.id} style={{ borderBottom:'1px solid rgba(106,191,63,.06)' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontWeight:700 }}>{org.name}</div>
                    <div style={{ fontSize:11, color:'#4a6a4a' }}>{org.contact_email}</div>
                  </td>
                  <td style={{ padding:'12px 16px', fontFamily:'DM Mono,monospace', fontSize:12, color:'#6abf3f' }}>{org.slug}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700, background:PLAN_COLOUR[org.plan]+'22', color:PLAN_COLOUR[org.plan] }}>
                      {(org.plan||'none').charAt(0).toUpperCase()+(org.plan||'none').slice(1)}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700, background:STATUS_COLOUR[org.status]+'22', color:STATUS_COLOUR[org.status] }}>
                      {org.status}
                    </span>
                    {!org.is_active && <span style={{ marginLeft:6, padding:'2px 8px', borderRadius:10, fontSize:10, background:'rgba(224,85,85,.2)', color:'#e05555' }}>SUSPENDED</span>}
                  </td>
                  <td style={{ padding:'12px 16px', fontFamily:'DM Mono,monospace', fontWeight:700 }}>{org.staff_count}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#4a6a4a' }}>
                    {org.created_at ? new Date(org.created_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <button onClick={() => nav('/super/orgs')} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid rgba(106,191,63,.3)', background:'transparent', color:'#6abf3f', fontSize:12, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
