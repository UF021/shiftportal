"""
Incident reports — staff submit, HR review.
Up to 3 photo attachments stored as binary blobs.
"""
import base64
import os
import pytz
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr
from email_utils import send_email, org_sender, org_reply_to
import models

UK_TZ = pytz.timezone('Europe/London')

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

    # Check for 3-in-a-week commendation (fires exactly once at the 3rd report)
    try:
        _check_commendation(me, db)
    except Exception:
        pass

    # Auto-forward: check if any rule matches this site_location
    try:
        _auto_forward(incident, me.organisation_id, db)
    except Exception:
        pass

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
        "forwarded_to":         r.forwarded_to or None,
    }


# ── Commendation trigger ──────────────────────────────────────────────────────

def _check_commendation(user: models.User, db: Session):
    """Send a commendation email when a staff member files their 3rd incident in one calendar week."""
    now_uk    = datetime.now(UK_TZ)
    week_mon  = (now_uk - timedelta(days=now_uk.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_mon_utc = week_mon.astimezone(timezone.utc).replace(tzinfo=None)

    count = db.query(models.IncidentReport).filter(
        models.IncidentReport.user_id      == user.id,
        models.IncidentReport.submitted_at >= week_mon_utc,
    ).count()

    if count != 3:
        return  # only fire exactly once, at the 3rd report

    org = db.query(models.Organisation).filter(
        models.Organisation.id == user.organisation_id
    ).first()
    org_name   = (org.brand_name or org.name) if org else "HR Team"
    portal_url = os.getenv("FRONTEND_URL", "https://portal.ikanfm.co.uk")
    reply_to   = org_reply_to(org) if org else None

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
        <tr>
          <td style="background:#0f1923;padding:28px 32px;text-align:center;">
            <div style="color:#6abf3f;font-size:22px;font-weight:900;letter-spacing:-0.5px;">{org_name}</div>
            <div style="color:#7a9a7a;font-size:13px;margin-top:4px;">HR Department</div>
          </td>
        </tr>
        <tr>
          <td style="background:#e8f5e9;border-bottom:3px solid #2e7d32;padding:20px 32px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🌟</div>
            <div style="font-size:20px;font-weight:700;color:#1b5e20;">Outstanding Incident Reporting</div>
            <div style="font-size:14px;color:#2e7d32;margin-top:6px;">You've submitted 3 reports this week — thank you.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;">Dear <strong>{user.first_name}</strong>,</p>
            <p style="margin:0 0 16px;font-size:14px;color:#333;line-height:1.7;">
              We wanted to take a moment to personally thank you for the exceptional level of incident reporting
              you have submitted this week. Filing three or more reports in a single week demonstrates exactly
              the kind of professional vigilance and site awareness we value in our security officers.
            </p>
            <div style="background:#f1f8e9;border-left:4px solid #43a047;border-radius:6px;padding:16px 20px;margin:20px 0;">
              <div style="font-weight:700;font-size:14px;color:#1b5e20;margin-bottom:8px;">
                ✅ This has been formally recorded in your staff file as an example of good practice.
              </div>
              <p style="margin:0;font-size:13px;color:#388e3c;line-height:1.6;">
                Thorough incident reporting protects you, your colleagues, and the clients we serve. It ensures
                that patterns are identified early, liability is properly documented, and every officer on site
                can make informed decisions.
              </p>
            </div>
            <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px;">
              Your diligence this week contributes directly to a safer working environment for everyone.
              Thank you for setting the standard.
            </p>
            <p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:16px;margin:24px 0 0;">
              You can view your incident history at any time via the staff portal.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <div style="font-size:12px;color:#999;">Warm regards — {org_name} HR Team</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    text = f"""Dear {user.first_name},

We wanted to take a moment to personally thank you for the exceptional level of incident reporting you submitted this week. Filing three or more reports in a single week demonstrates exactly the kind of professional vigilance and site awareness we value in our security officers.

This has been formally noted in your staff record as an example of good practice.

Thorough incident reporting protects you, your colleagues, and the clients we serve. It ensures that patterns are identified early, that liability is properly documented, and that every officer on site can make informed decisions. Your diligence this week contributes directly to that.

Thank you for setting the standard.

Warm regards,
{org_name} HR Team"""

    send_email(
        to        = user.email,
        subject   = f"Well Done — Outstanding Incident Reporting This Week | {org_name}",
        body      = text,
        html      = html,
        from_name = org_sender(org) if org else "HR Team",
        reply_to  = reply_to,
    )


# ── HR: forward incident ──────────────────────────────────────────────────────

class ForwardBody(BaseModel):
    emails: str  # comma-separated


@router.post("/{incident_id}/forward")
def forward_incident(
    incident_id: int,
    body:        ForwardBody,
    db:          Session     = Depends(get_db),
    hr:          models.User = Depends(require_hr),
):
    inc = db.query(models.IncidentReport).filter(
        models.IncidentReport.id              == incident_id,
        models.IncidentReport.organisation_id == hr.organisation_id,
    ).first()
    if not inc:
        raise HTTPException(404, "Incident not found")

    recipients = [e.strip() for e in body.emails.split(',') if e.strip()]
    if not recipients:
        raise HTTPException(400, "At least one email address required")

    org = db.query(models.Organisation).filter(
        models.Organisation.id == hr.organisation_id
    ).first()
    org_name = (org.brand_name or org.name) if org else "HR Team"

    _send_forward_email(inc, recipients, hr.full_name, org_name, org_reply_to(org) if org else None)

    # Persist forwarded_to — accumulate without duplicates
    _record_forwarded(inc, recipients, db)

    return {"ok": True, "sent_to": recipients}


def _yn(val) -> str:
    return "Yes" if val else "No"


def _send_forward_email(inc, recipients: list, forwarded_by: str, org_name: str, reply_to: str | None):
    # Build inline photo tags
    photo_html = ""
    for n in (1, 2, 3):
        data = getattr(inc, f"photo_{n}_data")
        ct   = getattr(inc, f"photo_{n}_type") or "image/jpeg"
        fn   = getattr(inc, f"photo_{n}_filename") or f"Photo {n}"
        if data:
            b64 = base64.b64encode(data).decode()
            photo_html += f"""
              <div style="margin-bottom:12px;">
                <div style="font-size:11px;color:#888;margin-bottom:4px;">{fn}</div>
                <img src="data:{ct};base64,{b64}" alt="{fn}"
                     style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid #e0e0e0;" />
              </div>"""

    photos_section = (
        f'<tr><td style="padding:0 32px 24px;">'
        f'<div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">Attached Photos</div>'
        f'{photo_html}</td></tr>'
    ) if photo_html else ""

    def row(label, value):
        return f"""
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#888;min-width:180px;vertical-align:top;">{label}</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#1a1a1a;">{value or "—"}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0"
             style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
        <tr>
          <td style="background:#0f1923;padding:24px 32px;">
            <div style="color:#6abf3f;font-size:20px;font-weight:900;">{org_name}</div>
            <div style="color:#7a9a7a;font-size:12px;margin-top:3px;">Incident Report — Forwarded Copy</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px;">
            <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
              The following incident report has been forwarded from the <strong>{org_name}</strong> HR portal
              by <strong>{forwarded_by}</strong>.
            </p>
          </td>
        </tr>

        <!-- Incident Details -->
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
              Incident Details
            </div>
            <table cellpadding="0" cellspacing="0" width="100%">
              {row("Report #", f"#{inc.id}")}
              {row("Staff Name", inc.staff_name)}
              {row("Staff ID", inc.staff_id)}
              {row("Date of Incident", inc.date_of_incident)}
              {row("Time of Incident", inc.time_of_incident)}
              {row("Site / Location", inc.site_location)}
              {row("Police / Emergency Services", _yn(inc.police_called))}
              {(row("Officer Name", inc.officer_name) + row("Collar / Badge No.", inc.collar_number)) if inc.police_called else ""}
              {row("Duty Manager Called", _yn(inc.duty_manager_called))}
              {row("Duty Manager Name", inc.duty_manager_name) if inc.duty_manager_called else ""}
              {row("Injuries Reported", _yn(inc.injuries))}
              {row("Injury Description", inc.injury_description) if inc.injuries else ""}
            </table>
          </td>
        </tr>

        <!-- Statement -->
        <tr>
          <td style="padding:24px 32px 0;">
            <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee;">
              Staff Statement
            </div>
            <div style="background:#f9f9f9;border:1px solid #e8e8e8;border-radius:8px;padding:14px 16px;font-size:13px;line-height:1.8;color:#333;white-space:pre-wrap;">
{inc.statement}
            </div>
          </td>
        </tr>

        {photos_section}

        <tr>
          <td style="background:#f5f5f5;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;margin-top:24px;">
            <div style="font-size:11px;color:#999;">
              Forwarded by {forwarded_by} via {org_name} HR Portal
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    date_str = inc.date_of_incident or "Unknown Date"
    site_str = inc.site_location   or "Unknown Site"

    for email_addr in recipients:
        send_email(
            to        = email_addr,
            subject   = f"Incident Report — {date_str} | {site_str}",
            body      = f"Incident Report #{inc.id} forwarded by {forwarded_by} from {org_name}.\n\nDate: {date_str}\nSite: {site_str}\nStaff: {inc.staff_name}\n\nStatement:\n{inc.statement}",
            html      = html,
            from_name = f"{org_name} HR",
            reply_to  = reply_to,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _record_forwarded(inc: models.IncidentReport, recipients: list, db):
    """Merge new recipients into inc.forwarded_to and commit."""
    existing = set(e.strip() for e in inc.forwarded_to.split(',') if inc.forwarded_to and e.strip())
    existing.update(recipients)
    inc.forwarded_to = ', '.join(sorted(existing))
    db.commit()


def _auto_forward(incident: models.IncidentReport, org_id: int, db):
    """Check auto-forward rules and send if the site_location matches."""
    rules = db.query(models.IncidentAutoForward).filter(
        models.IncidentAutoForward.organisation_id == org_id
    ).all()
    if not rules:
        return

    site_loc = (incident.site_location or '').lower()
    matched_emails: list[str] = []

    for rule in rules:
        if rule.site_name.lower() in site_loc or site_loc in rule.site_name.lower():
            for e in rule.emails.split(','):
                e = e.strip()
                if e:
                    matched_emails.append(e)

    if not matched_emails:
        return

    org = db.query(models.Organisation).filter(
        models.Organisation.id == org_id
    ).first()
    org_name = (org.brand_name or org.name) if org else "HR Team"

    _send_forward_email(incident, matched_emails, f"{org_name} (auto)", org_name,
                        org_reply_to(org) if org else None)
    _record_forwarded(incident, matched_emails, db)


# ── HR: auto-forward config CRUD ──────────────────────────────────────────────

class AutoForwardBody(BaseModel):
    site_id:   int
    site_name: str
    emails:    str  # comma-separated


@router.get("/auto-forward")
def list_auto_forwards(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    rules = db.query(models.IncidentAutoForward).filter(
        models.IncidentAutoForward.organisation_id == hr.organisation_id
    ).order_by(models.IncidentAutoForward.site_name).all()
    return [
        {"id": r.id, "site_id": r.site_id, "site_name": r.site_name, "emails": r.emails}
        for r in rules
    ]


@router.post("/auto-forward")
def upsert_auto_forward(
    body: AutoForwardBody,
    db:   Session = Depends(get_db),
    hr:   models.User = Depends(require_hr),
):
    emails = ', '.join(e.strip() for e in body.emails.split(',') if e.strip())
    if not emails:
        raise HTTPException(400, "At least one email required")

    existing = db.query(models.IncidentAutoForward).filter(
        models.IncidentAutoForward.organisation_id == hr.organisation_id,
        models.IncidentAutoForward.site_id         == body.site_id,
    ).first()

    if existing:
        existing.site_name = body.site_name
        existing.emails    = emails
    else:
        db.add(models.IncidentAutoForward(
            organisation_id = hr.organisation_id,
            site_id         = body.site_id,
            site_name       = body.site_name,
            emails          = emails,
            created_by_id   = hr.id,
        ))
    db.commit()
    return {"ok": True}


@router.delete("/auto-forward/{rule_id}")
def delete_auto_forward(
    rule_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    rule = db.query(models.IncidentAutoForward).filter(
        models.IncidentAutoForward.id              == rule_id,
        models.IncidentAutoForward.organisation_id == hr.organisation_id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


# ── HR: trigger incident reminders now ────────────────────────────────────────

@router.post("/trigger-reminders")
def trigger_incident_reminders(
    bg: BackgroundTasks,
    hr: models.User = Depends(require_hr),
):
    from scheduled import send_incident_filing_reminders
    bg.add_task(send_incident_filing_reminders)
    return {"ok": True, "message": "Reminder job queued — emails will be sent shortly"}
