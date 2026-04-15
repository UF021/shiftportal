import math
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
import models

router = APIRouter()


# ── Haversine ─────────────────────────────────────────────────────────────────

def haversine_metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Schemas ───────────────────────────────────────────────────────────────────

class ClockInRequest(BaseModel):
    scheduled_start: Optional[str] = None   # 'HH:MM'
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None


class ClockOutRequest(BaseModel):
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None


class ManualShiftRequest(BaseModel):
    user_id:         int
    site_id:         int
    date:            date
    clock_in_time:   str            # 'HH:MM'
    clock_out_time:  str            # 'HH:MM'
    scheduled_start: Optional[str] = None
    overnight:       bool = False
    entry_notes:     Optional[str] = None


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


def _check_gps(site: models.Site, gps_lat: Optional[float], gps_lng: Optional[float]) -> bool:
    """Returns True if GPS verified (within 50 m of site), False if no site coords."""
    if site.site_lat is None or site.site_lng is None:
        return False  # site not geo-coded — allow but unverified
    if gps_lat is None or gps_lng is None:
        return False
    dist = haversine_metres(gps_lat, gps_lng, site.site_lat, site.site_lng)
    if dist > 50:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"GPS location too far from site ({int(dist)} m away, max 50 m)"
        )
    return True


def _calc_lateness(scheduled_start: Optional[str], now: datetime) -> tuple[bool, int]:
    """Returns (is_late, minutes_late) relative to scheduled_start HH:MM."""
    if not scheduled_start:
        return False, 0
    try:
        h, m = map(int, scheduled_start.split(":"))
    except (ValueError, AttributeError):
        return False, 0
    scheduled = now.replace(hour=h, minute=m, second=0, microsecond=0)
    diff = int((now - scheduled).total_seconds() / 60)
    if diff > 0:
        return True, diff
    return False, 0


# ── Public endpoint — site info ───────────────────────────────────────────────

@router.get("/{org_slug}/{site_code}")
def site_info(org_slug: str, site_code: str, db: Session = Depends(get_db)):
    org, site = _get_site(db, org_slug, site_code)
    return {
        "org_name":    org.name,
        "site_code":   site.code,
        "site_name":   site.name,
        "site_address": site.address,
        "site_lat":    site.site_lat,
        "site_lng":    site.site_lng,
        "gps_enabled": site.site_lat is not None and site.site_lng is not None,
    }


# ── Clock in ──────────────────────────────────────────────────────────────────

@router.post("/{org_slug}/{site_code}/in")
def clock_in(
    org_slug: str,
    site_code: str,
    body: ClockInRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    org, site = _get_site(db, org_slug, site_code)

    # User must belong to this org
    if current_user.organisation_id != org.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not belong to this organisation")

    # No open clock-in already exists
    open_in = db.query(models.ClockEvent).filter(
        models.ClockEvent.user_id == current_user.id,
        models.ClockEvent.event_type == models.ClockEventType.clock_in,
        models.ClockEvent.shift_minutes == None,
    ).first()
    # A clock-in is considered "open" when there is no corresponding clock-out.
    # We track this by checking if there is a clock_in with no subsequent clock_out.
    open_event = db.query(models.ClockEvent).filter(
        models.ClockEvent.user_id == current_user.id,
        models.ClockEvent.event_type == models.ClockEventType.clock_in,
    ).order_by(models.ClockEvent.timestamp.desc()).first()

    if open_event:
        last_out = db.query(models.ClockEvent).filter(
            models.ClockEvent.user_id == current_user.id,
            models.ClockEvent.event_type == models.ClockEventType.clock_out,
            models.ClockEvent.timestamp > open_event.timestamp,
        ).first()
        if not last_out:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already have an open clock-in. Please clock out first.")

    now = datetime.now(timezone.utc)
    gps_verified = _check_gps(site, body.gps_lat, body.gps_lng)
    is_late, minutes_late = _calc_lateness(body.scheduled_start, now)

    event = models.ClockEvent(
        organisation_id = org.id,
        user_id         = current_user.id,
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
    db.refresh(event)

    return {
        "id":             event.id,
        "event_type":     event.event_type,
        "timestamp":      event.timestamp.isoformat(),
        "site_name":      site.name,
        "scheduled_start": event.scheduled_start,
        "is_late":        event.is_late,
        "minutes_late":   event.minutes_late,
        "gps_verified":   event.gps_verified,
    }


# ── Clock out ─────────────────────────────────────────────────────────────────

@router.post("/{org_slug}/{site_code}/out")
def clock_out(
    org_slug: str,
    site_code: str,
    body: ClockOutRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    org, site = _get_site(db, org_slug, site_code)

    if current_user.organisation_id != org.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not belong to this organisation")

    # Find most recent open clock-in (no clock-out after it)
    last_in = db.query(models.ClockEvent).filter(
        models.ClockEvent.user_id == current_user.id,
        models.ClockEvent.event_type == models.ClockEventType.clock_in,
    ).order_by(models.ClockEvent.timestamp.desc()).first()

    if not last_in:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active clock-in found")

    last_out = db.query(models.ClockEvent).filter(
        models.ClockEvent.user_id == current_user.id,
        models.ClockEvent.event_type == models.ClockEventType.clock_out,
        models.ClockEvent.timestamp > last_in.timestamp,
    ).first()

    if last_out:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active clock-in found. You have already clocked out.")

    now = datetime.now(timezone.utc)
    gps_verified = _check_gps(site, body.gps_lat, body.gps_lng)
    shift_minutes = int((now - last_in.timestamp).total_seconds() / 60)

    event = models.ClockEvent(
        organisation_id = org.id,
        user_id         = current_user.id,
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
    db.refresh(event)

    return {
        "id":           event.id,
        "event_type":   event.event_type,
        "timestamp":    event.timestamp.isoformat(),
        "site_name":    site.name,
        "shift_minutes": shift_minutes,
        "shift_hours":  round(shift_minutes / 60, 2),
        "clocked_in_at": last_in.timestamp.isoformat(),
        "gps_verified": event.gps_verified,
    }


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

    # Detect open clock-in: most recent clock_in with no clock_out after it
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

    # Build completed shift records (most recent first)
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
        is_manual = ci.entry_notes is not None  # manual entries always have entry_notes (even "")
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


# ── HR — all events (grouped shifts) ─────────────────────────────────────────

@router.get("/all")
def all_events(
    db:         Session     = Depends(get_db),
    hr:         models.User = Depends(require_hr),
    staff_id:   Optional[int]  = None,
    from_date:  Optional[date] = None,
    to_date:    Optional[date] = None,
):
    """Return grouped shift records for the org. Each record = one clock_in paired with its clock_out."""
    from collections import defaultdict

    q = db.query(models.ClockEvent).filter(
        models.ClockEvent.organisation_id == hr.organisation_id,
        models.ClockEvent.event_type      == models.ClockEventType.clock_in,
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

    # Fetch all relevant clock_outs in one query
    user_ids = list({ci.user_id for ci in clock_ins})
    min_ts   = min(ci.timestamp for ci in clock_ins)

    clock_outs_raw = (
        db.query(models.ClockEvent)
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

    entries    = []
    total_mins = 0

    for ci in clock_ins:
        co = next(
            (o for o in outs_by_user.get(ci.user_id, []) if o.timestamp > ci.timestamp),
            None,
        )
        site_name     = (ci.site.name if ci.site else None) or (co.site.name if co and co.site else None)
        shift_minutes = co.shift_minutes if co else None
        is_manual     = ci.entry_notes is not None  # manual entries always have entry_notes (even "")

        entries.append({
            "id":              ci.id,
            "user_id":         ci.user_id,
            "user_name":       ci.user.full_name if ci.user else None,
            "date":            ci.timestamp.date().isoformat(),
            "start_time":      ci.timestamp.strftime("%H:%M"),
            "end_time":        co.timestamp.strftime("%H:%M") if co else None,
            "site_name":       site_name,
            "shift_minutes":   shift_minutes,
            "shift_hours":     round(shift_minutes / 60, 2) if shift_minutes else None,
            "is_late":         ci.is_late,
            "minutes_late":    ci.minutes_late,
            "scheduled_start": ci.scheduled_start,
            "is_manual":       is_manual,
            "entry_notes":     ci.entry_notes or None,
            "gps_verified":    ci.gps_verified,
        })
        if shift_minutes:
            total_mins += shift_minutes

    return {"entries": entries, "total_mins": total_mins}


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

    # Months employed
    months_employed = 0
    if current_user.employment_start_date:
        today = date.today()
        start = current_user.employment_start_date
        months_employed = (today.year - start.year) * 12 + (today.month - start.month)
        if today.day < start.day:
            months_employed -= 1
        months_employed = max(0, months_employed)

    # Holiday year starts April 1
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
    remaining = round(accrued - holidays_taken, 1)

    return {
        "avg_days_per_week":          avg_days_per_week,
        "months_employed":            months_employed,
        "holidays_taken_since_april": holidays_taken,
        "annual_entitlement":         annual_entitlement,
        "accrued_to_date":            accrued,
        "remaining":                  remaining,
    }


# ── HR — shift average for a user (used in approve confirmation) ───────────────

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
    return {
        "avg_shift_hours": round(avg_mins / 60, 2),
        "shift_count":     len(clock_outs),
    }


# ── HR — punctuality report ───────────────────────────────────────────────────

@router.get("/punctuality/{user_id}")
def punctuality(
    user_id: int,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    # Verify the target user belongs to the same org
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target or target.organisation_id != hr.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")

    clock_ins = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id == user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_in,
            models.ClockEvent.scheduled_start != None,
        )
        .all()
    )

    total = len(clock_ins)
    late_events = [e for e in clock_ins if e.is_late]
    late_count = len(late_events)
    on_time_count = total - late_count
    avg_late_minutes = (
        round(sum(e.minutes_late for e in late_events) / late_count, 1)
        if late_count else 0
    )

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
    """Create a clock_in + clock_out pair manually (HR only). clocked_via_qr=False."""
    # Verify staff belongs to same org
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

    # Build datetimes (treat as UTC)
    in_h,  in_m  = map(int, body.clock_in_time.split(':'))
    out_h, out_m = map(int, body.clock_out_time.split(':'))

    clock_in_dt  = datetime(body.date.year, body.date.month, body.date.day, in_h,  in_m,  tzinfo=timezone.utc)
    clock_out_dt = datetime(body.date.year, body.date.month, body.date.day, out_h, out_m, tzinfo=timezone.utc)

    # Handle overnight shift
    if body.overnight or clock_out_dt <= clock_in_dt:
        clock_out_dt += timedelta(days=1)

    shift_minutes = int((clock_out_dt - clock_in_dt).total_seconds() / 60)
    is_late, minutes_late = _calc_lateness(body.scheduled_start, clock_in_dt)

    # Always set entry_notes (even empty string) so is_manual detection works
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
    out_event = models.ClockEvent(
        organisation_id = hr.organisation_id,
        user_id         = body.user_id,
        site_id         = site.id,
        event_type      = models.ClockEventType.clock_out,
        timestamp       = clock_out_dt,
        shift_minutes   = shift_minutes,
        entry_notes     = notes,
    )
    db.add(in_event)
    db.add(out_event)
    db.commit()

    return {
        "message":       "Manual shift created",
        "in_id":         in_event.id,
        "out_id":        out_event.id,
        "shift_minutes": shift_minutes,
        "shift_hours":   round(shift_minutes / 60, 2),
        "is_late":       is_late,
        "minutes_late":  minutes_late,
    }
