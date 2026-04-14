import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { fmtDate } from '../../api/utils'

function PF({ label, value }) {
  return (
    <div style={{padding:'12px 0',borderBottom:'1px solid #f0f4f0'}}>
      <div style={{fontSize:10,fontWeight:700,color:'#8aaa8a',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>{label}</div>
      <div style={{fontSize:14,fontWeight:500,color:value?'#1a2a1a':'#8aaa8a'}}>{value||'—'}</div>
    </div>
  )
}

export default function StaffProfile() {
  const { user }   = useAuth()
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const sia  = user?.sia_expiry ? new Date(user.sia_expiry) : null
  const days = sia ? Math.ceil((sia-new Date())/86400000) : null
  const gone = days!==null&&days<0, warn=days!==null&&days<60

  return <div>
    <div style={{fontSize:20,fontWeight:700,color:'#1a2a1a',marginBottom:16}}>My Profile</div>

    <div className="s-card">
      <div className="s-card-title">👤 Personal Details</div>
      <PF label="Full Name"    value={`${user?.first_name||''} ${user?.last_name||''}`}/>
      <PF label="Date of Birth" value={fmtDate(user?.date_of_birth)}/>
      <PF label="Email"        value={user?.email}/>
      <PF label="Phone"        value={user?.phone}/>
      <PF label="Address"      value={user?.full_address}/>
      <PF label="Nationality"  value={user?.nationality}/>
    </div>

    <div className="s-card">
      <div className="s-card-title">💼 Employment</div>
      <PF label="Staff ID"        value={user?.staff_id&&user.staff_id!=='TBC'?user.staff_id:'TBC — HR will assign'}/>
      <PF label="Job Title"       value="Licensed Security Officer"/>
      <PF label="Employment Start" value={user?.employment_start_date ? fmtDate(user.employment_start_date) : 'To be confirmed by HR'}/>
      <PF label="NI Number"       value={user?.ni_number}/>
      <PF label="Contract Type"   value="Zero Hours"/>
    </div>

    <div className="s-card">
      <div className="s-card-title">🪪 SIA Licence</div>
      <PF label="Licence Number" value={user?.sia_licence}/>
      <PF label="Expiry Date"    value={fmtDate(user?.sia_expiry)}/>
      {days!==null&&(
        <div style={{background:gone?'#fde8e8':warn?'#fef9e8':'#f0faf0',border:`1px solid ${gone?'#e08080':warn?'#f0c060':'#a0d080'}`,borderRadius:10,padding:14,marginTop:10,textAlign:'center'}}>
          <div style={{fontSize:36,fontWeight:700,fontFamily:'DM Mono,monospace',color:gone?'#e05555':warn?'#d97706':c}}>{gone?'EXPIRED':`${days} days`}</div>
          <div style={{fontSize:12,color:'#6a8a6a',marginTop:4}}>{gone?'⚠ Contact HR immediately':warn?'Renewal required soon':'Until licence expiry'}</div>
        </div>
      )}
      <PF label="Right to Work" value={user?.right_to_work?'Yes — confirmed':'No'}/>
    </div>

    <div className="s-card">
      <div className="s-card-title">🆘 Emergency Contact</div>
      <PF label="Name"         value={user?.nok_name}/>
      <PF label="Phone"        value={user?.nok_phone}/>
      <PF label="Relationship" value={user?.nok_relation}/>
    </div>
  </div>
}
