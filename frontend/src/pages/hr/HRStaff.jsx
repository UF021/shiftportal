import { useEffect, useRef, useState } from 'react'
import { getAllStaff, updateStaff, getMySites, deleteStaff, bulkDeleteStaff } from '../../api/client'
import { fmtDate } from '../../api/utils'

const PRESET_PAY = ['12.71','12.80','12.90','13.00']

const siaStatus = exp => {
  if (!exp) return 'unknown'
  const now=new Date(), e=new Date(exp), d60=new Date(); d60.setDate(d60.getDate()+60)
  if (e<now)  return 'expired'
  if (e<d60)  return 'expiring'
  return 'valid'
}

const Badge = ({st}) => {
  const map={valid:['badge-green','✓ Valid'],expiring:['badge-amber','⚠ Expiring'],expired:['badge-red','✗ Expired'],unknown:['badge-grey','— Unknown']}
  const [cls,lbl]=map[st]||map.unknown
  return <span className={`badge ${cls}`}>{lbl}</span>
}

function Toast({ toast }) {
  if (!toast) return null
  const bg  = toast.type === 'error' ? 'rgba(224,85,85,.15)' : 'rgba(106,191,63,.15)'
  const col = toast.type === 'error' ? '#e05555' : 'var(--green)'
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: bg, border: `1px solid ${col}`, borderRadius: 10,
      padding: '12px 20px', fontSize: 14, fontWeight: 600, color: col,
      boxShadow: '0 4px 20px rgba(0,0,0,.25)', maxWidth: 340,
    }}>
      {toast.msg}
    </div>
  )
}

function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Yes, Delete Permanently', busy = false }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 440 }}>
        <h3 style={{ marginBottom: 12 }}>Confirm Delete</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>{message}</p>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-outline" disabled={busy}>Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            className="btn" style={{ background: '#e05555', color: '#fff', border: 'none' }}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HRStaff() {
  const [staff,  setStaff]  = useState([])
  const [sites,  setSites]  = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [editing,        setEdit]        = useState(null)
  const [form,           setForm]        = useState({})
  const [customPay,      setCustomPay]   = useState('')
  const [selSites,       setSelSites]    = useState([])
  const [otherSiteOn,    setOtherSiteOn] = useState(false)
  const [otherSiteText,  setOtherSiteText] = useState('')
  const [saving,         setSave]        = useState(false)

  // Selection
  const [selected,  setSelected]  = useState(new Set())

  // Delete state
  const [confirmSingle, setConfirmSingle] = useState(null)   // staff object
  const [confirmBulk,   setConfirmBulk]   = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg, type = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const load = () => getAllStaff().then(r => { setStaff(r.data || []); setSelected(new Set()) }).catch(() => {})
  useEffect(() => { load(); getMySites().then(r => setSites(r.data || [])).catch(() => {}) }, [])

  const filtered = staff.filter(s => {
    const q = search.toLowerCase()
    const mQ = !q || [s.full_name,s.email,s.sia_licence,s.ni_number].some(f=>f?.toLowerCase().includes(q))
    const mF = !filter || siaStatus(s.sia_expiry)===filter
    return mQ && mF
  }).sort((a,b) => (a.full_name||'').localeCompare(b.full_name||''))

  // Selection helpers
  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id))
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map(s => s.id)))
  }

  // Delete handlers
  async function handleDeleteSingle() {
    setDeleting(true)
    try {
      await deleteStaff(confirmSingle.id)
      showToast(`✅ ${confirmSingle.full_name} deleted successfully.`)
      setConfirmSingle(null)
      load()
    } catch (ex) {
      showToast(ex.response?.data?.detail || 'Failed to delete staff member', 'error')
      setConfirmSingle(null)
    } finally {
      setDeleting(false)
    }
  }

  async function handleBulkDelete() {
    setDeleting(true)
    const ids = [...selected]
    try {
      const res = await bulkDeleteStaff(ids)
      showToast(`✅ ${res.data.deleted} staff member${res.data.deleted !== 1 ? 's' : ''} deleted successfully.`)
      setConfirmBulk(false)
      load()
    } catch (ex) {
      showToast(ex.response?.data?.detail || 'Failed to delete staff', 'error')
      setConfirmBulk(false)
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(s) {
    setEdit(s)
    const payStr = s.pay_rate ? String(parseFloat(s.pay_rate).toFixed(2)) : ''
    const isPreset = PRESET_PAY.includes(payStr)
    setCustomPay(isPreset || !payStr ? '' : payStr)

    const knownNames = sites.map(x => x.name)
    let existingNames = s.assigned_sites
      ? s.assigned_sites.split(',').map(x => x.trim()).filter(Boolean)
      : []
    if (existingNames.length === 0 && s.assigned_site_id) {
      const matched = sites.find(x => x.id === s.assigned_site_id)
      if (matched) existingNames = [matched.name]
    }
    const known   = existingNames.filter(n => knownNames.includes(n))
    const unknown = existingNames.filter(n => !knownNames.includes(n))
    setSelSites(known)
    setOtherSiteOn(unknown.length > 0)
    setOtherSiteText(unknown.join(', '))

    setForm({
      // Personal
      title:                 s.title||'',
      first_name:            s.first_name||'',
      last_name:             s.last_name||'',
      date_of_birth:         s.date_of_birth||'',
      nationality:           s.nationality||'',
      phone:                 s.phone||'',
      // Address
      address_line1:         s.address_line1||'',
      address_line2:         s.address_line2||'',
      city:                  s.city||'',
      postcode:              s.postcode||'',
      // Employment
      staff_id:              s.staff_id||'TBC',
      employment_start_date: s.employment_start_date||'',
      pay_rate:              !payStr ? '' : isPreset ? payStr : 'other',
      assigned_site_id:      String(s.assigned_site_id||''),
      right_to_work:         s.right_to_work !== false,
      // SIA
      ni_number:             s.ni_number||'',
      sia_licence:           s.sia_licence||'',
      sia_expiry:            s.sia_expiry||'',
      // Next of kin
      nok_name:              s.nok_name||'',
      nok_phone:             s.nok_phone||'',
      nok_relation:          s.nok_relation||'',
    })
  }

  async function save() {
    setSave(true)
    try {
      const payValue = form.pay_rate === 'other' ? (customPay ? parseFloat(customPay) : null) : (form.pay_rate ? parseFloat(form.pay_rate) : null)
      const allSiteNames = [...selSites, ...(otherSiteOn && otherSiteText.trim() ? otherSiteText.split(',').map(x => x.trim()).filter(Boolean) : [])]
      const assignedSites = allSiteNames.length ? allSiteNames.join(', ') : null
      const firstSite = sites.find(s => s.name === selSites[0])
      await updateStaff(editing.id, {
        // Personal
        title:                 form.title || null,
        first_name:            form.first_name,
        last_name:             form.last_name,
        date_of_birth:         form.date_of_birth || null,
        nationality:           form.nationality || null,
        phone:                 form.phone || null,
        // Address
        address_line1:         form.address_line1 || null,
        address_line2:         form.address_line2 || null,
        city:                  form.city || null,
        postcode:              form.postcode || null,
        // Employment
        staff_id:              form.staff_id,
        employment_start_date: form.employment_start_date || null,
        pay_rate:              payValue,
        assigned_site_id:      firstSite ? firstSite.id : (form.assigned_site_id ? parseInt(form.assigned_site_id) : null),
        assigned_sites:        assignedSites,
        right_to_work:         form.right_to_work,
        // SIA
        ni_number:             form.ni_number || null,
        sia_licence:           form.sia_licence || null,
        sia_expiry:            form.sia_expiry || null,
        // Next of kin
        nok_name:              form.nok_name || null,
        nok_phone:             form.nok_phone || null,
        nok_relation:          form.nok_relation || null,
      })
      setEdit(null); load()
    } catch(ex) { alert(ex.response?.data?.detail || 'Save failed') }
    finally { setSave(false) }
  }

  return (
    <>
      <Toast toast={toast} />

      <div style={{ marginBottom:26 }}>
        <h2 style={{ fontSize:23, fontWeight:700, marginBottom:4 }}>Staff Records</h2>
        <p style={{ fontSize:14, color:'var(--text-muted)' }}>{filtered.length} of {staff.length} employees</p>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search name, SIA, NI, email…"
          style={{ padding:'9px 13px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', width:240 }}/>
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{ padding:'9px 13px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13 }}>
          <option value="">All SIA Status</option>
          <option value="valid">Valid</option>
          <option value="expiring">Expiring (&lt;60 days)</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
          background: 'rgba(224,85,85,.08)', border: '1px solid rgba(224,85,85,.3)',
          borderRadius: 10, padding: '10px 16px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {selected.size} staff selected
          </span>
          <button onClick={() => setConfirmBulk(true)}
            className="btn" style={{ fontSize: 12, padding: '5px 14px', background: '#e05555', color: '#fff', border: 'none' }}>
            🗑️ Delete Selected
          </button>
          <button onClick={() => setSelected(new Set())} className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }}>
            Clear Selection
          </button>
        </div>
      )}

      <div className="card" style={{ padding:0 }}>
        <div className="tw">
          <table>
            <thead><tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  title={allSelected ? 'Deselect all' : 'Select all'} />
              </th>
              <th>Name</th><th>Staff ID</th><th>SIA Licence</th><th>SIA Expiry</th>
              <th>Pay</th><th>Start Date</th><th>Sites</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ background: selected.has(s.id) ? 'rgba(224,85,85,.05)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleRow(s.id)} />
                  </td>
                  <td><strong>{s.full_name}</strong><br/><span style={{ fontSize:11, color:'var(--text-muted)' }}>{s.email}</span></td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{s.staff_id||'TBC'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{s.sia_licence||'—'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(s.sia_expiry)}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', color:'var(--green)' }}>{s.pay_rate?`£${s.pay_rate}/hr`:'—'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{fmtDate(s.employment_start_date)}</td>
                  <td>
                    {(() => {
                      let names = s.assigned_sites
                        ? s.assigned_sites.split(',').map(x => x.trim()).filter(Boolean)
                        : []
                      if (names.length === 0 && s.assigned_site_id) {
                        const m = sites.find(x => x.id === s.assigned_site_id)
                        if (m) names = [m.name]
                      }
                      if (names.length === 0) {
                        return <span style={{ fontSize:12, color:'var(--text-muted)' }}>— Unassigned —</span>
                      }
                      return (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {names.map(n => (
                            <span key={n} style={{
                              fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:12,
                              background:'rgba(106,191,63,.15)', color:'#6abf3f',
                              whiteSpace:'nowrap',
                            }}>{n}</span>
                          ))}
                        </div>
                      )
                    })()}
                  </td>
                  <td><Badge st={siaStatus(s.sia_expiry)}/></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEdit(s)} className="btn btn-outline" style={{ fontSize:11, padding:'5px 10px' }}>Edit</button>
                      <button
                        onClick={() => setConfirmSingle(s)}
                        title="Delete staff member"
                        style={{ padding:'5px 8px', borderRadius:6, border:'1px solid rgba(224,85,85,.4)', background:'rgba(224,85,85,.08)', color:'#e05555', cursor:'pointer', fontSize:13 }}
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>No staff found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEdit(null)}>
          <div className="modal" style={{ width:580, maxHeight:'90vh', overflowY:'auto' }}>
            <h3>Staff Record</h3>
            <p className="sub" style={{ marginBottom:20 }}>{editing.email} · Registered {editing.registered_at ? fmtDate(editing.registered_at.slice(0,10)) : '—'}</p>

            {/* ── Section helper ── */}
            {[
              {
                label: 'Personal Information',
                fields: (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr', gap:10, marginBottom:10 }}>
                      <div className="field" style={{ marginBottom:0 }}><label>Title</label>
                        <select value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}>
                          <option value="">—</option>
                          {['Mr','Mrs','Miss','Ms','Dr','Prof'].map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>First Name</label>
                        <input value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))} />
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>Last Name</label>
                        <input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))} />
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div className="field" style={{ marginBottom:0 }}><label>Date of Birth</label>
                        <input type="date" value={form.date_of_birth} onChange={e=>setForm(f=>({...f,date_of_birth:e.target.value}))} />
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>Nationality</label>
                        <input value={form.nationality} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))} placeholder="e.g. British" />
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>Email (login)</label>
                        <input value={editing.email} disabled style={{ opacity:.6, cursor:'not-allowed' }} />
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>Phone</label>
                        <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="e.g. 07700 900000" />
                      </div>
                    </div>
                  </>
                ),
              },
              {
                label: 'Address',
                fields: (
                  <>
                    <div className="field" style={{ marginBottom:10 }}><label>Address Line 1</label>
                      <input value={form.address_line1} onChange={e=>setForm(f=>({...f,address_line1:e.target.value}))} placeholder="e.g. 12 High Street" />
                    </div>
                    <div className="field" style={{ marginBottom:10 }}><label>Address Line 2</label>
                      <input value={form.address_line2} onChange={e=>setForm(f=>({...f,address_line2:e.target.value}))} placeholder="Flat / apartment / building (optional)" />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 140px', gap:10 }}>
                      <div className="field" style={{ marginBottom:0 }}><label>City / Town</label>
                        <input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} placeholder="e.g. London" />
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>Postcode</label>
                        <input value={form.postcode} onChange={e=>setForm(f=>({...f,postcode:e.target.value.toUpperCase()}))} style={{ textTransform:'uppercase' }} placeholder="e.g. SW1A 1AA" />
                      </div>
                    </div>
                  </>
                ),
              },
              {
                label: 'Employment',
                fields: (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                      <div className="field" style={{ marginBottom:0 }}><label>Staff ID</label>
                        <input value={form.staff_id} onChange={e=>setForm(f=>({...f,staff_id:e.target.value}))} placeholder="e.g. IFM-045 or TBC" />
                      </div>
                      <div className="field" style={{ marginBottom:0 }}><label>Employment Start Date</label>
                        <input type="date" value={form.employment_start_date} onChange={e=>setForm(f=>({...f,employment_start_date:e.target.value}))} />
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom:10 }}><label>Pay Rate (£/hr)</label>
                      <select value={form.pay_rate} onChange={e=>setForm(f=>({...f,pay_rate:e.target.value}))}>
                        <option value="">— Select pay rate —</option>
                        {PRESET_PAY.map(p=><option key={p} value={p}>£{p}/hr</option>)}
                        <option value="other">Other</option>
                      </select>
                      {form.pay_rate === 'other' && (
                        <input type="number" step="0.01" min="0" value={customPay} onChange={e=>setCustomPay(e.target.value)}
                          placeholder="Enter amount e.g. 14.50"
                          style={{ marginTop:6, width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--navy-light)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }} />
                      )}
                    </div>
                    <div className="field" style={{ marginBottom:10 }}><label>Assigned Sites</label>
                      <div style={{ background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', maxHeight:160, overflowY:'auto' }}>
                        {sites.map(s => {
                          const checked = selSites.includes(s.name)
                          return (
                            <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', cursor:'pointer', fontSize:13 }}>
                              <input type="checkbox" checked={checked}
                                onChange={e => setSelSites(prev => e.target.checked ? [...prev, s.name] : prev.filter(n => n !== s.name))}
                                style={{ accentColor:'var(--green)', width:15, height:15 }} />
                              {s.name}
                            </label>
                          )
                        })}
                        <label style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', cursor:'pointer', fontSize:13, borderTop:'1px solid var(--border)', marginTop:6, paddingTop:8 }}>
                          <input type="checkbox" checked={otherSiteOn} onChange={e => setOtherSiteOn(e.target.checked)}
                            style={{ accentColor:'var(--green)', width:15, height:15 }} />
                          Other
                        </label>
                        {otherSiteOn && (
                          <input value={otherSiteText} onChange={e => setOtherSiteText(e.target.value)}
                            placeholder="Enter site name(s), comma-separated"
                            style={{ marginTop:6, width:'100%', padding:'7px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--navy)', color:'var(--text)', fontFamily:'DM Sans,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                        )}
                      </div>
                      {(selSites.length > 0 || (otherSiteOn && otherSiteText.trim())) && (
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                          Selected: {[...selSites, ...(otherSiteOn && otherSiteText.trim() ? [otherSiteText.trim()] : [])].join(', ')}
                        </div>
                      )}
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, cursor:'pointer', marginTop:4 }}>
                      <input type="checkbox" checked={form.right_to_work} onChange={e=>setForm(f=>({...f,right_to_work:e.target.checked}))}
                        style={{ accentColor:'var(--green)', width:15, height:15 }} />
                      Right to work confirmed
                    </label>
                  </>
                ),
              },
              {
                label: 'SIA & Compliance',
                fields: (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                    <div className="field" style={{ marginBottom:0 }}><label>NI Number</label>
                      <input value={form.ni_number} onChange={e=>setForm(f=>({...f,ni_number:e.target.value.toUpperCase()}))} style={{ textTransform:'uppercase' }} placeholder="e.g. AB123456C" />
                    </div>
                    <div className="field" style={{ marginBottom:0 }}><label>SIA Licence</label>
                      <input value={form.sia_licence} onChange={e=>setForm(f=>({...f,sia_licence:e.target.value}))} placeholder="Licence number" />
                    </div>
                    <div className="field" style={{ marginBottom:0 }}><label>SIA Expiry</label>
                      <input type="date" value={form.sia_expiry} onChange={e=>setForm(f=>({...f,sia_expiry:e.target.value}))} />
                    </div>
                  </div>
                ),
              },
              {
                label: 'Next of Kin',
                fields: (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                    <div className="field" style={{ marginBottom:0 }}><label>Full Name</label>
                      <input value={form.nok_name} onChange={e=>setForm(f=>({...f,nok_name:e.target.value}))} placeholder="e.g. Jane Smith" />
                    </div>
                    <div className="field" style={{ marginBottom:0 }}><label>Phone</label>
                      <input value={form.nok_phone} onChange={e=>setForm(f=>({...f,nok_phone:e.target.value}))} placeholder="e.g. 07700 900111" />
                    </div>
                    <div className="field" style={{ marginBottom:0 }}><label>Relationship</label>
                      <input value={form.nok_relation} onChange={e=>setForm(f=>({...f,nok_relation:e.target.value}))} placeholder="e.g. Spouse" />
                    </div>
                  </div>
                ),
              },
              {
                label: 'Declarations (read-only)',
                fields: (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {[
                      ['decl_policy',       'Company policy read & understood'],
                      ['decl_portal',       'Portal terms accepted'],
                      ['decl_line_manager', 'Line manager confirmed'],
                      ['decl_pay_schedule', 'Pay schedule confirmed'],
                      ['decl_trained',      'Training completed'],
                      ['decl_accurate',     'Information declared accurate'],
                      ['decl_contact',      'Contact details confirmed'],
                    ].map(([key, label]) => (
                      <div key={key} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, padding:'4px 0' }}>
                        <span style={{ fontSize:15 }}>{editing[key] ? '✅' : '⬜'}</span>
                        <span style={{ color: editing[key] ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
            ].map(({ label, fields }) => (
              <div key={label} style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', paddingBottom:6, marginBottom:14 }}>
                  {label}
                </div>
                {fields}
              </div>
            ))}

            <div className="modal-footer">
              <button onClick={()=>setEdit(null)} className="btn btn-outline">Cancel</button>
              <button onClick={save} className="btn btn-brand" disabled={saving}>{saving?'Saving…':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Single delete confirmation */}
      {confirmSingle && (
        <ConfirmModal
          message={`Are you sure you want to delete ${confirmSingle.full_name}? This will permanently remove all their shift records, holidays and data. This cannot be undone.`}
          onConfirm={handleDeleteSingle}
          onCancel={() => setConfirmSingle(null)}
          busy={deleting}
        />
      )}

      {/* Bulk delete confirmation */}
      {confirmBulk && (
        <ConfirmModal
          message={`Are you sure you want to delete ${selected.size} staff member${selected.size !== 1 ? 's' : ''}? This will permanently remove all their records. This cannot be undone.`}
          confirmLabel={`Yes, Delete ${selected.size} Permanently`}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulk(false)}
          busy={deleting}
        />
      )}
    </>
  )
}
