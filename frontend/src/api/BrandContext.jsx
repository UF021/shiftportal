import { createContext, useContext, useState, useEffect } from 'react'
import { getOrgPublic } from '../api/client'

const BrandCtx = createContext({
  name: 'Staff Portal', colour: '#6abf3f', logo_url: null, slug: null, loaded: false
})

export function BrandProvider({ slug, children }) {
  const [brand, setBrand] = useState({
    name: 'Staff Portal', colour: '#6abf3f', logo_url: null, slug, loaded: false
  })

  useEffect(() => {
    if (!slug) { setBrand(b => ({ ...b, loaded: true })); return }
    getOrgPublic(slug)
      .then(r => {
        const b = r.data
        setBrand({ ...b, loaded: true })
        // Apply brand colour as CSS variable globally
        document.documentElement.style.setProperty('--brand', b.colour || '#6abf3f')
        document.documentElement.style.setProperty('--brand-dark',  darken(b.colour || '#6abf3f'))
        document.documentElement.style.setProperty('--brand-muted', b.colour + '20' || '#6abf3f20')
        if (b.name) document.title = `${b.name} — Staff Portal`
      })
      .catch(() => setBrand(b => ({ ...b, loaded: true })))
  }, [slug])

  return <BrandCtx.Provider value={brand}>{children}</BrandCtx.Provider>
}

export const useBrand = () => useContext(BrandCtx)

function darken(hex) {
  // Simple darkening for hover states
  const n = parseInt(hex.replace('#',''), 16)
  const r = Math.max(0, (n >> 16) - 30)
  const g = Math.max(0, ((n >> 8) & 0xff) - 30)
  const b = Math.max(0, (n & 0xff) - 30)
  return `#${[r,g,b].map(x => x.toString(16).padStart(2,'0')).join('')}`
}
