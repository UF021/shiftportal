import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'

const ACTION_LABELS = {
  'shift.manual_add':  'Manual shift added',
  'shift.edit':        'Shift edited',
  'shift.delete':      'Shift deleted',
  'staff.activate':    'Staff activated',
  'staff.reject':      'Registration rejected',
  'staff.block':       'Access blocked',
  'staff.unblock':     'Access restored',
  'staff.archive':     'Staff archived',
  'staff.unarchive':   'Staff unarchived',
  'holiday.approve':   'Holiday approved',
  'holiday.reject':    'Holiday rejected',
  'org.plan_change':   'Plan changed',
  'org.toggle':        'Org toggled',
  'org.trial_extend':  'Trial extended',
}

const ACTION_COLOUR = {
  'shift.manual_add':  { bg: 'rgba(74,159,212,.12)',  text: '#4a9fd4' },
  'shift.edit':        { bg: 'rgba(240,160,48,.12)',  text: '#f0a030' },
  'shift.delete':      { bg: 'rgba(224,85,85,.12)',   text: '#e05555' },
  'staff.activate':    { bg: 'rgba(106,191,63,.12)',  text: '#6abf3f' },
  'staff.reject':      { bg: 'rgba(224,85,85,.12)',   text: '#e05555' },
  'staff.block':       { bg: 'rgba(224,85,85,.12)',   text: '#e05555' },
  'staff.unblock':     { bg: 'rgba(106,191,63,.12)',  text: '#6abf3f' },
  'staff.archive':     { bg: 'rgba(168,85,247,.12)',  text: '#a855f7' },
  'staff.unarchive':   { bg: 'rgba(106,191,63,.12)',  text: '#6abf3f' },
  'holiday.approve':   { bg: 'rgba(106,191,63,.12)',  text: '#6abf3f' },
  'holiday.reject':    { bg: 'rgba(224,85,85,.12)',   text: '#e05555' },
  'org.plan_change':   { bg: 'rgba(249,115,22,.12)',  text: '#f97316' },
  'org.toggle':        { bg: 'rgba(240,160,48,.12)',  text: '#f0a030' },
  'org.trial_extend':  { bg: 'rgba(74,159,212,.12)',  text: '#4a9fd4' },
}

function Badge({ action }) {
  const c = ACTION_COLOUR[action] || { bg: 'rgba(106,191,63,.1)', text: '#6abf3f' }
  return (
    <span style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>
      {ACTION_LABELS[action] || action}
    </span>
  )
}

function DetailChip({ detail }) {
  if (!detail || typeof detail !== 'object') return null
  const pairs = Object.entries(detail).filter(([, v]) => v != null && v !== '')
  if (!pairs.length) return null
  return (
    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {pairs.map(([k, v]) => (
        <span key={k} style={{ fontSize: 11, color: 'var(--text-dim)',
          background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '1px 7px', fontFamily: 'DM Mono,monospace' }}>
          {k}: {String(v)}
        </span>
      ))}
    </div>
  )
}

export default function HRAuditLog() {
  const [items,   setItems]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  const [search,    setSearch]    = useState('')
  const [action,    setAction]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = { page: pg, per_page: 50 }
      if (action)   params.action    = action
      if (search)   params.search    = search
      if (dateFrom) params.date_from = dateFrom + 'T00:00:00'
      if (dateTo)   params.date_to   = dateTo   + 'T23:59:59'
      const res = await api.get('/audit/', { params })
      setItems(res.data.items)
      setTotal(res.data.total)
      setPages(res.data.pages || 1)
      setPage(pg)
    } catch {
      setErr('Failed to load audit log.')
    } finally {
      setLoading(false)
    }
  }, [action, search, dateFrom, dateTo])

  useEffect(() => { load(1) }, [load])

  const inp = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(106,191,63,.2)',
    background: '#0f1923', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif',
    fontSize: 13, outline: 'none',
  }

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Audit Log</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          A tamper-evident record of all significant actions taken in this portal
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name…"
          style={{ ...inp, width: 200 }}
          onKeyDown={e => e.key === 'Enter' && load(1)}
        />
        <select value={action} onChange={e => setAction(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inp} />
        <button onClick={() => load(1)} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(106,191,63,.3)',
          background: 'rgba(106,191,63,.1)', color: '#6abf3f',
          fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>Filter</button>
        {(search || action || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(''); setAction(''); setDateFrom(''); setDateTo('') }}
            style={{ ...inp, border: '1px solid rgba(224,85,85,.3)', color: '#e05555',
              background: 'rgba(224,85,85,.08)', cursor: 'pointer', fontSize: 12 }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-dim)' }}>
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>

      {err && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(224,85,85,.1)',
          border: '1px solid rgba(224,85,85,.3)', color: '#e05555', fontSize: 13, marginBottom: 16 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div>No audit entries found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Actions taken in the portal will appear here</div>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: '0 16px',
            padding: '8px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--border)' }}>
            <span>When</span>
            <span>Action</span>
            <span>By</span>
            <span>Subject</span>
          </div>

          {items.map(item => {
            const ts = item.created_at ? new Date(item.created_at) : null
            return (
              <div key={item.id} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: '0 16px',
                padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.04)',
                alignItems: 'start',
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono,monospace' }}>
                  {ts ? ts.toLocaleDateString('en-GB') : '—'}<br />
                  <span style={{ fontSize: 11 }}>{ts ? ts.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : ''}</span>
                </div>
                <div>
                  <Badge action={item.action} />
                  <DetailChip detail={item.detail} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {item.actor_name}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                    {item.actor_role}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>
                  {item.entity_name || '—'}
                  {item.entity_id && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono,monospace', marginLeft: 6 }}>
                      #{item.entity_id}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1} style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: page <= 1 ? 'var(--text-dim)' : 'var(--text)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13,
              }}>← Prev</button>
              <span style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                Page {page} of {pages}
              </span>
              <button onClick={() => load(page + 1)} disabled={page >= pages} style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: page >= pages ? 'var(--text-dim)' : 'var(--text)',
                cursor: page >= pages ? 'not-allowed' : 'pointer', fontSize: 13,
              }}>Next →</button>
            </div>
          )}
        </>
      )}
    </>
  )
}
