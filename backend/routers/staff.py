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
            "id":                    u.id,
            "staff_id":              u.staff_id,
            "full_name":             u.full_name,
            "email":                 u.email,
            "phone":                 u.phone,
            "ni_number":             u.ni_number,
            "sia_licence":           u.sia_licence,
            "sia_expiry":            str(u.sia_expiry) if u.sia_expiry else None,
            "pay_rate":              u.pay_rate,
            "employment_start_date": str(u.employment_start_date) if u.employment_start_date else None,
            "assigned_site_id":      u.assigned_site_id,
            "assigned_sites":        u.assigned_sites,
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

    if req.staff_id              is not None: u.staff_id              = req.staff_id
    if req.employment_start_date is not None: u.employment_start_date = req.employment_start_date
    if req.pay_rate              is not None: u.pay_rate              = req.pay_rate
    if req.assigned_site_id      is not None: u.assigned_site_id      = req.assigned_site_id
    if req.ni_number             is not None: u.ni_number             = req.ni_number.upper()
    if req.sia_licence           is not None: u.sia_licence           = req.sia_licence
    if req.sia_expiry            is not None: u.sia_expiry            = req.sia_expiry
    if req.assigned_sites        is not None: u.assigned_sites        = req.assigned_sites or None

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
