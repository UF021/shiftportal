import { useEffect, useRef, useState } from 'react'
import { submitIncident, getMyIncidents } from '../../api/client'
import { useBrand } from '../../api/BrandContext'
import { useAuth } from '../../api/AuthContext'

const MAX_PHOTOS = 3

function PhotoPicker({ index, file, onChange, colour }) {
  const ref = useRef()
  const c   = colour || '#6abf3f'

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => onChange(index, e.target.files[0] || null)}
      />
      {file ? (
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#f0f4f0', border: `2px solid ${c}` }}>
          <img
            src={URL.createObjectURL(file)}
            alt={`Photo ${index + 1}`}
            style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            onClick={() => { onChange(index, null); ref.current.value = '' }}
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,.55)', color: '#fff',
              border: 'none', borderRadius: '50%', width: 26, height: 26,
              cursor: 'pointer', fontSize: 14, lineHeight: '26px', textAlign: 'center',
            }}
          >✕</button>
          <div style={{ padding: '4px 8px', fontSize: 11, color: '#6a8a6a', background: '#f0f4f0' }}>
            {file.name}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current.click()}
          style={{
            width: '100%', height: 90, borderRadius: 10, border: `2px dashed ${c}55`,
            background: `${c}08`, cursor: 'pointer', color: '#6a8a6a',
            fontSize: 13, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <span style={{ fontSize: 24 }}>📷</span>
          <span>Add photo {index + 1}</span>
        </button>
      )}
    </div>
  )
}

function CheckRow({ label, checked, onChange, children }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: '#6abf3f', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1a2a1a' }}>{label}</span>
      </label>
      {checked && children}
    </div>
  )
}

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
        {label}{required && <span style={{ color: '#e05555' }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#8aaa8a', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid #d4e4d4', fontSize: 14, color: '#1a2a1a',
  background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
  outline: 'none',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

export default function StaffIncidents() {
  const { colour }  = useBrand()
  const { user }    = useAuth()
  const c           = colour || '#6abf3f'

  const [view, setView] = useState('list')   // 'list' | 'form'
  const [past,  setPast] = useState(null)
  const [busy,  setBusy] = useState(false)
  const [ok,    setOk]   = useState('')
  const [err,   setErr]  = useState('')

  const [photos, setPhotos] = useState([null, null, null])

  const [form, setForm] = useState({
    date_of_incident:     '',
    time_of_incident:     '',
    site_location:        '',
    police_called:        false,
    officer_name:         '',
    collar_number:        '',
    duty_manager_called:  false,
    duty_manager_name:    '',
    injuries:             false,
    injury_description:   '',
    statement:            '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = () =>
    getMyIncidents()
      .then(r => setPast(r.data))
      .catch(() => setPast([]))

  useEffect(() => { load() }, [])

  function setPhoto(idx, file) {
    setPhotos(ps => ps.map((p, i) => i === idx ? file : p))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    if (!form.date_of_incident) return setErr('Please enter the date of the incident.')
    if (!form.time_of_incident) return setErr('Please enter the time of the incident.')
    if (!form.site_location.trim()) return setErr('Please enter the site location.')
    if (!form.statement.trim())     return setErr('Please write your statement.')
    if (form.statement.trim().length < 30) return setErr('Please provide a more detailed statement (at least 30 characters).')

    setBusy(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)))
      photos.forEach((p, i) => {
        if (p) fd.append(`photo_${i + 1}`, p, p.name)
      })
      await submitIncident(fd)
      setOk('Your incident report has been submitted. HR will review it shortly.')
      setView('list')
      setForm({
        date_of_incident: '', time_of_incident: '', site_location: '',
        police_called: false, officer_name: '', collar_number: '',
        duty_manager_called: false, duty_manager_name: '',
        injuries: false, injury_description: '', statement: '',
      })
      setPhotos([null, null, null])
      load()
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to submit. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── List view ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2a1a' }}>Incident Reports</div>
          <div style={{ fontSize: 12, color: '#6a8a6a' }}>Submit and view your incident reports</div>
        </div>

        {ok && (
          <div style={{ background: 'rgba(106,191,63,.12)', border: '1px solid rgba(106,191,63,.4)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>
            ✓ {ok}
          </div>
        )}

        <button
          onClick={() => { setView('form'); setOk(''); setErr('') }}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 12,
            background: c, color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 700, marginBottom: 20,
          }}
        >
          + Report New Incident
        </button>

        {past === null ? (
          <p style={{ color: '#8aaa8a', fontSize: 13 }}>Loading…</p>
        ) : past.length === 0 ? (
          <div className="s-card" style={{ padding: '24px 20px', textAlign: 'center', color: '#8aaa8a', fontSize: 13 }}>
            No incident reports submitted yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {past.map(r => (
              <div key={r.id} className="s-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2a1a' }}>
                    {fmtDate(r.date_of_incident)} — {r.site_location}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: r.reviewed ? 'rgba(106,191,63,.12)' : 'rgba(224,180,0,.12)',
                    color: r.reviewed ? '#2e7d32' : '#7d5a00',
                  }}>
                    {r.reviewed ? '✓ Reviewed' : 'Pending'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6a8a6a' }}>
                  Submitted {fmtDt(r.submitted_at)}
                  {r.police_called && ' · Police called'}
                  {r.injuries && ' · Injuries reported'}
                </div>
                {(r.has_photo_1 || r.has_photo_2 || r.has_photo_3) && (
                  <div style={{ fontSize: 11, color: '#8aaa8a', marginTop: 4 }}>
                    📷 {[r.has_photo_1, r.has_photo_2, r.has_photo_3].filter(Boolean).length} photo(s) attached
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Form view ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => { setView('list'); setErr('') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#6a8a6a', padding: 0 }}
        >←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2a1a' }}>New Incident Report</div>
          <div style={{ fontSize: 12, color: '#6a8a6a' }}>Complete all required fields</div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>

        {/* Pre-filled staff info */}
        <div className="s-card" style={{ padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Staff Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#8aaa8a', marginBottom: 2 }}>Name</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2a1a' }}>{user?.first_name} {user?.last_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8aaa8a', marginBottom: 2 }}>Staff ID</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2a1a', fontFamily: 'DM Mono,monospace' }}>{user?.staff_id || 'TBC'}</div>
            </div>
          </div>
        </div>

        {/* Incident date / time / location */}
        <div className="s-card" style={{ padding: '16px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>Incident Details</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date of Incident" required>
              <input
                type="date"
                value={form.date_of_incident}
                onChange={e => set('date_of_incident', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                style={inputStyle}
                required
              />
            </Field>
            <Field label="Time of Incident" required>
              <input
                type="time"
                value={form.time_of_incident}
                onChange={e => set('time_of_incident', e.target.value)}
                style={inputStyle}
                required
              />
            </Field>
          </div>

          <Field label="Site Location" required>
            <input
              type="text"
              placeholder="e.g. Vue Cinema — Star City"
              value={form.site_location}
              onChange={e => set('site_location', e.target.value)}
              style={inputStyle}
              required
            />
          </Field>
        </div>

        {/* Checkboxes */}
        <div className="s-card" style={{ padding: '16px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Notifications & Injuries</div>

          <CheckRow
            label="Police / emergency services called"
            checked={form.police_called}
            onChange={v => set('police_called', v)}
          >
            <div style={{ padding: '10px 0 4px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Officer Name">
                <input
                  type="text"
                  placeholder="Full name"
                  value={form.officer_name}
                  onChange={e => set('officer_name', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Collar / Badge Number">
                <input
                  type="text"
                  placeholder="e.g. PC 1234"
                  value={form.collar_number}
                  onChange={e => set('collar_number', e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
          </CheckRow>

          <div style={{ borderTop: '1px solid #f0f4f0', margin: '4px 0' }} />

          <CheckRow
            label="Duty Manager called"
            checked={form.duty_manager_called}
            onChange={v => set('duty_manager_called', v)}
          >
            <div style={{ padding: '10px 0 4px 28px' }}>
              <Field label="Manager Name">
                <input
                  type="text"
                  placeholder="Full name"
                  value={form.duty_manager_name}
                  onChange={e => set('duty_manager_name', e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
          </CheckRow>

          <div style={{ borderTop: '1px solid #f0f4f0', margin: '4px 0' }} />

          <CheckRow
            label="Any injuries?"
            checked={form.injuries}
            onChange={v => set('injuries', v)}
          >
            <div style={{ padding: '10px 0 4px 28px' }}>
              <Field label="Describe injuries and to whom">
                <textarea
                  placeholder="Describe what injuries occurred and who was injured…"
                  value={form.injury_description}
                  onChange={e => set('injury_description', e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </Field>
            </div>
          </CheckRow>
        </div>

        {/* Photos */}
        <div className="s-card" style={{ padding: '16px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
            Supporting Photos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — up to 3)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[0, 1, 2].map(i => (
              <PhotoPicker key={i} index={i} file={photos[i]} onChange={setPhoto} colour={c} />
            ))}
          </div>
        </div>

        {/* Statement */}
        <div className="s-card" style={{ padding: '16px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6a8a6a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            Statement <span style={{ color: '#e05555' }}>*</span>
          </div>
          <div style={{ fontSize: 12, color: '#6a8a6a', marginBottom: 12, lineHeight: 1.6 }}>
            Use this section to write in your own words what happened. Include as much detail as possible in describing the incident.
          </div>
          <textarea
            value={form.statement}
            onChange={e => set('statement', e.target.value)}
            rows={8}
            placeholder="Write your account of the incident here…"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            required
          />
          <div style={{ textAlign: 'right', fontSize: 11, color: '#8aaa8a', marginTop: 4 }}>
            {form.statement.length} characters
          </div>
        </div>

        {err && (
          <div style={{ background: 'rgba(224,85,85,.1)', border: '1px solid rgba(224,85,85,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#a02020' }}>
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '15px', borderRadius: 12,
            background: busy ? '#ccc' : c, color: '#fff', border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {busy ? 'Submitting…' : 'Submit Incident Report'}
        </button>

        <button
          type="button"
          onClick={() => { setView('list'); setErr('') }}
          style={{
            width: '100%', padding: '12px', borderRadius: 12,
            background: 'transparent', color: '#6a8a6a', border: '1.5px solid #d4e4d4',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </form>
    </div>
  )
}
