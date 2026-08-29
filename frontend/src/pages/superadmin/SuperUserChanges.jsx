import { useEffect, useState } from 'react'
import { getUserChanges } from '../../api/client'

const SOURCE_LABELS = {
  app:          { label: 'App',         colour: '#22a06b' },
  trigger:      { label: 'Direct DB',   colour: '#e2483d' },
  'auto-archive':{ label: 'Auto-archive', colour: '#f59e0b' },
}

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function SuperUserChanges() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [userId,  setUserId]  = useState('')
  const [field,   setField]   = useState('')
  const [source,  setSource]  = useState('')

  const load = () => {
    setLoading(true)
    const params = {}
    if (userId) params.user_id = parseInt(userId)
    if (field)  params.field   = field
    if (source) params.source  = source
    getUserChanges(params)
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>User Field Change Log</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>
          All changes to critical user fields — from the app, automated rules, or direct database edits.
          Rows marked <span style={{ color:'#e2483d', fontWeight:700 }}>Direct DB</span> have no corresponding app action and may indicate unauthorised changes.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <input
          type="number" placeholder="User ID" value={userId}
          onChange={e => setUserId(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, width:100 }} />
        <select value={field} onChange={e => setField(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
          <option value="">All fields</option>
          {['is_active','is_archived','is_blocked','is_rejected','role','staff_id'].map(f =>
            <option key={f} value={f}>{f}</option>
          )}
        </select>
        <select value={source} onChange={e => setSource(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
          <option value="">All sources</option>
          <option value="app">App</option>
          <option value="trigger">Direct DB (trigger)</option>
          <option value="auto-archive">Auto-archive</option>
        </select>
        <button onClick={load} className="btn btn-brand" style={{ fontSize:13, padding:'8px 16px' }}>Search</button>
      </div>

      {loading ? <p style={{ color:'var(--text-muted)' }}>Loading…</p>
      : !rows.length ? (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <p style={{ color:'var(--text-muted)' }}>No change records found</p>
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--navy-light)', borderBottom:'2px solid var(--border)' }}>
                {['When','User ID','Field','Old → New','Changed By','Source'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const src = SOURCE_LABELS[r.source] || { label: r.source || '?', colour: '#aaa' }
                const isDirectDb = r.source === 'trigger'
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--border)', background: isDirectDb ? 'rgba(226,72,61,.06)' : undefined }}>
                    <td style={{ padding:'9px 14px', whiteSpace:'nowrap', color:'var(--text-muted)', fontSize:12 }}>{fmt(r.changed_at)}</td>
                    <td style={{ padding:'9px 14px', fontFamily:'DM Mono,monospace' }}>{r.user_id}</td>
                    <td style={{ padding:'9px 14px', fontWeight:600 }}>{r.field_name}</td>
                    <td style={{ padding:'9px 14px', fontFamily:'DM Mono,monospace', fontSize:12 }}>
                      <span style={{ color:'var(--text-muted)' }}>{r.old_value ?? 'null'}</span>
                      {' → '}
                      <span style={{ fontWeight:700 }}>{r.new_value ?? 'null'}</span>
                    </td>
                    <td style={{ padding:'9px 14px', fontSize:12 }}>
                      {r.changed_by_name || (isDirectDb ? <em style={{ color:'#e2483d' }}>DB trigger</em> : '—')}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ background: src.colour + '22', color: src.colour, borderRadius:10, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
                        {src.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
