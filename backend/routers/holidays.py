from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone

from ..database import get_db
from ..schemas import HolidayCreate, HolidayOut, HolidaySummary
from ..auth_utils import get_current_user, require_hr, org_guard
from .. import models

router = APIRouter()
ALLOWANCE = 20


@router.post("/", response_model=HolidayOut, status_code=201)
def request(
    req:  HolidayCreate,
    db:   Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if req.to_date < req.from_date:
        raise HTTPException(400, "End date must be after start date")
    ahead = (req.from_date - date.today()).days
    if ahead < 28:
        raise HTTPException(
            400,
            f"Requests must be submitted at least 4 weeks in advance. "
            f"Your selected date is {ahead} day(s) away."
        )
    days = (req.to_date - req.from_date).days + 1
    h = models.Holiday(
        organisation_id = user.organisation_id,
        user_id         = user.id,
        from_date       = req.from_date,
        to_date         = req.to_date,
        days            = days,
        note            = req.note,
        status          = models.HolidayStatus.pending,
    )
    db.add(h); db.commit(); db.refresh(h)
    return h


@router.get("/my", response_model=HolidaySummary)
def my_holidays(
    db:   Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    reqs = db.query(models.Holiday).filter(models.Holiday.user_id == user.id)\
             .order_by(models.Holiday.from_date.desc()).all()
    approved = sum(h.days for h in reqs if h.status == models.HolidayStatus.approved)
    pending  = sum(h.days for h in reqs if h.status == models.HolidayStatus.pending)
    return HolidaySummary(
        approved_days  = approved,
        pending_days   = pending,
        remaining_days = ALLOWANCE - approved - pending,
        requests       = reqs,
    )


@router.patch("/{hol_id}/approve")
def approve(hol_id: int, db: Session = Depends(get_db), hr: models.User = Depends(require_hr)):
    h = db.query(models.Holiday).filter(models.Holiday.id == hol_id).first()
    if not h: raise HTTPException(404, "Not found")
    org_guard(hr, h.organisation_id)
    h.status = models.HolidayStatus.approved
    h.reviewed_at = datetime.now(timezone.utc)
    h.reviewed_by_id = hr.id
    db.commit()
    return {"message": "Approved"}


@router.patch("/{hol_id}/reject")
def reject(hol_id: int, db: Session = Depends(get_db), hr: models.User = Depends(require_hr)):
    h = db.query(models.Holiday).filter(models.Holiday.id == hol_id).first()
    if not h: raise HTTPException(404, "Not found")
    org_guard(hr, h.organisation_id)
    h.status = models.HolidayStatus.rejected
    h.reviewed_at = datetime.now(timezone.utc)
    h.reviewed_by_id = hr.id
    db.commit()
    return {"message": "Rejected"}


@router.get("/all")
def all_holidays(
    status_filter: str = None,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    q = db.query(models.Holiday).filter(models.Holiday.organisation_id == hr.organisation_id)
    if status_filter:
        q = q.filter(models.Holiday.status == status_filter)
    return q.order_by(models.Holiday.submitted_at.desc()).all()
