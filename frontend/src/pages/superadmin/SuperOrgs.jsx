import { useEffect, useState } from 'react'
import { listOrgs, toggleOrg, extendTrial } from '../../api/client'

const PLAN_C = { trial:'#f0a030', starter:'#4a9fd4', growth:'#6abf3f', enterprise:'#a855f7', none:'#6a8a6a' }

export default function SuperOrgs() {
  const [orgs, setOrgs]   = useState([])
  const [busy, setBusy]   = useState(null)
  const [msg,  setMsg]    = useState('')
  const [search, setSrch] = useState('')

  const load = () => listOrgs().then(r => setOrgs(r.data || [])).catch(() => {})
  useEffect(load, [])

  async function toggle(id, name, isActive) {
    if (!confirm(`${isActive ? 'Suspend' : 'Reactivate'} "${name}"?`)) return
    setBusy(id)
    try {
      await toggleOrg(id)
      setMsg(`✅ ${name} ${isActive ? 'suspended' : 'reactivated'}`)
      load()
    } catch { setMsg('❌ Action failed') }
    finally { setBusy(null) }
  }

  async function extend(id, name) {
    const days = prompt(`Extend trial for "${name}" by how many days?`, '30')
    if (!days || isNaN(days)) return
    setBusy(id)
    try {
      await extendTrial(id, { days: parseInt(days) })
      setMsg(`✅ Trial extended by ${days} days`)
      load()
    } catch { setMsg('❌ Failed to extend trial') }
    finally { setBusy(null) }
  }

  const filtered = orgs.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.slug.includes(search.toLowerCase()) || o.contact_email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Organisations</h2>
        <p style={{ fontSize:14, color:'#7a9a7a' }}>{filtered.length} of {orgs.length} tenants</p>
      </div>

      {msg && (
        <div style={{ padding:'12px 16px', borderRadius:8, marginBottom:16, fontSize:13, background:msg.startsWith('✅')?'rgba(106,191,63,.1)':'rgba(224,85,85,.1)', border:`1px solid ${msg.startsWith('✅')?'rgba(106,191,63,.3)':'rgba(224,85,85,.3)'}`, color:msg.startsWith('✅')?'#6abf3f':'#e05555' }}>
          {msg}
        </div>
      )}

      <input value={search} onChange={e => setSrch(e.target.value)}
        placeholder="Search organisations…"
        style={{ padding:'9px 14px', borderRadius:8, border:'1px solid rgba(106,191,63,.2)', background:'#0f1923', color:'#e8f0e0', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', width:280, marginBottom:18 }}/>

      <div style={{ display:'grid', gap:14 }}>
        {filtered.map(org => {
          const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null
          const trialDays = trialEnd ? Math.ceil((trialEnd - new Date()) / 86400000) : null

          return (
            <div key={org.id} style={{ background:'#0f1923', border:`1px solid ${org.is_active ? 'rgba(106,191,63,.2)' : 'rgba(224,85,85,.2)'}`, borderRadius:12, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                    <div style={{ fontWeight:700, fontSize:16 }}>{org.name}</div>
                    {!org.is_active && <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, background:'rgba(224,85,85,.2)', color:'#e05555', fontWeight:700 }}>SUSPENDED</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#4a6a4a', fontFamily:'DM Mono,monospace' }}>/{org.slug}</div>
                  <div style={{ fontSize:12, color:'#7a9a7a', marginTop:4 }}>{org.contact_email}</div>
                  <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
                    <span style={{ padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700, background:PLAN_C[org.plan]+'22', color:PLAN_C[org.plan] }}>
                      {(org.plan||'none').toUpperCase()}
                    </span>
                    <span style={{ fontSize:12, color:'#7a9a7a' }}>👥 {org.staff_count} staff</span>
                    {trialDays !== null && (
                      <span style={{ fontSize:12, color: trialDays < 7 ? '#e05555' : '#f0a030' }}>
                        ⏳ {trialDays > 0 ? `${trialDays} days left` : 'Trial expired'}
                      </span>
                    )}
                    <span style={{ fontSize:12, color:'#4a6a4a' }}>
                      Created {org.created_at ? new Date(org.created_at).toLocaleDateString('en-GB') : '—'}
                    </span>
                  </div>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {org.status === 'trial' && (
                    <button onClick={() => extend(org.id, org.name)} disabled={busy===org.id} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(240,160,48,.4)', background:'rgba(240,160,48,.1)', color:'#f0a030', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      ⏳ Extend Trial
                    </button>
                  )}
                  <button onClick={() => toggle(org.id, org.name, org.is_active)} disabled={busy===org.id} style={{ padding:'8px 14px', borderRadius:8, border:`1px solid ${org.is_active?'rgba(224,85,85,.4)':'rgba(106,191,63,.4)'}`, background:org.is_active?'rgba(224,85,85,.1)':'rgba(106,191,63,.1)', color:org.is_active?'#e05555':'#6abf3f', fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    {busy===org.id ? '…' : org.is_active ? '⏸ Suspend' : '▶ Reactivate'}
                  </button>
                  <a href={`/login/${org.slug}`} target="_blank" rel="noreferrer" style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(106,191,63,.25)', background:'transparent', color:'#6abf3f', fontFamily:'DM Sans,sans-serif', fontSize:12, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center' }}>
                    🔗 View Portal
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
