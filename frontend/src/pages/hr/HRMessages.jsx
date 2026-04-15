// HRMessages.jsx
import { useEffect, useState } from 'react'
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

export default function HRMessages() {
  const { colour } = useBrand()
  const c          = colour || '#6abf3f'

  const [staff,    setStaff]    = useState([])
  const [sent,     setSent]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [form,     setForm]     = useState({ title:'', body:'', priority:'normal', recipient_id:'' })
  const [err,      setErr]      = useState('')
  const [success,  setSuccess]  = useState(false)

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
    setSending(true); setErr(''); setSuccess(false)
    try {
      await sendMessage({
        title:        form.title.trim(),
        body:         form.body.trim(),
        priority:     form.priority,
        recipient_id: form.recipient_id ? Number(form.recipient_id) : null,
      })
      setForm({ title:'', body:'', priority:'normal', recipient_id:'' })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      // Refresh sent list
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
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Title</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Message title" style={ipt} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Message</label>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Write your message here…" rows={5}
                style={{ ...ipt, resize:'vertical', lineHeight:1.6 }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={ipt}>
                {PRIORITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Recipient</label>
              <select value={form.recipient_id} onChange={e => setForm(f => ({ ...f, recipient_id: e.target.value }))} style={ipt}>
                <option value="">All Staff (Broadcast)</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={sending} className="btn btn-brand" style={{ marginTop:4 }}>
              {sending ? '⏳ Sending…' : '💬 Send Message'}
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
              <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:10, lineHeight:1.6 }}>
                {m.body.length > 140 ? m.body.slice(0, 140) + '…' : m.body}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                  To: <strong>{m.recipient_name}</strong>
                  <span style={{ margin:'0 8px' }}>·</span>
                  {m.sent_at ? new Date(m.sent_at).toLocaleDateString('en-GB') : '—'}
                </div>
                <div style={{ fontSize:12 }}>
                  <span style={{ color:'var(--green)', fontWeight:700 }}>
                    {m.read_count}
                  </span>
                  <span style={{ color:'var(--text-muted)' }}>
                    {' '}/ {m.total_staff} read
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
