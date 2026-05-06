"""
Scheduled tasks — run by APScheduler on startup.

Lateness escalation ladder (per calendar month, per staff member):
  1st / 2nd warning  → informal reminder   (portal: green / normal)
  3rd warning        → second formal notice (portal: amber / warning)
  4th+ warning       → final written notice (portal: red   / urgent)
"""
import os
import logging
import smtplib
import pytz
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from database import SessionLocal
import models

log = logging.getLogger(__name__)
UK_TZ = pytz.timezone('Europe/London')


def _smtp_cfg():
    return (
        os.getenv("SMTP_HOST"),
        int(os.getenv("SMTP_PORT", "587")),
        os.getenv("SMTP_USER"),
        os.getenv("SMTP_PASS"),
    )


def _send(to_email: str, subject: str, body: str):
    smtp_host, smtp_port, smtp_user, smtp_pass = _smtp_cfg()
    if not all([smtp_host, smtp_user, smtp_pass]):
        log.info("[LATENESS] SMTP not configured — would send to %s", to_email)
        return
    bcc = os.getenv("BCC_EMAIL", smtp_user)
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = smtp_user
        msg["To"]      = to_email
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(smtp_host, smtp_port) as srv:
            srv.starttls()
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(smtp_user, [to_email, bcc], msg.as_string())
        log.info("[LATENESS] Sent warning (level %s) to %s", bcc, to_email)
    except Exception as exc:
        log.error("[LATENESS] Failed to send to %s: %s", to_email, exc)


def _row_table(late_events: list) -> str:
    header = (
        f"  {'Date':<14} {'Site':<35} {'Scheduled Start':<18} {'Arrived':<12} {'Minutes Late'}\n"
        f"  {'-'*14} {'-'*35} {'-'*18} {'-'*12} {'-'*13}\n"
    )
    rows = ""
    for e in late_events:
        date_str = e["date"].strftime("%d/%m/%Y") if hasattr(e["date"], "strftime") else str(e["date"])
        rows += (
            f"  {date_str:<14} {e['site']:<35} "
            f"{e['scheduled_start']:<18} {e['clocked_in']:<12} {e['minutes_late']} mins\n"
        )
    return header + rows


# ── Email builders ─────────────────────────────────────────────────────────────

def _build_informal_email(first_name: str, full_name: str, late_events: list) -> tuple[str, str]:
    """1st / 2nd warning — informal reminder."""
    subject = f"Lateness Warning Notice — {full_name}"
    body = f"""Dear {first_name},

I am writing to bring to your attention that our records show you have been recorded as late on more than one occasion within the past seven days.

Punctuality is an important part of your role and is essential to ensuring our clients receive a consistent and professional service. Arriving on time allows for a smooth handover and ensures your colleagues are not placed under unnecessary pressure.

YOUR RECENT LATENESS RECORD (LAST 7 DAYS):

{_row_table(late_events)}
We would like to remind you of your obligation to report for duty at your scheduled start time. Please ensure you plan your journey and arrive at your place of work with sufficient time to clock in and be fully ready to begin work at your scheduled start time. Clocking in at your start time is not the same as being ready to work — you should be on site, prepared, and ready to commence your duties when your shift begins.

If you are experiencing difficulties that are affecting your ability to arrive on time, please contact us as soon as possible so that we can offer support.

Please be advised that a continued pattern of lateness may result in further formal action being taken in line with our company disciplinary procedure.

This notice is being issued as an informal reminder and will be kept on file.

If you have any questions or wish to discuss this matter, please do not hesitate to contact HR directly at hr@ikanfm.co.uk.

Yours sincerely,

Julie Mitcham
HR Department
Ikan Facilities Management Ltd
Web: www.ikanfm.co.uk"""
    return subject, body


def _build_second_formal_email(first_name: str, full_name: str, late_events: list) -> tuple[str, str]:
    """3rd warning in a calendar month — second formal written warning (amber)."""
    subject = f"Second Formal Lateness Warning — {full_name}"
    body = f"""Dear {first_name},

Further to previous correspondence regarding your attendance, I am writing to inform you that our records continue to show a persistent pattern of lateness during your scheduled shifts.

This letter constitutes a Second Formal Written Warning and will be placed on your personnel file.

YOUR LATENESS RECORD THIS MONTH:

{_row_table(late_events)}
Despite previous reminders, we regret that your punctuality has not improved to the required standard. This continued failure to arrive on time is unacceptable and is having an adverse impact on our clients and on your colleagues.

Please be reminded that arriving at your start time to clock in is not sufficient — you must be on site, prepared, and fully ready to begin work at your scheduled start time.

If there are any circumstances affecting your ability to arrive on time, you must contact us immediately.

Please be advised that a further instance of lateness will result in a Final Written Notice being issued, which may ultimately lead to formal disciplinary action up to and including dismissal.

If you wish to discuss this matter, please contact HR directly at hr@ikanfm.co.uk.

Yours sincerely,

Julie Mitcham
HR Department
Ikan Facilities Management Ltd
Web: www.ikanfm.co.uk"""
    return subject, body


def _build_final_notice_email(first_name: str, full_name: str, late_events: list) -> tuple[str, str]:
    """4th+ warning in a calendar month — final written notice before termination (red)."""
    subject = f"FINAL WRITTEN NOTICE — Persistent Lateness — {full_name}"
    body = f"""Dear {first_name},

I am writing to you regarding your continued and persistent lateness. This letter constitutes your FINAL WRITTEN NOTICE prior to the commencement of formal disciplinary proceedings, which may result in the termination of your employment.

YOUR LATENESS RECORD THIS MONTH:

{_row_table(late_events)}
You have previously received informal and formal written warnings regarding your punctuality. Despite these notices, the required and sustained improvement has not been demonstrated.

Your continued lateness:
  - Breaches the terms of your contract of employment
  - Undermines the professional service we provide to our clients
  - Places an unfair burden on your colleagues
  - Jeopardises the operational effectiveness of the business

THIS IS YOUR FINAL WARNING.

Any further recorded lateness will result in us beginning the process of terminating your employment with us.

If you have any mitigating circumstances you believe we should be aware of, you must contact us immediately at hr@ikanfm.co.uk.

Yours sincerely,

Julie Mitcham
HR Department
Ikan Facilities Management Ltd
Web: www.ikanfm.co.uk"""
    return subject, body


# ── Main scheduled job ─────────────────────────────────────────────────────────

def send_lateness_warnings():
    """
    Check all staff across all organisations for lateness in the past 7 days.
    If a staff member has more than one late clock-in, send a warning email
    and create a portal message at the appropriate escalation level.
    """
    log.info("[LATENESS] Running weekly lateness check…")
    db = SessionLocal()
    try:
        now_uk   = datetime.now(UK_TZ)
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)

        # Start of the current calendar month (UTC) for escalation counting
        month_start_uk  = now_uk.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_start_utc = month_start_uk.astimezone(timezone.utc)

        orgs = db.query(models.Organisation).filter(models.Organisation.is_active == True).all()

        total_sent = 0
        for org in orgs:
            late_events = (
                db.query(models.ClockEvent)
                .filter(
                    models.ClockEvent.organisation_id == org.id,
                    models.ClockEvent.event_type      == models.ClockEventType.clock_in,
                    models.ClockEvent.is_late         == True,
                    models.ClockEvent.timestamp       >= week_ago,
                )
                .order_by(models.ClockEvent.timestamp.asc())
                .all()
            )

            from collections import defaultdict
            by_user = defaultdict(list)
            for e in late_events:
                by_user[e.user_id].append(e)

            for user_id, events in by_user.items():
                if len(events) < 2:
                    continue  # Only warn if late more than once this week

                user = db.query(models.User).filter(models.User.id == user_id).first()
                if not user or not user.email:
                    continue

                # ── Escalation: count warnings already sent this calendar month ──
                warnings_this_month = (
                    db.query(models.Message)
                    .filter(
                        models.Message.recipient_id == user.id,
                        models.Message.title.like('Lateness Warning%'),
                        models.Message.sent_at >= month_start_utc,
                    )
                    .count()
                )
                # Also count second formal and final notices
                warnings_this_month += (
                    db.query(models.Message)
                    .filter(
                        models.Message.recipient_id == user.id,
                        models.Message.title.like('Second Formal Lateness%'),
                        models.Message.sent_at >= month_start_utc,
                    )
                    .count()
                )
                warnings_this_month += (
                    db.query(models.Message)
                    .filter(
                        models.Message.recipient_id == user.id,
                        models.Message.title.like('FINAL WRITTEN NOTICE%'),
                        models.Message.sent_at >= month_start_utc,
                    )
                    .count()
                )

                # This warning will be number: warnings_this_month + 1
                this_warning_number = warnings_this_month + 1

                # Build event rows
                rows = []
                for e in events:
                    ci_uk = e.timestamp.astimezone(UK_TZ)
                    site  = e.site.name if e.site else "—"
                    rows.append({
                        "date":            ci_uk.date(),
                        "site":            site,
                        "scheduled_start": e.scheduled_start or "—",
                        "clocked_in":      ci_uk.strftime("%H:%M"),
                        "minutes_late":    e.minutes_late or 0,
                    })

                org_name = org.brand_name or org.name

                if this_warning_number >= 4:
                    subject, body = _build_final_notice_email(user.first_name, user.full_name, rows)
                    priority = 'urgent'
                elif this_warning_number == 3:
                    subject, body = _build_second_formal_email(user.first_name, user.full_name, rows)
                    priority = 'warning'
                else:
                    subject, body = _build_informal_email(user.first_name, user.full_name, rows)
                    priority = 'normal'

                _send(user.email, subject, body)

                portal_msg = models.Message(
                    organisation_id = org.id,
                    sent_by         = None,
                    recipient_id    = user.id,
                    title           = subject,
                    body            = body,
                    priority        = priority,
                    read_by         = '[]',
                )
                db.add(portal_msg)
                db.commit()

                log.info(
                    "[LATENESS] Warning #%d sent to user %d (%s) — priority: %s",
                    this_warning_number, user.id, user.email, priority,
                )
                total_sent += 1

        log.info("[LATENESS] Weekly check complete — %d warning(s) sent", total_sent)
    except Exception as exc:
        log.error("[LATENESS] Weekly check failed: %s", exc)
    finally:
        db.close()
