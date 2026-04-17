import base64
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx

from database import get_db
from schemas import OrgCreate, OrgBrandingUpdate, OrgOut, SiteCreate, SiteOut
from auth_utils import (
    get_current_user, require_hr, require_superadmin,
    hash_password, org_guard
)
from pydantic import BaseModel
import models

DEFAULT_DOCS = [
    ('pay_calendar',   'Pay Calendar 2025/26'),
    ('staff_handbook', 'Staff Operating Guidelines & Health and Safety'),
    ('martyn_law',     "Martyn's Law, Body Worn Camera & Use of Force Policy"),
]

router = APIRouter()


# ── Public: branding for login page ──────────────────────────────────────────
@router.get("/{slug}/public")
def org_public(slug: str, db: Session = Depends(get_db)):
    org = db.query(models.Organisation).filter(
        models.Organisation.slug == slug,
        models.Organisation.is_active == True,
    ).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    return {
        "slug":     org.slug,
        "name":     org.brand_name or org.name,
        "colour":   org.brand_colour or "#6abf3f",
        "logo_url": org.brand_logo_url,
        "email":    org.brand_email or org.contact_email,
    }


# ── HR: get own org ───────────────────────────────────────────────────────────
@router.get("/me", response_model=OrgOut)
def get_my_org(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    org = db.query(models.Organisation).filter(
        models.Organisation.id == hr.organisation_id
    ).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    return org


@router.patch("/me/branding")
def update_branding(
    req: OrgBrandingUpdate,
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    org = db.query(models.Organisation).filter(
        models.Organisation.id == hr.organisation_id
    ).first()
    for field, val in req.model_dump(exclude_none=True).items():
        setattr(org, field, val)
    db.commit()
    return {"message": "Branding updated"}


# ── Sites (org-scoped) ────────────────────────────────────────────────────────
@router.get("/me/sites", response_model=list[SiteOut])
def list_sites(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    return db.query(models.Site).filter(
        models.Site.organisation_id == hr.organisation_id,
        models.Site.is_active       == True,
    ).order_by(models.Site.group, models.Site.name).all()


async def geocode_address(address: str):
    if not address:
        return None, None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                'https://nominatim.openstreetmap.org/search',
                params={'q': address, 'format': 'json', 'limit': 1},
                headers={'User-Agent': 'ShiftPortal/1.0'},
                timeout=5.0,
            )
            data = r.json()
            if data:
                return float(data[0]['lat']), float(data[0]['lon'])
    except Exception:
        pass
    return None, None


@router.post("/me/sites", response_model=SiteOut, status_code=201)
async def create_site(
    req: SiteCreate,
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    lat, lng = await geocode_address(req.address)
    site = models.Site(
        organisation_id = hr.organisation_id,
        code            = req.code,
        name            = req.name,
        group           = req.group,
        address         = req.address,
        site_lat        = lat,
        site_lng        = lng,
    )
    db.add(site); db.commit(); db.refresh(site)
    return site


# ── GPS Capture endpoints ─────────────────────────────────────────────────────

class GPSCaptureCreate(BaseModel):
    latitude:    float
    longitude:   float
    accuracy:    Optional[float] = None
    captured_by: Optional[str]  = None
    notes:       Optional[str]  = None


@router.post("/public/{slug}/sites/{site_code}/capture-gps", status_code=201)
def submit_gps_capture(
    slug:      str,
    site_code: str,
    req:       GPSCaptureCreate,
    db:        Session = Depends(get_db),
):
    """Public — anyone with the link can submit GPS coordinates for HR review."""
    org = db.query(models.Organisation).filter(
        models.Organisation.slug      == slug,
        models.Organisation.is_active == True,
    ).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    site = db.query(models.Site).filter(
        models.Site.organisation_id == org.id,
        models.Site.code            == site_code,
        models.Site.is_active       == True,
    ).first()
    if not site:
        raise HTTPException(404, "Site not found")
    capture = models.GPSCapture(
        organisation_id = org.id,
        site_id         = site.id,
        latitude        = req.latitude,
        longitude       = req.longitude,
        accuracy        = req.accuracy,
        captured_by     = req.captured_by,
        notes           = req.notes,
    )
    db.add(capture); db.commit(); db.refresh(capture)
    return {"id": capture.id, "message": "GPS coordinates submitted for review"}


@router.get("/me/sites/gps-captures")
def list_gps_captures(
    db: Session        = Depends(get_db),
    hr: models.User    = Depends(require_hr),
):
    """HR — list all GPS capture submissions for their org."""
    captures = (
        db.query(models.GPSCapture)
        .filter(models.GPSCapture.organisation_id == hr.organisation_id)
        .order_by(models.GPSCapture.captured_at.desc())
        .all()
    )
    return [
        {
            "id":          c.id,
            "site_id":     c.site_id,
            "site_name":   c.site.name if c.site else "Unknown",
            "site_code":   c.site.code if c.site else "—",
            "latitude":    c.latitude,
            "longitude":   c.longitude,
            "accuracy":    c.accuracy,
            "captured_by": c.captured_by,
            "notes":       c.notes,
            "captured_at": c.captured_at.isoformat() if c.captured_at else None,
            "approved":    c.approved,
        }
        for c in captures
    ]


@router.patch("/me/sites/{site_id}/approve-gps/{capture_id}")
def approve_gps_capture(
    site_id:    int,
    capture_id: int,
    db:         Session     = Depends(get_db),
    hr:         models.User = Depends(require_hr),
):
    """HR — approve a GPS capture and update the site's stored coordinates."""
    capture = db.query(models.GPSCapture).filter(
        models.GPSCapture.id              == capture_id,
        models.GPSCapture.organisation_id == hr.organisation_id,
        models.GPSCapture.site_id         == site_id,
    ).first()
    if not capture:
        raise HTTPException(404, "Capture not found")
    capture.approved = True
    site = db.query(models.Site).filter(
        models.Site.id              == site_id,
        models.Site.organisation_id == hr.organisation_id,
    ).first()
    if site:
        site.site_lat = capture.latitude
        site.site_lng = capture.longitude
    db.commit()
    return {"message": "GPS coordinates approved and applied to site"}


@router.delete("/me/sites/gps-captures/{capture_id}", status_code=204)
def reject_gps_capture(
    capture_id: int,
    db:         Session     = Depends(get_db),
    hr:         models.User = Depends(require_hr),
):
    """HR — reject (delete) a GPS capture submission."""
    capture = db.query(models.GPSCapture).filter(
        models.GPSCapture.id              == capture_id,
        models.GPSCapture.organisation_id == hr.organisation_id,
    ).first()
    if not capture:
        raise HTTPException(404, "Capture not found")
    db.delete(capture); db.commit()


@router.delete("/me/sites/{site_id}", status_code=204)
def delete_site(
    site_id: int,
    db:      Session = Depends(get_db),
    hr:      models.User = Depends(require_hr),
):
    s = db.query(models.Site).filter(
        models.Site.id              == site_id,
        models.Site.organisation_id == hr.organisation_id,
    ).first()
    if not s:
        raise HTTPException(404, "Site not found")
    s.is_active = False
    db.commit()


# ── Dashboard stats ───────────────────────────────────────────────────────────
@router.get("/me/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    from datetime import date
    today = date.today()
    in60  = date.fromordinal(today.toordinal() + 60)

    org_id = hr.organisation_id

    total_staff = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_active       == True,
        models.User.role            == models.UserRole.staff,
    ).count()

    pending_regs = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_active       == False,
        models.User.role            == models.UserRole.staff,
    ).count()

    sia_expired = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_active       == True,
        models.User.sia_expiry      <  today,
    ).count()

    sia_expiring = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_active       == True,
        models.User.sia_expiry      >= today,
        models.User.sia_expiry      <= in60,
    ).count()

    all_entries = db.query(models.Timelog).filter(
        models.Timelog.organisation_id == org_id
    ).all()
    total_hours = sum(e.total_mins or 0 for e in all_entries) / 60

    # SIA alerts for dashboard
    alerts = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_active       == True,
        models.User.sia_expiry      <= in60,
    ).order_by(models.User.sia_expiry).limit(8).all()

    return {
        "total_staff":        total_staff,
        "pending_regs":       pending_regs,
        "sia_expired":        sia_expired,
        "sia_expiring_soon":  sia_expiring,
        "total_hours_period": round(total_hours, 1),
        "sia_alerts": [
            {
                "id":         u.id,
                "full_name":  u.full_name,
                "sia_expiry": str(u.sia_expiry),
                "expired":    u.sia_expiry < today,
            }
            for u in alerts
        ],
    }


# ── Documents (staff + HR read, HR write) ────────────────────────────────────

class DocumentUpdate(BaseModel):
    doc_name: str
    doc_url:  Optional[str] = None


def _ensure_default_docs(org_id: int, db: Session):
    """Seed the three default document stubs if they don't exist yet."""
    for key, name in DEFAULT_DOCS:
        exists = db.query(models.OrgDocument).filter(
            models.OrgDocument.organisation_id == org_id,
            models.OrgDocument.doc_key         == key,
        ).first()
        if not exists:
            db.add(models.OrgDocument(organisation_id=org_id, doc_key=key, doc_name=name))
    db.commit()


@router.get("/me/documents")
def get_documents(
    db:           Session       = Depends(get_db),
    current_user: models.User   = Depends(get_current_user),
):
    org_id = current_user.organisation_id
    if not org_id:
        raise HTTPException(403, "No organisation")
    _ensure_default_docs(org_id, db)
    docs = db.query(models.OrgDocument).filter(
        models.OrgDocument.organisation_id == org_id,
    ).order_by(models.OrgDocument.id).all()
    return [
        {
            "doc_key":    d.doc_key,
            "doc_name":   d.doc_name,
            "doc_url":    d.doc_url,
            "has_file":   d.doc_content is not None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }
        for d in docs
    ]


@router.put("/me/documents/{doc_key}")
def update_document(
    doc_key: str,
    body:    DocumentUpdate,
    db:      Session      = Depends(get_db),
    hr:      models.User  = Depends(require_hr),
):
    doc = db.query(models.OrgDocument).filter(
        models.OrgDocument.organisation_id == hr.organisation_id,
        models.OrgDocument.doc_key         == doc_key,
    ).first()
    if not doc:
        doc = models.OrgDocument(organisation_id=hr.organisation_id, doc_key=doc_key)
        db.add(doc)
    doc.doc_name   = body.doc_name
    doc.doc_url    = body.doc_url
    doc.updated_by = hr.id
    db.commit()
    return {"message": "Document updated"}


class DocumentUpload(BaseModel):
    pdf_base64: str


@router.post("/me/documents/{doc_key}/upload", status_code=200)
def upload_document(
    doc_key: str,
    body:    DocumentUpload,
    db:      Session      = Depends(get_db),
    hr:      models.User  = Depends(require_hr),
):
    """HR only — store a base64-encoded PDF as binary in the database."""
    try:
        pdf_bytes = base64.b64decode(body.pdf_base64)
    except Exception:
        raise HTTPException(400, "Invalid base64 data")
    if not pdf_bytes.startswith(b'%PDF'):
        raise HTTPException(400, "File does not appear to be a PDF")

    doc = db.query(models.OrgDocument).filter(
        models.OrgDocument.organisation_id == hr.organisation_id,
        models.OrgDocument.doc_key         == doc_key,
    ).first()
    if not doc:
        doc = models.OrgDocument(organisation_id=hr.organisation_id, doc_key=doc_key, doc_name=doc_key)
        db.add(doc)
    doc.doc_content = pdf_bytes
    doc.updated_by  = hr.id
    db.commit()
    return {"message": "Document uploaded", "size_bytes": len(pdf_bytes)}


@router.get("/me/documents/{doc_key}/file")
def get_document_file(
    doc_key:      str,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(get_current_user),
):
    """Any authenticated user — stream the stored PDF back."""
    org_id = current_user.organisation_id
    if not org_id:
        raise HTTPException(403, "No organisation")
    doc = db.query(models.OrgDocument).filter(
        models.OrgDocument.organisation_id == org_id,
        models.OrgDocument.doc_key         == doc_key,
    ).first()
    if not doc or not doc.doc_content:
        raise HTTPException(404, "Document not found or not yet uploaded")
    return Response(
        content      = doc.doc_content,
        media_type   = "application/pdf",
        headers      = {"Content-Disposition": f'inline; filename="{doc.doc_name}.pdf"'},
    )


# ── Superadmin: create org ────────────────────────────────────────────────────
@router.post("/", status_code=201)
def create_org(
    req: OrgCreate,
    db:  Session = Depends(get_db),
    _:   models.User = Depends(require_superadmin),
):
    if db.query(models.Organisation).filter(models.Organisation.slug == req.slug).first():
        raise HTTPException(409, f"Slug '{req.slug}' already taken")

    org = models.Organisation(
        slug          = req.slug,
        name          = req.name,
        contact_email = req.contact_email,
        contact_phone = req.contact_phone,
        address       = req.address,
        brand_name    = req.name,
        brand_colour  = "#6abf3f",
        brand_email   = req.contact_email,
        contract_employer_name    = req.name,
        contract_employer_address = req.address or "",
        contract_employer_email   = req.contact_email,
        contract_signatory_name   = f"{req.hr_first_name} {req.hr_last_name}",
        contract_signatory_role   = "Director",
        contract_min_pay          = "National Minimum Wage (NMW)",
        contract_max_pay          = "£14",
    )
    db.add(org); db.flush()

    # 30-day trial subscription
    sub = models.Subscription(
        organisation_id = org.id,
        plan            = models.SubscriptionPlan.trial,
        status          = models.SubscriptionStatus.trial,
        seat_limit      = 999,   # unlimited during trial
        trial_ends_at   = datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(sub)

    # HR admin user
    hr = models.User(
        organisation_id = org.id,
        role            = models.UserRole.hr,
        email           = req.contact_email.lower(),
        hashed_password = hash_password(req.hr_password),
        is_active       = True,
        first_name      = req.hr_first_name,
        last_name       = req.hr_last_name,
    )
    db.add(hr); db.commit(); db.refresh(org)

    return {
        "message":  f"Organisation '{org.name}' created with 30-day trial",
        "org_id":   org.id,
        "slug":     org.slug,
        "hr_email": hr.email,
        "login_url": f"/login/{org.slug}",
    }


# ── Superadmin: list all orgs ─────────────────────────────────────────────────
@router.get("/")
def list_orgs(
    db: Session = Depends(get_db),
    _:  models.User = Depends(require_superadmin),
):
    orgs = db.query(models.Organisation).order_by(models.Organisation.created_at.desc()).all()
    return [
        {
            "id":             o.id,
            "slug":           o.slug,
            "name":           o.name,
            "contact_email":  o.contact_email,
            "is_active":      o.is_active,
            "created_at":     o.created_at.isoformat() if o.created_at else None,
            "plan":           o.subscription.plan.value if o.subscription else "none",
            "status":         o.subscription.status.value if o.subscription else "none",
            "trial_ends_at":  o.subscription.trial_ends_at.isoformat() if o.subscription and o.subscription.trial_ends_at else None,
            "staff_count":    sum(1 for u in o.users if u.is_active and u.role == models.UserRole.staff),
        }
        for o in orgs
    ]
