import { useEffect, useState } from 'react'
import { useBrand } from '../../api/BrandContext'
import api from '../../api/client'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ManagerHolidays() {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const [holidays, setHolidays] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [busy,     setBusy]     = useState(null)
  const [toast,    setToast]    = useState('')

  function load() {
    setLoading(true)
    api.get('/manager/holidays')
      .then(r => setHolidays(r.data || []))
      .catch(() => setHolidays([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function action(id, type) {
    setBusy(id + type)
    try {
      await api.patch(`/manager/holidays/${id}/${type}`)
      showToast(type === 'approve' ? 'Holiday approved.' : 'Holiday rejected.')
      load()
    } catch {
      showToast('Action failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: 'var(--navy-mid)', border: `1px solid ${c}`, borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, color: c }}>
          {toast}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Holiday Requests</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Pending requests from staff at your site</div>
      </div>

      <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : !holidays?.length ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>All caught up</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pending holiday requests from your staff.</div>
          </div>
        ) : holidays.map((h, i) => (
          <div key={h.id} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
            borderBottom: i < holidays.length - 1 ? '1px solid var(--border)' : 'none',
            flexWrap: 'wrap',
          }}>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{h.user_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                {fmtDate(h.from_date)} → {fmtDate(h.to_date)}
                <span style={{ marginLeft: 8, fontFamily: 'DM Mono,monospace', color: c, fontWeight: 700 }}>
                  {h.days} day{h.days !== 1 ? 's' : ''}
                </span>
              </div>
              {h.notes && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, fontStyle: 'italic' }}>"{h.notes}"</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => action(h.id, 'reject')} disabled={busy !== null} style={{
                padding: '8px 14px', borderRadius: 7, border: '1px solid #ef4444',
                background: 'transparent', color: '#fca5a5', fontSize: 12, fontWeight: 600,
                cursor: busy !== null ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif',
                opacity: busy === h.id + 'reject' ? 0.6 : 1,
              }}>
                {busy === h.id + 'reject' ? '…' : 'Reject'}
              </button>
              <button onClick={() => action(h.id, 'approve')} disabled={busy !== null} style={{
                padding: '8px 14px', borderRadius: 7, border: 'none',
                background: c, color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: busy !== null ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans,sans-serif',
                opacity: busy === h.id + 'approve' ? 0.6 : 1,
              }}>
                {busy === h.id + 'approve' ? '…' : 'Approve'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
