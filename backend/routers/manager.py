"""
Manager portal router — site-scoped views for site managers.

Scope: managers see only staff/events at their assigned_site_id.
HR and superadmin can also call these endpoints (unrestricted).
"""
import pytz
from datetime import datetime, timezone, date as _date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import require_manager
import models

router = APIRouter()
UK_TZ = pytz.timezone('Europe/London')


def _site_ids(mgr: models.User) -> list | None:
    """Returns [site_id] for managers, None for HR/superadmin (no restriction)."""
    if mgr.role == models.UserRole.manager:
        return [mgr.assigned_site_id] if mgr.assigned_site_id else []
    return None


# ── Dashboard: today's attendance ─────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(
    db:  Session     = Depends(get_db),
    mgr: models.User = Depends(require_manager),
):
    site_ids = _site_ids(mgr)
    now_uk   = datetime.now(UK_TZ)
    today    = now_uk.date()
    day_start = UK_TZ.localize(
        datetime(today.year, today.month, today.day, 0, 0)
    ).astimezone(timezone.utc)

    # Resolve site name
    site_name = None
    if mgr.assigned_site_id:
        s = db.query(models.Site).filter(models.Site.id == mgr.assigned_site_id).first()
        site_name = s.name if s else None

    # Empty if manager has no assigned site
    if site_ids is not None and not site_ids:
        return {"site_name": site_name, "today": str(today), "currently_working": 0,
                "completed_today": 0, "total_today": 0, "attendance": []}

    q = db.query(models.ClockEvent).filter(
        models.ClockEvent.organisation_id == mgr.organisation_id,
        models.ClockEvent.event_type      == models.ClockEventType.clock_in,
        models.ClockEvent.timestamp       >= day_start,
    )
    if site_ids is not None:
        q = q.filter(models.ClockEvent.site_id.in_(site_ids))
    clock_ins = q.all()

    attendance = []
    for ci in clock_ins:
        ci_uk = ci.timestamp.astimezone(UK_TZ)
        co = (
            db.query(models.ClockEvent)
            .filter(
                models.ClockEvent.user_id    == ci.user_id,
                models.ClockEvent.event_type == models.ClockEventType.clock_out,
                models.ClockEvent.timestamp  >  ci.timestamp,
            )
            .order_by(models.ClockEvent.timestamp.asc())
            .first()
        )
        co_uk = co.timestamp.astimezone(UK_TZ) if co else None
        attendance.append({
            "user_id":   ci.user_id,
            "user_name": ci.user.full_name if ci.user else f"User #{ci.user_id}",
            "site_name": ci.site.name if ci.site else None,
            "clock_in":  ci_uk.strftime("%H:%M"),
            "clock_out": co_uk.strftime("%H:%M") if co_uk else None,
            "status":    "completed" if co else "working",
            "minutes":   co.shift_minutes if co else None,
        })

    attendance.sort(key=lambda a: a["clock_in"])
    working   = sum(1 for a in attendance if a["status"] == "working")
    completed = sum(1 for a in attendance if a["status"] == "completed")

    return {
        "site_name":         site_name,
        "today":             str(today),
        "currently_working": working,
        "completed_today":   completed,
        "total_today":       len(attendance),
        "attendance":        attendance,
    }


# ── Clock log: events for a date range ───────────────────────────────────────

@router.get("/clock")
def clock_log(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    db:        Session        = Depends(get_db),
    mgr:       models.User    = Depends(require_manager),
):
    site_ids = _site_ids(mgr)
    if site_ids is not None and not site_ids:
        return []

    today = _date.today()
    fd = _date.fromisoformat(from_date) if from_date else today
    td = _date.fromisoformat(to_date)   if to_date   else today

    fd_utc = UK_TZ.localize(datetime(fd.year, fd.month, fd.day,  0,  0)).astimezone(timezone.utc)
    td_utc = UK_TZ.localize(datetime(td.year, td.month, td.day, 23, 59)).astimezone(timezone.utc)

    q = db.query(models.ClockEvent).filter(
        models.ClockEvent.organisation_id == mgr.organisation_id,
        models.ClockEvent.timestamp.between(fd_utc, td_utc),
    )
    if site_ids is not None:
        q = q.filter(models.ClockEvent.site_id.in_(site_ids))

    events = q.order_by(models.ClockEvent.timestamp.desc()).limit(500).all()
    return [
        {
            "id":            e.id,
            "user_id":       e.user_id,
            "user_name":     e.user.full_name if e.user else f"User #{e.user_id}",
            "event_type":    e.event_type.value,
            "timestamp_uk":  e.timestamp.astimezone(UK_TZ).strftime("%Y-%m-%d %H:%M"),
            "site_name":     e.site.name if e.site else None,
            "is_late":       e.is_late,
            "minutes_late":  e.minutes_late,
            "shift_minutes": e.shift_minutes,
        }
        for e in events
    ]


# ── Staff list for this site ──────────────────────────────────────────────────

@router.get("/staff")
def staff_list(
    db:  Session     = Depends(get_db),
    mgr: models.User = Depends(require_manager),
):
    site_ids = _site_ids(mgr)
    if site_ids is not None and not site_ids:
        return []

    q = db.query(models.User).filter(
        models.User.organisation_id == mgr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
        models.User.is_archived.isnot(True),
    )
    if site_ids is not None:
        q = q.filter(models.User.assigned_site_id.in_(site_ids))

    today = _date.today()
    users = q.order_by(models.User.last_name).all()
    return [
        {
            "id":            u.id,
            "full_name":     u.full_name,
            "phone":         u.phone,
            "email":         u.email,
            "sia_licence":   u.sia_licence,
            "sia_expiry":    str(u.sia_expiry) if u.sia_expiry else None,
            "sia_days_left": (u.sia_expiry - today).days if u.sia_expiry else None,
            "is_blocked":    u.is_blocked,
        }
        for u in users
    ]


# ── Pending holidays for site staff ──────────────────────────────────────────

@router.get("/holidays")
def holidays(
    db:  Session     = Depends(get_db),
    mgr: models.User = Depends(require_manager),
):
    site_ids = _site_ids(mgr)

    staff_q = db.query(models.User.id).filter(
        models.User.organisation_id == mgr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
    )
    if site_ids is not None:
        if not site_ids:
            return []
        staff_q = staff_q.filter(models.User.assigned_site_id.in_(site_ids))

    staff_ids = [row.id for row in staff_q.all()]
    if not staff_ids:
        return []

    reqs = (
        db.query(models.Holiday)
        .filter(
            models.Holiday.user_id.in_(staff_ids),
            models.Holiday.status == models.HolidayStatus.pending,
        )
        .order_by(models.Holiday.from_date)
        .all()
    )
    user_map = {u.id: u.full_name for u in
                db.query(models.User).filter(models.User.id.in_(staff_ids)).all()}
    return [
        {
            "id":        h.id,
            "user_id":   h.user_id,
            "user_name": user_map.get(h.user_id, f"User #{h.user_id}"),
            "from_date": str(h.from_date),
            "to_date":   str(h.to_date),
            "days":      (h.to_date - h.from_date).days + 1,
            "notes":     h.notes,
        }
        for h in reqs
    ]


# ── Approve / reject holiday ──────────────────────────────────────────────────

def _get_holiday_and_guard(holiday_id: int, mgr: models.User, db: Session) -> models.Holiday:
    h = db.query(models.Holiday).filter(models.Holiday.id == holiday_id).first()
    if not h:
        raise HTTPException(404, "Holiday not found")
    u = db.query(models.User).filter(models.User.id == h.user_id).first()
    if not u or u.organisation_id != mgr.organisation_id:
        raise HTTPException(403, "Access denied")
    site_ids = _site_ids(mgr)
    if site_ids is not None and u.assigned_site_id not in site_ids:
        raise HTTPException(403, "Staff not assigned to your site")
    return h


@router.patch("/holidays/{holiday_id}/approve")
def approve_holiday(
    holiday_id: int,
    db:         Session     = Depends(get_db),
    mgr:        models.User = Depends(require_manager),
):
    h = _get_holiday_and_guard(holiday_id, mgr, db)
    h.status = models.HolidayStatus.approved
    db.commit()
    return {"message": "Holiday approved"}


@router.patch("/holidays/{holiday_id}/reject")
def reject_holiday(
    holiday_id: int,
    db:         Session     = Depends(get_db),
    mgr:        models.User = Depends(require_manager),
):
    h = _get_holiday_and_guard(holiday_id, mgr, db)
    h.status = models.HolidayStatus.rejected
    db.commit()
    return {"message": "Holiday rejected"}
