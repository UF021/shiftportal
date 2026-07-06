import json
import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List

from database import get_db
from schemas import EditUserRequest
from auth_utils import get_current_user, require_hr, org_guard
import models

log = logging.getLogger(__name__)


def _send_merge_email(primary: models.User, secondary_email: str, secondary_name: str):
    api_key   = os.getenv("RESEND_API_KEY")
    from_addr = os.getenv("EMAIL_FROM", "hr@ikanfm.co.uk")
    if not api_key:
        log.info("[MERGE] RESEND_API_KEY not set — would notify %s", primary.email)
        return
    try:
        import resend
        resend.api_key = api_key

        subject = f"Your staff record has been merged — Staff ID: {primary.staff_id or 'TBC'}"
        body = f"""Dear {primary.first_name},

We are writing to inform you that we identified more than one staff record in our system under your name or details.

Your records have now been merged into a single account. Please use the following details when logging into the staff portal:

  Staff ID:  {primary.staff_id or 'TBC'}
  Email:     {primary.email}

All shift records, holidays, training and other history associated with any previous accounts have been transferred to your main record.

If you believe this has been done in error, or if you have any questions, please contact HR at hr@ikanfm.co.uk.

Yours sincerely,

HR Department
Ikan Facilities Management Ltd
Web: www.ikanfm.co.uk"""

        resend.Emails.send({
            "from":    f"Ikan FM HR <{from_addr}>",
            "to":      [primary.email],
            "subject": subject,
            "text":    body,
        })

        # If the secondary had a different email, notify that address too
        if secondary_email and secondary_email.lower() != primary.email.lower():
            sec_body = f"""Dear {secondary_name},

We are writing to inform you that we identified more than one staff record in our system for you.

Your records have been consolidated. Your active staff account is now:

  Email:    {primary.email}
  Staff ID: {primary.staff_id or 'TBC'}

Please use the above email address to log in going forward. If you have any questions please contact HR at hr@ikanfm.co.uk.

Yours sincerely,

HR Department
Ikan Facilities Management Ltd
Web: www.ikanfm.co.uk"""
            resend.Emails.send({
                "from":    f"Ikan FM HR <{from_addr}>",
                "to":      [secondary_email],
                "subject": "Your staff account has been consolidated",
                "text":    sec_body,
            })

        log.info("[MERGE] Merge notification sent to %s", primary.email)
    except Exception as exc:
        log.error("[MERGE] Failed to send merge notification: %s", exc)

router = APIRouter()


@router.get("/all")
def list_staff(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    q = db.query(models.User).filter(
        models.User.role == models.UserRole.staff,
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.User.organisation_id == hr.organisation_id)

    users = q.order_by(models.User.last_name).all()

    # First clock-in date per user (one query for all users)
    user_ids = [u.id for u in users]
    first_clocks = {}
    if user_ids:
        rows = (
            db.query(
                models.ClockEvent.user_id,
                func.min(models.ClockEvent.timestamp).label('first_ts'),
            )
            .filter(
                models.ClockEvent.user_id.in_(user_ids),
                models.ClockEvent.event_type == models.ClockEventType.clock_in,
            )
            .group_by(models.ClockEvent.user_id)
            .all()
        )
        import pytz
        uk = pytz.timezone('Europe/London')
        for row in rows:
            first_clocks[row.user_id] = row.first_ts.astimezone(uk).date().isoformat()

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
            "full_address":          u.full_address,
            # Employment
            "pay_rate":              u.pay_rate,
            "employment_start_date": str(u.employment_start_date) if u.employment_start_date else None,
            "first_clock_in":        first_clocks.get(u.id),
            "assigned_site_id":      u.assigned_site_id,
            "assigned_sites":        u.assigned_sites,
            "right_to_work":         u.right_to_work,
            "staff_type":            u.staff_type or 'payroll',
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
            "is_blocked":            u.is_blocked,
            "registered_at":         u.registered_at.isoformat() if u.registered_at else None,
            "activated_at":          u.activated_at.isoformat() if u.activated_at else None,
        }
        for u in users
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
    if req.staff_type            is not None: u.staff_type            = req.staff_type if req.staff_type in ('payroll', 'subcontract') else 'payroll'
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


class BulkBlockRequest(BaseModel):
    user_ids: List[int]


@router.post("/{user_id}/block")
def block_staff(
    user_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)
    if u.role != models.UserRole.staff:
        raise HTTPException(403, "Can only block staff accounts")
    u.is_blocked = True
    db.commit()
    return {"message": "Access blocked", "id": u.id}


@router.post("/{user_id}/unblock")
def unblock_staff(
    user_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    org_guard(hr, u.organisation_id)
    if u.role != models.UserRole.staff:
        raise HTTPException(403, "Can only unblock staff accounts")
    u.is_blocked = False
    db.commit()
    return {"message": "Access restored", "id": u.id}


@router.post("/bulk/block")
def bulk_block_staff(
    req: BulkBlockRequest,
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    users = db.query(models.User).filter(models.User.id.in_(req.user_ids)).all()
    blocked = 0
    for u in users:
        try:
            org_guard(hr, u.organisation_id)
        except HTTPException:
            continue
        if u.role != models.UserRole.staff:
            continue
        u.is_blocked = True
        blocked += 1
    db.commit()
    return {"blocked": blocked}


@router.get("/profile-changes")
def list_profile_changes(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    import pytz
    uk = pytz.timezone('Europe/London')
    q = db.query(models.ProfileChangeLog).filter(
        models.ProfileChangeLog.is_acknowledged == False,
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.ProfileChangeLog.organisation_id == hr.organisation_id)
    logs = q.order_by(models.ProfileChangeLog.changed_at.desc()).limit(50).all()
    return [
        {
            "id":           l.id,
            "user_id":      l.user_id,
            "full_name":    l.user.full_name if l.user else "Unknown",
            "staff_id":     l.user.staff_id if l.user else None,
            "changed_at":   l.changed_at.astimezone(uk).isoformat() if l.changed_at else None,
            "changes":      json.loads(l.changes_json),
        }
        for l in logs
    ]


@router.post("/profile-changes/{log_id}/acknowledge")
def acknowledge_profile_change(
    log_id: int,
    db:     Session = Depends(get_db),
    hr:     models.User = Depends(require_hr),
):
    log = db.query(models.ProfileChangeLog).filter(models.ProfileChangeLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "Notice not found")
    org_guard(hr, log.organisation_id)
    log.is_acknowledged = True
    db.commit()
    return {"message": "Acknowledged"}


@router.get("/duplicates")
def list_duplicates(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    """Return groups of staff sharing an NI number, SIA licence, or name+DOB+phone."""
    q = db.query(models.User).filter(
        models.User.role      == models.UserRole.staff,
        models.User.is_active == True,
    )
    if hr.role != models.UserRole.superadmin:
        q = q.filter(models.User.organisation_id == hr.organisation_id)
    all_staff = q.all()

    from collections import defaultdict
    ni_map   = defaultdict(list)
    sia_map  = defaultdict(list)
    name_map = defaultdict(list)
    for u in all_staff:
        if u.ni_number:
            ni_map[u.ni_number.upper()].append(u.id)
        if u.sia_licence:
            sia_map[u.sia_licence.strip()].append(u.id)
        if u.first_name and u.last_name and u.date_of_birth and u.phone:
            key = f"{u.first_name.lower()}|{u.last_name.lower()}|{u.date_of_birth}|{u.phone}"
            name_map[key].append(u.id)

    pair_reason: dict[tuple, str] = {}
    for ids in ni_map.values():
        if len(ids) > 1:
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    pair_reason.setdefault((min(ids[i], ids[j]), max(ids[i], ids[j])), "ni_number")
    for ids in sia_map.values():
        if len(ids) > 1:
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    pair_reason.setdefault((min(ids[i], ids[j]), max(ids[i], ids[j])), "sia_licence")
    for ids in name_map.values():
        if len(ids) > 1:
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    pair_reason.setdefault((min(ids[i], ids[j]), max(ids[i], ids[j])), "name_dob_phone")

    user_map = {u.id: u for u in all_staff}
    result = []
    for (id_a, id_b), reason in pair_reason.items():
        ua, ub = user_map.get(id_a), user_map.get(id_b)
        if ua and ub:
            result.append({
                "ids":    [ua.id, ub.id],
                "reason": reason,
                "records": [
                    {"id": u.id, "full_name": u.full_name, "staff_id": u.staff_id,
                     "email": u.email, "ni_number": u.ni_number, "sia_licence": u.sia_licence,
                     "date_of_birth": str(u.date_of_birth) if u.date_of_birth else None,
                     "phone": u.phone,
                     "registered_at": u.registered_at.isoformat() if u.registered_at else None,
                     "activated_at":  u.activated_at.isoformat()  if u.activated_at  else None}
                    for u in (ua, ub)
                ],
            })
    return result


class MergeRequest(BaseModel):
    primary_id:    int         # record to keep (newer — takes field primacy)
    secondary_id:  int         # record to absorb then delete
    keep_staff_id: str | None = None  # explicit staff ID to apply; None = keep primary's existing ID


@router.post("/merge")
def merge_staff(
    req: MergeRequest,
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    primary   = db.query(models.User).filter(models.User.id == req.primary_id).first()
    secondary = db.query(models.User).filter(models.User.id == req.secondary_id).first()
    if not primary or not secondary:
        raise HTTPException(404, "One or both staff records not found")
    org_guard(hr, primary.organisation_id)
    org_guard(hr, secondary.organisation_id)

    # Re-parent simple records from secondary → primary
    for Model, fk in [
        (models.ClockEvent,       models.ClockEvent.user_id),
        (models.ClockFailure,     models.ClockFailure.user_id),
        (models.Timelog,          models.Timelog.user_id),
        (models.Holiday,          models.Holiday.user_id),
        (models.ProfileChangeLog, models.ProfileChangeLog.user_id),
        (models.IncidentReport,   models.IncidentReport.user_id),
    ]:
        db.query(Model).filter(fk == secondary.id).update({fk: primary.id}, synchronize_session=False)

    # Messages — re-parent both sent_by and recipient_id
    db.query(models.Message).filter(models.Message.sent_by == secondary.id).update(
        {models.Message.sent_by: primary.id}, synchronize_session=False
    )
    db.query(models.Message).filter(models.Message.recipient_id == secondary.id).update(
        {models.Message.recipient_id: primary.id}, synchronize_session=False
    )

    # DocReadConfirmation — re-parent, skip if primary already confirmed the same doc
    sec_confirms = db.query(models.DocReadConfirmation).filter(
        models.DocReadConfirmation.user_id == secondary.id
    ).all()
    for dc in sec_confirms:
        clash = db.query(models.DocReadConfirmation).filter(
            models.DocReadConfirmation.user_id == primary.id,
            models.DocReadConfirmation.doc_key == dc.doc_key,
        ).first()
        if clash:
            db.delete(dc)
        else:
            dc.user_id = primary.id

    # Training enrollment — keep primary's; absorb secondary's only if primary lacks one
    primary_enrol   = db.query(models.TrainingEnrollment).filter(models.TrainingEnrollment.user_id == primary.id).first()
    secondary_enrol = db.query(models.TrainingEnrollment).filter(models.TrainingEnrollment.user_id == secondary.id).first()
    if secondary_enrol:
        if primary_enrol:
            db.delete(secondary_enrol)
        else:
            secondary_enrol.user_id = primary.id

    # Training progress — re-parent avoiding duplicate module keys
    sec_progress = db.query(models.TrainingProgress).filter(models.TrainingProgress.user_id == secondary.id).all()
    for sp in sec_progress:
        clash = db.query(models.TrainingProgress).filter(
            models.TrainingProgress.user_id == primary.id,
            models.TrainingProgress.module  == sp.module,
        ).first()
        if clash:
            db.delete(sp)
        else:
            sp.user_id = primary.id

    secondary_name  = secondary.full_name
    secondary_email = secondary.email

    # Apply the chosen staff ID before deleting secondary
    if req.keep_staff_id and req.keep_staff_id.strip():
        primary.staff_id = req.keep_staff_id.strip()

    db.delete(secondary)
    db.commit()

    # Refresh primary to get updated staff_id before emailing
    db.refresh(primary)
    _send_merge_email(primary, secondary_email, secondary_name)

    return {"message": f"Merged: {secondary_name} absorbed into {primary.full_name}", "primary_id": primary.id}
