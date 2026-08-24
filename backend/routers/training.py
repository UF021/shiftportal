"""
Training progress — staff complete modules/quizzes, HR monitors completion.
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
from email_utils import send_email, org_sender, org_reply_to
import models

log = logging.getLogger(__name__)

router = APIRouter()

PASS_MARK     = 8
EXPIRY_DAYS   = 90
VALID_MODULES = {'module1', 'module2', 'module3'}
MODULE_LABELS = {
    'module1': 'Company Policies',
    'module2': 'SIA Door Supervisor',
    'module3': "Martyn's Law",
}


class ProgressSubmit(BaseModel):
    score: int


class ReminderRequest(BaseModel):
    staff_type: Optional[str]       = None   # 'payroll' | 'subcontract' | None = both
    user_ids:   Optional[List[int]] = None   # override: send to these specific users only


def _get_deadline(user_id: int, db) -> datetime | None:
    enrol = db.query(models.TrainingEnrollment).filter(
        models.TrainingEnrollment.user_id == user_id
    ).first()
    return enrol.deadline if enrol else None


# ── Staff: get my progress ────────────────────────────────────────────────────

@router.get("/my")
def get_my_progress(
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    rows     = db.query(models.TrainingProgress).filter(
        models.TrainingProgress.user_id == me.id
    ).all()
    deadline = _get_deadline(me.id, db)

    if deadline is None:
        now = datetime.now(timezone.utc)
        db.add(models.TrainingEnrollment(
            user_id     = me.id,
            enrolled_at = now,
            deadline    = now + timedelta(days=28),
        ))
        db.commit()
        deadline = now + timedelta(days=28)

    return {
        "deadline": deadline.isoformat() if deadline else None,
        "modules":  {r.module: _fmt(r) for r in rows},
    }


# ── Staff: submit module result ───────────────────────────────────────────────

@router.post("/module/{module}")
def submit_module(
    module:  str,
    body:    ProgressSubmit,
    db:      Session = Depends(get_db),
    me:      models.User = Depends(get_current_user),
):
    if module not in VALID_MODULES:
        raise HTTPException(400, "Invalid module name")
    if not (0 <= body.score <= 10):
        raise HTTPException(400, "Score must be 0–10")

    passed = body.score >= PASS_MARK
    now    = datetime.now(timezone.utc)

    existing = db.query(models.TrainingProgress).filter(
        models.TrainingProgress.user_id == me.id,
        models.TrainingProgress.module  == module,
    ).first()

    if existing:
        existing.score    = body.score
        existing.attempts = (existing.attempts or 0) + 1
        if passed:
            existing.passed      = True
            existing.completed_at = now
            existing.expires_at  = now + timedelta(days=EXPIRY_DAYS)
    else:
        prog = models.TrainingProgress(
            organisation_id = me.organisation_id,
            user_id         = me.id,
            module          = module,
            score           = body.score,
            passed          = passed,
            attempts        = 1,
            completed_at    = now if passed else None,
            expires_at      = (now + timedelta(days=EXPIRY_DAYS)) if passed else None,
        )
        db.add(prog)

    db.commit()
    return {"passed": passed, "score": body.score}


# ── HR: all staff training progress ──────────────────────────────────────────

@router.get("/admin")
def admin_progress(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    staff = (
        db.query(models.User)
        .filter(
            models.User.organisation_id == hr.organisation_id,
            models.User.role            == models.UserRole.staff,
            models.User.is_active       == True,
            models.User.is_blocked.isnot(True),
            models.User.is_archived.isnot(True),
        )
        .order_by(models.User.last_name)
        .all()
    )

    result = []
    for s in staff:
        rows = db.query(models.TrainingProgress).filter(
            models.TrainingProgress.user_id == s.id
        ).all()
        progress = {r.module: _fmt(r) for r in rows}
        deadline = _get_deadline(s.id, db)

        result.append({
            "user_id":      s.id,
            "staff_id":     s.staff_id,
            "full_name":    s.full_name,
            "email":        s.email,
            "staff_type":   s.staff_type or "payroll",
            "activated_at": s.activated_at.isoformat() if s.activated_at else None,
            "deadline":     deadline.isoformat() if deadline else None,
            "module1":      progress.get("module1"),
            "module2":      progress.get("module2"),
            "module3":      progress.get("module3"),
        })

    return result


# ── HR: send training reminder emails ────────────────────────────────────────

@router.post("/remind")
def send_training_reminders(
    body: ReminderRequest = ReminderRequest(),
    db:   Session         = Depends(get_db),
    hr:   models.User     = Depends(require_hr),
):
    """
    Send 7-day-deadline training reminders with suspension warning.

    Targeting priority:
      1. user_ids set → send only to those specific users (must be in same org)
      2. staff_type set → send to all 'payroll' or 'subcontract' with incomplete training
      3. neither set → send to all staff with incomplete training
    """
    org = db.query(models.Organisation).filter(
        models.Organisation.id == hr.organisation_id
    ).first()
    org_name   = (org.brand_name or org.name) if org else "HR Team"
    portal_url = os.getenv("FRONTEND_URL", "https://portal.ikanfm.co.uk")
    now        = datetime.now(timezone.utc)

    # Build candidate pool
    q = db.query(models.User).filter(
        models.User.organisation_id == hr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
        models.User.is_blocked.isnot(True),
        models.User.is_archived.isnot(True),
    )

    if body.user_ids:
        q = q.filter(models.User.id.in_(body.user_ids))
    elif body.staff_type in ('payroll', 'subcontract'):
        if body.staff_type == 'payroll':
            # NULL staff_type defaults to payroll
            q = q.filter(
                (models.User.staff_type == 'payroll') |
                (models.User.staff_type == None)
            )
        else:
            q = q.filter(models.User.staff_type == 'subcontract')

    candidates = q.all()

    # Filter to those with incomplete training
    incomplete = []
    for s in candidates:
        rows    = db.query(models.TrainingProgress).filter(
            models.TrainingProgress.user_id == s.id
        ).all()
        progress = {r.module: r for r in rows}
        missing  = [
            m for m in VALID_MODULES
            if not (
                progress.get(m) and
                progress[m].passed and
                (progress[m].expires_at is None or
                 progress[m].expires_at.replace(tzinfo=timezone.utc) > now)
            )
        ]
        if missing:
            incomplete.append((s, missing))

    if not incomplete:
        return {
            "sent":    0,
            "failed":  0,
            "total":   0,
            "message": "All selected staff have completed their training — no reminders sent.",
        }

    deadline_str = (now + timedelta(days=7)).strftime("%-d %B %Y")
    sent = failed = 0

    for s, missing_modules in incomplete:
        _send_training_reminder_email(
            user       = s,
            missing    = missing_modules,
            org_name   = org_name,
            portal_url = portal_url,
            deadline   = deadline_str,
            reply_to   = org_reply_to(org) if org else None,
        )
        sent += 1

    # Determine target_type label for the log
    if body.user_ids:
        target_type = 'individual'
    elif body.staff_type in ('payroll', 'subcontract'):
        target_type = body.staff_type
    else:
        target_type = 'all'

    log_entry = models.TrainingReminderLog(
        organisation_id = hr.organisation_id,
        sent_by_id      = hr.id,
        sent_by_name    = hr.full_name,
        target_type     = target_type,
        recipient_count = sent,
        triggered_by    = 'manual',
    )
    db.add(log_entry)
    db.commit()

    return {
        "sent":    sent,
        "failed":  failed,
        "total":   len(incomplete),
        "message": f"Reminder sent to {sent} staff member{'s' if sent != 1 else ''}.",
    }


# ── HR: reminder send log ─────────────────────────────────────────────────────

@router.get("/reminder-logs")
def get_reminder_logs(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    logs = (
        db.query(models.TrainingReminderLog)
        .filter(models.TrainingReminderLog.organisation_id == hr.organisation_id)
        .order_by(models.TrainingReminderLog.sent_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id":              l.id,
            "sent_at":         l.sent_at.isoformat(),
            "sent_by":         l.sent_by_name or "Automated",
            "target_type":     l.target_type,
            "recipient_count": l.recipient_count,
            "triggered_by":    l.triggered_by,
        }
        for l in logs
    ]


# ── Email builder ─────────────────────────────────────────────────────────────

def _send_training_reminder_email(
    user:       models.User,
    missing:    list,
    org_name:   str,
    portal_url: str,
    deadline:   str,
    reply_to:   str = None,
):
    module_items_html = "\n".join(
        f'<li style="padding:6px 0;color:#c62828;font-weight:600;">&#9744; {MODULE_LABELS.get(m, m)}</li>'
        for m in missing
    )
    module_items_text = "\n".join(
        f"  ☐ {MODULE_LABELS.get(m, m)}"
        for m in missing
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr>
          <td style="background:#0f1923;padding:28px 32px;text-align:center;">
            <div style="color:#6abf3f;font-size:22px;font-weight:900;letter-spacing:-0.5px;">{org_name}</div>
            <div style="color:#7a9a7a;font-size:13px;margin-top:4px;">HR Department</div>
          </td>
        </tr>

        <!-- Urgent banner -->
        <tr>
          <td style="background:#fff3e0;border-bottom:3px solid #ff6d00;padding:20px 32px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">⚠️</div>
            <div style="font-size:18px;font-weight:700;color:#e65100;">URGENT — Training Action Required</div>
            <div style="font-size:14px;color:#bf360c;margin-top:6px;">
              Complete by <strong>{deadline}</strong> or be suspended from site duties
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;">Dear <strong>{user.first_name}</strong>,</p>

            <p style="margin:0 0 16px;font-size:14px;color:#333;line-height:1.6;">
              This is a formal notice from <strong>{org_name}</strong> HR. Our records show that your
              mandatory Security Officer Training Programme is <strong>incomplete</strong>. This training
              is a condition of your continued employment and active site access.
            </p>

            <!-- Outstanding modules -->
            <div style="background:#fafafa;border:1px solid #e0e0e0;border-left:4px solid #c62828;border-radius:6px;padding:16px 20px;margin:20px 0;">
              <div style="font-weight:700;font-size:14px;color:#1a1a1a;margin-bottom:10px;">Your outstanding module(s):</div>
              <ul style="margin:0;padding:0 0 0 18px;list-style:none;">
                {module_items_html}
              </ul>
            </div>

            <!-- Suspension warning -->
            <div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:6px;padding:20px;margin:20px 0;text-align:center;">
              <div style="font-size:16px;font-weight:700;color:#c62828;">⏱ You have 7 days to complete this training</div>
              <div style="font-size:13px;color:#b71c1c;margin-top:10px;line-height:1.6;">
                Failure to complete all modules by <strong>{deadline}</strong> will result in
                your <strong>immediate suspension from site duties</strong>. You will not be
                eligible for shift assignments during any period of suspension.
              </div>
            </div>

            <!-- How to complete -->
            <p style="font-size:14px;font-weight:700;color:#1a1a1a;margin:24px 0 10px;">How to complete your training:</p>
            <ol style="font-size:14px;color:#333;line-height:1.8;padding-left:20px;margin:0 0 20px;">
              <li>Log in to the staff portal: <a href="{portal_url}" style="color:#1565c0;font-weight:600;">{portal_url}</a></li>
              <li>Navigate to the <strong>Training</strong> section in the menu</li>
              <li>Complete all outstanding modules — pass mark: <strong>8 out of 10</strong></li>
            </ol>

            <!-- CTA button -->
            <div style="text-align:center;margin:28px 0;">
              <a href="{portal_url}/staff/training"
                 style="display:inline-block;background:#1565c0;color:#ffffff;font-size:15px;font-weight:700;
                        text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
                Complete Training Now →
              </a>
            </div>

            <p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 16px;">
              If you are experiencing difficulty accessing the portal or completing your training,
              contact HR <strong>immediately</strong> — do not wait until the deadline.
            </p>

            <p style="font-size:12px;color:#888;border-top:1px solid #eeeeee;padding-top:16px;margin:24px 0 0;line-height:1.6;">
              This notice has been recorded in your staff file. This is a mandatory compliance
              requirement under your employment agreement.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f5;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <div style="font-size:12px;color:#999;">{org_name} HR Team</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text = f"""Dear {user.first_name},

This is a formal notice from {org_name} HR.

Our records show that your mandatory Security Officer Training Programme is INCOMPLETE. This training is a condition of your continued employment and active site access.

Your outstanding module(s):
{module_items_text}

YOU HAVE 7 DAYS TO COMPLETE THIS TRAINING.

Failure to complete all modules by {deadline} will result in your IMMEDIATE SUSPENSION from site duties. You will not be eligible for shift assignments during any period of suspension.

How to complete your training:
  1. Log in to the staff portal: {portal_url}
  2. Navigate to the Training section
  3. Complete all outstanding modules (pass mark: 8/10)

If you are experiencing difficulty, contact HR immediately — do not wait until the deadline.

This notice has been recorded in your staff file.

HR Team
{org_name}"""

    send_email(
        to        = user.email,
        subject   = f"URGENT — Complete Your Training by {deadline} | {org_name}",
        body      = text,
        html      = html,
        from_name = f"{org_name} HR",
        reply_to  = reply_to,
    )


# ── helper ────────────────────────────────────────────────────────────────────

def _fmt(r: models.TrainingProgress) -> dict:
    return {
        "score":        r.score,
        "passed":       r.passed,
        "attempts":     r.attempts,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "expires_at":   r.expires_at.isoformat()   if r.expires_at   else None,
    }


# ── Shared function used by scheduler ─────────────────────────────────────────

def send_payroll_training_reminders_all_orgs(db: Session):
    """
    Called by the weekly APScheduler job.
    Sends training reminders to all payroll staff (across all orgs)
    who have incomplete training.
    """
    import os as _os
    now = datetime.now(timezone.utc)

    orgs = db.query(models.Organisation).filter(
        models.Organisation.is_active == True
    ).all()

    total_sent = 0
    for org in orgs:
        portal_url = _os.getenv("FRONTEND_URL", "https://portal.ikanfm.co.uk")
        org_name   = org.brand_name or org.name

        payroll_staff = db.query(models.User).filter(
            models.User.organisation_id == org.id,
            models.User.role            == models.UserRole.staff,
            models.User.is_active       == True,
            models.User.is_blocked.isnot(True),
            models.User.is_archived.isnot(True),
            # payroll or NULL staff_type
            (models.User.staff_type == 'payroll') |
            (models.User.staff_type == None),
        ).all()

        deadline_str = (now + timedelta(days=7)).strftime("%-d %B %Y")
        org_sent = 0

        for s in payroll_staff:
            rows     = db.query(models.TrainingProgress).filter(
                models.TrainingProgress.user_id == s.id
            ).all()
            progress = {r.module: r for r in rows}
            missing  = [
                m for m in VALID_MODULES
                if not (
                    progress.get(m) and
                    progress[m].passed and
                    (progress[m].expires_at is None or
                     progress[m].expires_at.replace(tzinfo=timezone.utc) > now)
                )
            ]
            if not missing:
                continue

            _send_training_reminder_email(
                user       = s,
                missing    = missing,
                org_name   = org_name,
                portal_url = portal_url,
                deadline   = deadline_str,
                reply_to   = org.brand_email or org.contact_email,
            )
            org_sent += 1
            total_sent += 1

        if org_sent > 0:
            log_entry = models.TrainingReminderLog(
                organisation_id = org.id,
                sent_by_id      = None,
                sent_by_name    = 'Automated',
                target_type     = 'auto',
                recipient_count = org_sent,
                triggered_by    = 'auto',
            )
            db.add(log_entry)

    db.commit()
    log.info("[TRAINING] Weekly payroll reminder: sent %d emails", total_sent)
