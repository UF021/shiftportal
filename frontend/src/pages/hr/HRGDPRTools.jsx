import { useEffect, useState } from 'react'
import api from '../../api/client'

function downloadJson(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function HRGDPRTools() {
  const [staff,     setStaff]     = useState([])
  const [retention, setRetention] = useState(null)
  const [search,    setSearch]    = useState('')
  const [busy,      setBusy]      = useState(null)
  const [msg,       setMsg]       = useState('')
  const [eraseTarget, setEraseTarget] = useState(null)
  const [eraseConfirm, setEraseConfirm] = useState('')

  useEffect(() => {
    api.get('/staff/all').then(r => setStaff(r.data || [])).catch(() => {})
    api.get('/gdpr/retention').then(r => setRetention(r.data)).catch(() => {})
  }, [])

  const filtered = staff.filter(s =>
    !search ||
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (s.staff_id || '').toLowerCase().includes(search.toLowerCase())
  )

  async function exportData(s) {
    setBusy(`export-${s.id}`)
    try {
      const res = await api.get(`/gdpr/export/${s.id}`, { responseType: 'blob' })
      downloadJson(res.data, `sar-${s.last_name?.toLowerCase()}-${s.id}.json`)
      setMsg(`✅ Data exported for ${s.first_name} ${s.last_name}`)
    } catch {
      setMsg('❌ Export failed')
    } finally {
      setBusy(null)
    }
  }

  async function confirmErase() {
    if (!eraseTarget) return
    setBusy(`erase-${eraseTarget.id}`)
    try {
      await api.post(`/gdpr/erase/${eraseTarget.id}`)
      setMsg(`✅ Personal data for ${eraseTarget.first_name} ${eraseTarget.last_name} has been anonymised.`)
      setStaff(prev => prev.filter(s => s.id !== eraseTarget.id))
      setEraseTarget(null)
      setEraseConfirm('')
      api.get('/gdpr/retention').then(r => setRetention(r.data)).catch(() => {})
    } catch (ex) {
      setMsg(`❌ ${ex.response?.data?.detail || 'Erasure failed'}`)
      setEraseTarget(null)
      setEraseConfirm('')
    } finally {
      setBusy(null)
    }
  }

  const c = '#6abf3f'
  const inp = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(106,191,63,.2)',
    background: '#0f1923', color: 'var(--text)', fontFamily: 'DM Sans,sans-serif',
    fontSize: 13, outline: 'none',
  }

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>GDPR Tools</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Subject Access Requests (data export) and Right to Erasure for staff records
        </p>
      </div>

      {msg && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontSize: 13,
          background: msg.startsWith('✅') ? 'rgba(106,191,63,.1)' : 'rgba(224,85,85,.1)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(106,191,63,.3)' : 'rgba(224,85,85,.3)'}`,
          color: msg.startsWith('✅') ? c : '#e05555',
        }}>
          {msg}
        </div>
      )}

      {/* Retention summary */}
      {retention && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 14 }}>
            Data Retention Overview
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Total staff records', value: retention.total_staff, colour: c },
              { label: 'Erased records',       value: retention.erased_staff, colour: '#a855f7' },
              { label: 'Shifts < 1 year',      value: retention.shift_records.last_1_year,  colour: c },
              { label: 'Shifts 1–3 years',     value: retention.shift_records['1_to_3_years'], colour: '#f0a030' },
              { label: 'Shifts 3–6 years',     value: retention.shift_records['3_to_6_years'], colour: '#e05555' },
              { label: 'Shifts > 6 years',     value: retention.shift_records.over_6_years, colour: '#ef4444' },
            ].map(({ label, value, colour }) => (
              <div key={label} style={{ background: 'var(--navy-light)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: colour }}>{value ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '10px 12px', background: 'rgba(240,160,48,.06)', border: '1px solid rgba(240,160,48,.2)', borderRadius: 8 }}>
            ⚖️ <strong>UK retention policy:</strong> {retention.retention_policy.payroll_records} · {retention.retention_policy.note}
          </div>
        </div>
      )}

      {/* Staff list */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Staff Data Actions</h3>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search staff…" style={{ ...inp, width: 220 }} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24 }}>No staff found</div>
        ) : (
          <div style={{ display: 'grid', gap: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 200px', gap: 12,
              padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <span>Staff member</span>
              <span>Staff ID</span>
              <span>Actions</span>
            </div>
            {filtered.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 200px', gap: 12,
                padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.04)', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {s.first_name} {s.last_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.email}</div>
                </div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: 'var(--text-muted)' }}>
                  {s.staff_id || '—'}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => exportData(s)}
                    disabled={busy === `export-${s.id}`}
                    title="Download all personal data held for this staff member (Subject Access Request)"
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${c}44`, background: `${c}12`, color: c,
                      fontFamily: 'DM Sans,sans-serif',
                      opacity: busy === `export-${s.id}` ? 0.5 : 1,
                    }}
                  >
                    {busy === `export-${s.id}` ? '…' : '⬇ Export'}
                  </button>
                  <button
                    onClick={() => { setEraseTarget(s); setEraseConfirm('') }}
                    disabled={!!busy}
                    title="Anonymise personal data — retains payroll records as required by HMRC"
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: '1px solid rgba(224,85,85,.4)', background: 'rgba(224,85,85,.1)', color: '#e05555',
                      fontFamily: 'DM Sans,sans-serif',
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    🗑 Erase
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Erase confirmation modal */}
      {eraseTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }}>
          <div style={{ background: 'var(--navy-mid)', border: '1px solid rgba(224,85,85,.4)',
            borderRadius: 14, padding: 28, width: 460, maxWidth: '100%' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#e05555', marginTop: 0 }}>
              ⚠ Right to Erasure — Confirm
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              You are about to anonymise all personal data for:
            </p>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--navy-light)',
              fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
              {eraseTarget.first_name} {eraseTarget.last_name} (#{eraseTarget.staff_id || eraseTarget.id})
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              This will permanently anonymise: name, email, DOB, address, NI number, SIA licence,
              phone, next of kin, and password.  Payroll records (shift logs, holidays) are retained
              for 6 years as required by HMRC.  <strong>This cannot be undone.</strong>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              Type <strong>ERASE</strong> to confirm:
            </p>
            <input
              value={eraseConfirm}
              onChange={e => setEraseConfirm(e.target.value)}
              placeholder="ERASE"
              style={{ ...inp, width: '100%', marginBottom: 16, boxSizing: 'border-box',
                border: '1px solid rgba(224,85,85,.4)' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setEraseTarget(null); setEraseConfirm('') }}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', fontFamily: 'DM Sans,sans-serif',
                  fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={confirmErase}
                disabled={eraseConfirm !== 'ERASE' || !!busy}
                style={{
                  flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                  background: eraseConfirm === 'ERASE' ? '#e05555' : '#4a4a4a',
                  color: '#fff', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
                  cursor: eraseConfirm === 'ERASE' ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? 'Erasing…' : 'Permanently Erase Personal Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
