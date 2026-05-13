"""
Incident reports — staff submit, HR review.
Up to 3 photo attachments stored as binary blobs.
"""
import base64
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
import models

router = APIRouter()

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB per image


# ── Staff: submit incident ────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def submit_incident(
    # Incident details
    date_of_incident:       str  = Form(...),
    time_of_incident:       str  = Form(...),
    site_location:          str  = Form(...),
    police_called:          str  = Form("false"),   # "true" / "false"
    officer_name:           str  = Form(""),
    collar_number:          str  = Form(""),
    duty_manager_called:    str  = Form("false"),
    duty_manager_name:      str  = Form(""),
    injuries:               str  = Form("false"),
    injury_description:     str  = Form(""),
    statement:              str  = Form(...),
    # Photos (optional)
    photo_1: Optional[UploadFile] = File(None),
    photo_2: Optional[UploadFile] = File(None),
    photo_3: Optional[UploadFile] = File(None),
    db:      Session = Depends(get_db),
    me:      models.User = Depends(get_current_user),
):
    def _read_photo(upload):
        if upload and upload.filename:
            data = upload.file.read()
            if len(data) > MAX_IMAGE_BYTES:
                raise HTTPException(400, f"Photo '{upload.filename}' exceeds 10 MB limit")
            return data, upload.filename, upload.content_type
        return None, None, None

    p1_data, p1_name, p1_type = _read_photo(photo_1)
    p2_data, p2_name, p2_type = _read_photo(photo_2)
    p3_data, p3_name, p3_type = _read_photo(photo_3)

    incident = models.IncidentReport(
        organisation_id      = me.organisation_id,
        user_id              = me.id,
        staff_name           = f"{me.first_name} {me.last_name}",
        staff_id             = me.staff_id or "",
        date_of_incident     = date_of_incident.strip(),
        time_of_incident     = time_of_incident.strip(),
        site_location        = site_location.strip(),
        police_called        = police_called.lower() == "true",
        officer_name         = officer_name.strip() or None,
        collar_number        = collar_number.strip() or None,
        duty_manager_called  = duty_manager_called.lower() == "true",
        duty_manager_name    = duty_manager_name.strip() or None,
        injuries             = injuries.lower() == "true",
        injury_description   = injury_description.strip() or None,
        statement            = statement.strip(),
        photo_1_data         = p1_data,
        photo_1_filename     = p1_name,
        photo_1_type         = p1_type,
        photo_2_data         = p2_data,
        photo_2_filename     = p2_name,
        photo_2_type         = p2_type,
        photo_3_data         = p3_data,
        photo_3_filename     = p3_name,
        photo_3_type         = p3_type,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return {"id": incident.id, "message": "Incident report submitted successfully"}


# ── Staff: list own incidents ─────────────────────────────────────────────────

@router.get("/my")
def my_incidents(
    db: Session = Depends(get_db),
    me: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.IncidentReport)
        .filter(models.IncidentReport.user_id == me.id)
        .order_by(models.IncidentReport.submitted_at.desc())
        .all()
    )
    return [_fmt(r) for r in rows]


# ── HR: list all incidents for org ────────────────────────────────────────────

@router.get("/")
def list_incidents(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    rows = (
        db.query(models.IncidentReport)
        .filter(models.IncidentReport.organisation_id == hr.organisation_id)
        .order_by(models.IncidentReport.submitted_at.desc())
        .all()
    )
    return [_fmt(r) for r in rows]


# ── HR: get photo ─────────────────────────────────────────────────────────────

@router.get("/{incident_id}/photo/{n}")
def get_photo(
    incident_id: int,
    n: int,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    if n not in (1, 2, 3):
        raise HTTPException(400, "Photo number must be 1, 2, or 3")

    inc = db.query(models.IncidentReport).filter(
        models.IncidentReport.id              == incident_id,
        models.IncidentReport.organisation_id == hr.organisation_id,
    ).first()
    if not inc:
        raise HTTPException(404, "Incident not found")

    data = getattr(inc, f"photo_{n}_data")
    ct   = getattr(inc, f"photo_{n}_type") or "image/jpeg"
    if not data:
        raise HTTPException(404, "Photo not found")

    from fastapi.responses import Response
    return Response(content=data, media_type=ct)


# ── HR: mark reviewed ─────────────────────────────────────────────────────────

@router.patch("/{incident_id}/review")
def mark_reviewed(
    incident_id: int,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    inc = db.query(models.IncidentReport).filter(
        models.IncidentReport.id              == incident_id,
        models.IncidentReport.organisation_id == hr.organisation_id,
    ).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.reviewed     = True
    inc.reviewed_at  = datetime.now(timezone.utc)
    inc.reviewed_by  = hr.id
    db.commit()
    return {"ok": True}


# ── helper ────────────────────────────────────────────────────────────────────

def _fmt(r: models.IncidentReport) -> dict:
    return {
        "id":                   r.id,
        "staff_name":           r.staff_name,
        "staff_id":             r.staff_id,
        "date_of_incident":     r.date_of_incident,
        "time_of_incident":     r.time_of_incident,
        "site_location":        r.site_location,
        "police_called":        r.police_called,
        "officer_name":         r.officer_name,
        "collar_number":        r.collar_number,
        "duty_manager_called":  r.duty_manager_called,
        "duty_manager_name":    r.duty_manager_name,
        "injuries":             r.injuries,
        "injury_description":   r.injury_description,
        "statement":            r.statement,
        "has_photo_1":          r.photo_1_data is not None,
        "has_photo_2":          r.photo_2_data is not None,
        "has_photo_3":          r.photo_3_data is not None,
        "photo_1_filename":     r.photo_1_filename,
        "photo_2_filename":     r.photo_2_filename,
        "photo_3_filename":     r.photo_3_filename,
        "reviewed":             r.reviewed,
        "reviewed_at":          r.reviewed_at.isoformat() if r.reviewed_at else None,
        "submitted_at":         r.submitted_at.isoformat() if r.submitted_at else None,
    }
