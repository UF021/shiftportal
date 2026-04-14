import { useLocation, Link } from 'react-router-dom'

export default function PendingPage() {
  const { state } = useLocation()
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f7f5', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:40, textAlign:'center', maxWidth:480, boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize:52, marginBottom:14 }}>⏳</div>
        <h3 style={{ fontSize:20, fontWeight:700, color:'#7a5000', marginBottom:10 }}>Registration Submitted</h3>
        <p style={{ fontSize:13, color:'#4a6a4a', lineHeight:1.8 }}>
          Your registration has been received and is being reviewed by the HR team
          {state?.org ? ` at ${state.org}` : ''}.
          <br /><br />
          {state?.email && <>You will be notified at <strong>{state.email}</strong> once your account is activated.<br /><br /></>}
          If your registration is not activated within 24hrs, please contact hr@ikanfm.co.uk
        </p>
        <Link to="/login">
          <button style={{ marginTop:22, padding:'11px 24px', borderRadius:20, border:'1.5px solid #c0d8c0', background:'#fff', color:'#4e9a28', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            ← Back to Sign In
          </button>
        </Link>
      </div>
    </div>
  )
}
