"""
GDPR tools — data export (SAR) and right to erasure.

UK legal context:
  - Employees can request a copy of all personal data held (Subject Access Request).
  - The right to erasure applies but is balanced against lawful processing for
    employment/payroll records.  Strategy: anonymise personal identifiers,
    retain payroll-critical records (shift hours, holidays) for 6 years per
    HMRC requirements, delete purely personal data (messages, training logs).
  - All erasures are logged in the audit trail.
"""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr, org_guard
from audit_utils import log_action
import models

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_export(user: models.User, db: Session) -> dict:
    """Collect all personal data for a user into a structured dict."""

    clock_events = db.query(models.ClockEvent).filter(
        models.ClockEvent.user_id == user.id
    ).order_by(models.ClockEvent.timestamp).all()

    holidays = db.query(models.Holiday).filter(
        models.Holiday.user_id == user.id
    ).order_by(models.Holiday.from_date).all()

    messages_received = db.query(models.Message).filter(
        models.Message.recipient_id == user.id
    ).order_by(models.Message.sent_at).all()

    messages_sent = db.query(models.Message).filter(
        models.Message.sent_by == user.id
    ).order_by(models.Message.sent_at).all()

    training = db.query(models.TrainingProgress).filter(
        models.TrainingProgress.user_id == user.id
    ).all()

    incidents = db.query(models.Incident).filter(
        models.Incident.user_id == user.id
    ).order_by(models.Incident.submitted_at).all()

    doc_confirmations = db.query(models.DocReadConfirmation).filter(
        models.DocReadConfirmation.user_id == user.id
    ).all()

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "subject": {
            "id":                    user.id,
            "staff_id":              user.staff_id,
            "email":                 user.email,
            "title":                 user.title,
            "first_name":            user.first_name,
            "last_name":             user.last_name,
            "date_of_birth":         str(user.date_of_birth) if user.date_of_birth else None,
            "nationality":           user.nationality,
            "phone":                 user.phone,
            "address_line1":         user.address_line1,
            "address_line2":         user.address_line2,
            "city":                  user.city,
            "postcode":              user.postcode,
            "ni_number":             user.ni_number,
            "sia_licence":           user.sia_licence,
            "sia_expiry":            str(user.sia_expiry) if user.sia_expiry else None,
            "right_to_work":         user.right_to_work,
            "nok_name":              user.nok_name,
            "nok_phone":             user.nok_phone,
            "nok_relation":          user.nok_relation,
            "employment_start_date": str(user.employment_start_date) if user.employment_start_date else None,
            "pay_rate":              user.pay_rate,
            "staff_type":            user.staff_type,
            "is_active":             user.is_active,
            "role":                  user.role.value,
            "registered_at":         user.registered_at.isoformat() if user.registered_at else None,
            "activated_at":          user.activated_at.isoformat()  if user.activated_at  else None,
        },
        "shift_records": [
            {
                "event_type":      e.event_type.value,
                "timestamp":       e.timestamp.isoformat() if e.timestamp else None,
                "site":            e.site.name if e.site else None,
                "scheduled_start": e.scheduled_start,
                "is_late":         e.is_late,
                "minutes_late":    e.minutes_late,
                "shift_minutes":   e.shift_minutes,
                "entry_notes":     e.entry_notes,
            }
            for e in clock_events
        ],
        "holidays": [
            {
                "from_date":       str(h.from_date),
                "to_date":         str(h.to_date),
                "days":            h.days,
                "reason":          h.reason,
                "status":          h.status.value,
                "requested_at":    h.requested_at.isoformat() if h.requested_at else None,
                "reviewed_at":     h.reviewed_at.isoformat()  if h.reviewed_at  else None,
            }
            for h in holidays
        ],
        "messages_received": [
            {
                "title":   m.title,
                "body":    m.body,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            }
            for m in messages_received
        ],
        "messages_sent": [
            {
                "title":   m.title,
                "body":    m.body,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            }
            for m in messages_sent
        ],
        "training": [
            {
                "module":       t.module,
                "score":        t.score,
                "passed":       t.passed,
                "attempts":     t.attempts,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            for t in training
        ],
        "incidents": [
            {
                "incident_type": i.incident_type,
                "description":   i.description,
                "submitted_at":  i.submitted_at.isoformat() if i.submitted_at else None,
                "status":        i.status,
            }
            for i in incidents
        ],
        "document_confirmations": [
            {
                "doc_key":      d.doc_key,
                "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None,
            }
            for d in doc_confirmations
        ],
    }


# ── Staff: export own data ────────────────────────────────────────────────────

@router.get("/export/me")
def export_my_data(
    db:   Session      = Depends(get_db),
    user: models.User  = Depends(get_current_user),
):
    data     = _user_export(user, db)
    filename = f"my-data-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    return Response(
        content      = json.dumps(data, indent=2, default=str),
        media_type   = "application/json",
        headers      = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── HR: export any staff member's data ───────────────────────────────────────

@router.get("/export/{user_id}")
def export_staff_data(
    user_id: int,
    db:      Session     = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    org_guard(hr, target.organisation_id)

    data     = _user_export(target, db)
    filename = f"sar-{target.last_name.lower()}-{target.id}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    return Response(
        content      = json.dumps(data, indent=2, default=str),
        media_type   = "application/json",
        headers      = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── HR: erase (anonymise) a staff member ─────────────────────────────────────

@router.post("/erase/{user_id}", status_code=200)
def erase_staff_data(
    user_id: int,
    db:      Session     = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    org_guard(hr, target.organisation_id)

    if target.role == models.UserRole.hr:
        raise HTTPException(403, "Cannot erase an HR admin account via this endpoint.")

    if getattr(target, 'is_erased', False):
        raise HTTPException(409, "This record has already been erased.")

    token = str(uuid.uuid4())[:8]

    # Anonymise all personal identifiers — keep payroll-critical fields intact
    target.first_name            = "Erased"
    target.last_name             = "User"
    target.email                 = f"erased-{user_id}-{token}@gdpr.removed"
    target.hashed_password       = "ERASED"
    target.title                 = None
    target.date_of_birth         = None
    target.nationality           = None
    target.phone                 = None
    target.address_line1         = None
    target.address_line2         = None
    target.city                  = None
    target.postcode              = None
    target.ni_number             = None
    target.sia_licence           = None
    target.sia_expiry            = None
    target.right_to_work         = None
    target.nok_name              = None
    target.nok_phone             = None
    target.nok_relation          = None
    target.is_active             = False
    target.is_blocked            = True
    target.is_erased             = True

    # Delete purely personal data — shift records and holidays are retained
    # for HMRC payroll compliance (6-year minimum retention)
    db.query(models.Message).filter(
        (models.Message.recipient_id == user_id) | (models.Message.sent_by == user_id)
    ).delete(synchronize_session=False)

    db.query(models.TrainingProgress).filter(
        models.TrainingProgress.user_id == user_id
    ).delete(synchronize_session=False)

    db.query(models.ProfileChangeLog).filter(
        models.ProfileChangeLog.user_id == user_id
    ).delete(synchronize_session=False)

    db.query(models.DocReadConfirmation).filter(
        models.DocReadConfirmation.user_id == user_id
    ).delete(synchronize_session=False)

    log_action(db, hr.organisation_id, hr, 'gdpr.erase', 'staff', user_id,
               f"Erased User #{user_id}",
               {"note": "Personal identifiers anonymised; payroll records retained per HMRC 6-year rule"})

    db.commit()
    return {"message": f"Personal data for staff member #{user_id} has been anonymised."}


# ── HR: data retention overview ───────────────────────────────────────────────

@router.get("/retention")
def retention_overview(
    db: Session     = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    """
    Returns a breakdown of data age for the org to support retention policy
    decisions.  Clock events older than 6 years may be candidates for deletion.
    """
    from datetime import timedelta
    from sqlalchemy import func

    org_id   = hr.organisation_id
    now      = datetime.now(timezone.utc)
    y1_ago   = now - timedelta(days=365)
    y3_ago   = now - timedelta(days=3 * 365)
    y6_ago   = now - timedelta(days=6 * 365)

    def event_count(after, before=None):
        q = db.query(func.count(models.ClockEvent.id)).filter(
            models.ClockEvent.organisation_id == org_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_in,
            models.ClockEvent.timestamp       >= after,
        )
        if before:
            q = q.filter(models.ClockEvent.timestamp < before)
        return q.scalar() or 0

    total_staff  = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.role            == models.UserRole.staff,
    ).count()

    erased_count = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_erased       == True,
    ).count()

    return {
        "total_staff":    total_staff,
        "erased_staff":   erased_count,
        "shift_records": {
            "last_1_year":    event_count(y1_ago),
            "1_to_3_years":   event_count(y3_ago, y1_ago),
            "3_to_6_years":   event_count(y6_ago, y3_ago),
            "over_6_years":   event_count(datetime.min.replace(tzinfo=timezone.utc), y6_ago),
        },
        "retention_policy": {
            "payroll_records": "Minimum 6 years (HMRC)",
            "personal_data":   "Duration of employment + reasonable period",
            "note":            "Records over 6 years old may be eligible for deletion.",
        },
    }
