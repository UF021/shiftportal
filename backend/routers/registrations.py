import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from database import get_db
from schemas import ActivateRequest
from auth_utils import get_current_user, require_hr, org_guard
from audit_utils import log_action, log_field_change
from email_utils import send_email, org_sender, org_reply_to
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
        models.User.is_active   == False,
        models.User.role        == models.UserRole.staff,
        models.User.is_archived.isnot(True),
        models.User.is_rejected.isnot(True),
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.User.organisation_id == hr.organisation_id)

    six_weeks_ago = datetime.now(timezone.utc) - timedelta(weeks=6)
    result = []
    for u in q.order_by(models.User.registered_at.desc()).all():
        last_clock = db.query(models.ClockEvent).filter(
            models.ClockEvent.user_id    == u.id,
            models.ClockEvent.event_type == models.ClockEventType.clock_in,
        ).order_by(models.ClockEvent.timestamp.desc()).first()
        last_clock_in = last_clock.timestamp.isoformat() if last_clock else None
        is_previously_active = bool(
            u.staff_id and u.staff_id != 'TBC' and
            last_clock and last_clock.timestamp >= six_weeks_ago
        )
        result.append({
            "id":                  u.id,
            "full_name":           u.full_name,
            "email":               u.email,
            "phone":               u.phone,
            "date_of_birth":       str(u.date_of_birth) if u.date_of_birth else None,
            "nationality":         u.nationality,
            "full_address":        u.full_address,
            "ni_number":           u.ni_number,
            "sia_licence":         u.sia_licence,
            "sia_expiry":          str(u.sia_expiry) if u.sia_expiry else None,
            "right_to_work":       u.right_to_work,
            "nok_name":            u.nok_name,
            "nok_phone":           u.nok_phone,
            "nok_relation":        u.nok_relation,
            "registered_at":       u.registered_at.isoformat() if u.registered_at else None,
            "staff_id":            u.staff_id,
            "last_clock_in":       last_clock_in,
            "is_previously_active": is_previously_active,
            "declarations": {
                "policy":        u.decl_policy,
                "portal":        u.decl_portal,
                "line_manager":  u.decl_line_manager,
                "pay_schedule":  u.decl_pay_schedule,
                "trained":       u.decl_trained,
                "accurate":      u.decl_accurate,
                "contact":       u.decl_contact,
            },
        })
    return result


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

    # Preserve existing staff ID if re-activating a previously active account (staff_id != 'TBC').
    # Only assign a new ID for genuinely new activations.
    if not u.staff_id or u.staff_id == 'TBC':
        pre_reg = db.query(models.PreRegistration).filter(
            models.PreRegistration.email == u.email,
            models.PreRegistration.organisation_id == u.organisation_id,
            models.PreRegistration.staff_id != None,
        ).first()
        if pre_reg and pre_reg.staff_id:
            u.staff_id = pre_reg.staff_id
        else:
            u.staff_id = _generate_staff_id(u.first_name, u.last_name, u.organisation_id, db)

    log_field_change(db, u, hr, 'is_active', False, True)
    u.is_active             = True
    u.employment_start_date = req.employment_start_date
    u.pay_rate              = req.pay_rate
    u.assigned_site_id      = req.assigned_site_id
    u.assigned_sites        = req.assigned_sites
    u.activated_at          = datetime.now(timezone.utc)

    log_action(db, u.organisation_id, hr, 'staff.activate', 'staff', u.id, u.full_name,
               {"staff_id": u.staff_id, "pay_rate": str(req.pay_rate) if req.pay_rate else None})
    db.commit()

    # Welcome email to newly activated staff member
    org = db.query(models.Organisation).filter(models.Organisation.id == u.organisation_id).first()
    if u.email and org:
        send_email(
            to        = u.email,
            subject   = f"Your account is now active — {org.brand_name or org.name}",
            body      = (
                f"Dear {u.first_name},\n\n"
                f"Your staff account has been reviewed and is now active. "
                f"You can log in to the staff portal using your registered email address and password.\n\n"
                f"  Portal: https://portal.ikanfm.co.uk/login/{org.slug}\n"
                f"  Staff ID: {u.staff_id}\n\n"
                f"If you have forgotten your password, use the 'Forgot Password' link on the login page.\n\n"
                f"If you have any questions, please contact HR.\n\n"
                f"Welcome aboard,\nHR Team"
            ),
            from_name = org_sender(org),
            reply_to  = org_reply_to(org),
        )

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
    log_field_change(db, u, hr, 'is_rejected', False, True)
    u.is_rejected = True
    log_action(db, u.organisation_id, hr, 'staff.reject', 'staff', u.id, u.full_name)
    db.commit()
    return {"message": f"Registration for {u.full_name} rejected"}


@router.get("/rejected")
def rejected_registrations(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    q = db.query(models.User).filter(
        models.User.is_rejected == True,
        models.User.role        == models.UserRole.staff,
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.User.organisation_id == hr.organisation_id)
    return [
        {
            "id":           u.id,
            "full_name":    u.full_name,
            "email":        u.email,
            "phone":        u.phone,
            "registered_at": u.registered_at.isoformat() if u.registered_at else None,
            "staff_id":     u.staff_id,
        }
        for u in q.order_by(models.User.registered_at.desc()).all()
    ]


@router.post("/{user_id}/reconsider")
def reconsider(
    user_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)
    if not u.is_rejected:
        raise HTTPException(400, "User is not in rejected state")
    log_field_change(db, u, hr, 'is_rejected', True, False)
    u.is_rejected = False
    log_action(db, u.organisation_id, hr, 'staff.reconsider', 'staff', u.id, u.full_name)
    db.commit()
    return {"message": f"{u.full_name} moved back to pending"}
