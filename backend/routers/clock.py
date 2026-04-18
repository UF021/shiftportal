import math
import random
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
import models

router = APIRouter()


# ── Name matching ─────────────────────────────────────────────────────────────

def names_match(entered: str, stored_first: str, stored_last: str) -> bool:
    entered = entered.strip().lower()
    full = f'{stored_first} {stored_last}'.strip().lower()
    first = stored_first.strip().lower()
    last = stored_last.strip().lower()

    # Exact full name match
    if entered == full:
        return True
    # Last name only
    if entered == last:
        return True
    # First name only
    if entered == first:
        return True
    # Last name, First name format
    if entered == f'{last} {first}':
        return True
    # Remove all spaces and compare
    if entered.replace(' ', '') == full.replace(' ', ''):
        return True
    # Check if entered name contains both first and last name words
    entered_words = set(entered.split())
    if stored_first.lower() in entered_words and stored_last.lower() in entered_words:
        return True

    return False


# ── Haversine ─────────────────────────────────────────────────────────────────

def haversine_metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Schemas ───────────────────────────────────────────────────────────────────

class QRClockInRequest(BaseModel):
    staff_id:         str
    full_name:        str
    scheduled_start:  Optional[str]   = None   # 'HH:MM'
    gps_lat:          Optional[float] = None
    gps_lng:          Optional[float] = None
    # Manager override fields
    manager_override: bool            = False
    manager_name:     Optional[str]   = None
    override_reason:  Optional[str]   = None
    manual_time:      Optional[str]   = None   # 'HH:MM' — override clock-in time


class QRClockOutRequest(BaseModel):
    staff_id:         str
    full_name:        str
    gps_lat:          Optional[float] = None
    gps_lng:          Optional[float] = None
    # Manager override fields
    manager_override: bool            = False
    manager_name:     Optional[str]   = None
    override_reason:  Optional[str]   = None


class ManualShiftRequest(BaseModel):
    user_id:         int
    site_id:         int
    date:            date
    clock_in_time:   str
    clock_out_time:  Optional[str] = None
    scheduled_start: Optional[str] = None
    overnight:       bool = False
    entry_notes:     Optional[str] = None


class EditShiftRequest(BaseModel):
    date:            date
    clock_in_time:   Optional[str] = None
    clock_out_time:  Optional[str] = None
    site_id:         int
    scheduled_start: Optional[str] = None
    entry_notes:     Optional[str] = None


class BulkDeleteRequest(BaseModel):
    event_ids: list[int]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_site(db: Session, org_slug: str, site_code: str) -> tuple:
    org = db.query(models.Organisation).filter(models.Organisation.slug == org_slug).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    site = db.query(models.Site).filter(
        models.Site.organisation_id == org.id,
        models.Site.code == site_code,
        models.Site.is_active == True,
    ).first()
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return org, site


def _lookup_staff(db: Session, org_id: int, staff_id: str, full_name: str) -> models.User:
    """Look up a user by staff_id within an org; validate name and active status."""
    from sqlalchemy import func
    user = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        func.lower(models.User.staff_id) == staff_id.strip().lower(),
    ).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Staff ID not recognised")
    if not names_match(full_name, user.first_name, user.last_name):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Name not recognised. Please enter your name exactly as registered — e.g. John Smith. If problems persist contact your supervisor.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is not yet activated")
    return user


def _check_gps(site: models.Site, gps_lat: Optional[float], gps_lng: Optional[float]) -> bool:
    if site.site_lat is None or site.site_lng is None:
        return False
    if gps_lat is None or gps_lng is None:
        return False
    dist = haversine_metres(gps_lat, gps_lng, site.site_lat, site.site_lng)
    if dist > 70:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"You must be within 70 metres of the site ({int(dist)} m away)"
        )
    return True


def _calc_lateness(scheduled_start: Optional[str], now: datetime) -> tuple[bool, int]:
    if not scheduled_start:
        return False, 0
    try:
        h, m = map(int, scheduled_start.split(":"))
    except (ValueError, AttributeError):
        return False, 0
    scheduled = now.replace(hour=h, minute=m, second=0, microsecond=0)
    diff = int((now - scheduled).total_seconds() / 60)
    return (True, diff) if diff > 0 else (False, 0)


def _sia_status(expiry: date | None) -> str:
    if not expiry:
        return "unknown"
    days = (expiry - date.today()).days
    if days < 0:
        return "expired"
    if days < 60:
        return "expiring"
    return "valid"


def _record_failure(
    db: Session, org_id: int, user_id, staff_id_entered: str, site_id,
    reason: str, lat, lng, distance, ip: str | None = None,
):
    f = models.ClockFailure(
        organisation_id  = org_id,
        user_id          = user_id,
        staff_id_entered = (staff_id_entered or "").strip().upper(),
        site_id          = site_id,
        failure_reason   = reason,
        gps_lat          = lat,
        gps_lng          = lng,
        distance_metres  = distance,
        ip_address       = ip,
    )
    db.add(f)
    db.flush()   # write immediately so count queries see it


def _has_open_clock_in(db: Session, user_id: int) -> bool:
    last_in = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_in,
        )
        .order_by(models.ClockEvent.timestamp.desc())
        .first()
    )
    if not last_in:
        return False
    last_out = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_out,
            models.ClockEvent.timestamp  > last_in.timestamp,
        )
        .first()
    )
    return last_out is None


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTANT: All fixed-path routes MUST come before the parametric
# /{org_slug}/{site_code} routes, otherwise FastAPI will match e.g.
# GET /my/history as org_slug="my", site_code="history".
# ─────────────────────────────────────────────────────────────────────────────


# ── My history ────────────────────────────────────────────────────────────────

@router.get("/my/history")
def my_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return completed shifts (grouped clock_in+clock_out) plus any open clock-in."""
    events = (
        db.query(models.ClockEvent)
        .filter(models.ClockEvent.user_id == current_user.id)
        .order_by(models.ClockEvent.timestamp.asc())
        .all()
    )

    clock_ins  = [e for e in events if e.event_type == models.ClockEventType.clock_in]
    clock_outs = [e for e in events if e.event_type == models.ClockEventType.clock_out]

    open_in = None
    open_in_id = None
    if clock_ins:
        last_in = clock_ins[-1]
        if not any(o.timestamp > last_in.timestamp for o in clock_outs):
            s = last_in.site
            open_in = {
                "id":              last_in.id,
                "timestamp":       last_in.timestamp.isoformat(),
                "site_name":       s.name if s else None,
                "scheduled_start": last_in.scheduled_start,
            }
            open_in_id = last_in.id

    used_out_ids: set[int] = set()
    shifts = []
    for ci in reversed(clock_ins):
        if ci.id == open_in_id:
            continue
        co = next(
            (o for o in clock_outs if o.timestamp > ci.timestamp and o.id not in used_out_ids),
            None,
        )
        if co:
            used_out_ids.add(co.id)
        site_name = (ci.site.name if ci.site else None) or (co.site.name if co and co.site else None)
        is_manual = ci.entry_notes is not None
        shifts.append({
            "id":              ci.id,
            "date":            ci.timestamp.date().isoformat(),
            "start_time":      ci.timestamp.strftime("%H:%M"),
            "end_time":        co.timestamp.strftime("%H:%M") if co else None,
            "site_name":       site_name,
            "shift_minutes":   co.shift_minutes if co else None,
            "is_late":         ci.is_late,
            "minutes_late":    ci.minutes_late,
            "scheduled_start": ci.scheduled_start,
            "is_manual":       is_manual,
            "gps_verified":    ci.gps_verified,
        })

    return {"open_in": open_in, "shifts": shifts}


# ── My holiday stats ──────────────────────────────────────────────────────────

@router.get("/my/holiday-stats")
def holiday_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    three_months_ago = datetime.now(timezone.utc) - timedelta(days=91)
    clock_ins = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == current_user.id,
            models.ClockEvent.event_type == models.ClockEventType.clock_in,
            models.ClockEvent.timestamp  >= three_months_ago,
        )
        .all()
    )
    unique_dates = {e.timestamp.date() for e in clock_ins}
    avg_days_per_week = round(len(unique_dates) / 13, 1) if unique_dates else 0.0

    months_employed = 0
    if current_user.employment_start_date:
        today = date.today()
        start = current_user.employment_start_date
        months_employed = (today.year - start.year) * 12 + (today.month - start.month)
        if today.day < start.day:
            months_employed -= 1
        months_employed = max(0, months_employed)

    today = date.today()
    april_start = date(today.year, 4, 1) if today >= date(today.year, 4, 1) else date(today.year - 1, 4, 1)
    approved_hols = (
        db.query(models.Holiday)
        .filter(
            models.Holiday.user_id   == current_user.id,
            models.Holiday.status    == models.HolidayStatus.approved,
            models.Holiday.from_date >= april_start,
        )
        .all()
    )
    holidays_taken = sum(h.days for h in approved_hols)

    annual_entitlement = round(avg_days_per_week * 4, 1)
    accrued = round((annual_entitlement / 12) * 2.3 * months_employed, 1) if annual_entitlement else 0.0
    accrued = min(accrued, annual_entitlement)

    return {
        "avg_days_per_week":          avg_days_per_week,
        "months_employed":            months_employed,
        "holidays_taken_since_april": holidays_taken,
        "annual_entitlement":         annual_entitlement,
        "accrued_to_date":            accrued,
        "remaining":                  round(accrued - holidays_taken, 1),
    }


# ── HR — all events (grouped shifts) ─────────────────────────────────────────

@router.get("/all")
def all_events(
    db:        Session     = Depends(get_db),
    hr:        models.User = Depends(require_hr),
    staff_id:  Optional[int]  = None,
    from_date: Optional[date] = None,
    to_date:   Optional[date] = None,
):
    from collections import defaultdict
    from sqlalchemy.orm import joinedload

    q = (
        db.query(models.ClockEvent)
        .options(
            joinedload(models.ClockEvent.user),
            joinedload(models.ClockEvent.site),
        )
        .filter(
            models.ClockEvent.organisation_id == hr.organisation_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_in,
        )
    )
    if staff_id:
        q = q.filter(models.ClockEvent.user_id == staff_id)
    if from_date:
        q = q.filter(models.ClockEvent.timestamp >= datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc))
    if to_date:
        to_end = datetime(to_date.year, to_date.month, to_date.day, 23, 59, 59, tzinfo=timezone.utc)
        q = q.filter(models.ClockEvent.timestamp <= to_end)

    clock_ins = q.order_by(models.ClockEvent.timestamp.desc()).limit(500).all()
    if not clock_ins:
        return {"entries": [], "total_mins": 0}

    user_ids = list({ci.user_id for ci in clock_ins})
    min_ts   = min(ci.timestamp for ci in clock_ins)

    clock_outs_raw = (
        db.query(models.ClockEvent)
        .options(joinedload(models.ClockEvent.site))
        .filter(
            models.ClockEvent.organisation_id == hr.organisation_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_out,
            models.ClockEvent.user_id.in_(user_ids),
            models.ClockEvent.timestamp       >= min_ts,
        )
        .order_by(models.ClockEvent.timestamp.asc())
        .all()
    )

    outs_by_user: dict[int, list] = defaultdict(list)
    for co in clock_outs_raw:
        outs_by_user[co.user_id].append(co)

    def _parse_override(notes: str | None) -> tuple[bool, str | None]:
        """Return (is_override, manager_name) from entry_notes."""
        if not notes or not notes.startswith('[OVERRIDE]'):
            return False, None
        manager_name = None
        for part in notes.split('|'):
            part = part.strip()
            if part.startswith('Manager:'):
                manager_name = part.replace('Manager:', '').strip()
                break
        return True, manager_name

    entries    = []
    total_mins = 0
    for ci in clock_ins:
        co            = next((o for o in outs_by_user.get(ci.user_id, []) if o.timestamp > ci.timestamp), None)
        site_name     = (ci.site.name if ci.site else None) or (co.site.name if co and co.site else None)
        shift_minutes = co.shift_minutes if co else None
        is_override, manager_name = _parse_override(ci.entry_notes)
        is_manual     = bool(ci.entry_notes) and not is_override

        entries.append({
            "id":              ci.id,
            "user_id":         ci.user_id,
            "user_name":       ci.user.full_name if ci.user else "Unknown",
            "date":            ci.timestamp.date().isoformat(),
            "start_time":      ci.timestamp.strftime("%H:%M"),
            "end_time":        co.timestamp.strftime("%H:%M") if co else None,
            "site_id":         ci.site_id,
            "site_name":       site_name,
            "shift_minutes":   shift_minutes,
            "shift_hours":     round(shift_minutes / 60, 2) if shift_minutes else None,
            "is_late":         ci.is_late,
            "minutes_late":    ci.minutes_late,
            "scheduled_start": ci.scheduled_start,
            "is_manual":       is_manual,
            "is_override":     is_override,
            "manager_name":    manager_name,
            "entry_notes":     ci.entry_notes or None,
            "gps_verified":    ci.gps_verified,
        })
        if shift_minutes:
            total_mins += shift_minutes

    return {"entries": entries, "total_mins": total_mins}


# ── HR — shift average for a user ─────────────────────────────────────────────

@router.get("/shift-avg/{user_id}")
def shift_avg(
    user_id: int,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target or target.organisation_id != hr.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")

    three_months_ago = datetime.now(timezone.utc) - timedelta(days=91)
    clock_outs = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id      == user_id,
            models.ClockEvent.event_type   == models.ClockEventType.clock_out,
            models.ClockEvent.shift_minutes != None,
            models.ClockEvent.timestamp    >= three_months_ago,
        )
        .all()
    )
    if not clock_outs:
        return {"avg_shift_hours": None, "shift_count": 0}

    avg_mins = sum(e.shift_minutes for e in clock_outs) / len(clock_outs)
    return {"avg_shift_hours": round(avg_mins / 60, 2), "shift_count": len(clock_outs)}


# ── HR — punctuality report ───────────────────────────────────────────────────

@router.get("/punctuality/{user_id}")
def punctuality(
    user_id: int,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target or target.organisation_id != hr.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")

    clock_ins = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id         == user_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_in,
            models.ClockEvent.scheduled_start != None,
        )
        .all()
    )
    total         = len(clock_ins)
    late_events   = [e for e in clock_ins if e.is_late]
    late_count    = len(late_events)
    on_time_count = total - late_count
    avg_late_minutes = round(sum(e.minutes_late for e in late_events) / late_count, 1) if late_count else 0

    return {
        "user_id":          user_id,
        "user_name":        target.full_name,
        "total_shifts":     total,
        "on_time_count":    on_time_count,
        "late_count":       late_count,
        "avg_late_minutes": avg_late_minutes,
    }


# ── HR — manual shift entry ───────────────────────────────────────────────────

@router.post("/manual", status_code=201)
def manual_shift(
    body: ManualShiftRequest,
    db:   Session = Depends(get_db),
    hr:   models.User = Depends(require_hr),
):
    staff = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not staff or staff.organisation_id != hr.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")

    site = db.query(models.Site).filter(
        models.Site.id              == body.site_id,
        models.Site.organisation_id == hr.organisation_id,
        models.Site.is_active       == True,
    ).first()
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")

    in_h, in_m = map(int, body.clock_in_time.split(':'))
    clock_in_dt = datetime(body.date.year, body.date.month, body.date.day, in_h, in_m, tzinfo=timezone.utc)
    is_late, minutes_late = _calc_lateness(body.scheduled_start, clock_in_dt)
    notes = body.entry_notes if body.entry_notes is not None else ""

    in_event = models.ClockEvent(
        organisation_id = hr.organisation_id,
        user_id         = body.user_id,
        site_id         = site.id,
        event_type      = models.ClockEventType.clock_in,
        timestamp       = clock_in_dt,
        scheduled_start = body.scheduled_start,
        is_late         = is_late,
        minutes_late    = minutes_late,
        entry_notes     = notes,
    )
    db.add(in_event)

    shift_minutes = None
    out_id = None
    if body.clock_out_time:
        out_h, out_m = map(int, body.clock_out_time.split(':'))
        clock_out_dt = datetime(body.date.year, body.date.month, body.date.day, out_h, out_m, tzinfo=timezone.utc)
        if body.overnight or clock_out_dt <= clock_in_dt:
            clock_out_dt += timedelta(days=1)
        shift_minutes = int((clock_out_dt - clock_in_dt).total_seconds() / 60)
        out_event = models.ClockEvent(
            organisation_id = hr.organisation_id,
            user_id         = body.user_id,
            site_id         = site.id,
            event_type      = models.ClockEventType.clock_out,
            timestamp       = clock_out_dt,
            shift_minutes   = shift_minutes,
            entry_notes     = notes,
        )
        db.add(out_event)
        out_id = out_event.id

    db.commit()

    return {
        "message":       "Clock-in entry created",
        "in_id":         in_event.id,
        "out_id":        out_id,
        "shift_minutes": shift_minutes,
        "is_late":       is_late,
        "minutes_late":  minutes_late,
    }


# ── HR — clock failure log ────────────────────────────────────────────────────

@router.get("/failures")
def list_failures(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    rows = (
        db.query(models.ClockFailure)
        .filter(models.ClockFailure.organisation_id == hr.organisation_id)
        .order_by(models.ClockFailure.attempted_at.desc())
        .limit(500)
        .all()
    )
    return [
        {
            "id":              r.id,
            "user_id":         r.user_id,
            "user_name":       r.user.full_name if r.user else None,
            "staff_id":        r.staff_id_entered,
            "site_id":         r.site_id,
            "site_name":       r.site.name if r.site else None,
            "failure_reason":  r.failure_reason,
            "distance_metres": r.distance_metres,
            "gps_lat":         r.gps_lat,
            "gps_lng":         r.gps_lng,
            "attempted_at":    r.attempted_at.isoformat() if r.attempted_at else None,
            "ip_address":      r.ip_address,
            "user_is_active":  r.user.is_active if r.user else None,
        }
        for r in rows
    ]


@router.post("/failures/{user_id}/reinstate")
def reinstate_user(
    user_id: int,
    db:      Session     = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u or u.organisation_id != hr.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")
    u.is_active = True
    # Clear GPS failure records for this user so the counter resets
    db.query(models.ClockFailure).filter(
        models.ClockFailure.user_id         == user_id,
        models.ClockFailure.failure_reason  == 'gps_mismatch',
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"{u.full_name} reinstated successfully"}


# ── HR — edit a shift ────────────────────────────────────────────────────────

@router.patch("/entry/{event_id}")
def edit_shift(
    event_id: int,
    body:     EditShiftRequest,
    db:       Session     = Depends(get_db),
    hr:       models.User = Depends(require_hr),
):
    ci = db.query(models.ClockEvent).filter(
        models.ClockEvent.id              == event_id,
        models.ClockEvent.organisation_id == hr.organisation_id,
        models.ClockEvent.event_type      == models.ClockEventType.clock_in,
    ).first()
    if not ci:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")

    site = db.query(models.Site).filter(
        models.Site.id              == body.site_id,
        models.Site.organisation_id == hr.organisation_id,
        models.Site.is_active       == True,
    ).first()
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")

    # Resolve clock_in datetime — use provided time or keep existing
    if body.clock_in_time:
        in_h, in_m = map(int, body.clock_in_time.split(':'))
        clock_in_dt = datetime(body.date.year, body.date.month, body.date.day, in_h, in_m, tzinfo=timezone.utc)
    else:
        clock_in_dt = ci.timestamp.replace(
            year=body.date.year, month=body.date.month, day=body.date.day
        )

    # Always auto-calculate lateness — no manual override
    is_late, minutes_late = _calc_lateness(body.scheduled_start, clock_in_dt)

    # Update clock_in event
    ci.timestamp       = clock_in_dt
    ci.site_id         = body.site_id
    ci.scheduled_start = body.scheduled_start
    ci.is_late         = is_late
    ci.minutes_late    = minutes_late
    ci.entry_notes     = body.entry_notes

    # Find and update the matching clock_out
    co = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == ci.user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_out,
            models.ClockEvent.timestamp  > ci.timestamp - timedelta(hours=24),
        )
        .order_by(models.ClockEvent.timestamp.asc())
        .first()
    )
    shift_minutes = co.shift_minutes if co else None
    if co:
        if body.clock_out_time:
            out_h, out_m = map(int, body.clock_out_time.split(':'))
            clock_out_dt = datetime(body.date.year, body.date.month, body.date.day, out_h, out_m, tzinfo=timezone.utc)
            # Auto overnight: if clock-out <= clock-in, shift crosses midnight
            if clock_out_dt <= clock_in_dt:
                clock_out_dt += timedelta(days=1)
            shift_minutes = int((clock_out_dt - clock_in_dt).total_seconds() / 60)
            co.timestamp     = clock_out_dt
            co.shift_minutes = shift_minutes
        co.site_id     = body.site_id
        co.entry_notes = body.entry_notes

    db.commit()
    return {"message": "Shift updated", "shift_minutes": shift_minutes}


# ── HR — delete a shift ───────────────────────────────────────────────────────

@router.delete("/entry/{event_id}")
def delete_shift(
    event_id: int,
    db:       Session     = Depends(get_db),
    hr:       models.User = Depends(require_hr),
):
    ci = db.query(models.ClockEvent).filter(
        models.ClockEvent.id              == event_id,
        models.ClockEvent.organisation_id == hr.organisation_id,
        models.ClockEvent.event_type      == models.ClockEventType.clock_in,
    ).first()
    if not ci:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")

    # Delete matching clock_out first (FK safety)
    co = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == ci.user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_out,
            models.ClockEvent.timestamp  > ci.timestamp,
        )
        .order_by(models.ClockEvent.timestamp.asc())
        .first()
    )
    if co:
        db.delete(co)
    db.delete(ci)
    db.commit()
    return {"message": "Shift deleted"}


# ── HR — bulk delete shifts ───────────────────────────────────────────────────

@router.delete("/entries/bulk")
def bulk_delete_shifts(
    body: BulkDeleteRequest,
    db:   Session     = Depends(get_db),
    hr:   models.User = Depends(require_hr),
):
    deleted = 0
    for eid in body.event_ids:
        ci = db.query(models.ClockEvent).filter(
            models.ClockEvent.id              == eid,
            models.ClockEvent.organisation_id == hr.organisation_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_in,
        ).first()
        if not ci:
            continue
        co = (
            db.query(models.ClockEvent)
            .filter(
                models.ClockEvent.user_id    == ci.user_id,
                models.ClockEvent.event_type == models.ClockEventType.clock_out,
                models.ClockEvent.timestamp  > ci.timestamp,
            )
            .order_by(models.ClockEvent.timestamp.asc())
            .first()
        )
        if co:
            db.delete(co)
        db.delete(ci)
        deleted += 1
    db.commit()
    return {"message": f"{deleted} shifts deleted", "deleted": deleted}


# ── Public: site info ─────────────────────────────────────────────────────────
# MUST be last — these parametric GET/POST routes catch everything above them.

@router.get("/{org_slug}/{site_code}")
def site_info(org_slug: str, site_code: str, db: Session = Depends(get_db)):
    org, site = _get_site(db, org_slug, site_code)
    has_gps = site.site_lat is not None and site.site_lng is not None
    brand_email = org.brand_email or org.contact_email
    brand_name  = org.brand_name  or org.name
    return {
        "org_name":       org.name,
        "brand_name":     brand_name,
        "brand_email":    brand_email,
        "hr_contact_email": brand_email,
        "site_code":      site.code,
        "site_name":      site.name,
        "site_address":   site.address,
        "site_lat":       site.site_lat,
        "site_lng":       site.site_lng,
        "gps_enabled":    has_gps,
        "has_gps_coords": has_gps,
    }


# ── QR Clock in (no JWT — staff_id + name auth) ───────────────────────────────

@router.post("/{org_slug}/{site_code}/in")
def clock_in(
    org_slug:  str,
    site_code: str,
    body:      QRClockInRequest,
    request:   Request,
    db:        Session = Depends(get_db),
):
    org, site = _get_site(db, org_slug, site_code)
    ip = request.client.host if request.client else None

    # ── Staff ID lookup (with failure recording) ──────────────────────────────
    user = db.query(models.User).filter(
        models.User.organisation_id == org.id,
        models.User.staff_id        == body.staff_id.strip().upper(),
    ).first()
    if not user:
        _record_failure(db, org.id, None, body.staff_id, site.id, 'id_not_found', body.gps_lat, body.gps_lng, None, ip)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Staff ID not recognised")

    if not names_match(body.full_name, user.first_name, user.last_name):
        _record_failure(db, org.id, user.id, body.staff_id, site.id, 'name_mismatch', body.gps_lat, body.gps_lng, None, ip)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Name not recognised. Please enter your name exactly as registered — e.g. John Smith. If problems persist contact your supervisor.")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account has been suspended after 3 failed location attempts. Please contact your supervisor.")

    # ── Prevent double clock-in ───────────────────────────────────────────────
    if _has_open_clock_in(db, user.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "already_clocked_in")

    # ── Manager override path — skip GPS entirely ────────────────────────────
    if body.manager_override:
        if not body.manager_name or not body.manager_name.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duty Manager name is required for override")

        # Use provided manual_time for the timestamp, else server time
        now = datetime.now(timezone.utc)
        if body.manual_time:
            try:
                h, m = map(int, body.manual_time.split(':'))
                now = now.replace(hour=h, minute=m, second=0, microsecond=0)
            except (ValueError, AttributeError):
                pass

        is_late, minutes_late = _calc_lateness(body.scheduled_start, now)
        override_notes = (
            f"[OVERRIDE] Manager: {body.manager_name.strip()} | "
            f"Reason: {body.override_reason or 'Not specified'}"
        )
        event = models.ClockEvent(
            organisation_id = org.id,
            user_id         = user.id,
            site_id         = site.id,
            event_type      = models.ClockEventType.clock_in,
            timestamp       = now,
            scheduled_start = body.scheduled_start,
            is_late         = is_late,
            minutes_late    = minutes_late,
            gps_lat         = None,
            gps_lng         = None,
            gps_verified    = False,
            clocked_via_qr  = False,
            entry_notes     = override_notes,
        )
        db.add(event)
        db.commit()
        return {
            "success":         True,
            "timestamp":       now.isoformat(),
            "site_name":       site.name,
            "full_name":       user.full_name,
            "staff_id":        user.staff_id,
            "sia_licence":     user.sia_licence,
            "sia_expiry":      str(user.sia_expiry) if user.sia_expiry else None,
            "sia_status":      _sia_status(user.sia_expiry),
            "is_late":         is_late,
            "minutes_late":    minutes_late,
            "scheduled_start": body.scheduled_start,
            "distance_metres": None,
            "is_override":     True,
            "manager_name":    body.manager_name.strip(),
        }

    # ── GPS check with failure tracking ──────────────────────────────────────
    gps_verified    = False
    distance_metres = None
    if site.site_lat is not None and site.site_lng is not None:
        if body.gps_lat is None or body.gps_lng is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "GPS coordinates required for this site")
        dist            = haversine_metres(body.gps_lat, body.gps_lng, site.site_lat, site.site_lng)
        distance_metres = round(dist)
        if dist > 70:
            _record_failure(db, org.id, user.id, body.staff_id, site.id, 'gps_mismatch', body.gps_lat, body.gps_lng, dist, ip)

            since = datetime.now(timezone.utc) - timedelta(hours=24)
            failure_count = db.query(models.ClockFailure).filter(
                models.ClockFailure.user_id        == user.id,
                models.ClockFailure.site_id        == site.id,
                models.ClockFailure.failure_reason == 'gps_mismatch',
                models.ClockFailure.attempted_at   >= since,
            ).count()

            if failure_count >= 3:
                user.is_active = False
                _record_failure(db, org.id, user.id, body.staff_id, site.id, 'account_blocked', body.gps_lat, body.gps_lng, dist, ip)
                db.commit()
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account has been suspended after 3 failed location attempts. Please contact your supervisor.")

            db.commit()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You must be within 70 metres of the site ({int(dist)} m away)")

        gps_verified = True

    now = datetime.now(timezone.utc)
    is_late, minutes_late = _calc_lateness(body.scheduled_start, now)

    event = models.ClockEvent(
        organisation_id = org.id,
        user_id         = user.id,
        site_id         = site.id,
        event_type      = models.ClockEventType.clock_in,
        timestamp       = now,
        scheduled_start = body.scheduled_start,
        is_late         = is_late,
        minutes_late    = minutes_late,
        gps_lat         = body.gps_lat,
        gps_lng         = body.gps_lng,
        gps_verified    = gps_verified,
    )
    db.add(event)
    db.commit()

    return {
        "success":          True,
        "timestamp":        now.isoformat(),
        "site_name":        site.name,
        "full_name":        user.full_name,
        "staff_id":         user.staff_id,
        "sia_licence":      user.sia_licence,
        "sia_expiry":       str(user.sia_expiry) if user.sia_expiry else None,
        "sia_status":       _sia_status(user.sia_expiry),
        "is_late":          is_late,
        "minutes_late":     minutes_late,
        "scheduled_start":  body.scheduled_start,
        "distance_metres":  distance_metres,
        "is_override":      False,
        "manager_name":     None,
    }


# ── QR Clock out (no JWT — staff_id + name auth) ──────────────────────────────

@router.post("/{org_slug}/{site_code}/out")
def clock_out(
    org_slug:  str,
    site_code: str,
    body:      QRClockOutRequest,
    db:        Session = Depends(get_db),
):
    org, site = _get_site(db, org_slug, site_code)
    user = _lookup_staff(db, org.id, body.staff_id, body.full_name)

    # Find the most recent open clock_in for this user (any site)
    last_in = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == user.id,
            models.ClockEvent.event_type == models.ClockEventType.clock_in,
        )
        .order_by(models.ClockEvent.timestamp.desc())
        .first()
    )
    if not last_in:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active clock-in found. Please clock in first.")

    last_out = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == user.id,
            models.ClockEvent.event_type == models.ClockEventType.clock_out,
            models.ClockEvent.timestamp  > last_in.timestamp,
        )
        .first()
    )
    if last_out:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active clock-in found. You have already clocked out.")

    # ── Manager override path for clock-out — skip GPS ───────────────────────
    if body.manager_override:
        if not body.manager_name or not body.manager_name.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duty Manager name is required for override")
        now           = datetime.now(timezone.utc)
        shift_minutes = int((now - last_in.timestamp).total_seconds() / 60)
        override_notes = (
            f"[OVERRIDE] Manager: {body.manager_name.strip()} | "
            f"Reason: {body.override_reason or 'Not specified'}"
        )
        event = models.ClockEvent(
            organisation_id = org.id,
            user_id         = user.id,
            site_id         = site.id,
            event_type      = models.ClockEventType.clock_out,
            timestamp       = now,
            gps_lat         = None,
            gps_lng         = None,
            gps_verified    = False,
            shift_minutes   = shift_minutes,
            entry_notes     = override_notes,
        )
        db.add(event)
        db.commit()
        return {
            "success":         True,
            "timestamp":       now.isoformat(),
            "site_name":       site.name,
            "full_name":       user.full_name,
            "staff_id":        user.staff_id,
            "sia_licence":     user.sia_licence,
            "sia_expiry":      str(user.sia_expiry) if user.sia_expiry else None,
            "sia_status":      _sia_status(user.sia_expiry),
            "shift_minutes":   shift_minutes,
            "clock_in_time":   last_in.timestamp.strftime("%H:%M"),
            "distance_metres": None,
            "is_override":     True,
            "manager_name":    body.manager_name.strip(),
        }

    gps_verified = _check_gps(site, body.gps_lat, body.gps_lng)
    now = datetime.now(timezone.utc)
    shift_minutes = int((now - last_in.timestamp).total_seconds() / 60)

    distance_metres = None
    if site.site_lat is not None and body.gps_lat is not None:
        distance_metres = round(haversine_metres(body.gps_lat, body.gps_lng, site.site_lat, site.site_lng))

    event = models.ClockEvent(
        organisation_id = org.id,
        user_id         = user.id,
        site_id         = site.id,
        event_type      = models.ClockEventType.clock_out,
        timestamp       = now,
        gps_lat         = body.gps_lat,
        gps_lng         = body.gps_lng,
        gps_verified    = gps_verified,
        shift_minutes   = shift_minutes,
    )
    db.add(event)
    db.commit()

    return {
        "success":          True,
        "timestamp":        now.isoformat(),
        "site_name":        site.name,
        "full_name":        user.full_name,
        "staff_id":         user.staff_id,
        "sia_licence":      user.sia_licence,
        "sia_expiry":       str(user.sia_expiry) if user.sia_expiry else None,
        "sia_status":       _sia_status(user.sia_expiry),
        "shift_minutes":    shift_minutes,
        "clock_in_time":    last_in.timestamp.strftime("%H:%M"),
        "distance_metres":  distance_metres,
        "is_override":      False,
        "manager_name":     None,
    }
