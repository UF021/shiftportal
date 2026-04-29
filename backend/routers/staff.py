from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from database import get_db
from schemas import EditUserRequest
from auth_utils import get_current_user, require_hr, org_guard
import models

router = APIRouter()


@router.get("/all")
def list_staff(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    q = db.query(models.User).filter(
        models.User.is_active == True,
        models.User.role      == models.UserRole.staff,
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.User.organisation_id == hr.organisation_id)

    return [
        {
            # Identity
            "id":                    u.id,
            "staff_id":              u.staff_id,
            "full_name":             u.full_name,
            "email":                 u.email,
            # Personal
            "title":                 u.title,
            "first_name":            u.first_name,
            "last_name":             u.last_name,
            "date_of_birth":         str(u.date_of_birth) if u.date_of_birth else None,
            "nationality":           u.nationality,
            "phone":                 u.phone,
            # Address
            "address_line1":         u.address_line1,
            "address_line2":         u.address_line2,
            "city":                  u.city,
            "postcode":              u.postcode,
            # Employment
            "pay_rate":              u.pay_rate,
            "employment_start_date": str(u.employment_start_date) if u.employment_start_date else None,
            "assigned_site_id":      u.assigned_site_id,
            "assigned_sites":        u.assigned_sites,
            "right_to_work":         u.right_to_work,
            # SIA / compliance
            "ni_number":             u.ni_number,
            "sia_licence":           u.sia_licence,
            "sia_expiry":            str(u.sia_expiry) if u.sia_expiry else None,
            # Next of kin
            "nok_name":              u.nok_name,
            "nok_phone":             u.nok_phone,
            "nok_relation":          u.nok_relation,
            # Declarations
            "decl_policy":           u.decl_policy,
            "decl_portal":           u.decl_portal,
            "decl_line_manager":     u.decl_line_manager,
            "decl_pay_schedule":     u.decl_pay_schedule,
            "decl_trained":          u.decl_trained,
            "decl_accurate":         u.decl_accurate,
            "decl_contact":          u.decl_contact,
            # Meta
            "is_active":             u.is_active,
            "registered_at":         u.registered_at.isoformat() if u.registered_at else None,
        }
        for u in q.order_by(models.User.last_name).all()
    ]


@router.patch("/{user_id}")
def update_staff(
    user_id: int,
    req:     EditUserRequest,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)

    # Employment
    if req.staff_id              is not None: u.staff_id              = req.staff_id
    if req.employment_start_date is not None: u.employment_start_date = req.employment_start_date
    if req.pay_rate              is not None: u.pay_rate              = req.pay_rate
    if req.assigned_site_id      is not None: u.assigned_site_id      = req.assigned_site_id
    if req.assigned_sites        is not None: u.assigned_sites        = req.assigned_sites or None
    if req.right_to_work         is not None: u.right_to_work         = req.right_to_work
    # SIA / compliance
    if req.ni_number             is not None: u.ni_number             = req.ni_number.upper() if req.ni_number else None
    if req.sia_licence           is not None: u.sia_licence           = req.sia_licence
    if req.sia_expiry            is not None: u.sia_expiry            = req.sia_expiry
    # Personal
    if req.title                 is not None: u.title                 = req.title or None
    if req.first_name            is not None: u.first_name            = req.first_name
    if req.last_name             is not None: u.last_name             = req.last_name
    if req.date_of_birth         is not None: u.date_of_birth         = req.date_of_birth
    if req.nationality           is not None: u.nationality           = req.nationality or None
    if req.phone                 is not None: u.phone                 = req.phone or None
    # Address
    if req.address_line1         is not None: u.address_line1         = req.address_line1 or None
    if req.address_line2         is not None: u.address_line2         = req.address_line2 or None
    if req.city                  is not None: u.city                  = req.city or None
    if req.postcode              is not None: u.postcode              = req.postcode or None
    # Next of kin
    if req.nok_name              is not None: u.nok_name              = req.nok_name or None
    if req.nok_phone             is not None: u.nok_phone             = req.nok_phone or None
    if req.nok_relation          is not None: u.nok_relation          = req.nok_relation or None

    db.commit()
    return {"message": "Updated", "id": u.id}


class BulkDeleteRequest(BaseModel):
    user_ids: List[int]


@router.delete("/{user_id}")
def delete_staff(
    user_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)
    if u.role != models.UserRole.staff:
        raise HTTPException(403, "Can only delete staff accounts")
    db.delete(u)
    db.commit()
    return {"message": "Deleted", "id": user_id}


@router.delete("/bulk/delete")
def bulk_delete_staff(
    req: BulkDeleteRequest,
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    users = db.query(models.User).filter(models.User.id.in_(req.user_ids)).all()
    deleted = 0
    for u in users:
        try:
            org_guard(hr, u.organisation_id)
        except HTTPException:
            continue
        if u.role != models.UserRole.staff:
            continue
        db.delete(u)
        deleted += 1
    db.commit()
    return {"deleted": deleted}
