import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../api/AuthContext'

const NAV = [
  { path:'/super',      icon:'📊', label:'Dashboard' },
  { path:'/super/orgs', icon:'🏢', label:'Organisations' },
  { path:'/super/new',  icon:'➕', label:'New Organisation' },
]

export default function SuperLayout() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()

  return (
    <div style={{ minHeight:'100vh', background:'#0a0f15', color:'#e8f0e0' }}>
      {/* Topbar */}
      <div style={{ background:'#0f1923', borderBottom:'1px solid rgba(106,191,63,.2)', padding:'0 24px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:20 }}>⚡</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#6abf3f' }}>ShiftPortal</div>
            <div style={{ fontSize:10, color:'#4a6a4a', textTransform:'uppercase', letterSpacing:'.06em' }}>Super Admin</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:13, color:'#7a9a7a' }}>{user?.first_name} {user?.last_name}</span>
          <button onClick={() => { signOut(); nav('/login') }} style={{ padding:'6px 14px', borderRadius:6, border:'1px solid rgba(106,191,63,.25)', background:'transparent', color:'#7a9a7a', fontSize:12, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Sign out</button>
        </div>
      </div>

      <div style={{ display:'flex', minHeight:'calc(100vh - 60px)' }}>
        {/* Sidebar */}
        <div style={{ width:220, background:'#0f1923', borderRight:'1px solid rgba(106,191,63,.15)', padding:'20px 0', flexShrink:0 }}>
          {NAV.map(({ path, icon, label }) => {
            const active = pathname === path || (path !== '/super' && pathname.startsWith(path))
            return (
              <div key={path} onClick={() => nav(path)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 18px',
                fontSize:13, cursor:'pointer', transition:'all .15s',
                borderLeft:`3px solid ${active ? '#6abf3f' : 'transparent'}`,
                background: active ? 'rgba(106,191,63,.12)' : 'transparent',
                color: active ? '#6abf3f' : '#7a9a7a',
                fontWeight: active ? 700 : 400,
              }}>
                <span style={{ fontSize:15 }}>{icon}</span>{label}
              </div>
            )
          })}
        </div>

        <div style={{ flex:1, padding:'30px 34px', overflowY:'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
