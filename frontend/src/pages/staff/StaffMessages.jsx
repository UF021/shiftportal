// StaffMessages.jsx
import { useEffect, useState, useCallback } from 'react'
import { getMyMessages, markMessageRead } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const PRIORITY_CFG = {
  urgent: { icon:'🚨', label:'Urgent', bg:'#fde8e8', col:'#c0392b', border:'#e05555' },
  info:   { icon:'ℹ️',  label:'Info',   bg:'#e3f2fd', col:'#1565c0', border:'#90caf9' },
  normal: { icon:'📢', label:'Normal', bg:'#e8f8e0', col:'#2e7d32', border:'#6abf3f' },
}

export default function StaffMessages() {
  const { colour }          = useBrand()
  const c                   = colour || '#6abf3f'
  const [messages, setMessages] = useState(null)

  const load = useCallback(() => {
    getMyMessages()
      .then(r => setMessages(r.data || []))
      .catch(() => setMessages([]))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRead(msg) {
    if (msg.is_read) return
    try {
      await markMessageRead(msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m))
    } catch (_) {}
  }

  return (
    <>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:19, fontWeight:700, color:'#1a2a1a' }}>Messages</div>
        <div style={{ fontSize:13, color:'#6a8a6a' }}>Tap a message to mark it as read</div>
      </div>

      {messages === null ? (
        <p style={{ color:'#8aaa8a', fontSize:13 }}>Loading…</p>
      ) : messages.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', color:'#8aaa8a', fontSize:14 }}>
          No messages yet. Check back later.
        </div>
      ) : messages.map(msg => {
        const cfg     = PRIORITY_CFG[msg.priority] || PRIORITY_CFG.normal
        const isUnread = !msg.is_read

        return (
          <div
            key={msg.id}
            onClick={() => handleRead(msg)}
            style={{
              background: '#fff',
              border: `1px solid ${isUnread ? c : '#e0ead0'}`,
              borderLeft: `4px solid ${isUnread ? c : '#e0ead0'}`,
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
              cursor: isUnread ? 'pointer' : 'default',
              transition: 'box-shadow .2s',
              boxShadow: isUnread ? `0 2px 12px ${c}22` : 'none',
            }}
          >
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
              <span style={{
                background: cfg.bg, color: cfg.col,
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              }}>
                {cfg.icon} {cfg.label}
              </span>
              {isUnread && (
                <span style={{
                  background: c, color: '#fff',
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                }}>
                  NEW
                </span>
              )}
              <span style={{ fontSize:11, color:'#8aaa8a', marginLeft:'auto' }}>
                {msg.sent_at ? new Date(msg.sent_at).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—'}
              </span>
            </div>

            {/* Title */}
            <div style={{ fontSize:15, fontWeight: isUnread ? 700 : 600, color:'#1a2a1a', marginBottom:6 }}>
              {msg.title}
            </div>

            {/* Body */}
            <div style={{ fontSize:13, color:'#3a5a3a', lineHeight:1.6 }}>
              {msg.body}
            </div>

            {/* Read indicator */}
            {!isUnread && (
              <div style={{ fontSize:11, color:'#8aaa8a', marginTop:8, textAlign:'right' }}>✓ Read</div>
            )}
          </div>
        )
      })}
    </>
  )
}
