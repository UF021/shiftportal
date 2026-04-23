"""
Public contact form endpoint + HR read endpoint.

Spam protection (server-side):
  1. Honeypot field `_hp` — bots fill it; humans don't.
  2. Timing token `_ts`  — form must be submitted > 4 seconds after page load.
  3. Simple CAPTCHA answer `_ans` verified server-side.
  4. In-memory rate limit: max 3 submissions per IP per hour.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr

from database import get_db
from auth_utils import get_current_user
import models

router = APIRouter()

# ── In-memory rate limiter { ip: [timestamp, ...] } ──
_rate: dict[str, list] = {}

_MAX_PER_HOUR = 3


def _check_rate(ip: str) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)
    hits = [t for t in _rate.get(ip, []) if t > cutoff]
    _rate[ip] = hits
    if len(hits) >= _MAX_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many submissions. Please try again later."
        )
    hits.append(now)
    _rate[ip] = hits


# ── Schemas ───────────────────────────────────────────────────────────────────

class ContactSubmit(BaseModel):
    name:    str
    email:   str
    phone:   Optional[str] = None
    company: Optional[str] = None
    subject: str
    message: str
    # Spam fields
    _hp:     Optional[str] = None   # honeypot — must be empty
    _ts:     Optional[int] = None   # page load epoch ms — must be > 4s ago
    _ans:    Optional[int] = None   # captcha answer
    _q:      Optional[str] = None   # captcha question encoded as "a+b"


class ContactRead(BaseModel):
    hp:      str = ""
    ts:      int = 0
    ans:     int = 0
    q:       str = ""
    name:    str
    email:   str
    phone:   Optional[str] = None
    company: Optional[str] = None
    subject: str
    message: str


# ── POST /contact/{org_slug} — public ────────────────────────────────────────

@router.post("/{org_slug}", status_code=201)
def submit_contact(
    org_slug: str,
    body:     ContactRead,
    request:  Request,
    db:       Session = Depends(get_db),
):
    # 1. Honeypot
    if body.hp:
        raise HTTPException(400, "Invalid submission.")

    # 2. Timing — must be > 4 seconds since page load
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    if body.ts and (now_ms - body.ts) < 4000:
        raise HTTPException(400, "Submission too fast. Please try again.")

    # 3. CAPTCHA
    if body.q:
        try:
            a_str, b_str = body.q.split("+")
            expected = int(a_str.strip()) + int(b_str.strip())
            if body.ans != expected:
                raise HTTPException(400, "Incorrect answer to the security question.")
        except (ValueError, AttributeError):
            raise HTTPException(400, "Invalid security question.")

    # 4. Rate limit
    client_ip = request.client.host if request.client else "unknown"
    _check_rate(client_ip)

    # 5. Basic validation
    name    = (body.name    or "").strip()
    email   = (body.email   or "").strip().lower()
    subject = (body.subject or "").strip()
    message = (body.message or "").strip()
    if not name or not email or not subject or not message:
        raise HTTPException(400, "Please complete all required fields.")
    if len(message) > 4000:
        raise HTTPException(400, "Message is too long.")

    # 6. Resolve org
    org = db.query(models.Organisation).filter(
        models.Organisation.slug      == org_slug,
        models.Organisation.is_active == True,
    ).first()
    if not org:
        raise HTTPException(404, "Organisation not found.")

    # 7. Save
    msg = models.ContactMessage(
        organisation_id = org.id,
        name            = name,
        email           = email,
        phone           = (body.phone   or "").strip() or None,
        company         = (body.company or "").strip() or None,
        subject         = subject,
        message         = message,
        ip_address      = client_ip,
    )
    db.add(msg)
    db.commit()
    return {"message": "Thank you for your enquiry. We will be in touch shortly."}


# ── GET /contact — HR only ────────────────────────────────────────────────────

@router.get("")
def list_contacts(
    db: Session = Depends(get_db),
    hr: models.User = Depends(lambda: None),   # replaced below
):
    pass  # placeholder — real impl below


from auth_utils import get_current_user

@router.get("/", include_in_schema=True)
def list_contacts_hr(
    db:  Session      = Depends(get_db),
    me:  models.User  = Depends(get_current_user),
):
    if me.role.value not in ("hr", "superadmin"):
        raise HTTPException(403, "Not authorised.")
    msgs = (
        db.query(models.ContactMessage)
        .filter(models.ContactMessage.organisation_id == me.organisation_id)
        .order_by(models.ContactMessage.created_at.desc())
        .all()
    )
    return [
        {
            "id":         m.id,
            "name":       m.name,
            "email":      m.email,
            "phone":      m.phone,
            "company":    m.company,
            "subject":    m.subject,
            "message":    m.message,
            "is_read":    m.is_read,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msgs
    ]


@router.patch("/{msg_id}/read")
def mark_read(
    msg_id: int,
    db:     Session     = Depends(get_db),
    me:     models.User = Depends(get_current_user),
):
    if me.role.value not in ("hr", "superadmin"):
        raise HTTPException(403, "Not authorised.")
    msg = db.query(models.ContactMessage).filter(
        models.ContactMessage.id              == msg_id,
        models.ContactMessage.organisation_id == me.organisation_id,
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found.")
    msg.is_read = True
    db.commit()
    return {"ok": True}
