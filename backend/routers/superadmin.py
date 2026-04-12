from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from database import get_db
from auth_utils import require_superadmin, hash_password
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
    org_id: int,
    db:     Session = Depends(get_db),
    _:      models.User = Depends(require_superadmin),
):
    org = db.query(models.Organisation).filter(models.Organisation.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    org.is_active = not org.is_active
    db.commit()
    return {"message": f"Organisation {'activated' if org.is_active else 'deactivated'}", "is_active": org.is_active}


@router.post("/organisations/{org_id}/extend-trial")
def extend_trial(
    org_id: int,
    days:   int = 30,
    db:     Session = Depends(get_db),
    _:      models.User = Depends(require_superadmin),
):
    sub = db.query(models.Subscription).filter(models.Subscription.organisation_id == org_id).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    base = sub.trial_ends_at or datetime.now(timezone.utc)
    sub.trial_ends_at = base + timedelta(days=days)
    db.commit()
    return {"message": f"Trial extended by {days} days", "trial_ends_at": sub.trial_ends_at.isoformat()}
