import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'

const NAV = [
  { path:'/hr',                 icon:'📊', label:'Dashboard' },
  { path:'/hr/applications',    icon:'📝', label:'Applications' },
  { path:'/hr/registrations',   icon:'📋', label:'Registrations' },
  { path:'/hr/staff',           icon:'👥', label:'Staff Records' },
  { path:'/hr/timelogs',        icon:'⏱',  label:'Time Report' },
  { path:'/hr/holidays',        icon:'🌴', label:'Holidays' },
  { path:'/hr/manual',          icon:'✏️', label:'Manual Entry' },
  { path:'/hr/qrcodes',         icon:'📱', label:'QR Codes' },
  { path:'/hr/failures',        icon:'⚠️', label:'Clock Alerts' },
  { path:'/hr/messages',        icon:'💬', label:'Messages' },
  { path:'/hr/gps',             icon:'📍', label:'GPS Captures' },
  { path:'/hr/settings',        icon:'⚙️', label:'Settings' },
]

export default function HRLayout() {
  const { user, signOut } = useAuth()
  const { colour }        = useBrand()
  const nav               = useNavigate()
  const { pathname }      = useLocation()
  const c = colour || '#6abf3f'

  return (
    <div style={{ minHeight:'100vh', background:'var(--navy)', color:'var(--text)' }}>
      {/* Topbar */}
      <div style={{
        background:'var(--navy-mid)', borderBottom:'1px solid var(--border)',
        padding:'0 24px', height:60, display:'flex', alignItems:'center',
        justifyContent:'space-between', position:'sticky', top:0, zIndex:100,
      }}>
        <div onClick={() => nav('/hr')} style={{ cursor:'pointer' }}><OrgLogo height={36} dark={true} /></div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            display:'flex', alignItems:'center', gap:7,
            background:'var(--navy-light)', border:'1px solid var(--border)',
            borderRadius:8, padding:'6px 12px', fontSize:13,
          }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:c }} />
            <span>{user?.first_name} {user?.last_name}</span>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>HR Admin</span>
          </div>
          <button onClick={()=>{ signOut(); nav('/login') }} style={{
            padding:'6px 14px', borderRadius:6, border:'1px solid var(--border)',
            background:'transparent', color:'var(--text-muted)', fontSize:12,
            cursor:'pointer', fontFamily:'DM Sans,sans-serif',
          }}>Sign out</button>
        </div>
      </div>

      <div style={{ display:'flex', minHeight:'calc(100vh - 60px)' }}>
        {/* Sidebar */}
        <div style={{
          width:224, background:'var(--navy-mid)', borderRight:'1px solid var(--border)',
          padding:'20px 0', flexShrink:0,
        }}>
          <div style={{ padding:'0 0 8px 18px', fontSize:10, fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>
            HR Management
          </div>
          {NAV.map(({ path, icon, label }) => {
            const active = pathname === path || (path !== '/hr' && pathname.startsWith(path))
            return (
              <div key={path} onClick={() => nav(path)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 18px',
                fontSize:13, cursor:'pointer', transition:'all .15s',
                borderLeft:`3px solid ${active ? c : 'transparent'}`,
                background: active ? c + '18' : 'transparent',
                color: active ? c : 'var(--text-muted)',
                fontWeight: active ? 700 : 400,
              }}>
                <span style={{ fontSize:15, width:20, textAlign:'center' }}>{icon}</span>
                {label}
              </div>
            )
          })}
        </div>

        {/* Main */}
        <div style={{ flex:1, padding:'30px 34px', overflowY:'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
