"""
Shift scheduling router — planned rota management.

HR creates scheduled shifts (who, where, when).  The week-view endpoint
returns each shift enriched with a computed status based on clock events:

  scheduled   — date is in the future
  upcoming    — today, start time not yet reached
  clocked_in  — clock_in found within ±60 min of start, no clock_out yet
  completed   — clock_in + clock_out found
  no_show     — start + 45 min has passed, no matching clock_in
"""
import pytz
from datetime import datetime, date, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr, org_guard
import models

router = APIRouter()
UK_TZ  = pytz.timezone('Europe/London')


# ── Helpers ───────────────────────────────────────────────────────────────────

def _week_start(iso_date: str | None) -> date:
    """Return the Monday of the week containing iso_date, defaulting to current week."""
    if iso_date:
        try:
            d = date.fromisoformat(iso_date)
            return d - timedelta(days=d.weekday())
        except ValueError:
            pass
    today = date.today()
    return today - timedelta(days=today.weekday())


def _compute_status(shift: models.ScheduledShift, events_by_user: dict, now_uk: datetime) -> str:
    today   = now_uk.date()
    sh, sm  = map(int, shift.start_time.split(':'))

    if shift.date > today:
        return 'scheduled'

    # Build a UK-local start datetime for comparison
    start_uk = UK_TZ.localize(datetime(shift.date.year, shift.date.month, shift.date.day, sh, sm))

    if shift.date == today and now_uk < start_uk:
        return 'upcoming'

    # Look for a clock_in within ±60 min of scheduled start
    user_events = events_by_user.get(shift.user_id, [])
    clock_in = next(
        (e for e in user_events
         if e.event_type == models.ClockEventType.clock_in
         and abs((e.timestamp - start_uk).total_seconds()) <= 3600),
        None
    )
    if not clock_in:
        return 'no_show'

    clock_out = next(
        (e for e in user_events
         if e.event_type == models.ClockEventType.clock_out
         and e.timestamp > clock_in.timestamp),
        None
    )
    return 'completed' if clock_out else 'clocked_in'


def _serialise(shift: models.ScheduledShift, status: str) -> dict:
    return {
        "id":         shift.id,
        "user_id":    shift.user_id,
        "user_name":  shift.user.full_name  if shift.user else "Unknown",
        "staff_type": shift.user.staff_type if shift.user else None,
        "site_id":    shift.site_id,
        "site_name":  shift.site.name if shift.site else None,
        "site_code":  shift.site.code if shift.site else None,
        "date":       shift.date.isoformat(),
        "start_time": shift.start_time,
        "end_time":   shift.end_time,
        "notes":      shift.notes,
        "status":     status,
        "no_show_alerted": shift.no_show_alerted,
    }


# ── HR: week view ─────────────────────────────────────────────────────────────

@router.get("/week")
def week_view(
    week: Optional[str] = None,
    db:   Session       = Depends(get_db),
    hr:   models.User   = Depends(require_hr),
):
    mon = _week_start(week)
    sun = mon + timedelta(days=6)

    shifts = db.query(models.ScheduledShift).filter(
        models.ScheduledShift.organisation_id == hr.organisation_id,
        models.ScheduledShift.date            >= mon,
        models.ScheduledShift.date            <= sun,
    ).order_by(models.ScheduledShift.date, models.ScheduledShift.start_time).all()

    # Fetch clock events for the week (for status computation) — one query
    user_ids = list({s.user_id for s in shifts})
    raw_events = []
    if user_ids:
        week_start_utc = UK_TZ.localize(datetime(mon.year, mon.month, mon.day, 0, 0)).astimezone(timezone.utc)
        week_end_utc   = UK_TZ.localize(datetime(sun.year, sun.month, sun.day, 23, 59)).astimezone(timezone.utc)
        raw_events = db.query(models.ClockEvent).filter(
            models.ClockEvent.user_id.in_(user_ids),
            models.ClockEvent.timestamp.between(week_start_utc, week_end_utc),
        ).all()

    events_by_user: dict[int, list] = {}
    for e in raw_events:
        e_uk = e.timestamp.astimezone(UK_TZ)
        e.timestamp = e_uk   # replace with tz-aware UK time for comparison
        events_by_user.setdefault(e.user_id, []).append(e)

    now_uk = datetime.now(UK_TZ)

    # All active staff for "add shift" dropdowns
    all_staff = db.query(models.User).filter(
        models.User.organisation_id == hr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
        models.User.is_archived     == False,
    ).order_by(models.User.first_name, models.User.last_name).all()

    all_sites = db.query(models.Site).filter(
        models.Site.organisation_id == hr.organisation_id,
        models.Site.is_active       == True,
    ).order_by(models.Site.name).all()

    return {
        "week_start": mon.isoformat(),
        "week_end":   sun.isoformat(),
        "shifts":     [_serialise(s, _compute_status(s, events_by_user, now_uk)) for s in shifts],
        "staff":      [{"id": u.id, "full_name": u.full_name, "staff_type": u.staff_type, "email": u.email} for u in all_staff],
        "sites":      [{"id": s.id, "name": s.name, "code": s.code} for s in all_sites],
    }


# ── Staff: own upcoming shifts ────────────────────────────────────────────────

@router.get("/my")
def my_shifts(
    db:   Session     = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    today   = date.today()
    horizon = today + timedelta(days=28)

    shifts = db.query(models.ScheduledShift).filter(
        models.ScheduledShift.user_id == user.id,
        models.ScheduledShift.date    >= today,
        models.ScheduledShift.date    <= horizon,
    ).order_by(models.ScheduledShift.date, models.ScheduledShift.start_time).all()

    now_uk = datetime.now(UK_TZ)
    # Minimal status for staff view — just scheduled / upcoming / today
    def simple_status(s):
        if s.date > today:
            return 'scheduled'
        sh, sm = map(int, s.start_time.split(':'))
        start  = UK_TZ.localize(datetime(s.date.year, s.date.month, s.date.day, sh, sm))
        return 'upcoming' if now_uk < start else 'today'

    return [
        {
            "id":         s.id,
            "date":       s.date.isoformat(),
            "start_time": s.start_time,
            "end_time":   s.end_time,
            "site_name":  s.site.name if s.site else None,
            "site_code":  s.site.code if s.site else None,
            "notes":      s.notes,
            "status":     simple_status(s),
        }
        for s in shifts
    ]


# ── HR: create shift ──────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    user_id:    int
    site_id:    Optional[int] = None
    date:       str           # YYYY-MM-DD
    start_time: str           # HH:MM
    end_time:   Optional[str] = None
    notes:      Optional[str] = None


@router.post("/", status_code=201)
def create_shift(
    body: ShiftCreate,
    db:   Session     = Depends(get_db),
    hr:   models.User = Depends(require_hr),
):
    user = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not user or user.organisation_id != hr.organisation_id:
        raise HTTPException(404, "Staff member not found")

    shift = models.ScheduledShift(
        organisation_id = hr.organisation_id,
        user_id         = body.user_id,
        site_id         = body.site_id,
        date            = date.fromisoformat(body.date),
        start_time      = body.start_time,
        end_time        = body.end_time,
        notes           = body.notes,
        created_by_id   = hr.id,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return {"id": shift.id, "message": "Shift created"}


# ── HR: update shift ──────────────────────────────────────────────────────────

class ShiftUpdate(BaseModel):
    site_id:    Optional[int] = None
    date:       Optional[str] = None
    start_time: Optional[str] = None
    end_time:   Optional[str] = None
    notes:      Optional[str] = None


@router.patch("/{shift_id}")
def update_shift(
    shift_id: int,
    body:     ShiftUpdate,
    db:       Session     = Depends(get_db),
    hr:       models.User = Depends(require_hr),
):
    shift = db.query(models.ScheduledShift).filter(
        models.ScheduledShift.id              == shift_id,
        models.ScheduledShift.organisation_id == hr.organisation_id,
    ).first()
    if not shift:
        raise HTTPException(404, "Shift not found")

    if body.site_id    is not None: shift.site_id    = body.site_id
    if body.date       is not None: shift.date       = date.fromisoformat(body.date)
    if body.start_time is not None: shift.start_time = body.start_time
    if body.end_time   is not None: shift.end_time   = body.end_time
    if body.notes      is not None: shift.notes      = body.notes

    db.commit()
    return {"message": "Shift updated"}


# ── HR: delete shift ──────────────────────────────────────────────────────────

@router.delete("/{shift_id}", status_code=204)
def delete_shift(
    shift_id: int,
    db:       Session     = Depends(get_db),
    hr:       models.User = Depends(require_hr),
):
    shift = db.query(models.ScheduledShift).filter(
        models.ScheduledShift.id              == shift_id,
        models.ScheduledShift.organisation_id == hr.organisation_id,
    ).first()
    if not shift:
        raise HTTPException(404, "Shift not found")
    db.delete(shift)
    db.commit()


# ── HR: copy week ─────────────────────────────────────────────────────────────

class CopyWeekBody(BaseModel):
    from_week: str   # YYYY-MM-DD (any day in source week)
    to_week:   str   # YYYY-MM-DD (any day in target week)


@router.post("/copy-week")
def copy_week(
    body: CopyWeekBody,
    db:   Session     = Depends(get_db),
    hr:   models.User = Depends(require_hr),
):
    src_mon  = _week_start(body.from_week)
    dst_mon  = _week_start(body.to_week)
    delta    = dst_mon - src_mon

    src_shifts = db.query(models.ScheduledShift).filter(
        models.ScheduledShift.organisation_id == hr.organisation_id,
        models.ScheduledShift.date.between(src_mon, src_mon + timedelta(days=6)),
    ).all()

    created = 0
    for s in src_shifts:
        new_date = s.date + delta
        # Skip if a shift already exists for this user on the target date
        exists = db.query(models.ScheduledShift).filter(
            models.ScheduledShift.organisation_id == hr.organisation_id,
            models.ScheduledShift.user_id         == s.user_id,
            models.ScheduledShift.date            == new_date,
            models.ScheduledShift.start_time      == s.start_time,
        ).first()
        if not exists:
            db.add(models.ScheduledShift(
                organisation_id = hr.organisation_id,
                user_id         = s.user_id,
                site_id         = s.site_id,
                date            = new_date,
                start_time      = s.start_time,
                end_time        = s.end_time,
                notes           = s.notes,
                created_by_id   = hr.id,
            ))
            created += 1

    db.commit()
    return {"message": f"Copied {created} shift(s) to week of {dst_mon.isoformat()}"}
