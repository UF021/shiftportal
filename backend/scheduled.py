"""
Scheduled tasks — run by APScheduler on startup.

Lateness escalation ladder (per calendar month, per staff member):
  1st / 2nd warning  → informal reminder   (portal: green / normal)
  3rd warning        → second formal notice (portal: amber / warning)
  4th+ warning       → final written notice (portal: red   / urgent)
"""
import logging
import pytz
from datetime import datetime, date as _date, timedelta, timezone

from database import SessionLocal
from email_utils import send_email
import models

log = logging.getLogger(__name__)
UK_TZ = pytz.timezone('Europe/London')


def _send(to_email: str, subject: str, body: str):
    send_email(to=to_email, subject=subject, body=body, from_name="Ikan FM HR")


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
                    models.ClockEvent.minutes_late    >  10,
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
                if user.is_blocked or getattr(user, 'is_archived', False):
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


# ── SIA expiry warnings — weekly Monday 09:00 UK ──────────────────────────────

def send_sia_expiry_warnings():
    """
    Email each org's HR admin a list of staff whose SIA licence expires
    within 60 days, or has already expired.  Skips orgs with no expiring staff.
    """
    log.info("[SIA] Running SIA expiry check…")
    db = SessionLocal()
    try:
        from datetime import date as _date
        today    = _date.today()
        in_60    = today + timedelta(days=60)

        orgs = db.query(models.Organisation).filter(models.Organisation.is_active == True).all()
        total_sent = 0

        for org in orgs:
            expiring = db.query(models.User).filter(
                models.User.organisation_id == org.id,
                models.User.is_active       == True,
                models.User.sia_expiry      != None,
                models.User.sia_expiry      <= in_60,
            ).order_by(models.User.sia_expiry).all()

            if not expiring:
                continue

            hr_users = db.query(models.User).filter(
                models.User.organisation_id == org.id,
                models.User.role            == models.UserRole.hr,
                models.User.is_active       == True,
            ).all()

            rows = ""
            for u in expiring:
                days_left = (u.sia_expiry - today).days
                status    = "EXPIRED" if days_left < 0 else f"{days_left} days"
                rows     += f"  {u.full_name:<30} {str(u.sia_expiry):<14} {status}\n"

            subject = f"SIA Licence Expiry Alert — {len(expiring)} staff member(s) require attention"
            body    = (
                f"This is an automated reminder from the Tyma portal.\n\n"
                f"The following staff members have SIA licences expiring within 60 days "
                f"or that have already expired:\n\n"
                f"  {'Name':<30} {'Expiry Date':<14} Status\n"
                f"  {'-'*30} {'-'*14} {'-'*10}\n"
                f"{rows}\n"
                f"Please ensure renewals are arranged promptly to maintain compliance.\n\n"
                f"Regards,\nTyma Notifications"
            )

            for hr_user in hr_users:
                send_email(
                    to        = hr_user.email,
                    subject   = subject,
                    body      = body,
                    from_name = f"{org.brand_name or org.name} via Tyma",
                    reply_to  = org.brand_email or org.contact_email,
                )
                total_sent += 1

        log.info("[SIA] Check complete — %d email(s) sent", total_sent)
    except Exception as exc:
        log.error("[SIA] Check failed: %s", exc)
    finally:
        db.close()


# ── Missed clock-out alerts — daily 23:30 UK ──────────────────────────────────

def send_missed_clockout_alerts():
    """
    Email HR admins a list of staff who clocked in today but have no
    corresponding clock-out yet.  Excludes holiday-pay entries.
    """
    log.info("[CLOCKOUT] Running missed clock-out check…")
    db = SessionLocal()
    try:
        now_uk    = datetime.now(UK_TZ)
        day_start = UK_TZ.localize(datetime(now_uk.year, now_uk.month, now_uk.day, 0, 0)).astimezone(timezone.utc)

        orgs = db.query(models.Organisation).filter(models.Organisation.is_active == True).all()
        total_sent = 0

        for org in orgs:
            clock_ins = db.query(models.ClockEvent).filter(
                models.ClockEvent.organisation_id == org.id,
                models.ClockEvent.event_type      == models.ClockEventType.clock_in,
                models.ClockEvent.timestamp       >= day_start,
                models.ClockEvent.entry_notes     != '[HOLIDAY PAY]',
            ).all()

            open_shifts = []
            for ci in clock_ins:
                has_out = db.query(models.ClockEvent).filter(
                    models.ClockEvent.user_id    == ci.user_id,
                    models.ClockEvent.event_type == models.ClockEventType.clock_out,
                    models.ClockEvent.timestamp  >  ci.timestamp,
                ).first()
                if not has_out:
                    user = db.query(models.User).filter(models.User.id == ci.user_id).first()
                    if user:
                        ci_uk = ci.timestamp.astimezone(UK_TZ)
                        open_shifts.append({
                            "name":    user.full_name,
                            "site":    ci.site.name if ci.site else "—",
                            "in_time": ci_uk.strftime("%H:%M"),
                        })

            if not open_shifts:
                continue

            hr_users = db.query(models.User).filter(
                models.User.organisation_id == org.id,
                models.User.role            == models.UserRole.hr,
                models.User.is_active       == True,
            ).all()

            rows = "".join(
                f"  {s['name']:<30} {s['site']:<30} Clocked in: {s['in_time']}\n"
                for s in open_shifts
            )
            subject = f"Missed clock-out alert — {len(open_shifts)} open shift(s) today"
            body    = (
                f"The following staff members clocked in today but have not yet clocked out:\n\n"
                f"  {'Name':<30} {'Site':<30} Time\n"
                f"  {'-'*30} {'-'*30} {'-'*15}\n"
                f"{rows}\n"
                f"Please review and add a manual clock-out if required.\n\n"
                f"Regards,\nTyma Notifications"
            )

            for hr_user in hr_users:
                send_email(
                    to        = hr_user.email,
                    subject   = subject,
                    body      = body,
                    from_name = f"{org.brand_name or org.name} via Tyma",
                    reply_to  = org.brand_email or org.contact_email,
                )
                total_sent += 1

        log.info("[CLOCKOUT] Check complete — %d email(s) sent", total_sent)
    except Exception as exc:
        log.error("[CLOCKOUT] Check failed: %s", exc)
    finally:
        db.close()


# ── Trial expiry warnings — daily 09:00 UK ────────────────────────────────────

def send_trial_expiry_warnings():
    """
    Email HR admins when their trial expires in exactly 7, 3, or 1 day(s).
    """
    log.info("[TRIAL] Running trial expiry check…")
    db = SessionLocal()
    try:
        from datetime import date as _date
        today      = _date.today()
        warn_days  = {7, 3, 1}

        subs = db.query(models.Subscription).filter(
            models.Subscription.plan          == models.SubscriptionPlan.trial,
            models.Subscription.status        == models.SubscriptionStatus.trial,
            models.Subscription.trial_ends_at != None,
        ).all()

        total_sent = 0
        for sub in subs:
            trial_date = sub.trial_ends_at.date()
            days_left  = (trial_date - today).days
            if days_left not in warn_days:
                continue

            org = db.query(models.Organisation).filter(
                models.Organisation.id        == sub.organisation_id,
                models.Organisation.is_active == True,
            ).first()
            if not org:
                continue

            hr_users = db.query(models.User).filter(
                models.User.organisation_id == org.id,
                models.User.role            == models.UserRole.hr,
                models.User.is_active       == True,
            ).all()

            if days_left == 1:
                urgency = "TOMORROW"
            elif days_left == 3:
                urgency = "in 3 days"
            else:
                urgency = "in 7 days"

            subject = f"Your Tyma trial expires {urgency} — action required"
            body    = (
                f"Your 30-day free trial for {org.name} expires {urgency} ({trial_date}).\n\n"
                f"To continue using Tyma without interruption, please upgrade to a paid plan.\n\n"
                f"  Starter:    £149/month — up to 50 staff, 3 sites\n"
                f"  Growth:     £299/month — up to 200 staff, 10 sites\n"
                f"  Enterprise: Custom pricing — unlimited\n\n"
                f"To upgrade, visit Billing & Plan inside your portal or contact support@tyma.io.\n\n"
                f"Regards,\nThe Tyma Team"
            )

            for hr_user in hr_users:
                send_email(
                    to        = hr_user.email,
                    subject   = subject,
                    body      = body,
                    from_name = "Tyma",
                )
                total_sent += 1

        log.info("[TRIAL] Check complete — %d email(s) sent", total_sent)
    except Exception as exc:
        log.error("[TRIAL] Check failed: %s", exc)
    finally:
        db.close()


# ── No-show alerts — every 30 min ─────────────────────────────────────────────

def send_no_show_alerts():
    """
    Check today's scheduled shifts where start + 45 min has passed and no
    clock_in was recorded within ±60 min of start.  Sets no_show_alerted=True
    and emails HR so the same shift is never alerted twice.
    """
    log.info("[NO-SHOW] Running no-show check…")
    db = SessionLocal()
    try:
        from collections import defaultdict
        now_uk = datetime.now(UK_TZ)
        today  = now_uk.date()

        shifts = db.query(models.ScheduledShift).filter(
            models.ScheduledShift.date            == today,
            models.ScheduledShift.no_show_alerted == False,
        ).all()

        by_org = defaultdict(list)
        for s in shifts:
            sh, sm   = map(int, s.start_time.split(':'))
            start_uk = UK_TZ.localize(datetime(today.year, today.month, today.day, sh, sm))
            cutoff   = start_uk + timedelta(minutes=45)
            if now_uk < cutoff:
                continue  # threshold not reached yet

            start_utc = start_uk.astimezone(timezone.utc)
            clock_in  = db.query(models.ClockEvent).filter(
                models.ClockEvent.user_id    == s.user_id,
                models.ClockEvent.event_type == models.ClockEventType.clock_in,
                models.ClockEvent.timestamp.between(
                    start_utc - timedelta(hours=1),
                    start_utc + timedelta(hours=1),
                ),
            ).first()

            if not clock_in:
                s.no_show_alerted = True
                by_org[s.organisation_id].append(s)

        total_alerted = 0
        for org_id, no_shows in by_org.items():
            org = db.query(models.Organisation).filter(
                models.Organisation.id        == org_id,
                models.Organisation.is_active == True,
            ).first()
            if not org:
                continue

            hr_users = db.query(models.User).filter(
                models.User.organisation_id == org_id,
                models.User.role            == models.UserRole.hr,
                models.User.is_active       == True,
            ).all()

            rows = ""
            for s in no_shows:
                name = s.user.full_name if s.user else f"User #{s.user_id}"
                site = s.site.name if s.site else "—"
                rows += f"  {name:<30} {site:<30} Scheduled: {s.start_time}\n"

            subject = f"No-show alert — {len(no_shows)} staff member(s) failed to clock in"
            body    = (
                f"The following staff members were scheduled to start today but have not clocked in "
                f"(checked 45 minutes after their scheduled start time):\n\n"
                f"  {'Name':<30} {'Site':<30} Scheduled Start\n"
                f"  {'-'*30} {'-'*30} {'-'*15}\n"
                f"{rows}\n"
                f"Please contact the staff member(s) and update the schedule if required.\n\n"
                f"Regards,\nTyma Notifications"
            )

            for hr_user in hr_users:
                send_email(
                    to        = hr_user.email,
                    subject   = subject,
                    body      = body,
                    from_name = f"{org.brand_name or org.name} via Tyma",
                    reply_to  = org.brand_email or org.contact_email,
                )

            total_alerted += len(no_shows)

        db.commit()
        log.info("[NO-SHOW] Check complete — %d no-show(s) alerted", total_alerted)
    except Exception as exc:
        log.error("[NO-SHOW] Check failed: %s", exc)
        db.rollback()
    finally:
        db.close()


def send_weekly_payroll_training_reminder():
    """Send Monday morning training reminders to all payroll staff with incomplete modules."""
    from routers.training import send_payroll_training_reminders_all_orgs
    db = SessionLocal()
    try:
        send_payroll_training_reminders_all_orgs(db)
    except Exception as exc:
        log.error("[TRAINING-REMINDER] Weekly job failed: %s", exc)
    finally:
        db.close()


def send_incident_filing_reminders():
    """
    Weekly job: remind active staff who worked 2+ shifts in the last 7 days
    but filed zero incident reports in the last 14 days.
    Fires at most once per 14-day window per staff member.
    """
    import os as _os
    from email_utils import send_email as _send, org_sender, org_reply_to

    now     = datetime.now(timezone.utc)
    cutoff7 = now - timedelta(days=7)
    cutoff14= now - timedelta(days=14)

    db = SessionLocal()
    try:
        orgs = db.query(models.Organisation).filter(
            models.Organisation.is_active == True
        ).all()

        total_sent = 0
        for org in orgs:
            org_name   = org.brand_name or org.name
            portal_url = _os.getenv("FRONTEND_URL", "https://portal.ikanfm.co.uk")
            reply_to   = org_reply_to(org)

            staff_list = db.query(models.User).filter(
                models.User.organisation_id == org.id,
                models.User.role            == models.UserRole.staff,
                models.User.is_active       == True,
                models.User.is_blocked.isnot(True),
                models.User.is_archived.isnot(True),
            ).all()

            for s in staff_list:
                # Already reminded within the last 14 days?
                if s.incident_reminder_sent_at:
                    last = s.incident_reminder_sent_at.replace(tzinfo=timezone.utc) if s.incident_reminder_sent_at.tzinfo is None else s.incident_reminder_sent_at
                    if last > cutoff14:
                        continue

                # Count clock-in events in the last 7 days (proxy for shifts worked)
                shifts_worked = db.query(models.ClockEvent).filter(
                    models.ClockEvent.user_id    == s.id,
                    models.ClockEvent.event_type == models.ClockEventType.clock_in,
                    models.ClockEvent.timestamp  >= cutoff7,
                ).count()

                if shifts_worked < 2:
                    continue

                # Count incident reports in the last 14 days
                incidents_filed = db.query(models.IncidentReport).filter(
                    models.IncidentReport.user_id      == s.id,
                    models.IncidentReport.submitted_at >= cutoff14,
                ).count()

                if incidents_filed > 0:
                    continue

                # Send reminder
                _send_incident_reminder_email(s, org_name, portal_url, reply_to)

                s.incident_reminder_sent_at = now
                total_sent += 1

        db.commit()
        log.info("[INCIDENT-REMINDER] Sent %d reminder(s)", total_sent)
    except Exception as exc:
        db.rollback()
        log.error("[INCIDENT-REMINDER] Job failed: %s", exc)
    finally:
        db.close()


def _send_incident_reminder_email(user, org_name: str, portal_url: str, reply_to: str):
    from email_utils import send_email

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
        <tr>
          <td style="background:#0f1923;padding:28px 32px;text-align:center;">
            <div style="color:#6abf3f;font-size:22px;font-weight:900;letter-spacing:-0.5px;">{org_name}</div>
            <div style="color:#7a9a7a;font-size:13px;margin-top:4px;">HR Department</div>
          </td>
        </tr>
        <tr>
          <td style="background:#e3f2fd;border-bottom:3px solid #1565c0;padding:20px 32px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">📋</div>
            <div style="font-size:18px;font-weight:700;color:#0d47a1;">A Friendly Reminder — Incident Reporting</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;">Dear <strong>{user.first_name}</strong>,</p>
            <p style="margin:0 0 16px;font-size:14px;color:#333;line-height:1.7;">
              We hope you're well. Our records show that you've completed shifts recently but haven't
              filed an incident report in the past two weeks. We wanted to reach out as a friendly
              reminder — not a concern, but a prompt.
            </p>
            <div style="background:#f3f8ff;border:1px solid #bbdefb;border-radius:8px;padding:18px 20px;margin:20px 0;">
              <div style="font-weight:700;font-size:14px;color:#1565c0;margin-bottom:12px;">
                Why incident reporting matters:
              </div>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#333;line-height:1.6;">
                    <strong style="color:#1565c0;">🛡 Your safety</strong> — documented reports create a clear record if a situation escalates or if you need support.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#333;line-height:1.6;">
                    <strong style="color:#1565c0;">👁 Site awareness</strong> — it demonstrates to clients and management that you are actively engaged and alert to your environment.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#333;line-height:1.6;">
                    <strong style="color:#1565c0;">📊 Risk assessment</strong> — even minor observations contribute to identifying patterns that help keep everyone safer.
                  </td>
                </tr>
              </table>
            </div>
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:13px;color:#5d4037;line-height:1.6;">
              <strong>A nil report is just as valid.</strong> If nothing notable has occurred, filing a nil report is equally encouraged. The habit of reporting, regardless of severity, is what we're building across the team.
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="{portal_url}/staff/incidents"
                 style="display:inline-block;background:#1565c0;color:#ffffff;font-size:15px;font-weight:700;
                        text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
                File an Incident Report →
              </a>
            </div>
            <p style="font-size:13px;color:#555;line-height:1.6;margin:0;">
              Thank you for everything you do on site. If you have any questions about what constitutes a
              reportable incident, please don't hesitate to contact HR.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <div style="font-size:12px;color:#999;">Best regards — {org_name} HR Team</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text = f"""Dear {user.first_name},

We hope you're well. Our records show that you've completed shifts recently but haven't filed an incident report in the past two weeks. We wanted to reach out as a friendly reminder.

Incident reporting isn't just about recording serious events. It's an important part of your day-to-day role on site:

- YOUR SAFETY: documented reports create a clear record if a situation escalates.
- SITE AWARENESS: it demonstrates to clients and management that you are actively engaged.
- RISK ASSESSMENT: even minor observations help identify patterns that keep everyone safer.

A nil report is just as valid — if nothing notable has occurred, filing a nil report is equally encouraged.

File a report: {portal_url}/staff/incidents

Thank you for everything you do on site.

Best regards,
{org_name} HR Team"""

    send_email(
        to        = user.email,
        subject   = f"A Friendly Reminder — Incident Reporting | {org_name}",
        body      = text,
        html      = html,
        from_name = f"{org_name} HR",
        reply_to  = reply_to,
    )
