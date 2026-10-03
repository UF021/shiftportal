from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import get_db
from auth_utils import require_superadmin, hash_password
from audit_utils import log_action
from config import get_settings
import models

router = APIRouter()
settings = get_settings()


@router.get("/dashboard")
def super_dashboard(
    db: Session = Depends(get_db),
    _:  models.User = Depends(require_superadmin),
):
    orgs  = db.query(models.Organisation).all()
    users = db.query(models.User).filter(models.User.role == models.UserRole.staff).all()

    return {
        "total_orgs":   len(orgs),
        "active_orgs":  sum(1 for o in orgs if o.is_active),
        "trial_orgs":   sum(1 for o in orgs if o.subscription and o.subscription.status.value == "trial"),
        "total_staff":  len([u for u in users if u.is_active]),
        "orgs": [
            {
                "id":           o.id,
                "slug":         o.slug,
                "name":         o.name,
                "contact_email":o.contact_email,
                "is_active":    o.is_active,
                "plan":         o.subscription.plan.value if o.subscription else "none",
                "status":       o.subscription.status.value if o.subscription else "none",
                "staff_count":  sum(1 for u in o.users if u.is_active and u.role == models.UserRole.staff),
                "created_at":   o.created_at.isoformat() if o.created_at else None,
            }
            for o in sorted(orgs, key=lambda o: o.created_at or datetime.min, reverse=True)
        ]
    }


@router.post("/seed")
def seed_superadmin(db: Session = Depends(get_db)):
    """One-time seed — creates the platform superadmin account."""
    existing = db.query(models.User).filter(
        models.User.email == settings.superadmin_email
    ).first()
    if existing:
        return {"message": "Superadmin already exists"}

    sa = models.User(
        organisation_id = None,
        role            = models.UserRole.superadmin,
        email           = settings.superadmin_email,
        hashed_password = hash_password(settings.superadmin_password),
        is_active       = True,
        first_name      = "Platform",
        last_name       = "Admin",
    )
    db.add(sa); db.commit()
    return {"message": f"Superadmin created: {settings.superadmin_email}"}


@router.post("/organisations/{org_id}/toggle-active")
def toggle_org(
    org_id:     int,
    db:         Session = Depends(get_db),
    superadmin: models.User = Depends(require_superadmin),
):
    org = db.query(models.Organisation).filter(models.Organisation.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    org.is_active = not org.is_active
    log_action(db, org_id, superadmin, 'org.toggle', 'org', org_id, org.name,
               {"is_active": org.is_active})
    db.commit()
    return {"message": f"Organisation {'activated' if org.is_active else 'deactivated'}", "is_active": org.is_active}


@router.post("/organisations/{org_id}/extend-trial")
def extend_trial(
    org_id:     int,
    days:       int = 30,
    db:         Session = Depends(get_db),
    superadmin: models.User = Depends(require_superadmin),
):
    sub = db.query(models.Subscription).filter(models.Subscription.organisation_id == org_id).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    base = sub.trial_ends_at or datetime.now(timezone.utc)
    sub.trial_ends_at = base + timedelta(days=days)
    org = db.query(models.Organisation).filter(models.Organisation.id == org_id).first()
    log_action(db, org_id, superadmin, 'org.trial_extend', 'org', org_id,
               org.name if org else str(org_id), {"days_added": days})
    db.commit()
    return {"message": f"Trial extended by {days} days", "trial_ends_at": sub.trial_ends_at.isoformat()}


@router.get("/user-changes")
def user_changes(
    user_id:  Optional[int] = None,
    org_id:   Optional[int] = None,
    field:    Optional[str] = None,
    source:   Optional[str] = None,
    limit:    int = 200,
    db:       Session = Depends(get_db),
    _:        models.User = Depends(require_superadmin),
):
    q = db.query(models.UserChangeLog)
    if user_id: q = q.filter(models.UserChangeLog.user_id  == user_id)
    if org_id:  q = q.filter(models.UserChangeLog.organisation_id == org_id)
    if field:   q = q.filter(models.UserChangeLog.field_name == field)
    if source:  q = q.filter(models.UserChangeLog.source == source)
    rows = q.order_by(models.UserChangeLog.changed_at.desc()).limit(limit).all()
    return [
        {
            "id":             r.id,
            "user_id":        r.user_id,
            "organisation_id":r.organisation_id,
            "changed_by_id":  r.changed_by_id,
            "changed_by_name":r.changed_by_name,
            "changed_at":     r.changed_at.isoformat() if r.changed_at else None,
            "field_name":     r.field_name,
            "old_value":      r.old_value,
            "new_value":      r.new_value,
            "source":         r.source,
        }
        for r in rows
    ]


@router.get("/sites")
def list_all_sites(
    org_id: Optional[int] = None,
    db:     Session = Depends(get_db),
    _:      models.User = Depends(require_superadmin),
):
    q = db.query(models.Site)
    if org_id:
        q = q.filter(models.Site.organisation_id == org_id)
    sites = q.all()
    return [
        {
            "id":           s.id,
            "code":         s.code,
            "name":         s.name,
            "organisation_id": s.organisation_id,
            "is_active":    s.is_active,
            "gps_radius_m": s.gps_radius_m,
            "site_lat":     s.site_lat,
            "site_lng":     s.site_lng,
        }
        for s in sites
    ]


@router.patch("/sites/{site_id}/gps-radius")
def set_site_gps_radius(
    site_id: int,
    body:    dict,
    db:      Session = Depends(get_db),
    _:       models.User = Depends(require_superadmin),
):
    s = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not s:
        raise HTTPException(404, "Site not found")
    radius = body.get("gps_radius_m")
    if radius is not None and radius < 30:
        raise HTTPException(400, "GPS radius must be at least 30 metres")
    s.gps_radius_m = radius
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "gps_radius_m": s.gps_radius_m}


@router.get("/clock-events")
def list_clock_events(
    user_id: Optional[int] = None,
    org_id:  Optional[int] = None,
    limit:   int = 20,
    db:      Session = Depends(get_db),
    _:       models.User = Depends(require_superadmin),
):
    q = db.query(models.ClockEvent).order_by(models.ClockEvent.timestamp.desc())
    if user_id: q = q.filter(models.ClockEvent.user_id == user_id)
    if org_id:  q = q.filter(models.ClockEvent.organisation_id == org_id)
    rows = q.limit(limit).all()
    return [
        {
            "id":          r.id,
            "user_id":     r.user_id,
            "site_id":     r.site_id,
            "event_type":  r.event_type.value,
            "timestamp":   r.timestamp.isoformat() if r.timestamp else None,
            "scheduled_start": r.scheduled_start,
            "shift_minutes":   r.shift_minutes,
            "entry_notes": r.entry_notes,
        }
        for r in rows
    ]


@router.post("/clock-events/force-clockout/{user_id}")
def force_clockout(
    user_id: int,
    db:      Session = Depends(get_db),
    sa:      models.User = Depends(require_superadmin),
):
    from sqlalchemy import func as _func
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

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
        return {"message": "No clock-in found", "user": user.full_name}

    last_out = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_out,
            models.ClockEvent.timestamp  > last_in.timestamp,
        )
        .first()
    )
    if last_out:
        return {"message": "No open shift — already clocked out", "user": user.full_name,
                "last_clock_in": last_in.timestamp.isoformat(), "last_clock_out": last_out.timestamp.isoformat()}

    now = datetime.now(timezone.utc)
    out = models.ClockEvent(
        organisation_id = last_in.organisation_id,
        user_id         = user_id,
        site_id         = last_in.site_id,
        event_type      = models.ClockEventType.clock_out,
        timestamp       = now,
        shift_minutes   = int((now - last_in.timestamp).total_seconds() / 60),
        entry_notes     = f"Force-closed by superadmin ({sa.email})",
    )
    db.add(out)
    db.commit()
    return {
        "message":       "Open shift closed",
        "user":          user.full_name,
        "clock_in_at":   last_in.timestamp.isoformat(),
        "clock_out_at":  now.isoformat(),
        "shift_minutes": out.shift_minutes,
        "out_event_id":  out.id,
    }


@router.delete("/clock-events/purge-holiday-pay", status_code=200)
def purge_holiday_pay_events(
    db: Session = Depends(get_db),
    _:  models.User = Depends(require_superadmin),
):
    deleted = db.query(models.ClockEvent).filter(
        models.ClockEvent.entry_notes == '[HOLIDAY PAY]'
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.delete("/clock-events/{event_id}", status_code=204)
def delete_clock_event(
    event_id: int,
    db:       Session = Depends(get_db),
    sa:       models.User = Depends(require_superadmin),
):
    ev = db.query(models.ClockEvent).filter(models.ClockEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Event not found")
    db.delete(ev)
    db.commit()


@router.get("/clock-open-debug/{user_id}")
def debug_open_shift(
    user_id: int,
    db:      Session = Depends(get_db),
    _:       models.User = Depends(require_superadmin),
):
    """Replicate _has_open_clock_in logic exactly and return intermediate values."""
    from sqlalchemy import func as _func
    from routers.clock import _has_open_clock_in

    has_open = _has_open_clock_in(db, user_id)

    last_in = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.user_id    == user_id,
            models.ClockEvent.event_type == models.ClockEventType.clock_in,
        )
        .order_by(models.ClockEvent.timestamp.desc())
        .first()
    )
    last_out = None
    if last_in:
        last_out = (
            db.query(models.ClockEvent)
            .filter(
                models.ClockEvent.user_id    == user_id,
                models.ClockEvent.event_type == models.ClockEventType.clock_out,
                models.ClockEvent.timestamp  > last_in.timestamp,
            )
            .first()
        )
    return {
        "has_open_clock_in": has_open,
        "last_non_hp_clock_in":  {"id": last_in.id, "ts": last_in.timestamp.isoformat(), "notes": last_in.entry_notes} if last_in else None,
        "first_clock_out_after": {"id": last_out.id, "ts": last_out.timestamp.isoformat(), "notes": last_out.entry_notes} if last_out else None,
    }


@router.get("/clock-failures")
def list_clock_failures(
    user_id: Optional[int] = None,
    org_id:  Optional[int] = None,
    limit:   int = 100,
    db:      Session = Depends(get_db),
    _:       models.User = Depends(require_superadmin),
):
    q = db.query(models.ClockFailure).order_by(models.ClockFailure.attempted_at.desc())
    if user_id: q = q.filter(models.ClockFailure.user_id == user_id)
    if org_id:  q = q.filter(models.ClockFailure.organisation_id == org_id)
    rows = q.limit(limit).all()
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
        }
        for r in rows
    ]


@router.patch("/payroll-numbers/bulk")
def bulk_set_payroll_numbers(
    assignments: list[dict],   # [{"user_id": int, "payroll_number": str}, ...]
    db: Session = Depends(get_db),
    _:  models.User = Depends(require_superadmin),
):
    """Bulk-assign payroll numbers by user_id. Superadmin only."""
    results = []
    for a in assignments:
        uid = a.get("user_id")
        pn  = str(a.get("payroll_number", "")).strip()
        u   = db.query(models.User).filter(models.User.id == uid).first()
        if u:
            u.payroll_number = pn or None
            results.append({"user_id": uid, "name": u.full_name, "payroll_number": pn, "ok": True})
        else:
            results.append({"user_id": uid, "ok": False, "error": "not found"})
    db.commit()
    return results
