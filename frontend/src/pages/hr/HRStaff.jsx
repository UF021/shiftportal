import { useEffect, useState } from 'react'
import { getAllStaff, updateStaff, getMySites } from '../../api/client'

const PAY = ['11.44','12.00','12.21','12.50','13.00','13.50','14.00','14.50','15.00','15.50','16.00','17.00','18.00']

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

export default function HRStaff() {
  const [staff,  setStaff]  = useState([])
  const [sites,  setSites]  = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [editing,setEdit]   = useState(null)
  const [form,   setForm]   = useState({})
  const [saving, setSave]   = useState(false)

  const load = () => getAllStaff().then(r=>setStaff(r.data||[])).catch(()=>{})
  useEffect(() => { load(); getMySites().then(r=>setSites(r.data||[])).catch(()=>{}) }, [])

  const filtered = staff.filter(s => {
    const q = search.toLowerCase()
    const mQ = !q || [s.full_name,s.email,s.sia_licence,s.ni_number].some(f=>f?.toLowerCase().includes(q))
    const mF = !filter || siaStatus(s.sia_expiry)===filter
    return mQ && mF
  })

  function openEdit(s) {
    setEdit(s)
    setForm({
      staff_id:              s.staff_id||'TBC',
      employment_start_date: s.employment_start_date||'',
      pay_rate:              String(s.pay_rate||'12.00'),
      assigned_site_id:      String(s.assigned_site_id||''),
      ni_number:             s.ni_number||'',
      sia_licence:           s.sia_licence||'',
      sia_expiry:            s.sia_expiry||'',
    })
  }

  async function save() {
    setSave(true)
    try {
      await updateStaff(editing.id, {
        ...form,
        pay_rate:        form.pay_rate        ? parseFloat(form.pay_rate)        : null,
        assigned_site_id:form.assigned_site_id ? parseInt(form.assigned_site_id)  : null,
        employment_start_date: form.employment_start_date||null,
        sia_expiry:      form.sia_expiry||null,
      })
      setEdit(null); load()
    } catch(ex) { alert(ex.response?.data?.detail||'Save failed') }
    finally { setSave(false) }
  }

  return (
    <>
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

      <div className="card" style={{ padding:0 }}>
        <div className="tw">
          <table>
            <thead><tr>
              <th>Name</th><th>Staff ID</th><th>SIA Licence</th><th>SIA Expiry</th>
              <th>Pay</th><th>Start Date</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.sort((a,b)=>(a.full_name||'').localeCompare(b.full_name||'')).map(s=>(
                <tr key={s.id}>
                  <td><strong>{s.full_name}</strong><br/><span style={{ fontSize:11, color:'var(--text-muted)' }}>{s.email}</span></td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{s.staff_id||'TBC'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{s.sia_licence||'—'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{s.sia_expiry||'—'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', color:'var(--green)' }}>{s.pay_rate?`£${s.pay_rate}/hr`:'—'}</td>
                  <td style={{ fontFamily:'DM Mono,monospace', fontSize:12 }}>{s.employment_start_date||'—'}</td>
                  <td><Badge st={siaStatus(s.sia_expiry)}/></td>
                  <td><button onClick={()=>openEdit(s)} className="btn btn-outline" style={{ fontSize:11, padding:'5px 10px' }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEdit(null)}>
          <div className="modal" style={{ width:460 }}>
            <h3>Edit Staff Details</h3>
            <p className="sub">{editing.full_name}</p>
            <div className="field"><label>Staff ID</label>
              <input value={form.staff_id} onChange={e=>setForm(f=>({...f,staff_id:e.target.value}))} placeholder="e.g. IFM-045 or TBC"/></div>
            <div className="field"><label>Employment Start Date</label>
              <input type="date" value={form.employment_start_date} onChange={e=>setForm(f=>({...f,employment_start_date:e.target.value}))}/></div>
            <div className="field"><label>Pay Rate (£/hr)</label>
              <select value={form.pay_rate} onChange={e=>setForm(f=>({...f,pay_rate:e.target.value}))}>
                {PAY.map(p=><option key={p} value={p}>£{p}/hr</option>)}
              </select></div>
            <div className="field"><label>Assigned Site</label>
              <select value={form.assigned_site_id} onChange={e=>setForm(f=>({...f,assigned_site_id:e.target.value}))}>
                <option value="">— Unassigned —</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="field"><label>NI Number</label>
              <input value={form.ni_number} onChange={e=>setForm(f=>({...f,ni_number:e.target.value.toUpperCase()}))} style={{ textTransform:'uppercase' }}/></div>
            <div className="field"><label>SIA Licence Number</label>
              <input value={form.sia_licence} onChange={e=>setForm(f=>({...f,sia_licence:e.target.value}))}/></div>
            <div className="field"><label>SIA Expiry Date</label>
              <input type="date" value={form.sia_expiry} onChange={e=>setForm(f=>({...f,sia_expiry:e.target.value}))}/></div>
            <div className="modal-footer">
              <button onClick={()=>setEdit(null)} className="btn btn-outline">Cancel</button>
              <button onClick={save} className="btn btn-brand" disabled={saving}>{saving?'Saving…':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
