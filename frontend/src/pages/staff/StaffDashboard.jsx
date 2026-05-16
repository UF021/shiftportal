// StaffDashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyClockHistory, getMyMessages, getMyTraining, getMyIncidents } from '../../api/client'
import { useDocs } from '../../api/DocsContext'

function fmtDuration(mins) {
  if (mins == null) return '—'
  return `${parseFloat((mins / 60).toFixed(2))}h`
}

export default function StaffDashboard() {
  const { user }   = useAuth()
  const { colour } = useBrand()
  const nav        = useNavigate()
  const c          = colour || '#6abf3f'

  const [clockData,      setClockData]      = useState(null)
  const [urgentMessages, setUrgentMessages] = useState([])
  const [training,       setTraining]       = useState(null)
  const [incidents,      setIncidents]      = useState(null)
  const { unconfirmedDocs } = useDocs()

  useEffect(() => {
    getMyClockHistory()
      .then(r => setClockData(r.data))
      .catch(() => setClockData({ open_in: null, shifts: [] }))
    getMyMessages()
      .then(r => setUrgentMessages((r.data || []).filter(m => !m.is_read && m.priority === 'urgent')))
      .catch(() => {})
    getMyTraining()
      .then(r => setTraining(r.data))
      .catch(() => {})
    getMyIncidents()
      .then(r => setIncidents(r.data || []))
      .catch(() => setIncidents([]))
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

  // Most recent shift that had a scheduled start — check if late
  const lastScheduled = shifts.find(s => s.scheduled_start)
  const lastShiftLate = lastScheduled?.is_late ? lastScheduled : null

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
            ⚠️ You did not sign out from your last shift
          </div>
          <div style={{ fontSize:13, color:'#c05050', lineHeight:1.6 }}>
            Your clock-in on{' '}
            <strong>{new Date(openClockIn.timestamp).toLocaleDateString('en-GB', { timeZone:'Europe/London', weekday:'long', day:'2-digit', month:'long' })}</strong>
            {openClockIn.site_name ? <> at <strong>{openClockIn.site_name}</strong></> : ''} has no sign-out recorded.
            {' '}If you completed this shift, please contact your line supervisor or HR immediately to have your timesheet corrected.
            {' '}Failure to report this may affect your pay.
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

    {/* Document confirmation alert card */}
    {unconfirmedDocs.length > 0 && (
      <div
        onClick={() => nav('/staff/documents')}
        style={{
          background: '#fffbf0', border: '1.5px solid #f0c060', borderRadius: 12,
          padding: '14px 16px', marginBottom: 14, cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#6a4000' }}>
              {unconfirmedDocs.length} employment document{unconfirmedDocs.length !== 1 ? 's' : ''} require your confirmation
            </div>
            <div style={{ fontSize: 12, color: '#9a6a00', marginTop: 2 }}>
              You must read and confirm these documents as part of your onboarding.
            </div>
          </div>
          <span style={{
            flexShrink: 0, background: '#f0a030', color: '#fff',
            fontWeight: 800, fontSize: 13, borderRadius: 20,
            padding: '3px 10px', minWidth: 24, textAlign: 'center',
          }}>{unconfirmedDocs.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {unconfirmedDocs.map(d => (
            <div key={d.doc_key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(240,160,48,.08)', borderRadius: 8, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 14 }}>📄</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6a4000', flex: 1 }}>{d.doc_name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c07000' }}>Read & Confirm →</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Late shift banner */}
    {lastShiftLate && (
      <div style={{
        background: '#fff8e8', border: '1.5px solid #f0a030', borderRadius: 12,
        padding: '14px 16px', marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#7a5000', marginBottom: 3 }}>
            You were {lastShiftLate.minutes_late} {lastShiftLate.minutes_late === 1 ? 'minute' : 'minutes'} late for your last shift
          </div>
          <div style={{ fontSize: 13, color: '#9a6a00', lineHeight: 1.5 }}>
            {new Date(lastShiftLate.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}
            {lastShiftLate.site_name ? <> at <strong>{lastShiftLate.site_name}</strong></> : ''}.
            {' '}Please ensure you arrive on time.
          </div>
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
              ? `Clocked in · ${new Date(openClockIn.timestamp).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`
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
            <div style={{ fontSize:28, fontWeight:900, fontFamily:'DM Mono,monospace', fontStyle:'normal', color: lateCount > 0 ? '#c0392b' : '#6a8a6a' }}>{lateCount}</div>
            <div style={{ fontSize:11, color: lateCount > 0 ? '#c0392b' : '#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2, fontWeight: lateCount > 0 ? 700 : 400 }}>Late</div>
          </div>
          <div style={{ width:1, height:40, background:'#e0ead0' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Mono,monospace', fontStyle:'normal', color:'#4a6a4a' }}>{scheduledShifts.length > 0 ? Math.round(onTimeCount / scheduledShifts.length * 100) : 0}%</div>
            <div style={{ fontSize:11, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>On-time rate</div>
          </div>
        </div>
      )}
    </div>

    {/* Quick-watch video cards */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
      {[
        { id: '1-6L3Lqv9WM', title: 'Site Briefing' },
        { id: 'ss_3yR8aKqs', title: 'Safety Update' },
      ].map(({ id, title }) => (
        <div key={id} style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.12)', aspectRatio: '1/1', position: 'relative', background: '#000' }}>
          <iframe
            width="100%" height="100%"
            src={`https://www.youtube.com/embed/${id}`}
            title={title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      ))}
    </div>

    {/* Training card */}
    {(() => {
      const MODULES = ['module1', 'module2', 'module3']
      const LABELS  = { module1: 'Company Policies', module2: 'SIA Door Supervisor', module3: "Martyn's Law" }
      const mods    = training?.modules || {}
      const passedCount = MODULES.filter(m => mods[m]?.passed).length
      const allPassed   = passedCount === 3

      let daysLeft = null
      if (training?.deadline) {
        daysLeft = Math.ceil((new Date(training.deadline) - new Date()) / 86400000)
      }

      const urgency = daysLeft === null ? 'none' : daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'warning' : 'ok'

      const theme = allPassed
        ? { bg: 'linear-gradient(135deg,#1b5e20 0%,#2e7d32 100%)', border: '#4caf50', text: '#fff', sub: 'rgba(255,255,255,.75)', accent: '#a5d6a7', barTrack: 'rgba(255,255,255,.2)', barFill: '#a5d6a7', shadow: '0 6px 24px rgba(46,125,50,.35)' }
        : urgency === 'overdue'
        ? { bg: 'linear-gradient(135deg,#7f0000 0%,#c62828 100%)', border: '#e57373', text: '#fff', sub: 'rgba(255,255,255,.8)', accent: '#ffcdd2', barTrack: 'rgba(255,255,255,.2)', barFill: '#ff8a80', shadow: '0 6px 24px rgba(198,40,40,.4)' }
        : urgency === 'critical'
        ? { bg: 'linear-gradient(135deg,#bf360c 0%,#e64a19 100%)', border: '#ff8a65', text: '#fff', sub: 'rgba(255,255,255,.8)', accent: '#ffccbc', barTrack: 'rgba(255,255,255,.2)', barFill: '#ffab91', shadow: '0 6px 24px rgba(230,74,25,.35)' }
        : urgency === 'warning'
        ? { bg: 'linear-gradient(135deg,#1a2a0a 0%,#33510a 60%,#4a7a10 100%)', border: '#f9a825', text: '#fff', sub: 'rgba(255,255,255,.7)', accent: '#fff176', barTrack: 'rgba(255,255,255,.15)', barFill: '#fff176', shadow: '0 6px 20px rgba(0,0,0,.25)' }
        : { bg: 'linear-gradient(135deg,#0f1923 0%,#1a3a1a 60%,#2a5a20 100%)', border: '#4caf5055', text: '#fff', sub: 'rgba(255,255,255,.65)', accent: '#a5d6a7', barTrack: 'rgba(255,255,255,.12)', barFill: '#69f0ae', shadow: '0 6px 20px rgba(0,0,0,.25)' }

      const fmtDeadline = training?.deadline
        ? new Date(training.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : null

      const countdownLabel = daysLeft === null ? null
        : daysLeft < 0  ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`
        : daysLeft === 0 ? 'Due today!'
        : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`

      return (
        <div
          onClick={() => nav('/staff/training')}
          style={{
            background: theme.bg,
            border: `2px solid ${theme.border}`,
            borderRadius: 16, padding: '20px 20px 16px', marginBottom: 14,
            cursor: 'pointer', boxShadow: theme.shadow, position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Decorative circle */}
          <div style={{ position:'absolute', top:-30, right:-30, width:130, height:130, borderRadius:'50%', background:'rgba(255,255,255,.06)', pointerEvents:'none' }} />

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 30, lineHeight: 1 }}>🎓</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: theme.text, letterSpacing: '.01em' }}>Security Training</div>
                <div style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>
                  {allPassed ? '✓ All 3 modules complete' : `${passedCount} of 3 modules passed`}
                </div>
              </div>
            </div>
            {allPassed && <span style={{ fontSize: 28 }}>🏆</span>}
          </div>

          {/* Deadline + countdown block */}
          {!allPassed && fmtDeadline && (
            <div style={{
              background: 'rgba(0,0,0,.25)', borderRadius: 10, padding: '10px 14px',
              marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: theme.sub, marginBottom: 3 }}>Completion Deadline</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, fontFamily: 'DM Mono,monospace' }}>{fmtDeadline}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: theme.sub, marginBottom: 3 }}>Countdown</div>
                <div style={{
                  fontSize: 18, fontWeight: 900, fontFamily: 'DM Mono,monospace',
                  color: urgency === 'overdue' ? '#ff8a80' : urgency === 'critical' ? '#ffab91' : theme.accent,
                }}>{countdownLabel}</div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.sub, textTransform: 'uppercase', letterSpacing: '.05em' }}>Progress</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: theme.text }}>{Math.round((passedCount / 3) * 100)}%</span>
            </div>
            <div style={{ background: theme.barTrack, borderRadius: 6, height: 10, overflow: 'hidden' }}>
              <div style={{
                width: `${(passedCount / 3) * 100}%`, height: '100%',
                background: theme.barFill, borderRadius: 6, transition: 'width .4s',
              }} />
            </div>
          </div>

          {/* Module pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {MODULES.map(m => {
              const p = mods[m]
              const passed  = p?.passed
              const expired = passed && p?.expires_at && new Date(p.expires_at) < new Date()
              const failed  = p && !passed
              return (
                <div key={m} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,.12)',
                  border: `1px solid ${passed && !expired ? theme.accent : 'rgba(255,255,255,.2)'}`,
                  borderRadius: 20, padding: '4px 11px', fontSize: 11, fontWeight: 700,
                  color: passed && !expired ? theme.accent : 'rgba(255,255,255,.65)',
                }}>
                  <span>{passed && !expired ? '✓' : expired ? '⚠' : failed ? '✗' : '○'}</span>
                  {LABELS[m].split(' ')[0]}
                </div>
              )
            })}
          </div>

          <div style={{ fontSize: 11, color: theme.sub, textAlign: 'right' }}>Tap to start training →</div>
        </div>
      )
    })()}

    {/* Incident reports card */}
    {(() => {
      const total    = incidents?.length ?? null
      const pending  = incidents?.filter(i => !i.reviewed_at).length ?? null
      const reviewed = incidents?.filter(i => !!i.reviewed_at).length ?? null

      return (
        <div
          onClick={() => nav('/staff/incidents')}
          style={{
            background: 'linear-gradient(135deg,#fff5f5,#fff0f0)',
            border: '1.5px solid #ffcdd2',
            borderRadius: 14, padding: '16px 18px', marginBottom: 14, cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 22 }}>🚨</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>Incident Reports</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 1 }}>
                  {total === null ? 'Loading…' : total === 0 ? 'No incidents reported' : `${total} report${total !== 1 ? 's' : ''} submitted`}
                </div>
              </div>
            </div>
            <span style={{
              background: '#c62828', color: '#fff',
              fontWeight: 700, fontSize: 20, borderRadius: 10,
              padding: '4px 12px', fontFamily: 'DM Mono,monospace',
            }}>{total ?? '…'}</span>
          </div>

          {total !== null && total > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1, background: '#fff3e0', border: '1px solid #ffe082',
                borderRadius: 8, padding: '8px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#e65100', fontFamily: 'DM Mono,monospace' }}>{pending}</div>
                <div style={{ fontSize: 10, color: '#b45000', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>Pending review</div>
              </div>
              <div style={{
                flex: 1, background: '#e8f5e8', border: '1px solid #a5d6a7',
                borderRadius: 8, padding: '8px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2e7d32', fontFamily: 'DM Mono,monospace' }}>{reviewed}</div>
                <div style={{ fontSize: 10, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>Reviewed</div>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#888', marginTop: 10, textAlign: 'right' }}>Tap to view or report →</div>
        </div>
      )
    })()}

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
            <div style={{ width:100, fontSize:12, fontWeight:700, color:'#1a2a1a', flexShrink:0 }}>
              {(() => { const dt = new Date(s.date + 'T12:00:00'); return dt.toLocaleDateString('en-GB',{weekday:'short'}) + ' ' + dt.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}) })()}
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
