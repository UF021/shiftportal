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
