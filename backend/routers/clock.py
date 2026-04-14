import math
from datetime import datetime, timezone
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
    events = (
        db.query(models.ClockEvent)
        .filter(models.ClockEvent.user_id == current_user.id)
        .order_by(models.ClockEvent.timestamp.desc())
        .all()
    )
    return [
        {
            "id":             e.id,
            "event_type":     e.event_type,
            "timestamp":      e.timestamp.isoformat(),
            "site_name":      e.site.name if e.site else None,
            "scheduled_start": e.scheduled_start,
            "is_late":        e.is_late,
            "minutes_late":   e.minutes_late,
            "shift_minutes":  e.shift_minutes,
            "shift_hours":    round(e.shift_minutes / 60, 2) if e.shift_minutes else None,
            "gps_verified":   e.gps_verified,
        }
        for e in events
    ]


# ── HR — all events ───────────────────────────────────────────────────────────

@router.get("/all")
def all_events(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    events = (
        db.query(models.ClockEvent)
        .filter(models.ClockEvent.organisation_id == hr.organisation_id)
        .order_by(models.ClockEvent.timestamp.desc())
        .limit(500)
        .all()
    )
    return [
        {
            "id":             e.id,
            "user_id":        e.user_id,
            "user_name":      e.user.full_name if e.user else None,
            "event_type":     e.event_type,
            "timestamp":      e.timestamp.isoformat(),
            "site_name":      e.site.name if e.site else None,
            "scheduled_start": e.scheduled_start,
            "is_late":        e.is_late,
            "minutes_late":   e.minutes_late,
            "shift_minutes":  e.shift_minutes,
            "shift_hours":    round(e.shift_minutes / 60, 2) if e.shift_minutes else None,
            "gps_verified":   e.gps_verified,
        }
        for e in events
    ]


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
