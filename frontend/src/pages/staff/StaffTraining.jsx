import { useEffect, useState } from 'react'
import { useAuth } from '../../api/AuthContext'
import { useBrand } from '../../api/BrandContext'
import { getMyTraining, submitTrainingModule } from '../../api/client'

// ── Training content ──────────────────────────────────────────────────────────

const MODULES = {
  module1: {
    title: 'Company Policies & Procedures',
    duration: '30–40 mins',
    icon: '📋',
    sections: [
      { title: '1.1 Company Overview & Mission', content: `Ikan Facilities Management Ltd provides manned security services primarily to the cinema industry. With over 15 years of sector experience, we pride ourselves on delivering responsive, customer-focused, and accountable security services.

Our Mission: To become the market leading provider of excellent security services to the cinema industry in the UK.

Our Three Core Values:
• RELIABLE — Consistently high level of security services
• ACCOUNTABLE — Honest and value-for-money security
• CUSTOMER SERVICE — Excellent service for clients and guests

We are committed to the safety and wellbeing of our team members, ensuring proper training, confident role performance, prompt and full payment, and upholding legal entitlements.` },
      { title: '1.2 Code of Conduct', content: `All employees are under obligation to carry out their duties with integrity, professionalism and due consideration for their own safety and that of others.

Key Principles:
• Work in accordance with company objectives: Reliable, Accountable, Customer Service
• Maintain professional conduct at all times
• Show integrity in all interactions
• Prioritize safety of yourself and others
• Uphold company values in every action

Breach of code of conduct may result in disciplinary action up to and including dismissal.` },
      { title: '1.3 Your Roles & Responsibilities', content: `As a Security Officer, your main roles are:

Create Safe Environment:
• Protect clients' property, assets, and finances
• Prevent physical and verbal abuse
• Escort and protect staff during cash movements
• Conduct regular patrols (screens, toilets, public areas, back of house, perimeter)
• Monitor customer behaviour and enforce terms of entry

Incident Management:
• Respond quickly and correctly during incidents
• Report all suspicious incidents
• Record occurrences on Incident Report Forms
• Interact with staff/customers politely and courteously
• Report Health & Safety issues immediately

Professional Standards:
• Maintain clean, professional appearance
• Be clearly identifiable as security
• Comply with operational guidelines
• Participate in training activities
• Support management during emergencies` },
      { title: '1.4 Key Tasks While On Duty', content: `START OF SHIFT:
1. Report to Manager on Duty at start time
2. Complete sign-in process
3. Discuss concerns regarding the day
4. Ensure familiarity with building layout and fire procedures

DURING SHIFT — PATROLS:
• Screen Checks: Monitor auditoriums for antisocial behaviour, piracy, mobile phone use
• Toilet Checks: Monitor for antisocial behaviour
• Public Area Checks: Monitor antisocial behaviour while maintaining visibility
• Back of House: Check for security risks, unlocked rooms, fire exit clearance
• Perimeter Checks: Verify emergency exits clear/closed, lighting functional, note suspicious activity

INCIDENT RESPONSE — USE ABCD:
• Assess Behaviour — Evaluate the situation
• Communicate — Calm, clear communication
• Defuse — De-escalate the situation
• Eject — Remove customer if necessary` },
      { title: '1.5 Prohibited Activities (CRITICAL)', content: `The following activities are strictly PROHIBITED while on duty:

1. Refusing entry without duty manager authorisation
2. Discriminating on grounds of race, gender, sexual orientation, religion, or gender identity
3. Distracting client staff from their work
4. Engaging in personal conversations (religion, politics, personal subjects)
5. Congregating with other staff (unless dealing with incident)
6. Entertaining friends or family during work hours
7. Facilitating illegal ticket sales or unauthorised access
8. Taking unscheduled breaks during peak trading times
9. Undertaking tasks detracting from security role
10. Handling cash under ANY circumstances
11. Eating, drinking, chewing gum while on duty or visible to customers
12. Bringing or consuming alcohol on premises
13. Using mobile phone while on duty
14. Making ticket-cutting your primary responsibility (secondary only)
15. Arguing with duty managers, staff, or colleagues

CONSEQUENCES: Breach of prohibited activities may result in disciplinary action including dismissal.` },
      { title: '1.6 Health & Safety Duties', content: `Health and Safety at Work Act 1974 — Your Legal Duties:

YOU MUST:
• Look after your own health and safety
• Look after the health and safety of others (colleagues, customers)
• Cooperate with management regarding health and safety
• Use and look after safety equipment provided

KEY DEFINITIONS:
• Hazard: Anything that has potential to cause harm
• Risk: The chance that harm could happen in certain circumstances

TYPICAL WORKPLACE HAZARDS:
• Slips, trips, and falls (keep areas clear)
• Injuries from poor lifting (use proper technique)
• Sharp objects (report immediately)
• Violence and assaults (assess and de-escalate)
• Hazardous chemicals (avoid contact, report exposure)

YOUR RESPONSIBILITY: Report all hazards and H&S concerns to duty manager and line manager immediately.` },
      { title: '1.7 Equality & Diversity (Legal Requirement)', content: `The Equality Act 2010 protects people from discrimination. You MUST treat everyone equally and fairly.

PROTECTED CHARACTERISTICS (cannot discriminate based on):
• Age
• Disability
• Gender reassignment
• Marriage and civil partnership
• Pregnancy and maternity
• Race
• Religion or belief
• Sex (gender)
• Sexual orientation

YOUR DUTY: You are required to treat everyone fairly and with respect at all times, regardless of any protected characteristic.

IF YOU EXPERIENCE ABUSE: Report to your Area Supervisor immediately and send written report to hr@ikanfm.co.uk.

REMEMBER: Discrimination is illegal, unethical, and breaches company policy. Zero tolerance.` },
      { title: '1.8 Payroll & Wages', content: `ONLINE PAYROLL SYSTEM:
All staff must submit hours for each shift online on a daily basis.

TO REGISTER FOR ONLINE PORTAL:
1. Visit: portal.ikanfm.co.uk/login/ikan-fm
2. Click CREATE NEW ACCOUNT
3. Enter all required details and submit documentation
4. HR Department will activate account

CLOCK IN/OUT PROCEDURE:
1. Go to manager's office at start of shift
2. Open Chrome and scan the QR code
3. Tap Allow for location access (GPS confirms you're on site)
4. Enter Full Name and Staff ID
5. Tap green CLOCK IN button — screenshot confirmation

CRITICAL NOTES:
• Every shift must be fully recorded — no exceptions
• Missing records affect your pay (delayed or incorrect)
• All records are audited with server-side timestamps` },
      { title: '1.9 SIA Licensing & Right to Work', content: `SIA LICENSING REQUIREMENT:
• You MUST hold a valid SIA licence at ALL TIMES while working in security
• It is a CRIMINAL OFFENCE to carry out security roles without a valid SIA licence
• NO LICENCE = NO WORK

RENEWAL PLANNING:
• Plan 6–8 weeks AHEAD for licence renewal
• DO NOT leave renewal until the last minute
• If your licence expires, you cannot work

RIGHT TO WORK IN THE UK:
• Provide proof of right to work (passport, visa, etc.)
• Update personal details when they change
• INFORM US IN WRITING of ANY changes to immigration or SIA licensing status
• Send all updates to: hr@ikanfm.co.uk` },
      { title: '1.10 Feedback & Concerns', content: `IF YOU HAVE CONCERNS:
First Step: Raise with your line manager — direct, informal discussion resolves most issues.

IF UNCOMFORTABLE WITH LINE MANAGER:
• Email hr@ikanfm.co.uk — anonymous reporting available
• No retaliation policy in place

CONTACT DETAILS:
• HR/Accounts: hr@ikanfm.co.uk
• General inquiries: info@ikanfm.co.uk
• Phone: 0845 539 5330

Your voice matters. Raising concerns helps us maintain our values of Reliable, Accountable, and Customer Service.` },
    ],
  },

  module2: {
    title: 'SIA Door Supervisor Training',
    duration: '50–60 mins',
    icon: '🚪',
    sections: [
      { title: '2.1 Identifying Suspicious Behaviour', content: `Hostile reconnaissance is how terrorists gather information about potential targets. You CANNOT identify a terrorist by appearance — only by suspicious BEHAVIOUR.

SUSPICIOUS BEHAVIOUR INDICATORS:
• Making excessive phone calls throughout the day
• Staying in the same location for extended periods
• Carrying documents in different names
• Particular interest in outside/perimeter of site
• Interest in CCTV systems (photographing/covert recording)
• Making notes or drawing diagrams of the site
• Taking interest in activity timings (opening/closing times)
• Testing response systems (false alarm activations)
• Damage to perimeter security
• Trespassing with no good reason
• Asking unusual or detailed questions about site or security
• Nervousness, anxiety, avoiding eye contact
• Reluctance to be noticed or seen on site

If you see ANY of these indicators, report IMMEDIATELY to duty manager.` },
      { title: '2.2 UK Terrorist Threat Levels', content: `The Security Service (MI5) sets the UK government threat level.

THE FIVE THREAT LEVELS:
1. LOW — Attack is unlikely
2. MODERATE — Attack is possible but not likely
3. SUBSTANTIAL — Attack is a strong possibility
4. SEVERE — Attack is highly likely
5. CRITICAL — Attack is expected imminently

MANAGEMENT RESPONSE: If threat level increases, management may increase security officers, enhance patrols, adjust procedures, and increase visible security presence.

YOUR ROLE: Know the current threat level, follow duty manager guidelines, report suspicious activity immediately.` },
      { title: '2.3 Counter-Terrorism Measures', content: `MOST EFFECTIVE DETERRENTS:
✓ Searching INSIDE AND OUTSIDE premises at DIFFERENT TIMES each day — unpredictability prevents planning
✓ Regular customer bag searches on entry
✓ Regular patrols of out-of-way areas
✓ Visible presence of VIGILANT security staff
✓ Be suspicious of people showing interest in security measures

LEAST EFFECTIVE:
✗ Large signs announcing security presence (predictable)
✗ Searching at the SAME TIME each day (terrorists identify pattern)
✗ Fixed security positions (easily identified and avoided)

YOUR ROLE: Vary patrol times and routes. Conduct random searches. Stay alert and vigilant. Maintain unpredictable presence.` },
      { title: '2.4 Bomb Threat Response (CRITICAL)', content: `IF THERE IS A BOMB THREAT:

FIRST ACTION: RAISE ALARM AND EVACUATE THE BUILDING

DO NOT:
✗ Search for the bomb (you're not trained; could trigger device)
✗ Contact police first (evacuate first, contact after)
✗ Use radios or mobile phones near suspicious item (electrical impulse could detonate)

THE CORRECT SEQUENCE:
1. ASSESS: Confirm bomb threat has been made
2. ALERT: Raise alarm immediately
3. EVACUATE: Direct all people to assembly points
4. INFORM: Tell duty manager immediately
5. CONTACT: Follow manager's instructions (may call police)

IF YOU FIND A SUSPICIOUS ITEM:
1. DO NOT TOUCH IT
2. Contact duty manager IMMEDIATELY
3. Give exact location details
4. Clear the immediate area
5. DO NOT use radios/mobile phones nearby
6. Follow duty manager evacuation directions PRECISELY

REMEMBER: ANY bomb threat is taken seriously. Your calm response saves lives.` },
      { title: '2.5 First Aid & Emergency Response', content: `MOST COMMON EMERGENCY ON LICENSED PREMISES: Slips, trips, and falls

FIRST AIDER ROLES:
1. Preserve life
2. Prevent condition worsening
3. Promote recovery

WHEN CALLING EMERGENCY SERVICES PROVIDE:
• Location (exact address/site name)
• Type of incident
• Number of casualties
• Extent of injuries

AS SECURITY OFFICER (UNTRAINED IN FIRST AID):
If someone is unconscious:
✓ Call an ambulance (999)
✗ Do NOT try to diagnose the injury
✗ Do NOT move them unnecessarily
✗ Do NOT give CPR unless trained

Your role is to alert others and keep casualty safe until qualified help arrives.` },
      { title: '2.6 RIDDOR Reporting', content: `RIDDOR = Reporting of Injuries, Diseases and Dangerous Occurrences Regulations

WHAT MUST BE REPORTED:
• Workplace injuries
• Occupational diseases
• Dangerous occurrences

YOUR RESPONSIBILITY:
• Record all incidents on Incident Report Form
• Note exact details (time, location, people involved)
• Report to duty manager immediately
• Ensure incident is documented for RIDDOR purposes

Types requiring RIDDOR: Serious injuries requiring hospital treatment, broken bones, significant cuts, loss of consciousness, occupational diseases, dangerous near-miss occurrences.

REMEMBER: Complete documentation is essential. Your incident reports form the basis of RIDDOR reporting.` },
      { title: '2.7 Young People Safeguarding', content: `PROOF OF AGE — ACCEPTABLE DOCUMENTS:
✓ Original passport
✓ Valid driving licence
✓ Over 21 club card
✗ School books (not valid)
✗ Library cards (not valid)
✗ Gym membership cards (not valid)

WHEN CAN YOU SEARCH A YOUNG PERSON:
ONLY when:
✓ Consent given BY THE YOUNG PERSON, OR consent by an APPROPRIATE RESPONSIBLE ADULT
✓ You have EXPLAINED it's a condition of entry

IF YOUNG PERSON REFUSES SEARCH: Refuse entry — no exceptions.

REMOVING INTOXICATED YOUNG PERSON:
ONLY if a responsible adult IS PRESENT at point of ejection.
Do NOT: remove alone, trust young person's promise to go home, call unlicensed taxi.` },
      { title: '2.8 Vulnerable Person Protection', content: `A VULNERABLE PERSON IS:
• Person separated from their friends
• Person under age 18
• Person who does not speak English
• Person who appears unhappy or unwell

ACTIONS TO TAKE:
✓ Call a LICENSED taxi (not an unlicensed minicab)
✓ Stay with them until taxi arrives
✓ Verify driver/vehicle details
✓ Alert duty manager of situation

DO NOT:
✗ Take them home yourself
✗ Ask colleague to take them home
✗ Leave them unattended

Your vigilance prevents vulnerable people becoming victims of crime.` },
      { title: '2.9 Conflict De-escalation', content: `USE S.A.F.E.R. MODEL:
S — Step back (create distance, non-threatening posture)
A — Assess threat
F — Find help (call duty manager)
E — Evaluate options
R — Respond

USE P.A.L.M.S. POSITIONING:
P — Position: Stand at angle, outside arm's reach, not blocking exit
A — Attitude: Remain positive and helpful
L — Look & Listen: Watch body language, listen to tone
M — Make space: Keep 1.2–2m comfortable distance
S — Stance: Open posture, relaxed but ready, non-threatening

DO NOT TRIGGER FIGHT/FLIGHT RESPONSE:
✗ Intimidation (loud voice, rapid speech)
✗ Touching (without permission)
✗ Standing too close or directly facing
✗ Blocking their exit or cornering them

DE-ESCALATION PHRASES THAT WORK:
• "I understand the frustration you're feeling"
• "I'm trying to help you"
• "Please bear with me, we will sort this out"` },
      { title: '2.10 Searching & Entry Control', content: `LEGAL POSITION:
• You have NO formal legal right to force a search
• Search CAN be a condition of entry
• Must display suitable signs at entrance
• Must gain permission BEFORE searching
• Anyone refusing = refuse entry (no exceptions)
• Same-sex searching only

HOW TO CONDUCT BAG SEARCH:
1. Politely ask customer to open bag
2. Ask them to SHOW contents (not you searching)
3. Conduct in view of CCTV/witness
4. DO NOT put your hands inside bag
5. Ask customer to move items aside themselves
6. Use needle-proof gloves if you must touch items
7. Thank them for cooperation

CRITICAL LEGAL WARNING:
Searching someone without necessary consent = Criminal assault proceedings. Company and officer can be personally prosecuted. ALWAYS get permission first.` },
    ],
  },

  module3: {
    title: "Martyn's Law — Terrorism Protection",
    duration: '40–50 mins',
    icon: '⚖️',
    sections: [
      { title: "3.1 What is Martyn's Law?", content: `OFFICIAL NAME: Terrorism Protection of Premises Act 2025

BACKGROUND:
• Named after Martyn Hett — victim of Manchester Arena bombing (2017)
• Legislation created to honour his memory
• Requires public places to implement counter-terrorism measures

PURPOSE:
• Enhance public safety in crowded places
• Require premises to take protective security measures
• Establish legal duty of care to the public
• Create consistent counter-terrorism standards

APPLIES TO:
• Public gathering places and high-footfall venues
• Cinemas (YES — applies to all Ikan FM sites)
• Shopping centres, concert venues, event spaces

YOUR UNDERSTANDING: You need to know the law exists, what it requires, your role in counter-terrorism measures, and your site-specific procedures.` },
      { title: '3.2 Duty Holder Responsibilities', content: `WHAT PREMISES MUST DO:

Conduct Assessments: vulnerability assessments, identify security weaknesses, assess counter-terrorism risks.

Implement Measures: physical security (barriers, searches), staff training, emergency procedures, visitor safety protocols.

Train Staff: counter-terrorism awareness, threat identification, emergency procedure training, regular refresher training.

YOUR ROLE AS SECURITY OFFICER:
✓ Know site-specific counter-terrorism measures
✓ Maintain situational awareness
✓ Identify suspicious behaviour
✓ Report concerns immediately
✓ Assist with emergency procedures
✓ Support duty managers
✓ Document incidents

YOU ARE NOT RESPONSIBLE FOR: creating assessments or final decision-making (that is management's role).

REMEMBER: You're a critical part of the counter-terrorism framework.` },
      { title: '3.3 Dynamic Risk Assessment', content: `DYNAMIC RISK ASSESSMENT: A method of continuously assessing situations to ensure that risks of violence are quickly recognised, assessed, and responded to.

FACTORS TO ASSESS CONTINUOUSLY:

Threat Level: current national threat level, specific warnings for cinema venues.

Physical Environment: crowd density, site layout, exits accessible, lighting working, vulnerable areas.

Behaviour: anyone exhibiting suspicious indicators, unusual patterns, signs of distress.

Timing: time of day, event type, staffing levels.

CONTINUOUS ASSESSMENT MEANS:
✓ You reassess every few minutes
✓ You update your mental picture constantly
✓ You respond to changes immediately
✓ You don't become complacent

If risk increases: increase vigilance, alert other staff, adjust patrol patterns, position strategically, prepare to respond.

REMEMBER: You're always assessing, always alert, always ready to respond.` },
      { title: '3.4 Identifying Suspicious Activity', content: `PHYSICAL SURVEILLANCE INDICATORS:
🚨 Particular interest in outside of site — loitering, photographing building/exits, noting security features
🚨 Interest in CCTV systems — photographing cameras, noting coverage areas
🚨 Making notes or drawing diagrams — detailed sketches, marking exits

TIMING & PATTERN INDICATORS:
🚨 Interest in activity timings — when venue opens/closes, busy vs quiet times
🚨 Testing response times — false alarms, deliberately triggering security response
🚨 Damage to perimeter security — deliberate vandalism

BEHAVIOURAL INDICATORS:
🚨 Attempts to disguise identity — excessive covering, repeatedly changing appearance
🚨 Trespassing with no good reason
🚨 Asking unusual questions about site, security, staff numbers
🚨 Nervousness, excessive sweating, avoiding eye contact
🚨 Leaving area when noticed, moving away from security

YOUR ACTION: For ANY of these indicators — discreetly observe, note details (time, person description, behaviour), alert duty manager immediately, document observation.` },
      { title: '3.5 Terrorist Threat Levels', content: `UK GOVERNMENT THREAT LEVELS set by MI5:

LEVEL 1: LOW — Attack is unlikely. Standard security measures, general awareness.
LEVEL 2: MODERATE — Attack is possible but not likely. Increased awareness, standard protective measures.
LEVEL 3: SUBSTANTIAL — Attack is a strong possibility. Enhanced security, increased patrols and vigilance.
LEVEL 4: SEVERE — Attack is highly likely. Substantial security increase, enhanced protective measures, likely increased officers.
LEVEL 5: CRITICAL — Attack expected imminently. Maximum security, possible closure/evacuation, military or police support visible.

YOUR RESPONSIBILITY: Know current threat level. Follow duty manager's procedures. Maintain appropriate vigilance. Report suspicious activity immediately.

REMEMBER: Threat levels are intelligence-based. Follow management guidance.` },
      { title: '3.6 Counter-Terrorism Training', content: `WHY THIS TRAINING EXISTS: Martyn's Law requires premises to provide counter-terrorism training to staff. This training fulfils that requirement.

WHAT YOU'RE LEARNING:
✓ Understanding of Martyn's Law
✓ Threat identification and suspicious behaviour recognition
✓ Emergency procedures and your role
✓ Reporting procedures

REFRESHER TRAINING: Required every 3 months to keep knowledge current, address new threats, and ensure continuous compliance.

YOUR COMMITMENT: By completing this training, you confirm that you understand counter-terrorism measures, will maintain vigilance, will report suspicious activity, and will follow emergency procedures.

REMEMBER: Ongoing training keeps you and your colleagues safe.` },
      { title: '3.7 Emergency Evacuation Procedures', content: `EVACUATION SEQUENCE:
1. Alarm raised by staff or security
2. All patrons directed to assembly points
3. All staff support evacuation
4. Management contacts police
5. Police secure area/scene
6. Patrons accounted for

YOUR ROLE:
✓ Know evacuation routes (brief yourself daily)
✓ Direct patrons calmly to exits
✓ Use multiple exits (faster evacuation)
✓ Encourage use of alternate routes
✓ Don't allow return until all-clear given

CHALLENGES YOU WILL FACE:

People Don't Feel Threatened: Unwilling to leave — give firm, repeated requests.

Intoxicated Persons: More resistant — patient, firm, direct assistance.

People Use Familiar Exits (not fastest routes): Actively direct to alternate exits.

Panic Risk: Crowd mirrors staff behaviour — stay calm and confident.

REMEMBER: Calm, firm leadership prevents panic and injuries.` },
      { title: '3.8 Fire Exits vs. Fire Doors', content: `FIRE EXITS (GREEN signs):
Purpose: Allow people to EXIT the building safely.
• Clearly marked, direct exit routes to outside
• Should be clear and unobstructed
• Lead to assembly points
• Encourage use of MULTIPLE exits during evacuation

YOUR ROLE: Know ALL fire exit locations. Ensure they stay clear. Direct people to use them. Encourage multiple exits.

FIRE DOORS (heavy, self-closing):
Purpose: CONTAIN fire and smoke — NOT primary exit routes.
• Self-closing mechanisms
• Slow down fire/smoke progression
• Protect escape routes

YOUR ROLE: Keep them CLOSED. Report any propped-open doors to duty manager. Don't use as primary exits.

KEY DIFFERENCE: Fire exits = escape, Fire doors = containment. Know the difference for emergency response.` },
      { title: '3.9 Reporting Suspicious Activity', content: `IMMEDIATE THREAT (Active danger): Call 999
Report: location, nature of threat, direction of threat, number of people, whether armed, any injuries. Then notify duty manager immediately.

SUSPICIOUS ACTIVITY (Potentially threatening):
1. Alert duty manager IMMEDIATELY
2. Provide: what behaviour you observed, time and location, person description, why it seemed suspicious
3. Follow duty manager's instructions

NON-URGENT TERRORISM INFORMATION:
Anti-Terrorism Hotline: 0800-789321
Available 24/7 by specialist counter-terrorism officers. Confidential. For tips, information about suspects, general security concerns.

WHAT TO REPORT:
✓ Unattended items/suspicious packages
✓ Behaviour matching hostile reconnaissance
✓ Security system tampering
✓ Unauthorized access attempts
✓ Anyone taking photographs/notes of security
✓ Anything that "feels wrong"

REMEMBER: When in doubt, report. Police would rather check than miss a real threat.` },
      { title: '3.10 Your Legal & Protective Duties', content: `LEGISLATION APPLYING TO YOUR ROLE:

Terrorism Protection of Premises Act 2025 (Martyn's Law): Counter-terrorism measures are a legal obligation.
Health & Safety at Work Act 1974: Your duty to protect yourself and others.
Equality Act 2010: Treat everyone fairly regardless of protected characteristics.
SIA Regulations: Professional conduct standards and licensing requirements.

YOUR LEGAL OBLIGATIONS:
✓ Maintain valid SIA licence
✓ Follow site counter-terrorism procedures
✓ Report suspicious activity
✓ Cooperate with management
✓ Participate in training
✓ Support emergency procedures
✓ Document incidents

SITE-SPECIFIC PROCEDURES — CRITICAL:
Each Ikan FM site may have specific assembly points, particular evacuation routes, unique vulnerable areas, and special security measures.

✓ Familiarise yourself with YOUR site's procedures
✓ Know assembly point locations and emergency contact numbers
✓ Ask duty manager about site-specific threats

REMEMBER: You're part of the legal framework protecting public safety.` },
    ],
  },
}

const QUESTIONS = {
  module1: [
    { id: 1, q: "What are Ikan FM's three core values?", opts: ["Safe, Secure, Service", "Reliable, Accountable, Customer Service", "Professional, Responsive, Caring", "Efficient, Effective, Ethical"], correct: 1 },
    { id: 2, q: "Which of the following is a PROHIBITED activity while on duty?", opts: ["Conducting screen checks", "Using mobile phone while on duty", "Reporting suspicious behaviour", "Conducting patrols"], correct: 1 },
    { id: 3, q: "What should you do if you find a lost item on the premises?", opts: ["Take it home", "Alert duty manager immediately", "Put it in your pocket for later", "Wait and see if someone claims it"], correct: 1 },
    { id: 4, q: "Under the Health & Safety at Work Act 1974, you must:", opts: ["Only look after your own safety", "Look after your own and others' safety", "Only report to management", "Ignore minor hazards"], correct: 1 },
    { id: 5, q: "The Equality Act 2010 protects people from discrimination based on:", opts: ["Job performance only", "9 protected characteristics including age, disability, race, and sexual orientation", "Seniority level only", "Employment history only"], correct: 1 },
    { id: 6, q: "How far in advance should you plan for SIA licence renewal?", opts: ["2–3 weeks", "6–8 weeks", "1 month", "After it expires"], correct: 1 },
    { id: 7, q: "What is the first step if you have a workplace concern?", opts: ["Email HR immediately", "Contact police", "Raise with your line manager", "Post on social media"], correct: 2 },
    { id: 8, q: "Which documents prove right to work in the UK?", opts: ["School certificate only", "Bank statement only", "Passport or visa documentation", "Driving licence only"], correct: 2 },
    { id: 9, q: "What is the purpose of the online payroll portal?", opts: ["Order supplies", "Submit shift hours daily", "Request holidays", "Report incidents only"], correct: 1 },
    { id: 10, q: "Working without a valid SIA licence is:", opts: ["Fine as long as you're supervised", "A criminal offence", "Only an issue if caught", "Acceptable for training"], correct: 1 },
  ],
  module2: [
    { id: 1, q: "Making unusual questions about site security could indicate:", opts: ["Normal customer curiosity", "Hostile reconnaissance", "Friendly interest", "Staff confusion"], correct: 1 },
    { id: 2, q: "Which of these is an effective counter-terrorism deterrent?", opts: ["Searching at the same time every day", "Searching inside and outside at different times daily", "Announcing security presence with large signs", "Having fixed security positions"], correct: 1 },
    { id: 3, q: "If someone reports a bomb threat, your FIRST action is to:", opts: ["Search for the bomb", "Raise alarm and evacuate", "Contact police first", "Calmly assess situation"], correct: 1 },
    { id: 4, q: "A vulnerable person is:", opts: ["Anyone over 70", "Person separated from friends, under 18, doesn't speak English, or appears unwell", "Only intoxicated people", "Only people with disabilities"], correct: 1 },
    { id: 5, q: "When can you search a young person?", opts: ["Always, no consent needed", "Only with consent from young person OR appropriate adult, with explanation", "Never", "Only if you suspect something"], correct: 1 },
    { id: 6, q: "What action best protects a vulnerable person?", opts: ["Taking them home yourself", "Calling licensed taxi and verifying their safety", "Asking colleague to take them home", "Leaving them alone outside"], correct: 1 },
    { id: 7, q: "Use the P.A.L.M.S. approach to prevent which situation?", opts: ["Running out of resources", "Triggering fight/flight response in customer", "Losing control of venue", "Staff conflicts"], correct: 1 },
    { id: 8, q: "Which of these is an acceptable proof of age?", opts: ["Library card", "Original passport", "School book", "Gym membership card"], correct: 1 },
    { id: 9, q: "Searching a customer without consent could result in:", opts: ["Just a warning", "Criminal assault proceedings", "A small fine", "Verbal reprimand only"], correct: 1 },
    { id: 10, q: "What does RIDDOR stand for?", opts: ["Risk Identification Department of Operations", "Reporting of Injuries, Diseases and Dangerous Occurrences Regulations", "Restaurant Implementation and Dining Safety Order", "Rapid Incident Dispatch Department"], correct: 1 },
  ],
  module3: [
    { id: 1, q: "Martyn's Law is formally known as:", opts: ["Terrorism Safety Act", "Terrorism Protection of Premises Act 2025", "Public Safety Prevention Act", "Counter-terrorism Compliance Act"], correct: 1 },
    { id: 2, q: "Under Martyn's Law, premises must implement:", opts: ["Ticket discounts only", "Protective security measures and staff training", "Stricter entry fees", "Longer opening hours"], correct: 1 },
    { id: 3, q: "Which behaviour could indicate hostile reconnaissance?", opts: ["Buying popcorn", "Taking photographs of CCTV systems and making site diagrams", "Asking for bathroom location", "Purchasing a cinema ticket"], correct: 1 },
    { id: 4, q: "What does dynamic risk assessment mean?", opts: ["Assessment done once per week", "Continuous assessment of situations to quickly recognise and respond to risks", "Annual evaluation by police", "Risk assessment only by management"], correct: 1 },
    { id: 5, q: "When is the 'Critical' terrorist threat level declared?", opts: ["Attack is unlikely", "Attack is a strong possibility", "Attack is expected imminently", "There is no threat"], correct: 2 },
    { id: 6, q: "If you find a suspicious unattended item, you should:", opts: ["Touch it to see what it is", "Ignore it", "Do not touch it, contact duty manager, clear area, avoid radios/phones nearby", "Take it to lost and found"], correct: 2 },
    { id: 7, q: "The Anti-Terrorism Hotline number is:", opts: ["999", "0800-789321", "101", "112"], correct: 1 },
    { id: 8, q: "During emergency evacuation, people typically:", opts: ["Use fastest available exits", "Escape using routes they know best", "Stay calm and wait for instructions", "Gather their belongings first"], correct: 1 },
    { id: 9, q: "Fire EXITS are for:", opts: ["Containing fire and smoke", "Allowing safe evacuation from building", "Staff use only", "Equipment storage"], correct: 1 },
    { id: 10, q: "You should report immediately to duty manager if you observe:", opts: ["A customer looking at a film poster", "Someone taking photos of security cameras", "Someone buying a ticket", "A staff member at counter"], correct: 1 },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(isoDate) {
  if (!isoDate) return null
  const diff = new Date(isoDate) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function fmtDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString('en-GB')
}

function isExpired(isoDate) {
  if (!isoDate) return false
  return new Date(isoDate) < new Date()
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StaffTraining() {
  const { user }   = useAuth()
  const { colour } = useBrand()
  const c          = colour || '#6abf3f'

  const [progress,      setProgress]    = useState({})   // { module1: {...}, module2: {...}, module3: {...} }
  const [deadline,      setDeadline]    = useState(null)
  const [loading,       setLoading]     = useState(true)

  // view: 'dashboard' | 'content' | 'quiz'
  const [view,          setView]        = useState('dashboard')
  const [activeModule,  setActiveModule]= useState(null)
  const [sectionIndex,  setSectionIndex]= useState(0)

  // quiz
  const [answers,       setAnswers]     = useState({})
  const [submitted,     setSubmitted]   = useState(false)
  const [quizScore,     setQuizScore]   = useState(0)
  const [saving,        setSaving]      = useState(false)

  useEffect(() => {
    getMyTraining()
      .then(r => {
        setProgress(r.data.modules || {})
        setDeadline(r.data.deadline)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function startModule(mod) {
    setActiveModule(mod)
    setSectionIndex(0)
    setView('content')
    setAnswers({})
    setSubmitted(false)
  }

  function startQuiz() {
    setAnswers({})
    setSubmitted(false)
    setView('quiz')
  }

  async function submitQuiz() {
    const qs    = QUESTIONS[activeModule]
    let score   = 0
    qs.forEach(q => { if (answers[q.id] === q.correct) score++ })
    setQuizScore(score)
    setSubmitted(true)
    setSaving(true)
    try {
      await submitTrainingModule(activeModule, score)
      const r = await getMyTraining()
      setProgress(r.data.modules || {})
    } catch {}
    finally { setSaving(false) }
  }

  const daysLeft = daysUntil(deadline)

  // ── Dashboard ──────────────────────────────────────────────────────────────
  if (view === 'dashboard') {
    const allPassed = ['module1','module2','module3'].every(m => progress[m]?.passed && !isExpired(progress[m]?.expires_at))

    return (
      <div>
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Security Officer Training</h2>
          <p style={{ fontSize:14, color:'#555' }}>Complete all 3 modules to maintain your certification</p>
        </div>

        {/* Deadline banner */}
        {deadline && !allPassed && (
          <div style={{
            background: daysLeft <= 3 ? '#fff3cd' : daysLeft < 0 ? '#fdecea' : '#f0f9ec',
            border: `1px solid ${daysLeft <= 3 ? '#ffc107' : daysLeft < 0 ? '#e53935' : c}`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{daysLeft < 0 ? '🚨' : daysLeft <= 3 ? '⚠️' : '⏱'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: daysLeft < 0 ? '#c62828' : '#333' }}>
                {daysLeft < 0
                  ? `Training deadline passed ${Math.abs(daysLeft)} days ago`
                  : daysLeft === 0
                  ? 'Training deadline is today!'
                  : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining to complete training`}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Deadline: {fmtDate(deadline)}</div>
            </div>
          </div>
        )}

        {allPassed && (
          <div style={{
            background: '#f0f9ec', border: `1px solid ${c}`,
            borderRadius: 10, padding: '14px 18px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 28 }}>🏆</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#2e7d32' }}>All modules complete!</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Your certification is valid for 3 months from each module completion date.</div>
            </div>
          </div>
        )}

        {loading ? <p style={{ color: '#888' }}>Loading…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(MODULES).map(([key, mod]) => {
              const prog    = progress[key]
              const passed  = prog?.passed && !isExpired(prog?.expires_at)
              const expired = prog?.passed && isExpired(prog?.expires_at)
              const tried   = prog && !prog.passed

              return (
                <div key={key} style={{
                  background: '#fff', borderRadius: 12, padding: 20,
                  border: `1px solid ${passed ? c : '#dde8dd'}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 22 }}>{mod.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{mod.title}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{mod.duration}</div>
                        </div>
                      </div>

                      {passed && (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: c, background: c+'18', padding: '2px 8px', borderRadius: 20 }}>
                            ✓ Passed {prog.score}/10
                          </span>
                          <span style={{ fontSize: 11, color: '#666' }}>Expires {fmtDate(prog.expires_at)}</span>
                        </div>
                      )}
                      {expired && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#e65100', background: '#fff3e0', padding: '2px 8px', borderRadius: 20, marginTop: 6, display: 'inline-block' }}>
                          ⚠ Refresher required
                        </span>
                      )}
                      {tried && !passed && (
                        <span style={{ fontSize: 11, color: '#c62828', marginTop: 6, display: 'inline-block' }}>
                          Last score: {prog.score}/10 — retake needed (8/10 required)
                        </span>
                      )}
                    </div>
                    <button onClick={() => startModule(key)} style={{
                      padding: '9px 20px', borderRadius: 8, border: 'none',
                      background: passed ? c+'22' : c, color: passed ? c : '#fff',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      fontFamily: 'DM Sans,sans-serif', flexShrink: 0,
                    }}>
                      {passed ? '↻ Review' : expired ? '↻ Refresh' : tried ? 'Retake' : 'Start →'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 20, padding: '12px 16px', background: '#f8f8f8', borderRadius: 8, fontSize: 12, color: '#777' }}>
          Pass mark: 8/10 per module &nbsp;·&nbsp; Certificate valid 3 months &nbsp;·&nbsp; Refresher required every 3 months
        </div>
      </div>
    )
  }

  // ── Module content view ────────────────────────────────────────────────────
  if (view === 'content') {
    const mod     = MODULES[activeModule]
    const section = mod.sections[sectionIndex]
    const total   = mod.sections.length
    const pct     = Math.round(((sectionIndex + 1) / total) * 100)

    return (
      <div>
        <button onClick={() => setView('dashboard')} style={{
          background: 'none', border: 'none', color: c, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'DM Sans,sans-serif',
        }}>← Back to modules</button>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 5 }}>
            <span>{mod.icon} {mod.title}</span>
            <span>Section {sectionIndex + 1} of {total} ({pct}%)</span>
          </div>
          <div style={{ height: 6, background: '#eee', borderRadius: 3 }}>
            <div style={{ height: 6, background: c, borderRadius: 3, width: `${pct}%`, transition: 'width .3s' }} />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #dde8dd', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: '#1a2e1a' }}>{section.title}</h3>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: '#333', whiteSpace: 'pre-wrap' }}>{section.content}</div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setSectionIndex(i => Math.max(0, i - 1))} disabled={sectionIndex === 0}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 8, border: '1px solid #dde8dd',
              background: '#fff', color: sectionIndex === 0 ? '#ccc' : '#333',
              fontWeight: 700, fontSize: 14, cursor: sectionIndex === 0 ? 'default' : 'pointer',
              fontFamily: 'DM Sans,sans-serif',
            }}>
            ← Previous
          </button>
          {sectionIndex < total - 1 ? (
            <button onClick={() => setSectionIndex(i => i + 1)} style={{
              flex: 2, padding: '12px 0', borderRadius: 8, border: 'none',
              background: c, color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            }}>
              Next →
            </button>
          ) : (
            <button onClick={startQuiz} style={{
              flex: 2, padding: '12px 0', borderRadius: 8, border: 'none',
              background: c, color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            }}>
              Take Assessment →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Quiz view ──────────────────────────────────────────────────────────────
  if (view === 'quiz') {
    const mod = MODULES[activeModule]
    const qs  = QUESTIONS[activeModule]
    const allAnswered = Object.keys(answers).length === qs.length

    if (submitted) {
      const passed = quizScore >= 8
      return (
        <div>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, border: '1px solid #dde8dd', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>{passed ? '🏆' : '❌'}</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: passed ? '#2e7d32' : '#c62828' }}>
              {passed ? 'Assessment Passed!' : 'Assessment Failed'}
            </h3>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#333', marginBottom: 16 }}>
              {quizScore} / 10
            </div>
            {passed ? (
              <div style={{ background: '#f0f9ec', border: `1px solid ${c}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#2e7d32', textAlign: 'left' }}>
                ✓ Your certificate for <strong>{mod.title}</strong> is valid for 3 months.
              </div>
            ) : (
              <div style={{ background: '#fdecea', border: '1px solid #e53935', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#c62828', textAlign: 'left' }}>
                You need 8/10 to pass. Please review the content and try again.
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setView('dashboard') }} style={{
                flex: 1, padding: '12px 0', borderRadius: 8, border: '1px solid #dde8dd',
                background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
              }}>Back to Modules</button>
              {!passed && (
                <button onClick={() => { setAnswers({}); setSubmitted(false); setView('content'); setSectionIndex(0) }} style={{
                  flex: 1, padding: '12px 0', borderRadius: 8, border: 'none',
                  background: c, color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                }}>Review & Retry</button>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div>
        <button onClick={() => setView('content')} style={{
          background: 'none', border: 'none', color: c, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'DM Sans,sans-serif',
        }}>← Back to content</button>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{mod.title} — Assessment</h3>
          <p style={{ fontSize: 13, color: '#888' }}>Pass mark: 8/10. Answer all questions then submit.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          {qs.map((q, i) => (
            <div key={q.id} style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #dde8dd', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a2e1a' }}>
                Q{i + 1}. {q.q}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.opts.map((opt, idx) => (
                  <label key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    borderRadius: 8, border: `2px solid ${answers[q.id] === idx ? c : '#dde8dd'}`,
                    background: answers[q.id] === idx ? c + '12' : '#fafafa',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans,sans-serif',
                  }}>
                    <input type="radio" name={`q${q.id}`} value={idx}
                      checked={answers[q.id] === idx}
                      onChange={() => setAnswers(a => ({ ...a, [q.id]: idx }))}
                      style={{ accentColor: c, width: 16, height: 16 }} />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button onClick={submitQuiz} disabled={!allAnswered || saving} style={{
          width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
          background: allAnswered ? c : '#ccc', color: '#fff',
          fontWeight: 700, fontSize: 15, cursor: allAnswered ? 'pointer' : 'default',
          fontFamily: 'DM Sans,sans-serif',
        }}>
          {saving ? 'Saving…' : `Submit Assessment (${Object.keys(answers).length}/${qs.length} answered)`}
        </button>
      </div>
    )
  }

  return null
}
