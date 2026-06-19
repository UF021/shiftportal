"""
Training progress — staff complete modules/quizzes, HR monitors completion.
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
import models

log = logging.getLogger(__name__)

router = APIRouter()

PASS_MARK     = 8
EXPIRY_DAYS   = 90
VALID_MODULES = {'module1', 'module2', 'module3'}


class ProgressSubmit(BaseModel):
    score: int


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

    # Create enrollment on the fly for staff who logged in before this feature existed
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
    db: Session     = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    """Email all active staff who have not yet passed all three training modules."""
    staff = (
        db.query(models.User)
        .filter(
            models.User.organisation_id == hr.organisation_id,
            models.User.role            == models.UserRole.staff,
            models.User.is_active       == True,
            models.User.is_blocked      == False,
        )
        .all()
    )

    now = datetime.now(timezone.utc)
    incomplete = []
    for s in staff:
        rows = db.query(models.TrainingProgress).filter(
            models.TrainingProgress.user_id == s.id
        ).all()
        progress = {r.module: r for r in rows}
        all_passed = all(
            progress.get(m) and progress[m].passed and
            (progress[m].expires_at is None or progress[m].expires_at.replace(tzinfo=timezone.utc) > now)
            for m in VALID_MODULES
        )
        if not all_passed:
            incomplete.append(s)

    if not incomplete:
        return {"sent": 0, "message": "All staff have completed training — no reminders needed."}

    api_key   = os.getenv("RESEND_API_KEY")
    from_addr = os.getenv("EMAIL_FROM", "hr@ikanfm.co.uk")
    portal_url = os.getenv("FRONTEND_URL", "https://portal.ikanfm.co.uk")

    org = db.query(models.Organisation).filter(models.Organisation.id == hr.organisation_id).first()
    org_name = (org.brand_name or org.name) if org else "Ikan Facilities Management"

    sent = 0
    failed = 0
    for s in incomplete:
        body = f"""Dear {s.first_name},

This is an important reminder from {org_name} HR.

Our records show that you have not yet completed the mandatory Security Officer Training Programme on the staff portal. Completion of this training is a condition of your continued employment and is required to maintain access to the portal.

The training consists of three short modules:
  1. Company Policies
  2. SIA Door Supervisor
  3. Martyn's Law

Please log in to the staff portal and complete all modules as soon as possible:
  {portal_url}

Once logged in, navigate to the Training section and work through each module. A pass mark of 8 out of 10 is required for each.

If you are experiencing any difficulty accessing the portal or completing the training, please contact HR immediately.

This is a mandatory requirement — failure to complete the training may affect your ability to work shifts.

HR Team
{org_name}
Web: www.ikanfm.co.uk"""

        if not api_key:
            log.info("[EMAIL] RESEND_API_KEY not configured — skipping reminder to %s", s.email)
            sent += 1
            continue

        try:
            resend.api_key = api_key
            resend.Emails.send({
                "from":    f"{org_name} HR <{from_addr}>",
                "to":      [s.email],
                "subject": f"Action Required — Complete Your Training on {org_name} Staff Portal",
                "text":    body,
            })
            sent += 1
        except Exception as exc:
            log.error("[EMAIL] Failed to send training reminder to %s: %s", s.email, exc)
            failed += 1

    return {
        "sent":    sent,
        "failed":  failed,
        "total":   len(incomplete),
        "message": f"Reminder sent to {sent} staff member{'s' if sent != 1 else ''} with incomplete training.",
    }


# ── helper ────────────────────────────────────────────────────────────────────

def _fmt(r: models.TrainingProgress) -> dict:
    return {
        "score":        r.score,
        "passed":       r.passed,
        "attempts":     r.attempts,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "expires_at":   r.expires_at.isoformat()   if r.expires_at   else None,
    }
