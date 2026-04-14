import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import OrgLogo from '../../components/OrgLogo'

const NAV = [
  { path:'/staff',          icon:'🏠', label:'Home' },
  { path:'/staff/contract', icon:'📄', label:'Contract' },
  { path:'/staff/holidays', icon:'🌴', label:'Holidays' },
  { path:'/staff/profile',  icon:'👤', label:'Profile' },
]

export default function StaffLayout() {
  const { user, signOut } = useAuth()
  const { colour }        = useBrand()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const c = colour || '#6abf3f'

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
        background:'#fff', borderTop:'1px solid #dde8dd',
        display:'flex', position:'fixed', bottom:0, left:0, right:0, zIndex:99,
        boxShadow:'0 -2px 12px rgba(0,0,0,.08)',
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        {NAV.map(({ path, icon, label }) => {
          const active = pathname === path || (path !== '/staff' && pathname.startsWith(path))
          return (
            <button key={path} onClick={() => nav(path)} style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              padding:'8px 4px 10px', cursor:'pointer', border:'none',
              background:'transparent', fontFamily:'DM Sans,sans-serif',
              color: active ? c : '#6a8a6a',
              transition:'color .15s',
            }}>
              <span style={{ fontSize:22, marginBottom:3, transform:active?'scale(1.1)':'none', transition:'transform .15s' }}>{icon}</span>
              <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.03em', textTransform:'uppercase' }}>{label}</span>
              {active && <div style={{ width:20, height:2, background:c, borderRadius:1, marginTop:3 }} />}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
