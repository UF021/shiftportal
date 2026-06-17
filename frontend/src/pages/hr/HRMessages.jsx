import { useEffect, useRef, useState } from 'react'
import { sendMessage, getAllMessages, getAllStaff } from '../../api/client'
import { useBrand } from '../../api/BrandContext'

const PRIORITY_OPTS = [
  { value:'normal', label:'📢 Normal' },
  { value:'urgent', label:'🚨 Urgent' },
  { value:'info',   label:'ℹ️ Info' },
]

const PRIORITY_COLOURS = {
  normal: { bg:'#e8f8e0', col:'#2e7d32' },
  urgent: { bg:'#fde8e8', col:'#c0392b' },
  info:   { bg:'#e3f2fd', col:'#1565c0' },
}

function PBadge({ priority }) {
  const { bg, col } = PRIORITY_COLOURS[priority] || PRIORITY_COLOURS.normal
  const icons = { normal:'📢', urgent:'🚨', info:'ℹ️' }
  return (
    <span style={{ background:bg, color:col, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4 }}>
      {icons[priority]} {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}

// ── Recipient picker ──────────────────────────────────────────────────────────

function RecipientPicker({ staff, mode, setMode, selectedIds, setSelectedIds }) {
  const [search, setSearch] = useState('')

  const active = staff.filter(s => !s.is_blocked && s.is_active)
  const visible = active.filter(s =>
    !search || s.full_name.toLowerCase().includes(search.toLowerCase())
  )

  function toggleId(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }
  function selectAll() { setSelectedIds(active.map(s => s.id)) }
  function clearAll()  { setSelectedIds([]) }

  const ipt = {
    padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)',
    background:'var(--navy-light)', color:'var(--text)',
    fontFamily:'DM Sans,sans-serif', fontSize:13, width:'100%', boxSizing:'border-box',
  }

  return (
    <div>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:8 }}>
        Send To
      </label>

      {/* Mode toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {[
          { key:'all',    label:'📢 All Staff' },
          { key:'select', label:'👥 Select Staff' },
        ].map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => { setMode(o.key); if (o.key === 'all') clearAll() }}
            style={{
              flex:1, padding:'8px 0', borderRadius:8, fontSize:13, fontWeight:700,
              cursor:'pointer', fontFamily:'DM Sans,sans-serif', transition:'all .15s',
              border: mode === o.key ? '2px solid var(--green)' : '1px solid var(--border)',
              background: mode === o.key ? 'rgba(106,191,63,.1)' : 'var(--navy-light)',
              color: mode === o.key ? 'var(--green)' : 'var(--text-muted)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Staff picker (shown when mode === 'select') */}
      {mode === 'select' && (
        <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          {/* Search + bulk actions */}
          <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search staff…"
              style={{ ...ipt, marginBottom:0, flex:1 }}
            />
            <button type="button" onClick={selectAll}
              style={{ fontSize:11, fontWeight:700, whiteSpace:'nowrap', padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text-muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
              All
            </button>
            <button type="button" onClick={clearAll}
              style={{ fontSize:11, fontWeight:700, padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text-muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
              None
            </button>
          </div>

          {/* Scrollable list */}
          <div style={{ maxHeight:180, overflowY:'auto' }}>
            {visible.length === 0 ? (
              <div style={{ padding:'14px 16px', fontSize:13, color:'var(--text-muted)' }}>No staff found</div>
            ) : visible.map(s => {
              const checked = selectedIds.includes(s.id)
              return (
                <label key={s.id} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                  cursor:'pointer', transition:'background .1s',
                  background: checked ? 'rgba(106,191,63,.07)' : 'transparent',
                  borderBottom:'1px solid var(--border)',
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleId(s.id)}
                    style={{ accentColor:'var(--green)', width:15, height:15, flexShrink:0 }}
                  />
                  <span style={{ fontSize:13, fontWeight: checked ? 600 : 400 }}>{s.full_name}</span>
                  {s.staff_id && (
                    <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto', fontFamily:'DM Mono,monospace' }}>{s.staff_id}</span>
                  )}
                </label>
              )
            })}
          </div>

          {/* Selected count */}
          <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', fontSize:12, color: selectedIds.length > 0 ? 'var(--green)' : 'var(--text-muted)', fontWeight:600 }}>
            {selectedIds.length === 0
              ? 'No staff selected'
              : `${selectedIds.length} staff member${selectedIds.length !== 1 ? 's' : ''} selected`}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HRMessages() {
  const { colour } = useBrand()

  const [staff,   setStaff]   = useState([])
  const [sent,    setSent]    = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [mode,    setMode]    = useState('all')          // 'all' | 'select'
  const [selectedIds, setSelectedIds] = useState([])
  const [form,    setForm]    = useState({ title:'', body:'', priority:'normal' })
  const [err,     setErr]     = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    Promise.all([getAllStaff(), getAllMessages()])
      .then(([sr, mr]) => {
        setStaff(sr.data || [])
        setSent(mr.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSend(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) { setErr('Title and body are required.'); return }
    if (mode === 'select' && selectedIds.length === 0) { setErr('Please select at least one recipient.'); return }
    setSending(true); setErr(''); setSuccess(false)
    try {
      await sendMessage({
        title:         form.title.trim(),
        body:          form.body.trim(),
        priority:      form.priority,
        recipient_id:  null,
        recipient_ids: mode === 'select' ? selectedIds : null,
      })
      setForm({ title:'', body:'', priority:'normal' })
      setSelectedIds([])
      setMode('all')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      getAllMessages().then(r => setSent(r.data || [])).catch(() => {})
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const ipt = {
    padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)',
    background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, width:'100%', boxSizing:'border-box',
  }

  const isBroadcast = mode === 'all'

  return (
    <>
      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Messages</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>Send announcements and direct messages to staff</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.6fr', gap:24, alignItems:'start' }}>

        {/* Send form */}
        <div className="card">
          <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>✉️ Send Message</div>
          {success && (
            <div style={{ background:'#e8f8e0', border:'1px solid #6abf3f', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#2e7d32', marginBottom:14 }}>
              ✅ Message sent successfully!
            </div>
          )}
          {err && (
            <div style={{ background:'#fde8e8', border:'1px solid #e05555', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginBottom:14 }}>
              {err}
            </div>
          )}
          <form onSubmit={handleSend} style={{ display:'flex', flexDirection:'column', gap:14 }}>

            <RecipientPicker
              staff={staff}
              mode={mode}
              setMode={setMode}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
            />

            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Title</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Message title" style={ipt} />
            </div>

            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Message</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    body: f.body.startsWith('Dear {first_name},')
                      ? f.body
                      : `Dear {first_name},\n\n${f.body}`,
                  }))}
                  style={{
                    fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:5,
                    border:'1px solid var(--green)', background:'var(--green-muted)',
                    color:'var(--green)', cursor:'pointer', fontFamily:'DM Sans,sans-serif',
                  }}
                >
                  + Dear [First Name]
                </button>
              </div>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Write your message here…"
                rows={6}
                style={{ ...ipt, resize:'vertical', lineHeight:1.7 }}
              />
              {form.body.includes('{first_name}') && (
                <div style={{
                  marginTop:6, padding:'8px 12px', borderRadius:6,
                  background:'rgba(106,191,63,.08)', border:'1px solid rgba(106,191,63,.25)',
                  fontSize:12, color:'var(--text-muted)', lineHeight:1.6,
                }}>
                  <span style={{ fontWeight:700, color:'var(--green)', marginRight:6 }}>Preview:</span>
                  {form.body.replace('{first_name}', 'Sarah').split('\n').map((line, i, arr) => (
                    <span key={i}>{line}{i < arr.length - 1 ? <br /> : null}</span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={ipt}>
                {PRIORITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <button type="submit" disabled={sending} className="btn btn-brand" style={{ marginTop:4 }}>
              {sending ? '⏳ Sending…'
                : isBroadcast ? '📢 Broadcast to All Staff'
                : `💬 Send to ${selectedIds.length} Staff Member${selectedIds.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        </div>

        {/* Sent messages */}
        <div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>📤 Sent Messages</div>
          {loading ? (
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p>
          ) : sent.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No messages sent yet.</div>
          ) : sent.map(m => (
            <div key={m.id} className="card" style={{ marginBottom:12, padding:'14px 18px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{m.title}</div>
                <PBadge priority={m.priority} />
              </div>
              <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:10, lineHeight:1.6, whiteSpace:'pre-line' }}>
                {m.body.length > 160 ? m.body.slice(0, 160) + '…' : m.body}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                  To: <strong>{m.recipient_name}</strong>
                  <span style={{ margin:'0 8px' }}>·</span>
                  {m.sent_at ? new Date(m.sent_at).toLocaleDateString('en-GB') : '—'}
                </div>
                <div style={{ fontSize:12 }}>
                  <span style={{ color:'var(--green)', fontWeight:700 }}>{m.read_count}</span>
                  <span style={{ color:'var(--text-muted)' }}> / {m.total_staff} read</span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
