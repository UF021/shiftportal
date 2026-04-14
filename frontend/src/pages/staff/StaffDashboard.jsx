// StaffDashboard.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyClockHistory } from '../../api/client'

function fmtDuration(mins) {
  if (mins == null) return '—'
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

export default function StaffDashboard() {
  const { user }   = useAuth()
  const { colour } = useBrand()
  const c          = colour || '#6abf3f'

  const [clockEvents, setClockEvents] = useState(null)

  useEffect(() => {
    getMyClockHistory()
      .then(r => setClockEvents(r.data))
      .catch(() => setClockEvents([]))
  }, [])

  // Derive state from clock events
  const isClocked = (() => {
    if (!clockEvents?.length) return false
    const lastIn = [...clockEvents].filter(e => e.event_type === 'clock_in').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
    if (!lastIn) return false
    return !clockEvents.some(e => e.event_type === 'clock_out' && new Date(e.timestamp) > new Date(lastIn.timestamp))
  })()

  const openClockIn = isClocked
    ? [...(clockEvents || [])].filter(e => e.event_type === 'clock_in').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
    : null

  const clockIns     = (clockEvents || []).filter(e => e.event_type === 'clock_in' && e.scheduled_start)
  const onTimeCount  = clockIns.filter(e => !e.is_late).length
  const lateCount    = clockIns.filter(e => e.is_late).length
  const totalShifts  = (clockEvents || []).filter(e => e.event_type === 'clock_out').length

  // Recent completed shifts: pair clock_out with its clock_in
  const recentShifts = (clockEvents || [])
    .filter(e => e.event_type === 'clock_out' && e.shift_minutes != null)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5)

  const sia    = user?.sia_expiry ? new Date(user.sia_expiry) : null
  const days   = sia ? Math.ceil((sia - new Date()) / 86400000) : null
  const gone   = days !== null && days < 0
  const warn   = days !== null && days < 60
  const siaCol = gone ? '#e05555' : warn ? '#f0a030' : c

  return <>
    {/* Today's Status */}
    <div style={{
      background: isClocked ? `linear-gradient(135deg,#0a2a0a,#1a4a1a)` : '#fff',
      border: isClocked ? 'none' : '1.5px solid #d0e8d0',
      borderRadius: 14, padding: '16px 20px', marginBottom: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: isClocked ? '0 4px 20px rgba(106,191,63,.25)' : 'none',
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: isClocked ? 'rgba(255,255,255,.6)' : '#6a8a6a', marginBottom: 4 }}>
          Today's Status
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: isClocked ? '#fff' : '#1a2a1a' }}>
          {clockEvents === null ? '…'
            : isClocked
              ? `Clocked in · ${new Date(openClockIn.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : 'Not clocked in'}
        </div>
        {isClocked && openClockIn?.site_name && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>{openClockIn.site_name}</div>
        )}
      </div>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: isClocked ? c : '#ccc', boxShadow: isClocked ? `0 0 0 4px ${c}44` : 'none', transition: 'all .3s' }} />
    </div>

    {/* Hero */}
    <div style={{ background:`linear-gradient(135deg,#0f1923 0%,#1a3a1a 60%,${c}55 100%)`, borderRadius:16, padding:24, marginBottom:14, color:'#fff', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:c+'22' }} />
      <div style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Hello, {user?.first_name} 👋</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.6)' }}>Licensed Security Officer</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:18 }}>
        {[
          { val: clockEvents !== null ? `${totalShifts}` : '…', lbl:'Shifts', col:c },
          { val: gone?'EXP':days!=null?`${days}d`:'…', lbl:'SIA days left', col:siaCol },
        ].map(({val,lbl,col}) => (
          <div key={lbl} style={{ background:'rgba(255,255,255,.08)', borderRadius:10, padding:12, border:'1px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono,monospace', color:col }}>{val}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>

    {(gone||warn) && (
      <div style={{ background:gone?'#fde8e8':'#fef9e8', border:`1px solid ${gone?'#e08080':'#f0c060'}`, borderRadius:10, padding:'12px 16px', fontSize:13, color:gone?'#a02020':'#7a5000', marginBottom:14 }}>
        {gone ? '🔴 Your SIA licence has expired. Contact HR immediately.' : `⚠ Your SIA licence expires in ${days} days. Please arrange renewal.`}
      </div>
    )}

    {/* Punctuality */}
    <div className="s-card">
      <div className="s-card-title">🎯 Punctuality</div>
      {clockEvents === null ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>Loading…</p>
      ) : clockIns.length === 0 ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>No recorded shifts yet.</p>
      ) : (
        <div style={{ display:'flex', gap:20, alignItems:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', color:c }}>{onTimeCount}</div>
            <div style={{ fontSize:11, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>On time</div>
          </div>
          <div style={{ width:1, height:40, background:'#e0ead0' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', color:'#c0392b' }}>{lateCount}</div>
            <div style={{ fontSize:11, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>Late</div>
          </div>
          <div style={{ width:1, height:40, background:'#e0ead0' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', color:'#4a6a4a' }}>{clockIns.length > 0 ? Math.round(onTimeCount / clockIns.length * 100) : 0}%</div>
            <div style={{ fontSize:11, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>On-time rate</div>
          </div>
        </div>
      )}
    </div>

    {/* Contract card */}
    <div className="s-card">
      <div className="s-card-title">📄 Employment Contract</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'#1a2a1a' }}>Contract of Employment</div>
          <div style={{ fontSize:12, color:'#6a8a6a' }}>{user?.first_name} {user?.last_name} · Start: {user?.employment_start_date||'TBC'}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href="/staff/contract" style={{ padding:'8px 14px', borderRadius:8, border:`1.5px solid ${c}`, background:'#fff', color:c, fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer', textDecoration:'none' }}>View →</a>
        </div>
      </div>
    </div>

    {/* Recent Shifts */}
    <div className="s-card">
      <div className="s-card-title">🕐 Recent Shifts</div>
      {clockEvents === null ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>Loading…</p>
      ) : recentShifts.length === 0 ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>No completed shifts yet.</p>
      ) : recentShifts.map(e => (
        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f0f4f0' }}>
          <div style={{ width:88, fontSize:12, fontWeight:700, color:'#1a2a1a', flexShrink:0 }}>
            {new Date(e.timestamp).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontFamily:'DM Mono,monospace', color:'#6a8a6a' }}>
              {e.site_name || '—'}
            </div>
            <div style={{ display:'flex', gap:6, marginTop:2, alignItems:'center' }}>
              {e.is_late != null && (
                <span style={{ fontSize:10, fontWeight:700, color: e.is_late ? '#c0392b' : c, background: e.is_late ? '#fde8e8' : '#e8f8e0', padding:'1px 6px', borderRadius:4 }}>
                  {e.is_late ? `Late ${e.minutes_late}m` : 'On time'}
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:c, fontFamily:'DM Mono,monospace', whiteSpace:'nowrap' }}>
            {fmtDuration(e.shift_minutes)}
          </div>
        </div>
      ))}
    </div>
  </>
}
