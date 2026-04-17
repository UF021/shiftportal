// HRQRCodes.jsx
import { useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import { getMySites, getMyOrg } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

// ── Base URL for all QR codes ────────────────────────────────────────────────
// Falls back to the production domain if the env var is not set.
const APP_URL = import.meta.env.VITE_APP_URL || 'https://portal.ikanfm.co.uk'

function clockUrl(orgSlug, siteCode) {
  return `${APP_URL}/clock/${orgSlug}/${siteCode}`
}

function qrUrl(orgSlug, siteCode) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(clockUrl(orgSlug, siteCode))}`
}

async function toDataUrl(src) {
  const res  = await fetch(src)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader   = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function GpsBadge({ site }) {
  const hasGps = site.site_lat != null && site.site_lng != null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: hasGps ? 'rgba(106,191,63,.15)' : 'rgba(224,85,85,.12)',
      color: hasGps ? '#2e7d32' : '#a02020',
    }}>
      {hasGps ? '✅ GPS set' : '⚠️ No GPS'}
    </span>
  )
}

async function buildPdfPage(doc, site, org, logoData) {
  const W = 210
  const H = 297

  // Border
  doc.setDrawColor(180, 220, 180)
  doc.setLineWidth(0.8)
  doc.rect(8, 8, W - 16, H - 16)
  doc.setLineWidth(0.3)
  doc.rect(10, 10, W - 20, H - 20)

  let yPos = 28

  // Logo or org name
  if (logoData) {
    const logoW = 50, logoH = 18
    doc.addImage(logoData, 'PNG', (W - logoW) / 2, yPos, logoW, logoH, '', 'FAST')
    yPos += logoH + 10
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(30, 80, 30)
    doc.text(org.brand_name || org.name || 'ShiftPortal', W / 2, yPos + 6, { align: 'center' })
    yPos += 18
  }

  // Site name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(15, 40, 15)
  doc.text(site.name, W / 2, yPos + 8, { align: 'center', maxWidth: W - 40 })
  yPos += 20

  // QR code (140mm × 140mm centred)
  const qrDataUrl = await toDataUrl(qrUrl(org.slug, site.code))
  const qrSize    = 140
  doc.addImage(qrDataUrl, 'PNG', (W - qrSize) / 2, yPos, qrSize, qrSize, '', 'FAST')
  yPos += qrSize + 10

  // Label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(50, 130, 50)
  doc.text('Scan to Clock In / Clock Out', W / 2, yPos + 6, { align: 'center' })
  yPos += 14

  // URL below QR
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 130, 100)
  doc.text(clockUrl(org.slug, site.code), W / 2, yPos + 4, { align: 'center' })

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(150, 170, 150)
  doc.text(`${org.brand_name || org.name} — Staff Portal`, W / 2, H - 16, { align: 'center' })
}

export default function HRQRCodes() {
  const { colour } = useBrand()
  const c          = colour || '#6abf3f'

  const [sites,    setSites]    = useState([])
  const [org,      setOrg]      = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [building, setBuilding] = useState(false)
  const [copied,   setCopied]   = useState(null)

  useEffect(() => {
    Promise.all([getMySites(), getMyOrg()])
      .then(([sr, or]) => {
        setSites(sr.data || [])
        setOrg(or.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function downloadAll() {
    if (!sites.length || !org) return
    setBuilding(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      let logoData = null
      if (org.brand_logo_url) {
        try { logoData = await toDataUrl(org.brand_logo_url) } catch (_) {}
      }
      for (let i = 0; i < sites.length; i++) {
        if (i > 0) doc.addPage()
        await buildPdfPage(doc, sites[i], org, logoData)
      }
      doc.save(`QR-Codes-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setBuilding(false)
    }
  }

  async function downloadSingle(site) {
    if (!org) return
    setBuilding(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      let logoData = null
      if (org.brand_logo_url) {
        try { logoData = await toDataUrl(org.brand_logo_url) } catch (_) {}
      }
      await buildPdfPage(doc, site, org, logoData)
      doc.save(`QR-${site.code}-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setBuilding(false)
    }
  }

  function copyLink(site) {
    const url = clockUrl(org.slug, site.code)
    navigator.clipboard.writeText(url).then(() => {
      setCopied(site.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 40 }}>Loading sites…</p>

  return (
    <>
      <div style={{ marginBottom: 26, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>QR Codes</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Printable A4 clock-in sheets for each site — {sites.length} site{sites.length !== 1 ? 's' : ''}
          </p>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>
            Base URL: <span style={{ color: 'var(--green)' }}>{APP_URL}</span>
          </div>
        </div>
        <button
          onClick={downloadAll}
          disabled={building || !sites.length}
          className="btn btn-brand"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {building ? '⏳ Building PDF…' : `📥 Download All ${sites.length} QR Codes (PDF)`}
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No active sites found. Add sites in Settings first.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
          {sites.map(site => (
            <div key={site.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Site header */}
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{site.name}</div>
                  <GpsBadge site={site} />
                </div>
                {site.address && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{site.address}</div>
                )}
              </div>

              {/* QR image — 300×300 rendered at full width within card */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 16px 12px', background: 'var(--navy-light)' }}>
                <img
                  src={qrUrl(org?.slug, site.code)}
                  alt={`QR code for ${site.name}`}
                  width={200}
                  height={200}
                  style={{ borderRadius: 8, background: '#fff', padding: 8 }}
                  loading="lazy"
                />
              </div>

              {/* URL + GPS coords + buttons */}
              <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Clickable URL */}
                <a
                  href={org ? clockUrl(org.slug, site.code) : '#'}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 10, fontFamily: 'DM Mono,monospace', color: 'var(--green)',
                    background: 'var(--navy-light)', borderRadius: 6, padding: '6px 10px',
                    wordBreak: 'break-all', lineHeight: 1.5, textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  {org ? clockUrl(org.slug, site.code) : '…'}
                </a>

                {/* GPS coords if set */}
                {site.site_lat != null && (
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)' }}>
                    {site.site_lat.toFixed(4)}, {site.site_lng.toFixed(4)}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => copyLink(site)}
                    className="btn btn-outline"
                    style={{ flex: 1, fontSize: 12 }}
                  >
                    {copied === site.id ? '✅ Copied' : '🔗 Copy Link'}
                  </button>
                  <button
                    onClick={() => downloadSingle(site)}
                    disabled={building}
                    className="btn btn-brand"
                    style={{ flex: 1, fontSize: 12 }}
                  >
                    📄 Download
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
