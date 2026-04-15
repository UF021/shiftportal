import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('sp_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sp_token')
      localStorage.removeItem('sp_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Auth
export const login        = (email, password) => api.post('/auth/login', { email, password })
export const register     = data              => api.post('/auth/register', data)
export const getMe        = ()               => api.get('/auth/me')
export const getOrgPublic = slug             => api.get(`/auth/org/${slug}`)

// Staff
export const getAllStaff  = ()       => api.get('/staff/all')
export const updateStaff  = (id, d) => api.patch(`/staff/${id}`, d)

// Registrations
export const getPending   = ()       => api.get('/registrations/pending')
export const activateUser = (id, d) => api.post(`/registrations/${id}/activate`, d)
export const rejectUser   = id      => api.post(`/registrations/${id}/reject`)

// Timelogs
export const getMyLogs    = ()       => api.get('/timelogs/my')
export const createLog    = d        => api.post('/timelogs/', d)
export const deleteLog    = id      => api.delete(`/timelogs/${id}`)
export const getAllLogs    = params  => api.get('/timelogs/all', { params })

// Holidays
export const getMyHols    = ()       => api.get('/holidays/my')
export const requestHol   = d        => api.post('/holidays/', d)
export const approveHol   = id      => api.patch(`/holidays/${id}/approve`)
export const rejectHol    = id      => api.patch(`/holidays/${id}/reject`)
export const getAllHols    = p       => api.get('/holidays/all', { params: p })

// Org / HR
export const getMyOrg     = ()  => api.get('/orgs/me')
export const updateBranding = d => api.patch('/orgs/me/branding', d)
export const getMySites   = ()  => api.get('/orgs/me/sites')
export const createSite   = d   => api.post('/orgs/me/sites', d)
export const deleteSite   = id  => api.delete(`/orgs/me/sites/${id}`)
export const getDashboard  = () => api.get('/orgs/me/dashboard')
export const getOrgDocs    = ()           => api.get('/orgs/me/documents')
export const updateOrgDoc  = (key, data)  => api.put(`/orgs/me/documents/${key}`, data)

// Clock
export const getMyClockHistory  = ()      => api.get('/clock/my/history')
export const getMyHolidayStats  = ()      => api.get('/clock/my/holiday-stats')
export const getAllClockEvents   = ()      => api.get('/clock/all')
export const getPunctuality      = uid    => api.get(`/clock/punctuality/${uid}`)
export const getShiftAvg         = uid    => api.get(`/clock/shift-avg/${uid}`)
export const createManualShift   = d      => api.post('/clock/manual', d)

// Superadmin
export const superDashboard = ()      => api.get('/superadmin/dashboard')
export const listOrgs       = ()      => api.get('/orgs/')
export const createOrg      = d       => api.post('/orgs/', d)
export const toggleOrg      = id      => api.post(`/superadmin/organisations/${id}/toggle-active`)
export const extendTrial    = (id,d)  => api.post(`/superadmin/organisations/${id}/extend-trial`, null, { params: d })
