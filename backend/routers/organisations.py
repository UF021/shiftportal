from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from ..database import get_db
from ..schemas import OrgCreate, OrgBrandingUpdate, OrgOut, SiteCreate, SiteOut
from ..auth_utils import (
    get_current_user, require_hr, require_superadmin,
    hash_password, org_guard
)
from .. import models

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


@router.post("/me/sites", response_model=SiteOut, status_code=201)
def create_site(
    req: SiteCreate,
    db:  Session = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    site = models.Site(
        organisation_id = hr.organisation_id,
        code            = req.code,
        name            = req.name,
        group           = req.group,
        address         = req.address,
    )
    db.add(site); db.commit(); db.refresh(site)
    return site


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
