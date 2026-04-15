// HRQRCodes.jsx
import { useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import { getMySites, getMyOrg } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

function qrUrl(orgSlug, siteCode) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(
    `${window.location.origin}/clock/${orgSlug}/${siteCode}`
  )}`
}

function clockUrl(orgSlug, siteCode) {
  return `${window.location.origin}/clock/${orgSlug}/${siteCode}`
}

async function toDataUrl(src) {
  const res  = await fetch(src)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader    = new FileReader()
    reader.onload   = () => resolve(reader.result)
    reader.onerror  = reject
    reader.readAsDataURL(blob)
  })
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
      const W   = 210
      const H   = 297

      // Pre-load logo (optional)
      let logoData = null
      if (org.brand_logo_url) {
        try { logoData = await toDataUrl(org.brand_logo_url) } catch (_) {}
      }

      for (let i = 0; i < sites.length; i++) {
        const site = sites[i]
        if (i > 0) doc.addPage()

        // Page border
        doc.setDrawColor(180, 220, 180)
        doc.setLineWidth(0.8)
        doc.rect(8, 8, W - 16, H - 16)
        doc.setLineWidth(0.3)
        doc.rect(10, 10, W - 20, H - 20)

        let yPos = 28

        // Logo
        if (logoData) {
          const logoW = 50
          const logoH = 18
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

        // QR code
        const qrDataUrl = await toDataUrl(qrUrl(org.slug, site.code))
        const qrSize    = 140
        const qrX       = (W - qrSize) / 2
        doc.addImage(qrDataUrl, 'PNG', qrX, yPos, qrSize, qrSize, '', 'FAST')
        yPos += qrSize + 10

        // Clock in/out label
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.setTextColor(50, 130, 50)
        doc.text('Scan to Clock In / Clock Out', W / 2, yPos + 6, { align: 'center' })
        yPos += 14

        // URL (small, grey)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(130, 160, 130)
        doc.text(clockUrl(org.slug, site.code), W / 2, yPos + 4, { align: 'center' })

        // Footer
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(150, 170, 150)
        const footer = `Powered by ShiftPortal — ${org.brand_name || org.name}`
        doc.text(footer, W / 2, H - 16, { align: 'center' })
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
      const W   = 210
      const H   = 297

      let logoData = null
      if (org.brand_logo_url) {
        try { logoData = await toDataUrl(org.brand_logo_url) } catch (_) {}
      }

      doc.setDrawColor(180, 220, 180)
      doc.setLineWidth(0.8)
      doc.rect(8, 8, W - 16, H - 16)
      doc.setLineWidth(0.3)
      doc.rect(10, 10, W - 20, H - 20)

      let yPos = 28

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

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(15, 40, 15)
      doc.text(site.name, W / 2, yPos + 8, { align: 'center', maxWidth: W - 40 })
      yPos += 20

      const qrDataUrl = await toDataUrl(qrUrl(org.slug, site.code))
      const qrSize    = 140
      doc.addImage(qrDataUrl, 'PNG', (W - qrSize) / 2, yPos, qrSize, qrSize, '', 'FAST')
      yPos += qrSize + 10

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(50, 130, 50)
      doc.text('Scan to Clock In / Clock Out', W / 2, yPos + 6, { align: 'center' })
      yPos += 14

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(130, 160, 130)
      doc.text(clockUrl(org.slug, site.code), W / 2, yPos + 4, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(150, 170, 150)
      doc.text(`Powered by ShiftPortal — ${org.brand_name || org.name}`, W / 2, H - 16, { align: 'center' })

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

  if (loading) return <p style={{ color:'var(--text-muted)', padding:40 }}>Loading sites…</p>

  return (
    <>
      <div style={{ marginBottom:26, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>QR Codes</h2>
          <p style={{ fontSize:14, color:'var(--text-muted)' }}>Printable A4 clock-in sheets for each site</p>
        </div>
        <button
          onClick={downloadAll}
          disabled={building || !sites.length}
          className="btn btn-brand"
          style={{ display:'flex', alignItems:'center', gap:8 }}
        >
          {building ? '⏳ Building PDF…' : '📥 Download All QR Codes (PDF)'}
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
          No active sites found. Add sites in Settings first.
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:18 }}>
          {sites.map(site => (
            <div key={site.id} className="card" style={{ padding:0, overflow:'hidden' }}>
              {/* Site header */}
              <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{site.name}</div>
                {site.address && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{site.address}</div>}
              </div>

              {/* QR image */}
              <div style={{ display:'flex', justifyContent:'center', padding:'20px 16px 12px', background:'var(--navy-light)' }}>
                <img
                  src={qrUrl(org?.slug, site.code)}
                  alt={`QR code for ${site.name}`}
                  width={160}
                  height={160}
                  style={{ borderRadius:8, background:'#fff', padding:8 }}
                />
              </div>

              {/* URL chip */}
              <div style={{ padding:'8px 16px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{
                  fontSize:10, fontFamily:'DM Mono,monospace', color:'var(--text-muted)',
                  background:'var(--navy-light)', borderRadius:6, padding:'6px 10px',
                  wordBreak:'break-all', lineHeight:1.5,
                }}>
                  {org ? clockUrl(org.slug, site.code) : '…'}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    onClick={() => copyLink(site)}
                    className="btn btn-outline"
                    style={{ flex:1, fontSize:12 }}
                  >
                    {copied === site.id ? '✅ Copied' : '🔗 Copy Link'}
                  </button>
                  <button
                    onClick={() => downloadSingle(site)}
                    disabled={building}
                    className="btn btn-brand"
                    style={{ flex:1, fontSize:12 }}
                  >
                    📄 PDF
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
