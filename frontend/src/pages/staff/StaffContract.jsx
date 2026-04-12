import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'

const CLAUSES = [
  ['1. Probationary Period', 'Your employment is subject to a six (6) month probationary period. During this period your contract may be terminated with one (1) week\'s notice, however this does not prejudice the right to terminate at any time without notice for reasons of gross misconduct.'],
  ['2. Job Title', 'You are employed in the position of LICENSED SECURITY OFFICER. You must be in possession of a current and valid SIA Licence during the course of your employment. An invalid, revoked or suspended licence will result in immediate termination.'],
  ['3. Termination', 'The Employer may terminate by giving: (a) not less than 1 week during year 1; (b) 1 week per subsequent full year up to year 12; (c) 12 weeks after 12 years continuous employment. The Employee may terminate by four (4) weeks\' written notice.'],
  ['4. Place of Work', 'You will be required to work at premises as necessitated by the operational and business needs of the company.'],
  ['5. Remuneration', null], // filled from org settings
  ['6. Equal Opportunities', 'The employer adheres to a policy of making employment decisions without regard to race, colour, religion, sex, sexual orientation, national origin, citizenship, age or disability.'],
  ['7. Hours of Work', 'All staff are employed on a zero hours basis. You are entitled to five (5) minutes break for every hour worked. No breaks can be more than thirty (30) minutes. The working week runs from Friday to Thursday.'],
  ['8. Annual Holidays', 'The holiday year runs from 1 April to 31 March. You are entitled to four weeks of paid holiday per year, accruing at 2.3 days per full month. Requests must be made in writing at least 4 weeks in advance. Unused holiday does not carry forward.'],
  ['9. Sickness Absence or Lateness', 'Lateness 10–30 mins: 1-hour penalty. 30 mins–1 hour: 2-hour penalty. Over 1 hour: disciplinary notice. You must inform your manager before 10:00am on the first day of absence.'],
  ['10. Confidentiality', 'You shall not during or after employment disclose any confidential information concerning the employer or its clients.'],
  ['11. Non-Competition', 'For six (6) months after termination you shall not solicit or accept business from any customers or clients of the employer during the preceding two years.'],
  ['12. Governing Law', 'This Agreement shall be construed in accordance with the laws of England and Wales.'],
]

export default function StaffContract() {
  const { user }   = useAuth()
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const employer = user?.contract_employer_name    || user?.org_name || 'Employer'
  const empAddr  = user?.contract_employer_address || ''
  const empEmail = user?.org_email                 || ''
  const signName = user?.contract_signatory_name   || 'Director'
  const signRole = user?.contract_signatory_role   || 'Director'
  const minPay   = user?.contract_min_pay          || 'National Minimum Wage (NMW)'
  const maxPay   = user?.contract_max_pay          || '£14'
  const remunClause = `Your basic rate of pay will vary from the legal ${minPay} and ${maxPay} per hour depending on site and duties undertaken, payable every four weeks (Friday–Thursday). Wages are paid no later than 7 days after the pay period by electronic credit transfer. Bank holidays are paid at a rate of time and a half.`

  const addr = [user?.address_line1, user?.address_line2, user?.city, user?.postcode].filter(Boolean).join(', ')

  const particulars = [
    ['Employer',            employer],
    ['Employer Address',    empAddr],
    ['Employee',            `${user?.first_name||''} ${user?.last_name||''}`],
    ['Home Address',        addr || '—'],
    ['Date of Commencement',user?.employment_start_date || 'To be confirmed by HR'],
    ['Job Title',           'Licensed Security Officer'],
  ]

  function downloadPDF() {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = generatePDF
    s.onerror = () => window.print()
    if (window.jspdf) { generatePDF(); return }
    document.head.appendChild(s)
  }

  function generatePDF() {
    const { jsPDF } = window.jspdf
    const doc = new jsPDF({ unit:'mm', format:'a4' })
    const W=210, H=297, ML=20, lw=170; let y=28

    const hdr = () => {
      doc.setFillColor(15,25,35); doc.rect(0,0,W,14,'F')
      doc.setFillColor(...hexRGB(c)); doc.rect(0,0,4,14,'F')
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(255,255,255)
      doc.text(employer.toUpperCase(), ML, 9)
      doc.setFont('helvetica','normal')
      doc.text('CONTRACT OF EMPLOYMENT', W-ML, 9, {align:'right'})
      doc.setTextColor(60,60,60)
    }
    hdr()

    const chk = (h=10) => { if(y+h>H-20){doc.addPage();y=28;hdr()} }
    const T = (txt,sz=10,bold=false,col=[60,60,60]) => {
      chk(sz*.55+3); doc.setFont('helvetica',bold?'bold':'normal')
      doc.setFontSize(sz); doc.setTextColor(...col)
      doc.splitTextToSize(txt,lw).forEach(l=>{chk(5);doc.text(l,ML,y);y+=sz*.44}); y+=1.5
    }

    y+=2; T('CONTRACT OF EMPLOYMENT & STAFF HANDBOOK',14,true,[15,25,35])
    doc.setDrawColor(...hexRGB(c)); doc.setLineWidth(.4); doc.line(ML,y,W-ML,y); y+=5
    T(employer,9,false,[120,150,120]); T(empAddr||'',8,false,[150,170,150])
    if(empEmail) T(empEmail,8,false,[150,170,150]); y+=4

    T('STATEMENT OF PARTICULARS OF EMPLOYMENT',10,true,...[[78,154,40]])
    particulars.forEach(([l,v],i)=>{
      if(i%2===0){doc.setFillColor(244,251,244);doc.rect(ML,y-4,lw,7.5,'F')}
      doc.setDrawColor(192,224,192);doc.setLineWidth(.2);doc.rect(ML,y-4,lw,7.5,'S')
      doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(120,154,120)
      doc.text(l.toUpperCase(),ML+3,y+.5)
      doc.setFont('helvetica','normal');doc.setTextColor(15,25,35)
      doc.text(doc.splitTextToSize(v||'—',lw-55)[0],ML+55,y+.5)
      y+=7.5
    }); y+=5

    CLAUSES.forEach(([title,body])=>{
      const text = body || remunClause
      y+=3; chk(14)
      doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...hexRGB(c))
      doc.text(title,ML,y);y+=6; T(text,9.5)
    })

    chk(60); y+=3
    doc.setDrawColor(...hexRGB(c));doc.setLineWidth(.4);doc.line(ML,y,W-ML,y);y+=5
    T('DECLARATION OF UNDERSTANDING',10,true,...[[...hexRGB(c)]])
    T(`I, ${user?.first_name} ${user?.last_name}, declare that I have read and understood this Contract of Employment and agree to be bound by the terms herein.`,9.5)
    y+=8
    doc.setDrawColor(80,100,80);doc.setLineWidth(.4)
    doc.line(ML,y,ML+78,y);doc.line(W-ML-78,y,W-ML,y);y+=5
    doc.setFontSize(8.5);doc.setTextColor(120,150,120)
    doc.text(`${user?.first_name} ${user?.last_name}`,ML,y)
    doc.text(`${signName} — ${signRole}`,W-ML,y,{align:'right'})
    y+=5; doc.setFontSize(8)
    doc.text('Date: _______________',ML,y); doc.text('Date: _______________',W-ML,y,{align:'right'})

    const pages=doc.getNumberOfPages()
    for(let p=1;p<=pages;p++){
      doc.setPage(p);doc.setFontSize(7);doc.setTextColor(120,150,120)
      doc.text(`${user?.first_name} ${user?.last_name}`,ML,H-8)
      doc.text(`Page ${p} of ${pages}`,W-ML,H-8,{align:'right'})
    }
    doc.save(`Contract_${user?.first_name}_${user?.last_name}.pdf`)
  }

  function hexRGB(h) {
    const n=parseInt((h||'#6abf3f').replace('#',''),16)
    return [(n>>16)&255,(n>>8)&255,n&255]
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ fontSize:20, fontWeight:700, color:'#1a2a1a' }}>My Contract</div>
        <button onClick={downloadPDF} style={{ padding:'10px 18px', borderRadius:10, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>⬇ Download PDF</button>
      </div>

      <div className="s-card">
        <div style={{ fontWeight:700, fontSize:15, color:'#1a2a1a', marginBottom:4 }}>Contract of Employment &amp; Staff Handbook</div>
        <div style={{ fontSize:12, color:'#6a8a6a', marginBottom:16 }}>{user?.first_name} {user?.last_name} · Commencement: {user?.employment_start_date||'To be confirmed by HR'}</div>

        <div style={{ background:'#f8fbf8', border:`1.5px solid ${c}44`, borderRadius:12, padding:20, fontSize:13, lineHeight:1.85, maxHeight:520, overflowY:'auto', color:'#2a4a2a' }}>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.12em', color:'#6a8a6a' }}>{employer.toUpperCase()}</div>
            {empAddr && <div style={{ fontSize:10, color:'#8aaa8a', marginTop:2 }}>{empAddr}</div>}
            <div style={{ borderTop:`1.5px solid ${c}44`, margin:'12px 0' }} />
            <div style={{ fontSize:16, fontWeight:700, color:'#1a2a1a' }}>CONTRACT OF EMPLOYMENT &amp; STAFF HANDBOOK</div>
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:16 }}>
            <tbody>
              {particulars.map(([l,v],i) => (
                <tr key={l} style={{ background:i%2?'#fff':'#f4fbf4' }}>
                  <td style={{ padding:'6px 10px', fontWeight:700, color:'#6a8a6a', textTransform:'uppercase', fontSize:10, width:'40%', letterSpacing:'.05em' }}>{l}</td>
                  <td style={{ padding:'6px 10px', color:'#1a2a1a' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {CLAUSES.map(([title, body]) => (
            <div key={title}>
              <h4 style={{ fontSize:12, fontWeight:700, color:c, margin:'14px 0 5px', textTransform:'uppercase', letterSpacing:'.04em' }}>{title}</h4>
              <p style={{ marginBottom:10, color:'#4a6a4a' }}>{body || remunClause}</p>
            </div>
          ))}

          <div style={{ borderTop:`1.5px solid ${c}44`, margin:'16px 0' }} />
          <p style={{ fontSize:12, color:'#4a6a4a' }}>
            I, <strong>{user?.first_name} {user?.last_name}</strong>, declare that I have read and understood the Contract of Employment and agree to be bound by the terms herein.
          </p>
          <div style={{ display:'flex', gap:30, marginTop:20, flexWrap:'wrap' }}>
            {[['EMPLOYEE SIGNATURE',`${user?.first_name||''} ${user?.last_name||''}`],[`FOR ${employer.toUpperCase()}`,`${signName} — ${signRole}`]].map(([lbl,name]) => (
              <div key={lbl}>
                <div style={{ fontSize:10, color:'#6a8a6a', marginBottom:18 }}>{lbl}</div>
                <div style={{ borderTop:'1px solid #6a8a6a', width:150, paddingTop:4, fontSize:11, color:'#6a8a6a' }}>{name}</div>
                <div style={{ fontSize:10, color:'#8aaa8a', marginTop:3 }}>Date: _______________</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
