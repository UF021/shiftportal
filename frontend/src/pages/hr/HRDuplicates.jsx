import { useEffect, useState } from 'react'
import { getStaffDuplicates, mergeStaff } from '../../api/client'

const REASON_LABEL = {
  ni_number:      'matching NI number',
  sia_licence:    'matching SIA licence number',
  name_dob_phone: 'matching name, date of birth and phone number',
}

const REASON_BADGE = {
  ni_number:      { label: 'Same NI Number',         colour: '#b06000' },
  sia_licence:    { label: 'Same SIA Licence',        colour: '#7000bb' },
  name_dob_phone: { label: 'Same Name / DOB / Phone', colour: '#b03000' },
}

function StaffCard({ record, selected, isNewest, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: 16, borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
        border: `2px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
        background: selected ? 'rgba(106,191,63,.08)' : 'var(--navy-light)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="radio" checked={selected} onChange={onSelect} style={{ accentColor: 'var(--green)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: selected ? 'var(--green)' : 'var(--text-muted)' }}>
          {selected ? '✓ Keep this' : 'Discard this'}
        </span>
        {isNewest && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, background: 'rgba(106,191,63,.15)', color: 'var(--green)', borderRadius: 4, padding: '2px 7px' }}>
            Newest
          </span>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{record.full_name}</div>
      <div style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)', marginBottom: 2 }}>
        Staff ID: {record.staff_id || 'TBC'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{record.email}</div>
      {record.ni_number   && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>NI: {record.ni_number}</div>}
      {record.sia_licence && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>SIA: {record.sia_licence}</div>}
      {record.date_of_birth && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>DOB: {new Date(record.date_of_birth).toLocaleDateString('en-GB')}</div>}
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
        Registered: {record.registered_at ? new Date(record.registered_at).toLocaleDateString('en-GB') : '—'}
      </div>
    </div>
  )
}

function MergeModal({ group, onConfirm, onCancel, busy }) {
  const newestId = (() => {
    const [a, b] = group.records
    const at = a.activated_at || a.registered_at || ''
    const bt = b.activated_at || b.registered_at || ''
    return at >= bt ? a.id : b.id
  })()

  const [primaryId,     setPrimaryId]     = useState(newestId)
  const [staffIdChoice, setStaffIdChoice] = useState('primary')
  const [customId,      setCustomId]      = useState('')

  const primary   = group.records.find(r => r.id === primaryId)
  const secondary = group.records.find(r => r.id !== primaryId)

  const resolvedStaffId =
    staffIdChoice === 'secondary' ? secondary?.staff_id :
    staffIdChoice === 'custom'    ? customId.trim() :
    primary?.staff_id

  function selectPrimary(id) {
    setPrimaryId(id)
    setStaffIdChoice('primary')
  }

  const canSubmit = !(staffIdChoice === 'custom' && !customId.trim())

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 620, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ marginBottom: 6 }}>Merge Duplicate Records</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.6 }}>
          These records share the same {REASON_LABEL[group.reason] || 'details'}. Choose which record to keep — all shifts, holidays, training and history will be transferred to it.
        </p>

        {/* Step 1 */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
          Step 1 — Which record should we keep?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {group.records.map(r => (
            <StaffCard
              key={r.id}
              record={r}
              selected={r.id === primaryId}
              isNewest={r.id === newestId}
              onSelect={() => selectPrimary(r.id)}
            />
          ))}
        </div>

        {/* Step 2 */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
          Step 2 — Which Staff ID should be applied to the merged record?
        </div>
        <div style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 22 }}>
          {[
            {
              key: 'primary',
              label: primary?.staff_id || 'TBC',
              sub: `From the record being kept (${primary?.full_name})`,
            },
            {
              key: 'secondary',
              label: secondary?.staff_id || 'TBC',
              sub: `From the record being deleted (${secondary?.full_name})`,
            },
            {
              key: 'custom',
              label: 'Enter a different Staff ID',
              sub: 'Type a custom ID below',
            },
          ].map(opt => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="radio" name="staffIdChoice"
                checked={staffIdChoice === opt.key}
                onChange={() => setStaffIdChoice(opt.key)}
                style={{ accentColor: 'var(--green)', marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono,monospace' }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{opt.sub}</div>
              </div>
            </label>
          ))}
          {staffIdChoice === 'custom' && (
            <input
              value={customId}
              onChange={e => setCustomId(e.target.value)}
              placeholder="e.g. IFM-099"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, marginTop: 2,
                border: '1px solid var(--border)', background: 'var(--navy)',
                color: 'var(--text)', fontFamily: 'DM Mono,monospace', fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          )}
          {resolvedStaffId && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(106,191,63,.08)', border: '1px solid rgba(106,191,63,.2)', borderRadius: 8, fontSize: 12, color: 'var(--green)' }}>
              ✓ Staff ID that will be applied: <strong style={{ fontFamily: 'DM Mono,monospace' }}>{resolvedStaffId}</strong>
            </div>
          )}
        </div>

        {/* Warning */}
        <div style={{ background: 'rgba(224,85,85,.08)', border: '1px solid rgba(224,85,85,.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#c02020', marginBottom: 22, lineHeight: 1.6 }}>
          ⚠ <strong>{secondary?.full_name}</strong>'s record will be permanently deleted. All their shifts, holidays, training and history will be transferred to <strong>{primary?.full_name}</strong>'s account. Staff will be emailed their confirmed Staff ID. This cannot be undone.
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-outline" disabled={busy}>Cancel</button>
          <button
            onClick={() => onConfirm(primaryId, secondary?.id, resolvedStaffId || null)}
            disabled={busy || !canSubmit}
            className="btn"
            style={{ background: 'var(--green)', color: '#fff', border: 'none' }}
          >
            {busy ? 'Merging…' : 'Merge & Notify Staff →'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HRDuplicates() {
  const [groups,  setGroups]  = useState([])
  const [loading, setLoading] = useState(true)
  const [active,  setActive]  = useState(null)
  const [merging, setMerging] = useState(false)
  const [toast,   setToast]   = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  function load() {
    setLoading(true)
    getStaffDuplicates()
      .then(r => setGroups(r.data || []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleMerge(primaryId, secondaryId, keepStaffId) {
    setMerging(true)
    try {
      const res = await mergeStaff(primaryId, secondaryId, keepStaffId)
      showToast(`✅ ${res.data.message}`)
      setActive(null)
      load()
    } catch (ex) {
      showToast(ex.response?.data?.detail || 'Merge failed', 'error')
    } finally {
      setMerging(false)
    }
  }

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'error' ? 'rgba(224,85,85,.15)' : 'rgba(106,191,63,.15)',
          border: `1px solid ${toast.type === 'error' ? '#e05555' : 'var(--green)'}`,
          borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          color: toast.type === 'error' ? '#e05555' : 'var(--green)',
          boxShadow: '0 4px 20px rgba(0,0,0,.25)', maxWidth: 360,
        }}>{toast.msg}</div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 6 }}>Merge Duplicate Records</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Records are flagged when two or more staff share the same NI number, SIA licence, or name + date of birth + phone number.
          Select any group and merge them into a single record.
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>
          Scanning for duplicates…
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div style={{
          background: 'rgba(106,191,63,.07)', border: '1px solid rgba(106,191,63,.25)',
          borderRadius: 14, padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No duplicate records detected</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>All staff records appear to be unique. Check back after new registrations.</div>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <>
          <div style={{ marginBottom: 20 }}>
            <span style={{
              background: 'rgba(224,85,85,.12)', color: '#c02020', fontWeight: 700,
              fontSize: 12, padding: '5px 14px', borderRadius: 20,
              border: '1px solid rgba(224,85,85,.3)',
            }}>
              ⚠ {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} found
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map((g, i) => {
              const [a, b] = g.records
              const badge  = REASON_BADGE[g.reason] || { label: 'Similar Records', colour: '#888' }
              return (
                <div key={i} className="card" style={{ padding: '20px 24px' }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                      background: badge.colour + '18', color: badge.colour,
                      border: `1px solid ${badge.colour}44`,
                    }}>
                      ⚠ {badge.label}
                    </span>
                    <button
                      onClick={() => setActive(g)}
                      className="btn btn-brand"
                      style={{ fontSize: 12, padding: '7px 18px' }}
                    >
                      Merge Records →
                    </button>
                  </div>

                  {/* Side-by-side preview */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 10, alignItems: 'center' }}>
                    {/* Record A */}
                    <div style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{a.full_name}</div>
                      <div style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)', marginBottom: 2 }}>
                        ID: {a.staff_id || 'TBC'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.email}</div>
                      {a.ni_number   && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>NI: {a.ni_number}</div>}
                      {a.sia_licence && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>SIA: {a.sia_licence}</div>}
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                        Registered: {a.registered_at ? new Date(a.registered_at).toLocaleDateString('en-GB') : '—'}
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ textAlign: 'center', fontSize: 20, color: 'var(--text-dim)', fontWeight: 700 }}>⟷</div>

                    {/* Record B */}
                    <div style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{b.full_name}</div>
                      <div style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)', marginBottom: 2 }}>
                        ID: {b.staff_id || 'TBC'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.email}</div>
                      {b.ni_number   && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>NI: {b.ni_number}</div>}
                      {b.sia_licence && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>SIA: {b.sia_licence}</div>}
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                        Registered: {b.registered_at ? new Date(b.registered_at).toLocaleDateString('en-GB') : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {active && (
        <MergeModal
          group={active}
          onConfirm={handleMerge}
          onCancel={() => setActive(null)}
          busy={merging}
        />
      )}
    </>
  )
}
