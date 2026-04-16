import { useBrand } from '../api/BrandContext'

export default function OrgLogo({ height = 44, dark = true }) {
  const brand = useBrand()

  if (brand.logo_url) {
    return (
      <img
        src={brand.logo_url}
        alt={brand.name}
        style={{ height, objectFit: 'contain', mixBlendMode: dark ? 'normal' : 'multiply' }}
        onError={e => { e.target.style.display = 'none' }}
      />
    )
  }

  // Text fallback with brand colour
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, height,
    }}>
      {/* Geometric mark */}
      <svg viewBox="0 0 32 32" style={{ height: height * 0.85 }} xmlns="http://www.w3.org/2000/svg">
        <polygon points="0,16 8,0 16,16 8,32" fill={brand.colour} opacity=".9" />
        <polygon points="7,16 15,0 23,16 15,32" fill={brand.colour} opacity=".7" />
        <polygon points="4,24 12,8 20,24" fill={brand.colour} opacity=".5" />
      </svg>
      <div style={{ lineHeight: 1.2 }}>
        {(brand.name || 'Staff Portal').split(' ').map((word, i) => (
          <div key={i} style={{
            fontSize: height > 40 ? 14 : 11,
            fontWeight: 700,
            color: dark ? '#e8f0e0' : '#1a2a1a',
          }}>{word}</div>
        ))}
      </div>
    </div>
  )
}
