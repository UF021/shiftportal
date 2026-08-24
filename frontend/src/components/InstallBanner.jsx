import { useEffect, useState } from 'react'

const DISMISS_KEY = 'tyma_install_dismissed'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIOS,        setShowIOS]        = useState(false)
  const [visible,        setVisible]        = useState(false)

  useEffect(() => {
    // Don't show if already installed or previously dismissed
    if (isInStandaloneMode()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    // Android / Chrome: capture the install event
    const handler = e => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS Safari: no beforeinstallprompt — show manual instructions
    if (isIOS()) {
      setShowIOS(true)
      setVisible(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') localStorage.setItem(DISMISS_KEY, '1')
    setDeferredPrompt(null)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom))',
      left: 12, right: 12, zIndex: 200,
      background: '#1e2e40', border: '1px solid rgba(106,191,63,0.35)',
      borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f0e0', marginBottom: 3 }}>
          Install Tyma on your phone
        </div>
        {showIOS ? (
          <div style={{ fontSize: 12, color: '#7a9a7a', lineHeight: 1.5 }}>
            Tap <strong style={{ color: '#e8f0e0' }}>Share</strong> <span style={{ fontSize: 15 }}>⬆️</span> then{' '}
            <strong style={{ color: '#e8f0e0' }}>Add to Home Screen</strong> for a faster, app-like experience.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#7a9a7a', lineHeight: 1.5 }}>
            Get faster access to your shifts, clock-ins and holidays.
          </div>
        )}
        {!showIOS && deferredPrompt && (
          <button
            onClick={install}
            style={{
              marginTop: 10, padding: '8px 18px', borderRadius: 8, border: 'none',
              background: '#6abf3f', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            }}
          >
            Install App
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        style={{
          background: 'none', border: 'none', color: '#4a6a4a',
          fontSize: 18, cursor: 'pointer', padding: '0 4px', flexShrink: 0,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
