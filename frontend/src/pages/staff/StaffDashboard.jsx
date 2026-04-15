// StaffDashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyClockHistory, getMyMessages } from '../../api/client'

function fmtDuration(mins) {
  if (mins == null) return '—'
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

export default function StaffDashboard() {
  const { user }   = useAuth()
  const { colour } = useBrand()
  const nav        = useNavigate()
  const c          = colour || '#6abf3f'

  const [clockData,      setClockData]      = useState(null)
  const [urgentMessages, setUrgentMessages] = useState([])

  useEffect(() => {
    getMyClockHistory()
      .then(r => setClockData(r.data))
      .catch(() => setClockData({ open_in: null, shifts: [] }))
    getMyMessages()
      .then(r => setUrgentMessages((r.data || []).filter(m => !m.is_read && m.priority === 'urgent')))
      .catch(() => {})
  }, [])

  const openClockIn  = clockData?.open_in  || null
  const shifts       = clockData?.shifts   || []
  const isClocked    = !!openClockIn

  // Missed sign-out: open clock-in from a previous calendar day
  const missedSignOut = (() => {
    if (!openClockIn) return false
    const inDate  = new Date(openClockIn.timestamp).toDateString()
    const today   = new Date().toDateString()
    return inDate !== today
  })()

  // Punctuality: shifts with a scheduled_start
  const scheduledShifts = shifts.filter(s => s.scheduled_start)
  const onTimeCount     = scheduledShifts.filter(s => !s.is_late).length
  const lateCount       = scheduledShifts.filter(s => s.is_late).length
  const totalShifts     = shifts.length

  // Recent 5 completed shifts (already sorted most-recent-first by backend)
  const recentShifts = shifts.slice(0, 5)

  const sia    = user?.sia_expiry ? new Date(user.sia_expiry) : null
  const days   = sia ? Math.ceil((sia - new Date()) / 86400000) : null
  const gone   = days !== null && days < 0
  const warn   = days !== null && days < 60
  const siaCol = gone ? '#e05555' : warn ? '#f0a030' : c

  return <>
    {/* Missed sign-out notice */}
    {missedSignOut && (
      <div style={{
        background:'#fde8e8', border:'2px solid #e05555', borderRadius:12,
        padding:'14px 16px', marginBottom:14,
        display:'flex', alignItems:'flex-start', gap:12,
      }}>
        <span style={{ fontSize:22, flexShrink:0 }}>🔴</span>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'#a02020', marginBottom:3 }}>
            You did not sign out from your last shift
          </div>
          <div style={{ fontSize:13, color:'#c05050', lineHeight:1.5 }}>
            Your clock-in from{' '}
            <strong>{new Date(openClockIn.timestamp).toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long' })}</strong>
            {openClockIn.site_name ? ` at ${openClockIn.site_name}` : ''} was never closed.
            Please contact your line manager or HR to have your timesheet corrected.
          </div>
        </div>
      </div>
    )}

    {/* Urgent message banner */}
    {urgentMessages.length > 0 && (
      <div
        onClick={() => nav('/staff/messages')}
        style={{
          background:'#fde8e8', border:'1.5px solid #e05555', borderRadius:12,
          padding:'12px 16px', marginBottom:14, cursor:'pointer',
          display:'flex', alignItems:'center', gap:10,
        }}
      >
        <span style={{ fontSize:18 }}>🚨</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#a02020' }}>
            You have {urgentMessages.length} urgent message{urgentMessages.length > 1 ? 's' : ''}.
          </div>
          <div style={{ fontSize:12, color:'#c05050' }}>Tap to view →</div>
        </div>
      </div>
    )}

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
          {clockData === null ? '…'
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
      <div style={{ fontSize:22, fontWeight:700, marginBottom:2 }}>Hello, {user?.first_name} 👋</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', marginBottom:18 }}>Licensed Security Officer</div>

      {/* Staff ID — prominent, unmissable */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:'rgba(255,255,255,.55)', marginBottom:8 }}>
          YOUR STAFF ID
        </div>
        <div style={{
          display:'inline-block',
          background:'rgba(255,255,255,.12)',
          border:'2px solid rgba(255,255,255,.35)',
          borderRadius:12, padding:'10px 22px',
        }}>
          <div style={{ fontSize:52, fontWeight:900, fontFamily:'DM Mono,monospace', color:'#fff', letterSpacing:'.08em', lineHeight:1 }}>
            {user?.staff_id || 'TBC'}
          </div>
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:8 }}>
          Use this ID to clock in at any site
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          { val: clockData !== null ? `${totalShifts}` : '…', lbl:'Shifts', col:c },
          { val: gone?'EXP':days!=null?`${days}d`:'…', lbl:'SIA days left', col:siaCol },
        ].map(({val,lbl,col}) => (
          <div key={lbl} style={{ background:'rgba(255,255,255,.08)', borderRadius:10, padding:12, border:'1px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono,monospace', fontStyle:'normal', color:col }}>{val}</div>
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
      {clockData === null ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>Loading…</p>
      ) : scheduledShifts.length === 0 ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>No recorded shifts yet.</p>
      ) : (
        <div style={{ display:'flex', gap:20, alignItems:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', fontStyle:'normal', color:c }}>{onTimeCount}</div>
            <div style={{ fontSize:11, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>On time</div>
          </div>
          <div style={{ width:1, height:40, background:'#e0ead0' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', fontStyle:'normal', color:'#c0392b' }}>{lateCount}</div>
            <div style={{ fontSize:11, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>Late</div>
          </div>
          <div style={{ width:1, height:40, background:'#e0ead0' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', fontStyle:'normal', color:'#4a6a4a' }}>{scheduledShifts.length > 0 ? Math.round(onTimeCount / scheduledShifts.length * 100) : 0}%</div>
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
      {clockData === null ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>Loading…</p>
      ) : recentShifts.length === 0 ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>No completed shifts yet.</p>
      ) : recentShifts.map(s => (
        <div key={s.id} style={{ padding:'10px 0', borderBottom:'1px solid #f0f4f0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Date */}
            <div style={{ width:82, fontSize:12, fontWeight:700, color:'#1a2a1a', flexShrink:0 }}>
              {new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})}
            </div>
            {/* Site + times */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color:'#1a2a1a', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {s.site_name || '—'}
              </div>
              <div style={{ fontSize:11, fontFamily:'DM Mono,monospace', color:'#6a8a6a', marginTop:1 }}>
                {s.start_time}{s.end_time ? ` → ${s.end_time}` : ''}
              </div>
            </div>
            {/* Duration */}
            <div style={{ fontSize:13, fontWeight:700, color:c, fontFamily:'DM Mono,monospace', whiteSpace:'nowrap' }}>
              {fmtDuration(s.shift_minutes)}
            </div>
          </div>
          {/* Badges row */}
          <div style={{ display:'flex', gap:5, marginTop:5, marginLeft:92, flexWrap:'wrap' }}>
            {s.scheduled_start != null && (
              <span style={{ fontSize:10, fontWeight:700, color: s.is_late ? '#c0392b' : '#2e7d32', background: s.is_late ? '#fde8e8' : '#e8f8e0', padding:'2px 7px', borderRadius:4 }}>
                {s.is_late ? `Late ${s.minutes_late}m` : 'On time'}
              </span>
            )}
            {s.is_manual && (
              <span style={{ fontSize:10, fontWeight:700, color:'#1565c0', background:'#e3f2fd', padding:'2px 7px', borderRadius:4 }}>
                ✏️ Manual
              </span>
            )}
            {s.shift_minutes > 720 && (
              <span style={{ fontSize:10, fontWeight:700, color:'#b54708', background:'#fef3e2', padding:'2px 7px', borderRadius:4 }}>
                ⚠ Over 12h
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  </>
}
