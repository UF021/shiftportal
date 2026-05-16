"""
Training progress — staff complete modules/quizzes, HR monitors completion.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
import models

router = APIRouter()

PASS_MARK      = 8
EXPIRY_DAYS    = 90
DEADLINE_DAYS  = 14
VALID_MODULES  = {'module1', 'module2', 'module3'}

# Training went live on this date. Existing staff get 14 days from here;
# new staff get 14 days from their activation date — whichever is later.
TRAINING_LAUNCH = datetime(2026, 5, 16, tzinfo=timezone.utc)


def _deadline_for(user: models.User) -> datetime:
    base = user.activated_at or TRAINING_LAUNCH
    # For staff activated before the launch, start the clock from launch date
    effective = max(base, TRAINING_LAUNCH)
    return effective + timedelta(days=DEADLINE_DAYS)


class ProgressSubmit(BaseModel):
    score: int


# ── Staff: get my progress ────────────────────────────────────────────────────

@router.get("/my")
def get_my_progress(
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    rows = db.query(models.TrainingProgress).filter(
        models.TrainingProgress.user_id == me.id
    ).all()
    deadline = _deadline_for(me)
    return {
        "deadline": deadline.isoformat(),
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
        deadline = _deadline_for(s)

        result.append({
            "user_id":      s.id,
            "staff_id":     s.staff_id,
            "full_name":    s.full_name,
            "email":        s.email,
            "activated_at": s.activated_at.isoformat() if s.activated_at else None,
            "deadline":     deadline.isoformat(),
            "module1":      progress.get("module1"),
            "module2":      progress.get("module2"),
            "module3":      progress.get("module3"),
        })

    return result


# ── helper ────────────────────────────────────────────────────────────────────

def _fmt(r: models.TrainingProgress) -> dict:
    return {
        "score":        r.score,
        "passed":       r.passed,
        "attempts":     r.attempts,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "expires_at":   r.expires_at.isoformat()   if r.expires_at   else None,
    }
