import { useEffect, useState } from 'react'
import { getContactMessages, markContactRead } from '../../api/client'

function fmtDT(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function HRContacts() {
  const [messages, setMessages] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter,   setFilter]   = useState('all') // 'all' | 'unread' | 'read'

  useEffect(() => { load() }, [])

  function load() {
    getContactMessages()
      .then(r => setMessages(r.data || []))
      .catch(() => setMessages([]))
  }

  async function openMessage(msg) {
    setSelected(msg)
    if (!msg.is_read) {
      try {
        await markContactRead(msg.id)
        setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, is_read: true } : m))
      } catch {}
    }
  }

  const filtered = (messages || []).filter(m =>
    filter === 'all'    ? true :
    filter === 'unread' ? !m.is_read :
                           m.is_read
  )

  const unreadCount = (messages || []).filter(m => !m.is_read).length

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <h2 style={{ fontSize: 23, fontWeight: 700 }}>Website Enquiries</h2>
          {unreadCount > 0 && (
            <span style={{
              background: '#e05555', color: '#fff', fontSize: 11, fontWeight: 800,
              padding: '2px 10px', borderRadius: 20,
            }}>
              {unreadCount} new
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Contact form submissions from the Ikan Facilities Management website
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['all','All'], ['unread','Unread'], ['read','Read']].map(([val, lbl]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans,sans-serif',
            background: filter === val ? 'var(--brand,#6abf3f)' : 'var(--navy-light)',
            color: filter === val ? '#fff' : 'var(--text-muted)',
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 20 }}>

        {/* List */}
        <div>
          {messages === null ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <div style={{
              background: 'var(--navy-mid)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '32px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 14,
            }}>
              No {filter !== 'all' ? filter : ''} enquiries yet.
            </div>
          ) : filtered.map(msg => (
            <div
              key={msg.id}
              onClick={() => openMessage(msg)}
              style={{
                background: selected?.id === msg.id ? 'var(--navy-light)' : 'var(--navy-mid)',
                border: `1px solid ${selected?.id === msg.id ? 'var(--brand,#6abf3f)' : 'var(--border)'}`,
                borderRadius: 12, padding: '14px 18px', marginBottom: 10,
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    {!msg.is_read && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6abf3f', flexShrink: 0 }} />
                    )}
                    <div style={{ fontSize: 14, fontWeight: msg.is_read ? 500 : 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {msg.name}
                    </div>
                    {msg.company && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>· {msg.company}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {msg.subject}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {msg.message.substring(0, 90)}{msg.message.length > 90 ? '…' : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {fmtDT(msg.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            background: 'var(--navy-mid)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '24px', position: 'sticky', top: 24, alignSelf: 'start',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 3 }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDT(selected.created_at)}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 20, lineHeight: 1,
              }}>✕</button>
            </div>

            {/* Contact details */}
            <div style={{ background: 'var(--navy-light)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
              {[
                ['Email',   selected.email],
                ['Phone',   selected.phone   || '—'],
                ['Company', selected.company || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
                    {k === 'Email'
                      ? <a href={`mailto:${v}`} style={{ color: '#6abf3f', textDecoration: 'none' }}>{v}</a>
                      : v}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
              Subject
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
              {selected.subject}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
              Message
            </div>
            <div style={{
              fontSize: 14, color: 'var(--text)', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 400, overflowY: 'auto',
            }}>
              {selected.message}
            </div>

            <a
              href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
              style={{
                display: 'block', marginTop: 20, padding: '11px', textAlign: 'center',
                background: '#6abf3f', color: '#fff', borderRadius: 8,
                fontFamily: 'DM Sans,sans-serif', fontSize: 14, fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Reply by Email →
            </a>
          </div>
        )}
      </div>
    </>
  )
}
