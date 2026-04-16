from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from database import get_db
from schemas import LoginRequest, TokenOut, RegisterRequest, UserProfile
from auth_utils import verify_password, hash_password, create_token, get_current_user
import models

router = APIRouter()


@router.post("/login", response_model=TokenOut)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.email == req.email.lower()
    ).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account is pending HR approval. You will be notified by email once activated."
        )

    org = user.organisation
    return TokenOut(
        access_token = create_token(user.id, user.organisation_id, user.role.value),
        role         = user.role.value,
        user_id      = user.id,
        org_id       = user.organisation_id,
        name         = user.full_name,
        org_slug     = org.slug if org else None,
    )


@router.post("/register", status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Resolve organisation by slug
    org = db.query(models.Organisation).filter(
        models.Organisation.slug == req.org_slug,
        models.Organisation.is_active == True,
    ).first()
    if not org:
        raise HTTPException(404, f"Organisation '{req.org_slug}' not found or inactive")

    # Check seat limit
    active_count = db.query(models.User).filter(
        models.User.organisation_id == org.id,
        models.User.is_active == True,
        models.User.role == models.UserRole.staff,
    ).count()
    if org.subscription and active_count >= org.subscription.seat_limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"This organisation has reached its staff seat limit ({org.subscription.seat_limit}). "
            "Please contact your HR administrator."
        )

    # Email uniqueness
    if db.query(models.User).filter(models.User.email == req.email.lower()).first():
        raise HTTPException(409, "An account with this email address already exists")

    user = models.User(
        organisation_id   = org.id,
        role              = models.UserRole.staff,
        email             = req.email.lower(),
        hashed_password   = hash_password(req.password),
        is_active         = False,
        staff_id          = "TBC",
        title             = req.title,
        first_name        = req.first_name,
        last_name         = req.last_name,
        date_of_birth     = req.date_of_birth,
        nationality       = req.nationality,
        phone             = req.phone,
        address_line1     = req.address_line1,
        address_line2     = req.address_line2,
        city              = req.city,
        postcode          = req.postcode,
        ni_number         = req.ni_number.upper() if req.ni_number else None,
        right_to_work     = req.right_to_work,
        sia_licence       = req.sia_licence,
        sia_expiry        = req.sia_expiry,
        nok_name          = req.nok_name,
        nok_phone         = req.nok_phone,
        nok_relation      = req.nok_relation,
        decl_policy       = req.decl_policy,
        decl_portal       = req.decl_portal,
        decl_line_manager = req.decl_line_manager,
        decl_pay_schedule = req.decl_pay_schedule,
        decl_trained      = req.decl_trained,
        decl_accurate     = req.decl_accurate,
        decl_contact      = req.decl_contact,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Registration submitted. HR will review and activate your account.",
        "id":    user.id,
        "email": user.email,
        "org":   org.name,
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    org = current_user.organisation
    return {
        "id":                    current_user.id,
        "organisation_id":       current_user.organisation_id,
        "role":                  current_user.role.value,
        "email":                 current_user.email,
        "staff_id":              current_user.staff_id,
        "title":                 current_user.title,
        "first_name":            current_user.first_name,
        "last_name":             current_user.last_name,
        "full_name":             current_user.full_name,
        "date_of_birth":         str(current_user.date_of_birth) if current_user.date_of_birth else None,
        "nationality":           current_user.nationality,
        "phone":                 current_user.phone,
        "full_address":          current_user.full_address,
        "address_line1":         current_user.address_line1,
        "address_line2":         current_user.address_line2,
        "city":                  current_user.city,
        "postcode":              current_user.postcode,
        "employment_start_date": str(current_user.employment_start_date) if current_user.employment_start_date else None,
        "pay_rate":              current_user.pay_rate,
        "ni_number":             current_user.ni_number,
        "sia_licence":           current_user.sia_licence,
        "sia_expiry":            str(current_user.sia_expiry) if current_user.sia_expiry else None,
        "right_to_work":         current_user.right_to_work,
        "nok_name":              current_user.nok_name,
        "nok_phone":             current_user.nok_phone,
        "nok_relation":          current_user.nok_relation,
        "is_active":             current_user.is_active,
        "registered_at":         current_user.registered_at.isoformat() if current_user.registered_at else None,
        # Org branding passed down for contract/UI
        "org_name":              org.brand_name or org.name if org else None,
        "org_colour":            org.brand_colour if org else "#6abf3f",
        "org_logo_url":          org.brand_logo_url if org else None,
        "org_email":             org.brand_email or org.contact_email if org else None,
        "org_slug":              org.slug if org else None,
        "contract_employer_name":    org.contract_employer_name if org else None,
        "contract_employer_address": org.contract_employer_address if org else None,
        "contract_signatory_name":   org.contract_signatory_name if org else None,
        "contract_signatory_role":   org.contract_signatory_role if org else None,
        "contract_min_pay":          org.contract_min_pay if org else "NMW",
        "contract_max_pay":          org.contract_max_pay if org else "£14",
    }


@router.get("/pre-registration/{token}")
def get_pre_registration(token: str, db: Session = Depends(get_db)):
    """Public — return pre-filled details for a registration invite token."""
    rec = db.query(models.PreRegistration).filter(
        models.PreRegistration.token == token,
        models.PreRegistration.used  == False,
    ).first()
    if not rec:
        raise HTTPException(404, "Registration link is invalid or has already been used")
    return {
        "email":          rec.email,
        "first_name":     rec.first_name,
        "last_name":      rec.last_name,
        "date_of_birth":  rec.date_of_birth,
        "address":        rec.address,
        "phone":          rec.phone,
        "ni_number":      rec.ni_number,
        "sia_licence":    rec.sia_licence,
        "sia_expiry":     rec.sia_expiry,
        "nok_name":       rec.nok_name,
        "nok_phone":      rec.nok_phone,
    }


@router.get("/org/{slug}")
def get_org_public(slug: str, db: Session = Depends(get_db)):
    """Public endpoint — returns branding for login/register pages."""
    org = db.query(models.Organisation).filter(
        models.Organisation.slug == slug,
        models.Organisation.is_active == True,
    ).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    return {
        "slug":       org.slug,
        "name":       org.brand_name or org.name,
        "colour":     org.brand_colour or "#6abf3f",
        "logo_url":   org.brand_logo_url,
        "email":      org.brand_email or org.contact_email,
    }
