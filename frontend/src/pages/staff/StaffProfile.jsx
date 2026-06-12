import { useState } from 'react'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { updateMyDetails } from '../../api/client'
import { fmtDate } from '../../api/utils'

function PF({ label, value }) {
  return (
    <div style={{ padding:'10px 0', borderBottom:'1px solid #f0f4f0' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#8aaa8a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:500, color:value?'#1a2a1a':'#8aaa8a' }}>{value||'—'}</div>
    </div>
  )
}

function FField({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width:'100%', padding:'10px 13px', borderRadius:8,
  border:'1px solid #d0ddd0', background:'#f8fbf8',
  fontFamily:'DM Sans,sans-serif', fontSize:14, color:'#1a2a1a',
  outline:'none', boxSizing:'border-box',
}

export default function StaffProfile() {
  const { user, refreshUser } = useAuth()
  const { colour }            = useBrand()
  const c = colour || '#6abf3f'

  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [err,     setErr]     = useState('')

  const [form, setForm] = useState({})

  function startEdit() {
    setForm({
      first_name:    user?.first_name    || '',
      last_name:     user?.last_name     || '',
      phone:         user?.phone         || '',
      date_of_birth: user?.date_of_birth || '',
      nationality:   user?.nationality   || '',
      address_line1: user?.address_line1 || '',
      address_line2: user?.address_line2 || '',
      city:          user?.city          || '',
      postcode:      user?.postcode      || '',
      nok_name:      user?.nok_name      || '',
      nok_phone:     user?.nok_phone     || '',
      nok_relation:  user?.nok_relation  || '',
    })
    setSaved(false)
    setErr('')
    setEditing(true)
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function save() {
    if (!form.first_name?.trim()) { setErr('First name cannot be empty.'); return }
    if (!form.last_name?.trim())  { setErr('Last name cannot be empty.');  return }
    setSaving(true); setErr('')
    try {
      await updateMyDetails({
        first_name:    form.first_name.trim(),
        last_name:     form.last_name.trim(),
        phone:         form.phone         || null,
        date_of_birth: form.date_of_birth || null,
        nationality:   form.nationality   || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city:          form.city          || null,
        postcode:      form.postcode      || null,
        nok_name:      form.nok_name      || null,
        nok_phone:     form.nok_phone     || null,
        nok_relation:  form.nok_relation  || null,
      })
      await refreshUser()
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 5000)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const sia  = user?.sia_expiry ? new Date(user.sia_expiry) : null
  const days = sia ? Math.ceil((sia - new Date()) / 86400000) : null
  const gone = days !== null && days < 0
  const warn = days !== null && days < 60

  return (
    <div>
      <div style={{ fontSize:20, fontWeight:700, color:'#1a2a1a', marginBottom:16 }}>My Profile</div>

      {/* ── Read-only: Employment ── */}
      <div className="s-card">
        <div className="s-card-title">💼 Employment</div>
        <PF label="Staff ID"         value={user?.staff_id && user.staff_id !== 'TBC' ? user.staff_id : 'TBC — HR will assign'} />
        <PF label="Job Title"        value="Licensed Security Officer" />
        <PF label="Employment Start" value={user?.employment_start_date ? fmtDate(user.employment_start_date) : 'To be confirmed by HR'} />
        <PF label="NI Number"        value={user?.ni_number} />
        <PF label="Contract Type"    value="Zero Hours" />
      </div>

      {/* ── Read-only: SIA ── */}
      <div className="s-card">
        <div className="s-card-title">🪪 SIA Licence</div>
        <PF label="Licence Number" value={user?.sia_licence} />
        <PF label="Expiry Date"    value={fmtDate(user?.sia_expiry)} />
        {days !== null && (
          <div style={{
            background: gone ? '#fde8e8' : warn ? '#fef9e8' : '#f0faf0',
            border: `1px solid ${gone ? '#e08080' : warn ? '#f0c060' : '#a0d080'}`,
            borderRadius:10, padding:14, marginTop:10, textAlign:'center',
          }}>
            <div style={{ fontSize:36, fontWeight:700, fontFamily:'DM Mono,monospace', color:gone?'#e05555':warn?'#d97706':c }}>
              {gone ? 'EXPIRED' : `${days} days`}
            </div>
            <div style={{ fontSize:12, color:'#6a8a6a', marginTop:4 }}>
              {gone ? '⚠ Contact HR immediately' : warn ? 'Renewal required soon' : 'Until licence expiry'}
            </div>
          </div>
        )}
        <PF label="Right to Work" value={user?.right_to_work ? 'Yes — confirmed' : 'No'} />
      </div>

      {/* ── My Details: editable ── */}
      <div className="s-card" style={{ borderTop: `3px solid ${c}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="s-card-title" style={{ marginBottom:0 }}>✏️ My Details</div>
          {!editing && (
            <button onClick={startEdit} style={{
              padding:'7px 16px', borderRadius:20, border:`1px solid ${c}`,
              background:'transparent', color:c, fontFamily:'DM Sans,sans-serif',
              fontSize:12, fontWeight:700, cursor:'pointer',
            }}>Edit Details</button>
          )}
        </div>

        {saved && (
          <div style={{ background:'#f0faf0', border:'1px solid #a0d080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#2a6a2a', marginBottom:16 }}>
            ✅ Your details have been updated. HR has been notified of the changes.
          </div>
        )}

        {!editing ? (
          <>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#8aaa8a', marginBottom:8 }}>Personal</div>
            <PF label="Full Name"    value={`${user?.first_name||''} ${user?.last_name||''}`} />
            <PF label="Phone"        value={user?.phone} />
            <PF label="Date of Birth" value={fmtDate(user?.date_of_birth)} />
            <PF label="Nationality"  value={user?.nationality} />
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#8aaa8a', margin:'14px 0 8px' }}>Address</div>
            <PF label="Address" value={user?.full_address} />
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#8aaa8a', margin:'14px 0 8px' }}>Emergency Contact</div>
            <PF label="Name"         value={user?.nok_name} />
            <PF label="Phone"        value={user?.nok_phone} />
            <PF label="Relationship" value={user?.nok_relation} />
          </>
        ) : (
          <>
            {err && (
              <div style={{ background:'#fde8e8', border:'1px solid #e08080', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#a02020', marginBottom:16 }}>
                ⚠ {err}
              </div>
            )}

            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#8aaa8a', marginBottom:12 }}>Personal</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <FField label="First Name">
                <input style={inputStyle} value={form.first_name} onChange={set('first_name')} />
              </FField>
              <FField label="Last Name">
                <input style={inputStyle} value={form.last_name} onChange={set('last_name')} />
              </FField>
            </div>

            <FField label="Phone">
              <input style={inputStyle} value={form.phone} onChange={set('phone')} placeholder="e.g. 07700 900000" />
            </FField>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <FField label="Date of Birth">
                <input style={inputStyle} type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
              </FField>
              <FField label="Nationality">
                <input style={inputStyle} value={form.nationality} onChange={set('nationality')} placeholder="e.g. British" />
              </FField>
            </div>

            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#8aaa8a', margin:'6px 0 12px' }}>Address</div>

            <FField label="Address Line 1">
              <input style={inputStyle} value={form.address_line1} onChange={set('address_line1')} placeholder="e.g. 12 High Street" />
            </FField>
            <FField label="Address Line 2">
              <input style={inputStyle} value={form.address_line2} onChange={set('address_line2')} placeholder="Flat / apartment (optional)" />
            </FField>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10 }}>
              <FField label="City / Town">
                <input style={inputStyle} value={form.city} onChange={set('city')} placeholder="e.g. London" />
              </FField>
              <FField label="Postcode">
                <input style={{ ...inputStyle, textTransform:'uppercase' }} value={form.postcode}
                  onChange={e => setForm(f => ({ ...f, postcode: e.target.value.toUpperCase() }))}
                  placeholder="SW1A 1AA" />
              </FField>
            </div>

            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#8aaa8a', margin:'6px 0 12px' }}>Emergency Contact</div>

            <FField label="Full Name">
              <input style={inputStyle} value={form.nok_name} onChange={set('nok_name')} placeholder="e.g. Jane Smith" />
            </FField>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <FField label="Phone">
                <input style={inputStyle} value={form.nok_phone} onChange={set('nok_phone')} placeholder="e.g. 07700 900111" />
              </FField>
              <FField label="Relationship">
                <input style={inputStyle} value={form.nok_relation} onChange={set('nok_relation')} placeholder="e.g. Spouse" />
              </FField>
            </div>

            <div style={{ fontSize:12, color:'#8aaa8a', background:'#f8fbf8', borderRadius:8, padding:'10px 13px', marginBottom:20, lineHeight:1.5 }}>
              ℹ️ HR will be notified of any changes you submit. Name changes may temporarily affect QR clock-in — contact your supervisor if this happens.
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setEditing(false)} style={{
                flex:1, padding:'12px', borderRadius:10, border:'1px solid #d0ddd0',
                background:'#f8fbf8', color:'#6a8a6a', fontFamily:'DM Sans,sans-serif',
                fontSize:14, fontWeight:600, cursor:'pointer',
              }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{
                flex:2, padding:'12px', borderRadius:10, border:'none',
                background:c, color:'#fff', fontFamily:'DM Sans,sans-serif',
                fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer',
                opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
