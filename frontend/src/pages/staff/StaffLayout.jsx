import { useEffect, useState, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyMessages, getMyCompliance, recordComplianceWarning, getMyIncidents, getMyClockHistory } from '../../api/client'
import { DocsProvider, useDocs } from '../../api/DocsContext'
import OrgLogo from '../../components/OrgLogo'
import InstallBanner from '../../components/InstallBanner'

const BASE_NAV = [
  { path:'/staff',             icon:'🏠', label:'Home',      bg:'#e8f4ff', active:'#1565c0' },
  { path:'/staff/shifts',      icon:'🕐', label:'Shifts',    bg:'#f0f8ff', active:'#0277bd' },
  { path:'/staff/documents',   icon:'📋', label:'Docs',      bg:'#fff8e8', active:'#b45000' },
  { path:'/staff/holidays',    icon:'🌴', label:'Holidays',  bg:'#f0fff8', active:'#007a50' },
  { path:'/staff/messages',    icon:'💬', label:'Messages',  bg:'#fdf0ff', active:'#7b1fa2' },
  { path:'/staff/incidents',   icon:'🚨', label:'Incidents', bg:'#fff0f0', active:'#c62828' },
  { path:'/staff/training',    icon:'🎓', label:'Training',  bg:'#fffbe8', active:'#e65100' },
  { path:'/staff/profile',     icon:'👤', label:'Details',   bg:'#f0f0f0', active:'#37474f' },
]

// ── Compliance warning modal ──────────────────────────────────────────────────

function ComplianceModal({ compliance, onDismiss, onGoToDocs, onGoToTraining }) {
  const deadline = compliance.deadline ? new Date(compliance.deadline) : null
  const deadlineStr = deadline
    ? deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const isPastDeadline = deadline && new Date() > deadline

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%',
        boxShadow: '0 16px 60px rgba(0,0,0,.3)',
        border: `2px solid ${isPastDeadline ? '#e05555' : '#f0c060'}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: isPastDeadline ? '#c62828' : '#f0a030',
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              ACTION REQUIRED — Complete Your Compliance
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', marginTop: 3 }}>
              {isPastDeadline
                ? 'Your deadline has passed. Clock-in is now blocked until compliant.'
                : 'You have outstanding mandatory requirements to complete.'}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 14, color: '#444', marginBottom: 16, lineHeight: 1.6 }}>
            You have not yet completed the following mandatory steps:
          </p>

          {compliance.unconfirmed_docs.map(d => (
            <div key={d} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, marginBottom: 8,
              background: '#fff8e6', border: '1px solid #f0c060',
            }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ fontSize: 14, color: '#5a3a00', fontWeight: 600 }}>Read & confirm: {d}</span>
            </div>
          ))}

          {compliance.incomplete_training.map(t => (
            <div key={t} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, marginBottom: 8,
              background: '#fff8e6', border: '1px solid #f0c060',
            }}>
              <span style={{ fontSize: 18 }}>🎓</span>
              <span style={{ fontSize: 14, color: '#5a3a00', fontWeight: 600 }}>Complete: {t}</span>
            </div>
          ))}

          {deadlineStr && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 10,
              background: isPastDeadline ? '#fde8e8' : '#fff3e0',
              border: `1.5px solid ${isPastDeadline ? '#e05555' : '#f0a030'}`,
              fontSize: 14, fontWeight: 700,
              color: isPastDeadline ? '#a02020' : '#7a4000',
            }}>
              {isPastDeadline
                ? `⛔ Deadline passed: ${deadlineStr} — clock-in is blocked`
                : `⏳ Deadline: ${deadlineStr} — clock-in will be blocked after this date`}
            </div>
          )}

          <p style={{ fontSize: 13, color: '#666', marginTop: 14, lineHeight: 1.6 }}>
            Please complete these in the <strong>Documents</strong> and <strong>Training</strong> sections of your portal.
          </p>
        </div>

        {/* Footer buttons */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #eee',
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
        }}>
          <button onClick={onGoToDocs} style={{
            padding: '11px 20px', borderRadius: 9, border: 'none',
            background: '#b45000', color: '#fff', fontFamily: 'DM Sans,sans-serif',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            📋 Go to Documents
          </button>
          <button onClick={onGoToTraining} style={{
            padding: '11px 20px', borderRadius: 9, border: 'none',
            background: '#e65100', color: '#fff', fontFamily: 'DM Sans,sans-serif',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            🎓 Go to Training
          </button>
          {!isPastDeadline && (
            <button onClick={onDismiss} style={{
              padding: '11px 20px', borderRadius: 9,
              border: '1.5px solid #ccc', background: '#fff',
              color: '#666', fontFamily: 'DM Sans,sans-serif',
              fontSize: 14, cursor: 'pointer',
            }}>
              Remind me later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── No-incident-report alert ──────────────────────────────────────────────────

function NoIncidentAlert({ onDismiss, nav }) {
  return (
    <div style={{
      background: '#fff3e0', border: '1.5px solid #f0a030', borderRadius: 12,
      padding: '14px 18px', marginBottom: 18,
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>🚨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#7a4000', marginBottom: 4 }}>
          Have you reported all incidents?
        </div>
        <div style={{ fontSize: 13, color: '#8a5000', lineHeight: 1.6, marginBottom: 10 }}>
          You have worked at least one shift in the past week but have not filed any incident reports.
          All incidents — no matter how minor — must be reported. Please report any incidents that occurred during your shifts.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/staff/incidents')} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#c62828', color: '#fff',
            fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}>
            🚨 Report an Incident
          </button>
          <button onClick={onDismiss} style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid #ccc', background: '#fff',
            color: '#666', fontFamily: 'DM Sans,sans-serif',
            fontSize: 13, cursor: 'pointer',
          }}>
            No incidents to report
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inner component — has access to DocsProvider context ──────────────────────

function StaffLayoutInner() {
  const { user, signOut }    = useAuth()
  const { colour }           = useBrand()
  const nav                  = useNavigate()
  const { pathname }         = useLocation()
  const c                    = colour || '#6abf3f'
  const { unconfirmedCount } = useDocs()
  const [unread, setUnread]  = useState(0)

  // Compliance modal state
  const [compliance,         setCompliance]         = useState(null)
  const [showCompliance,     setShowCompliance]      = useState(false)
  const warnRecorded                                 = useRef(false)

  // No-incident alert state
  const [showIncidentAlert,  setShowIncidentAlert]   = useState(false)
  const incidentChecked                              = useRef(false)

  useEffect(() => {
    getMyMessages()
      .then(r => setUnread((r.data || []).filter(m => !m.is_read).length))
      .catch(() => {})
  }, [pathname])

  // Check compliance once on mount
  useEffect(() => {
    getMyCompliance()
      .then(r => {
        const c = r.data
        if (!c.is_compliant) {
          setCompliance(c)
          setShowCompliance(true)
          // Record warning date on first show
          if (!c.warned_at && !warnRecorded.current) {
            warnRecorded.current = true
            recordComplianceWarning().catch(() => {})
          }
        }
      })
      .catch(() => {})
  }, [])

  // Check for no incident reports in past week
  useEffect(() => {
    if (incidentChecked.current) return
    incidentChecked.current = true
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoStr = weekAgo.toISOString().split('T')[0]
    const todayStr   = new Date().toISOString().split('T')[0]
    Promise.all([
      getMyIncidents().catch(() => ({ data: [] })),
      getMyClockHistory({ from_date: weekAgoStr, to_date: todayStr }).catch(() => ({ data: { shifts: [] } })),
    ]).then(([incRes, clockRes]) => {
      const incidents = incRes.data || []
      const shifts    = clockRes.data?.shifts || []
      const hasShiftsThisWeek = shifts.some(s => {
        const shiftDate = new Date(s.date)
        return shiftDate >= weekAgo
      })
      const sessionDismissed = sessionStorage.getItem('incident_alert_dismissed')
      if (hasShiftsThisWeek && incidents.length === 0 && !sessionDismissed) {
        setShowIncidentAlert(true)
      }
    })
  }, [])

  function dismissIncidentAlert() {
    sessionStorage.setItem('incident_alert_dismissed', '1')
    setShowIncidentAlert(false)
  }

  return (
    <div className="sp">
      {/* Compliance modal */}
      {showCompliance && compliance && (
        <ComplianceModal
          compliance={compliance}
          onDismiss={() => setShowCompliance(false)}
          onGoToDocs={() => { setShowCompliance(false); nav('/staff/documents') }}
          onGoToTraining={() => { setShowCompliance(false); nav('/staff/training') }}
        />
      )}

      {/* Top bar */}
      <div style={{
        background: '#0f1923', padding: '0 20px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,.3)',
      }}>
        <div onClick={() => nav('/staff')} style={{ cursor:'pointer' }}><OrgLogo height={32} dark={true} /></div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            background: c + '22', border: `1px solid ${c}55`,
            borderRadius: 20, padding: '5px 14px', fontSize: 13, color: c,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:c }} />
            {user?.first_name}
          </div>
          <button onClick={() => { signOut(); nav('/login') }} style={{
            padding:'6px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,.15)',
            background:'transparent', color:'rgba(255,255,255,.6)', fontSize:12, cursor:'pointer',
          }}>Sign out</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:680, margin:'0 auto', padding:'20px 16px calc(84px + env(safe-area-inset-bottom))' }}>
        {/* No-incident alert — shown at top of every page until dismissed */}
        {showIncidentAlert && (
          <NoIncidentAlert onDismiss={dismissIncidentAlert} nav={nav} />
        )}
        <Outlet />
      </div>

      <InstallBanner />

      {/* Bottom nav */}
      <nav style={{
        background:'#f5f7f5', borderTop:'1px solid #dde8dd',
        display:'flex', position:'fixed', bottom:0, left:0, right:0, zIndex:99,
        boxShadow:'0 -2px 12px rgba(0,0,0,.08)',
        paddingBottom:'env(safe-area-inset-bottom)',
        gap:4, padding:'6px 4px calc(6px + env(safe-area-inset-bottom))',
      }}>
        {BASE_NAV.map(({ path, icon, label, bg, active: activeCol }) => {
          const active     = pathname === path || (path !== '/staff' && pathname.startsWith(path))
          const isMsgs     = path === '/staff/messages'
          const isDocs     = path === '/staff/documents'
          const badgeCount = isMsgs ? unread : isDocs ? unconfirmedCount : 0
          return (
            <button key={path} onClick={() => nav(path)} style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              padding:'6px 2px 5px', cursor:'pointer', border:'none',
              background: active ? activeCol : bg,
              borderRadius: 10,
              fontFamily:'DM Sans,sans-serif',
              color: active ? '#fff' : activeCol,
              transition:'all .15s', position:'relative',
              boxShadow: active ? `0 2px 8px ${activeCol}55` : 'none',
            }}>
              <span style={{ fontSize:19, marginBottom:2, transform:active?'scale(1.1)':'none', transition:'transform .15s', position:'relative' }}>
                {icon}
                {badgeCount > 0 && (
                  <span style={{
                    position:'absolute', top:-4, right:-6,
                    background:'#e53935', color:'#fff',
                    fontSize:9, fontWeight:700, borderRadius:8,
                    padding:'1px 4px', lineHeight:'14px',
                    minWidth:14, textAlign:'center',
                  }}>{badgeCount}</span>
                )}
              </span>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.02em', textTransform:'uppercase', opacity: active ? 1 : 0.75 }}>{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// Outer wrapper — provides DocsContext to all staff pages
export default function StaffLayout() {
  return (
    <DocsProvider>
      <StaffLayoutInner />
    </DocsProvider>
  )
}
