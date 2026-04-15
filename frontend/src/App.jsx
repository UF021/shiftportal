import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useAuth } from './api/AuthContext'
import { BrandProvider } from './api/BrandContext'

// Public
import LoginPage    from './pages/public/LoginPage'
import RegisterPage from './pages/public/RegisterPage'
import PendingPage  from './pages/public/PendingPage'
import ClockPage    from './pages/public/ClockPage'

// Staff (light theme)
import StaffLayout    from './pages/staff/StaffLayout'
import StaffDashboard from './pages/staff/StaffDashboard'
import StaffContract  from './pages/staff/StaffContract'
import StaffDocuments from './pages/staff/StaffDocuments'
import StaffHolidays  from './pages/staff/StaffHolidays'
import StaffProfile   from './pages/staff/StaffProfile'

// HR (dark theme)
import HRLayout         from './pages/hr/HRLayout'
import HRDashboard      from './pages/hr/HRDashboard'
import HRRegistrations  from './pages/hr/HRRegistrations'
import HRStaff          from './pages/hr/HRStaff'
import HRTimelogs       from './pages/hr/HRTimelogs'
import HRHolidays       from './pages/hr/HRHolidays'
import HRManualShift    from './pages/hr/HRManualShift'
import HRSettings       from './pages/hr/HRSettings'

// Superadmin
import SuperLayout  from './pages/superadmin/SuperLayout'
import SuperDash    from './pages/superadmin/SuperDash'
import SuperOrgs    from './pages/superadmin/SuperOrgs'
import SuperNewOrg  from './pages/superadmin/SuperNewOrg'

function Guard({ children, role }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!user)   return <Navigate to="/login" replace />
  if (role && !role.includes(user.role)) {
    return <Navigate to={user.role === 'hr' ? '/hr' : user.role === 'superadmin' ? '/super' : '/staff'} replace />
  }
  return children
}

// Wrapper that reads :slug from URL and provides branding
function BrandedRoute({ children }) {
  const { slug } = useParams()
  return <BrandProvider slug={slug}>{children}</BrandProvider>
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* ── QR Clock page (public) ── */}
      <Route path="/clock/:slug/:site_code" element={<BrandedRoute><ClockPage /></BrandedRoute>} />

      {/* ── Org-scoped login / register ── */}
      <Route path="/login/:slug"    element={<BrandedRoute><LoginPage /></BrandedRoute>} />
      <Route path="/register/:slug" element={<BrandedRoute><RegisterPage /></BrandedRoute>} />
      <Route path="/pending"        element={<PendingPage />} />

      {/* ── Fallback login (no slug) ── */}
      <Route path="/login" element={<BrandProvider slug="ikan-fm"><LoginPage /></BrandProvider>} />

      {/* ── Staff portal ── */}
      <Route path="/staff" element={
        <Guard role={['staff']}><BrandProvider slug={user?.org_slug}><StaffLayout /></BrandProvider></Guard>
      }>
        <Route index             element={<StaffDashboard />} />
        <Route path="contract"  element={<StaffContract />} />
        <Route path="documents" element={<StaffDocuments />} />
        <Route path="holidays"  element={<StaffHolidays />} />
        <Route path="profile"   element={<StaffProfile />} />
      </Route>

      {/* ── HR portal ── */}
      <Route path="/hr" element={
        <Guard role={['hr']}><BrandProvider slug={user?.org_slug}><HRLayout /></BrandProvider></Guard>
      }>
        <Route index                element={<HRDashboard />} />
        <Route path="registrations" element={<HRRegistrations />} />
        <Route path="staff"         element={<HRStaff />} />
        <Route path="timelogs"      element={<HRTimelogs />} />
        <Route path="holidays"      element={<HRHolidays />} />
        <Route path="manual"        element={<HRManualShift />} />
        <Route path="settings"      element={<HRSettings />} />
      </Route>

      {/* ── Superadmin ── */}
      <Route path="/super" element={<Guard role={['superadmin']}><SuperLayout /></Guard>}>
        <Route index       element={<SuperDash />} />
        <Route path="orgs" element={<SuperOrgs />} />
        <Route path="new"  element={<SuperNewOrg />} />
      </Route>

      {/* ── Root redirect ── */}
      <Route path="/" element={
        !user ? <Navigate to="/login" replace /> :
        user.role === 'superadmin' ? <Navigate to="/super" replace /> :
        user.role === 'hr'         ? <Navigate to="/hr"    replace /> :
                                     <Navigate to="/staff" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
