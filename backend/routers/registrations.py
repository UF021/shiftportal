import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from database import get_db
from schemas import ActivateRequest
from auth_utils import get_current_user, require_hr, org_guard
import models

router = APIRouter()


def _generate_staff_id(first_name: str, last_name: str, org_id: int, db: Session) -> str:
    """Generate a unique staff ID: initials + 3-digit random number (e.g. ZZ123)."""
    initials = (first_name[:1] + last_name[:1]).upper()
    for _ in range(200):
        candidate = f"{initials}{random.randint(0, 999):03d}"
        exists = db.query(models.User).filter(
            models.User.organisation_id == org_id,
            models.User.staff_id        == candidate,
        ).first()
        if not exists:
            return candidate
    # Extremely unlikely fallback — use 4 digits
    return f"{initials}{random.randint(1000, 9999)}"


@router.get("/pending")
def pending_registrations(
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    q = db.query(models.User).filter(
        models.User.is_active == False,
        models.User.role      == models.UserRole.staff,
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.User.organisation_id == hr.organisation_id)

    return [
        {
            "id":           u.id,
            "full_name":    u.full_name,
            "email":        u.email,
            "phone":        u.phone,
            "date_of_birth":str(u.date_of_birth) if u.date_of_birth else None,
            "nationality":  u.nationality,
            "full_address": u.full_address,
            "ni_number":    u.ni_number,
            "sia_licence":  u.sia_licence,
            "sia_expiry":   str(u.sia_expiry) if u.sia_expiry else None,
            "right_to_work":u.right_to_work,
            "nok_name":     u.nok_name,
            "nok_phone":    u.nok_phone,
            "nok_relation": u.nok_relation,
            "registered_at":u.registered_at.isoformat() if u.registered_at else None,
            "declarations": {
                "policy":        u.decl_policy,
                "portal":        u.decl_portal,
                "line_manager":  u.decl_line_manager,
                "pay_schedule":  u.decl_pay_schedule,
                "trained":       u.decl_trained,
                "accurate":      u.decl_accurate,
                "contact":       u.decl_contact,
            },
        }
        for u in q.order_by(models.User.registered_at.desc()).all()
    ]


@router.post("/{user_id}/activate")
def activate(
    user_id: int,
    req:     ActivateRequest,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)
    if u.is_active:
        raise HTTPException(400, "User is already active")

    # Use application reference as staff ID if they registered via a pre-registration link
    pre_reg = db.query(models.PreRegistration).filter(
        models.PreRegistration.email == u.email,
        models.PreRegistration.organisation_id == u.organisation_id,
        models.PreRegistration.staff_id != None,
    ).first()
    if pre_reg and pre_reg.staff_id:
        u.staff_id = pre_reg.staff_id
    else:
        u.staff_id = _generate_staff_id(u.first_name, u.last_name, u.organisation_id, db)

    u.is_active             = True
    u.employment_start_date = req.employment_start_date
    u.pay_rate              = req.pay_rate
    u.assigned_site_id      = req.assigned_site_id
    u.activated_at          = datetime.now(timezone.utc)

    db.commit()
    return {"message": f"{u.full_name} activated successfully", "staff_id": u.staff_id}


@router.post("/{user_id}/reject")
def reject(
    user_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)
    name = u.full_name
    db.delete(u)
    db.commit()
    return {"message": f"Registration for {name} rejected and removed"}
