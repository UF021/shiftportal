import { useBrand } from '../api/BrandContext'

export default function OrgLogo({ height = 44, dark = true }) {
  const brand = useBrand()
  const src = brand.logo_url || '/ikan-logo.png'

  return (
    <img
      src={src}
      alt={brand.name || 'Ikan Facilities Management'}
      style={{ height, objectFit: 'contain' }}
      onError={e => { e.target.style.display = 'none' }}
    />
  )
}
