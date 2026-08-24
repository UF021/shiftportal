import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'

const NAV = [
  { path:'/hr',                 icon:'📊', label:'Dashboard' },
  { path:'/hr/reports',         icon:'📈', label:'Reports' },
  { path:'/hr/applications',    icon:'📝', label:'Applications' },
  { path:'/hr/registrations',   icon:'📋', label:'Registrations' },
  { path:'/hr/staff',           icon:'👥', label:'Staff Records' },
  { path:'/hr/staff/archived',  icon:'📦', label:'Archived Staff',   indent: true },
  { path:'/hr/import',          icon:'📤', label:'Bulk Import',       indent: true },
  { path:'/hr/duplicates',      icon:'🔀', label:'Merge Duplicates' },
  { path:'/hr/timelogs',        icon:'⏱',  label:'Time Report' },
  { path:'/hr/payroll',         icon:'💷', label:'Payroll' },
  { path:'/hr/holidays',        icon:'🌴', label:'Holidays' },
  { path:'/hr/shifts',          icon:'📅', label:'Shift Scheduler' },
  { path:'/hr/manual',          icon:'✏️', label:'Manual Entry' },
  { path:'/hr/qrcodes',         icon:'📱', label:'QR Codes' },
  { path:'/hr/failures',        icon:'⚠️', label:'Clock Alerts' },
  { path:'/hr/messages',        icon:'💬', label:'Messages' },
  { path:'/hr/contacts',        icon:'📩', label:'Web Enquiries' },
  { path:'/hr/incidents',       icon:'🚨', label:'Incidents' },
  { path:'/hr/training',        icon:'🎓', label:'Training' },
  { path:'/hr/gps',             icon:'📍', label:'GPS Captures' },
  { path:'/hr/audit',           icon:'🔍', label:'Audit Log' },
  { path:'/hr/gdpr',            icon:'🛡', label:'GDPR Tools' },
  { path:'/hr/settings',        icon:'⚙️', label:'Settings' },
  { path:'/hr/billing',         icon:'💳', label:'Billing & Plan' },
]

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

function NavItem({ item, active, c, onClick }) {
  const { path, icon, label, indent } = item
  return (
    <div onClick={onClick || undefined} style={{
      display:'flex', alignItems:'center', gap:10,
      padding: indent ? '9px 18px 9px 34px' : '11px 18px',
      fontSize: indent ? 12 : 13,
      cursor:'pointer', transition:'all .15s',
      borderLeft:`3px solid ${active ? c : 'transparent'}`,
      background: active ? c + '18' : 'transparent',
      color: active ? c : indent ? 'var(--text-dim)' : 'var(--text-muted)',
      fontWeight: active ? 700 : 400,
      WebkitTapHighlightColor: 'transparent',
      minHeight: 44,
    }}>
      <span style={{ fontSize: indent ? 13 : 16, width:22, textAlign:'center', flexShrink:0 }}>{icon}</span>
      {label}
    </div>
  )
}

export default function HRLayout() {
  const { user, signOut }  = useAuth()
  const { colour }         = useBrand()
  const nav                = useNavigate()
  const { pathname }       = useLocation()
  const c                  = colour || '#6abf3f'
  const isMobile           = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef(null)

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  // Close drawer on outside tap
  useEffect(() => {
    if (!drawerOpen) return
    const handler = e => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [drawerOpen])

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  function isActive(path) {
    return pathname === path || (
      path !== '/hr' &&
      pathname.startsWith(path) &&
      !NAV.some(n => n.path !== path && n.path.startsWith(path) && pathname.startsWith(n.path))
    )
  }

  const sidebarContent = (
    <div style={{
      padding:'16px 0 32px',
      overflowY:'auto', height:'100%',
    }}>
      <div style={{ padding:'0 0 8px 18px', fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>
        HR Management
      </div>
      {NAV.map(item => (
        <NavItem
          key={item.path}
          item={item}
          active={isActive(item.path)}
          c={c}
          onClick={() => nav(item.path)}
        />
      ))}
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', color:'var(--text)' }}>

      {/* Topbar */}
      <div style={{
        background:'var(--navy-mid)', borderBottom:'1px solid var(--border)',
        padding:'0 16px', height:56,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:200,
      }}>
        {/* Left: hamburger (mobile) + logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(v => !v)}
              aria-label="Open navigation"
              style={{
                background:'none', border:'none', cursor:'pointer',
                color:'var(--text-muted)', padding:'6px', borderRadius:6,
                display:'flex', flexDirection:'column', gap:4, flexShrink:0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {drawerOpen ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <line x1="3" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          )}
          <div onClick={() => nav('/hr')} style={{ cursor:'pointer' }}>
            <OrgLogo height={32} dark={true} />
          </div>
        </div>

        {/* Right: user pill + sign out */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            display:'flex', alignItems:'center', gap:6,
            background:'var(--navy-light)', border:'1px solid var(--border)',
            borderRadius:8, padding:'5px 10px', fontSize:12,
            maxWidth: isMobile ? 120 : 'none', overflow:'hidden',
          }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:c, flexShrink:0 }} />
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {isMobile ? user?.first_name : `${user?.first_name} ${user?.last_name}`}
            </span>
            {!isMobile && (
              <span style={{ fontSize:10, color:'var(--text-muted)', whiteSpace:'nowrap' }}>HR Admin</span>
            )}
          </div>
          <button onClick={() => { signOut(); nav('/login') }} style={{
            padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
            background:'transparent', color:'var(--text-muted)', fontSize:12,
            cursor:'pointer', fontFamily:'DM Sans,sans-serif', whiteSpace:'nowrap',
            WebkitTapHighlightColor: 'transparent',
          }}>
            {isMobile ? '⎋' : 'Sign out'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:'flex', minHeight:'calc(100vh - 56px)' }}>

        {/* Desktop sidebar */}
        {!isMobile && (
          <div style={{
            width:224, background:'var(--navy-mid)', borderRight:'1px solid var(--border)',
            flexShrink:0, position:'sticky', top:56, height:'calc(100vh - 56px)',
            overflowY:'auto',
          }}>
            {sidebarContent}
          </div>
        )}

        {/* Mobile drawer overlay */}
        {isMobile && drawerOpen && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setDrawerOpen(false)}
              style={{
                position:'fixed', inset:0, top:56,
                background:'rgba(0,0,0,.65)', zIndex:150,
              }}
            />
            {/* Drawer */}
            <div
              ref={drawerRef}
              style={{
                position:'fixed', top:56, left:0, bottom:0,
                width:260, background:'var(--navy-mid)',
                borderRight:'1px solid var(--border)',
                zIndex:160, overflowY:'auto',
                boxShadow:'4px 0 24px rgba(0,0,0,.4)',
                animation:'slideInLeft .2s ease',
              }}
            >
              {sidebarContent}
            </div>
          </>
        )}

        {/* Main content */}
        <div style={{
          flex:1,
          padding: isMobile ? '16px 14px 32px' : '28px 32px',
          overflowY:'auto', minWidth:0,
        }}>
          <Outlet />
        </div>
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
