import os
import uuid
import random
import smtplib
import logging
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import require_hr
import models

router = APIRouter()
log = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://shiftportal.vercel.app")


def _generate_reference(first_name: str, last_name: str, org_id: int, db: Session) -> str:
    i1 = first_name[0].upper() if first_name else 'X'
    i2 = last_name[0].upper() if last_name else 'X'
    for _ in range(30):
        digits = f"{random.randint(0, 999):03d}"
        ref = f"{i1}{i2}{digits}"
        exists = db.query(models.JobApplication).filter(
            models.JobApplication.organisation_id == org_id,
            models.JobApplication.reference == ref,
        ).first()
        if not exists:
            return ref
    return f"{i1}{i2}{random.randint(100, 999)}"


# ── Email helper ──────────────────────────────────────────────────────────────

def _send_registration_email(to_email: str, first_name: str, reg_link: str, org_name: str):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")

    body = (
        f"Dear {first_name},\n\n"
        f"Congratulations! Your application to {org_name} has been accepted.\n\n"
        f"Please complete your registration by clicking the link below:\n"
        f"{reg_link}\n\n"
        f"This link is unique to you — please do not share it.\n\n"
        f"Kind regards,\n{org_name} HR Team"
    )

    if not all([smtp_host, smtp_user, smtp_pass]):
        log.info("[EMAIL] SMTP not configured — would send to %s:\n%s", to_email, body)
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Your {org_name} Application — Next Steps"
        msg["From"]    = smtp_user
        msg["To"]      = to_email
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(smtp_host, smtp_port) as srv:
            srv.starttls()
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(smtp_user, to_email, msg.as_string())
        log.info("[EMAIL] Sent registration email to %s", to_email)
    except Exception as exc:
        log.error("[EMAIL] Failed to send to %s: %s", to_email, exc)


# ── Public: submit application ────────────────────────────────────────────────

@router.post("/{org_slug}", status_code=201)
async def submit_application(
    org_slug: str,
    # Personal
    title:              str = Form(...),
    first_name:         str = Form(...),
    last_name:          str = Form(...),
    date_of_birth:      str = Form(...),
    email:              str = Form(...),
    phone:              str = Form(...),
    address:            str = Form(...),
    # Employment
    ni_number:          str = Form(...),
    sia_licence:        str = Form(...),
    sia_expiry:         str = Form(...),
    commute_method:     str = Form(...),
    # Work history
    employment_history: str = Form(...),
    # Immigration
    nationality:        str = Form(...),
    right_to_work:      str = Form(...),   # "true" / "false"
    # Emergency
    nok_name:           str = Form(...),
    nok_phone:          str = Form(...),
    # Declarations
    info_accurate:      str = Form(...),
    consent_references: str = Form(...),
    # File uploads
    sia_badge:          Optional[UploadFile] = File(None),
    immigration_doc:    Optional[UploadFile] = File(None),
    db:                 Session = Depends(get_db),
):
    org = db.query(models.Organisation).filter(
        models.Organisation.slug == org_slug,
        models.Organisation.is_active == True,
    ).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")

    sia_data, sia_filename, imm_data, imm_filename = None, None, None, None
    if sia_badge and sia_badge.filename:
        sia_data     = await sia_badge.read()
        sia_filename = sia_badge.filename
    if immigration_doc and immigration_doc.filename:
        imm_data     = await immigration_doc.read()
        imm_filename = immigration_doc.filename

    ref = _generate_reference(first_name.strip(), last_name.strip(), org.id, db)

    app = models.JobApplication(
        organisation_id          = org.id,
        reference                = ref,
        title                    = title.strip(),
        first_name               = first_name.strip(),
        last_name                = last_name.strip(),
        date_of_birth            = date_of_birth.strip(),
        email                    = email.strip().lower(),
        phone                    = phone.strip(),
        address                  = address.strip(),
        ni_number                = ni_number.strip().upper(),
        sia_licence              = sia_licence.strip(),
        sia_expiry               = sia_expiry.strip(),
        sia_badge_data           = sia_data,
        sia_badge_filename       = sia_filename,
        nationality              = nationality.strip(),
        right_to_work            = right_to_work.lower() == "true",
        immigration_doc_data     = imm_data,
        immigration_doc_filename = imm_filename,
        commute_method           = commute_method.strip(),
        employment_history       = employment_history.strip(),
        nok_name                 = nok_name.strip(),
        nok_phone                = nok_phone.strip(),
        info_accurate            = info_accurate.lower() == "true",
        consent_references       = consent_references.lower() == "true",
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return {"success": True, "application_id": app.id, "reference": app.reference}


# ── HR: list all applications ─────────────────────────────────────────────────

@router.get("/")
def list_applications(
    db: Session     = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    rows = (
        db.query(models.JobApplication)
        .filter(models.JobApplication.organisation_id == hr.organisation_id)
        .order_by(models.JobApplication.submitted_at.desc())
        .all()
    )
    return [_summary(a) for a in rows]


# ── HR: single application detail ─────────────────────────────────────────────

@router.get("/{app_id}")
def get_application(
    app_id: int,
    db:     Session     = Depends(get_db),
    hr:     models.User = Depends(require_hr),
):
    a = _get_app(app_id, hr, db)
    return {
        **_summary(a),
        "address":            a.address,
        "ni_number":          a.ni_number,
        "sia_licence":        a.sia_licence,
        "sia_expiry":         a.sia_expiry,
        "sia_badge_filename": a.sia_badge_filename,
        "nationality":        a.nationality,
        "right_to_work":      a.right_to_work,
        "immigration_doc_filename": a.immigration_doc_filename,
        "commute_method":     a.commute_method,
        "employment_history": a.employment_history,
        "nok_name":           a.nok_name,
        "nok_phone":          a.nok_phone,
        "info_accurate":      a.info_accurate,
        "consent_references": a.consent_references,
        "hr_notes":           a.hr_notes,
        "registration_sent_at": a.registration_sent_at.isoformat() if a.registration_sent_at else None,
    }


# ── HR: SIA badge file download ───────────────────────────────────────────────

@router.get("/{app_id}/sia-badge")
def download_sia_badge(
    app_id: int,
    db:     Session     = Depends(get_db),
    hr:     models.User = Depends(require_hr),
):
    a = _get_app(app_id, hr, db)
    if not a.sia_badge_data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No SIA badge uploaded")
    media_type = _guess_media_type(a.sia_badge_filename)
    return Response(content=a.sia_badge_data, media_type=media_type,
                    headers={"Content-Disposition": f'inline; filename="{a.sia_badge_filename or "sia_badge"}"'})


# ── HR: immigration doc file download ─────────────────────────────────────────

@router.get("/{app_id}/immigration-doc")
def download_immigration_doc(
    app_id: int,
    db:     Session     = Depends(get_db),
    hr:     models.User = Depends(require_hr),
):
    a = _get_app(app_id, hr, db)
    if not a.immigration_doc_data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No immigration doc uploaded")
    media_type = _guess_media_type(a.immigration_doc_filename)
    return Response(content=a.immigration_doc_data, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{a.immigration_doc_filename or "immigration_doc"}"'})


# ── HR: update status ─────────────────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str
    notes:  Optional[str] = None


@router.patch("/{app_id}/status")
def update_status(
    app_id: int,
    body:   StatusUpdate,
    db:     Session     = Depends(get_db),
    hr:     models.User = Depends(require_hr),
):
    a = _get_app(app_id, hr, db)

    valid = {s.value for s in models.ApplicationStatus}
    if body.status not in valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid status. Must be one of: {valid}")

    a.status           = body.status
    a.hr_notes         = body.notes
    a.status_updated_at = datetime.now(timezone.utc)
    a.status_updated_by = hr.id

    reg_link = None
    if body.status == models.ApplicationStatus.accepted and not a.registration_sent_at:
        # Create pre-registration record
        token = str(uuid.uuid4())
        pre = models.PreRegistration(
            organisation_id = a.organisation_id,
            token           = token,
            email           = a.email,
            first_name      = a.first_name,
            last_name       = a.last_name,
            date_of_birth   = a.date_of_birth,
            address         = a.address,
            phone           = a.phone,
            ni_number       = a.ni_number,
            sia_licence     = a.sia_licence,
            sia_expiry      = a.sia_expiry,
            nok_name        = a.nok_name,
            nok_phone       = a.nok_phone,
            staff_id        = a.reference,
            application_id  = a.id,
        )
        db.add(pre)
        db.flush()

        org      = db.query(models.Organisation).filter(models.Organisation.id == a.organisation_id).first()
        org_name = (org.brand_name or org.name) if org else "ShiftPortal"
        org_slug = org.slug if org else ""
        reg_link = f"{FRONTEND_URL}/register/{org_slug}?token={token}"

        _send_registration_email(a.email, a.first_name, reg_link, org_name)
        a.registration_sent_at = datetime.now(timezone.utc)

    db.commit()
    return {
        "message":  f"Status updated to {body.status}",
        "reg_link": reg_link,
        "email":    a.email if body.status == models.ApplicationStatus.accepted else None,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_app(app_id: int, hr: models.User, db: Session) -> models.JobApplication:
    a = db.query(models.JobApplication).filter(models.JobApplication.id == app_id).first()
    if not a or a.organisation_id != hr.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return a


def _summary(a: models.JobApplication) -> dict:
    return {
        "id":           a.id,
        "reference":    a.reference,
        "full_name":    f"{a.title} {a.first_name} {a.last_name}",
        "first_name":   a.first_name,
        "last_name":    a.last_name,
        "title":        a.title,
        "email":        a.email,
        "phone":        a.phone,
        "date_of_birth": a.date_of_birth,
        "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        "status":       a.status.value if a.status else "submitted",
        "has_sia_badge":    a.sia_badge_data is not None,
        "has_immigration_doc": a.immigration_doc_data is not None,
        "registration_sent_at": a.registration_sent_at.isoformat() if a.registration_sent_at else None,
    }


def _guess_media_type(filename: Optional[str]) -> str:
    if not filename:
        return "application/octet-stream"
    ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    }.get(ext, "application/octet-stream")
