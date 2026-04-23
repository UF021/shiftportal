export default function OrgLogo({ height = 44, dark = true }) {
  return (
    <img
      src="/ikan-logo.png"
      alt="Ikan Facilities Management"
      style={{
        height,
        objectFit: 'contain',
        background: dark ? '#fff' : 'none',
        borderRadius: dark ? 6 : 0,
        padding: dark ? '2px 8px' : 0,
      }}
    />
  )
}
