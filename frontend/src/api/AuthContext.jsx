import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, getMe } from '../api/client'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('sp_user')
    const token = localStorage.getItem('sp_token')
    if (saved && token) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  async function signIn(email, password) {
    const res = await apiLogin(email, password)
    localStorage.setItem('sp_token', res.data.access_token)
    const profile = await getMe()
    const u = { ...profile.data, role: res.data.role }
    localStorage.setItem('sp_user', JSON.stringify(u))
    setUser(u)
    return u
  }

  function signOut() {
    localStorage.removeItem('sp_token')
    localStorage.removeItem('sp_user')
    setUser(null)
  }

  function refreshUser() {
    return getMe().then(r => {
      const u = { ...r.data, role: user?.role }
      localStorage.setItem('sp_user', JSON.stringify(u))
      setUser(u)
      return u
    })
  }

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signOut, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
