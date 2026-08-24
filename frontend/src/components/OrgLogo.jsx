import { useBrand } from '../api/BrandContext'

export default function OrgLogo({ height = 44, dark = true }) {
  const { logo_url, name, colour } = useBrand()
  const c = colour || '#6abf3f'

  if (logo_url) {
    return (
      <img
        src={logo_url}
        alt={name || 'Portal'}
        style={{ height, maxWidth: 180, objectFit: 'contain' }}
      />
    )
  }

  // Fallback: org name as styled text
  return (
    <div style={{
      height,
      display: 'flex',
      alignItems: 'center',
      fontFamily: 'DM Sans, sans-serif',
      fontWeight: 800,
      fontSize: Math.round(height * 0.42),
      color: dark ? c : 'var(--text)',
      letterSpacing: '-0.02em',
      whiteSpace: 'nowrap',
    }}>
      {name || 'Portal'}
    </div>
  )
}
