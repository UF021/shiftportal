import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyMessages } from '../../api/client'
import { DocsProvider, useDocs } from '../../api/DocsContext'
import OrgLogo from '../../components/OrgLogo'

const BASE_NAV = [
  { path:'/staff',             icon:'🏠', label:'Home',      bg:'#e8f4ff', active:'#1565c0' },
  { path:'/staff/contract',    icon:'📄', label:'Contract',  bg:'#f0faf0', active:'#2e7d32' },
  { path:'/staff/documents',   icon:'📋', label:'Docs',      bg:'#fff8e8', active:'#b45000' },
  { path:'/staff/holidays',    icon:'🌴', label:'Holidays',  bg:'#f0fff8', active:'#007a50' },
  { path:'/staff/messages',    icon:'💬', label:'Messages',  bg:'#fdf0ff', active:'#7b1fa2' },
  { path:'/staff/incidents',   icon:'🚨', label:'Incidents', bg:'#fff0f0', active:'#c62828' },
  { path:'/staff/training',    icon:'🎓', label:'Training',  bg:'#fffbe8', active:'#e65100' },
  { path:'/staff/profile',     icon:'👤', label:'Profile',   bg:'#f0f0f0', active:'#37474f' },
]

// Inner component — has access to DocsProvider context
function StaffLayoutInner() {
  const { user, signOut }    = useAuth()
  const { colour }           = useBrand()
  const nav                  = useNavigate()
  const { pathname }         = useLocation()
  const c                    = colour || '#6abf3f'
  const { unconfirmedCount } = useDocs()
  const [unread, setUnread]  = useState(0)

  useEffect(() => {
    getMyMessages()
      .then(r => setUnread((r.data || []).filter(m => !m.is_read).length))
      .catch(() => {})
  }, [pathname])

  return (
    <div className="sp">
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
        <Outlet />
      </div>

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
