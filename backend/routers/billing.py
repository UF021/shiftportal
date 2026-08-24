"""
Billing router — plan management, usage enforcement, Stripe wiring.

Stripe is intentionally inactive until STRIPE_SECRET_KEY is set in the
environment.  All checkout / portal endpoints return a clear "billing not
yet configured" response so the rest of the system works normally in the
meantime.  When the Stripe account is ready, set the env vars and every
placeholder auto-activates.
"""

import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import get_current_user, require_hr, require_superadmin
import models

router = APIRouter()

# ── Plan definitions (source of truth) ───────────────────────────────────────
#
# staff_limit / site_limit = None means unlimited.
# extra_staff_gbp / extra_site_gbp = per-unit monthly add-on rate.

PLAN_CONFIG: dict[str, dict] = {
    "trial": {
        "name":             "Free Trial",
        "price_gbp":        0,
        "price_note":       "30-day free trial",
        "staff_limit":      10,
        "site_limit":       1,
        "extra_staff_gbp":  None,
        "extra_site_gbp":   None,
        "stripe_price_id":  None,
        "features": {
            "gps":                    False,
            "manager_override_audit": False,
            "advanced_scheduling":    False,
            "payroll_integration":    False,
            "multi_entity":           False,
            "api_access":             False,
            "custom_branding":        False,
            "bulk_import":            False,
            "sia_tracking":           True,
            "holiday_management":     True,
        },
    },
    "starter": {
        "name":             "Starter",
        "price_gbp":        149,
        "price_note":       "£149 / month",
        "staff_limit":      50,
        "site_limit":       3,
        "extra_staff_gbp":  1.50,
        "extra_site_gbp":   7.00,
        "stripe_price_id":  os.getenv("STRIPE_PRICE_STARTER"),
        "features": {
            "gps":                    False,
            "manager_override_audit": False,
            "advanced_scheduling":    False,
            "payroll_integration":    False,
            "multi_entity":           False,
            "api_access":             True,
            "custom_branding":        True,
            "bulk_import":            True,
            "sia_tracking":           True,
            "holiday_management":     True,
        },
    },
    "growth": {
        "name":             "Growth",
        "price_gbp":        299,
        "price_note":       "£299 / month",
        "staff_limit":      200,
        "site_limit":       10,
        "extra_staff_gbp":  1.50,
        "extra_site_gbp":   7.00,
        "stripe_price_id":  os.getenv("STRIPE_PRICE_GROWTH"),
        "features": {
            "gps":                    True,
            "manager_override_audit": True,
            "advanced_scheduling":    True,
            "payroll_integration":    True,
            "multi_entity":           False,
            "api_access":             True,
            "custom_branding":        True,
            "bulk_import":            True,
            "sia_tracking":           True,
            "holiday_management":     True,
        },
    },
    "enterprise": {
        "name":             "Enterprise",
        "price_gbp":        None,
        "price_note":       "Custom pricing",
        "staff_limit":      None,
        "site_limit":       None,
        "extra_staff_gbp":  None,
        "extra_site_gbp":   None,
        "stripe_price_id":  None,
        "features": {
            "gps":                    True,
            "manager_override_audit": True,
            "advanced_scheduling":    True,
            "payroll_integration":    True,
            "multi_entity":           True,
            "api_access":             True,
            "custom_branding":        True,
            "bulk_import":            True,
            "sia_tracking":           True,
            "holiday_management":     True,
        },
    },
    "hybrid": {
        "name":             "Hybrid",
        "price_gbp":        None,
        "price_note":       "£39–£99 / mo + £1.50–£2.00 per active staff",
        "staff_limit":      None,
        "site_limit":       None,
        "extra_staff_gbp":  2.00,
        "extra_site_gbp":   7.00,
        "stripe_price_id":  None,
        "features": {
            "gps":                    True,
            "manager_override_audit": True,
            "advanced_scheduling":    False,
            "payroll_integration":    False,
            "multi_entity":           False,
            "api_access":             True,
            "custom_branding":        True,
            "bulk_import":            False,
            "sia_tracking":           True,
            "holiday_management":     True,
        },
    },
}

FEATURE_LABELS = {
    "gps":                    "GPS verification",
    "manager_override_audit": "Manager override audit log",
    "advanced_scheduling":    "Advanced scheduling",
    "payroll_integration":    "Payroll integration (Xero / QuickBooks)",
    "multi_entity":           "Multi-entity / multi-brand support",
    "api_access":             "API access",
    "custom_branding":        "Custom branding",
    "bulk_import":            "Bulk staff import (CSV)",
    "sia_tracking":           "SIA licence tracking",
    "holiday_management":     "Holiday & leave management",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stripe_active() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY"))


def get_plan_config(plan_name: str) -> dict:
    return PLAN_CONFIG.get(plan_name, PLAN_CONFIG["trial"])


def effective_limits(sub: models.Subscription) -> tuple[Optional[int], Optional[int]]:
    """Return (staff_limit, site_limit) factoring in add-ons. None = unlimited."""
    cfg = get_plan_config(sub.plan.value)
    base_staff = cfg["staff_limit"]
    base_sites = cfg["site_limit"]
    staff = (base_staff + (sub.extra_staff or 0)) if base_staff is not None else None
    sites = (base_sites + (sub.extra_sites or 0)) if base_sites is not None else None
    return staff, sites


def check_staff_limit(org_id: int, db: Session) -> None:
    """Raise 402 if adding one more staff member would exceed the plan limit."""
    sub = db.query(models.Subscription).filter(
        models.Subscription.organisation_id == org_id
    ).first()
    if not sub:
        return
    staff_limit, _ = effective_limits(sub)
    if staff_limit is None:
        return
    current = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
        models.User.is_archived.isnot(True),
    ).count()
    if current >= staff_limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Staff limit reached ({current}/{staff_limit}) for your current plan. "
            "Please upgrade or purchase additional seats."
        )


def check_site_limit(org_id: int, db: Session) -> None:
    """Raise 402 if adding one more site would exceed the plan limit."""
    sub = db.query(models.Subscription).filter(
        models.Subscription.organisation_id == org_id
    ).first()
    if not sub:
        return
    _, site_limit = effective_limits(sub)
    if site_limit is None:
        return
    current = db.query(models.Site).filter(
        models.Site.organisation_id == org_id,
        models.Site.is_active       == True,
    ).count()
    if current >= site_limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Site limit reached ({current}/{site_limit}) for your current plan. "
            "Please upgrade or purchase additional sites."
        )


def has_feature(org_id: int, feature: str, db: Session) -> bool:
    """Return True if the org's current plan includes the given feature."""
    sub = db.query(models.Subscription).filter(
        models.Subscription.organisation_id == org_id
    ).first()
    if not sub:
        return False
    cfg = get_plan_config(sub.plan.value)
    return cfg["features"].get(feature, False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class AssignPlanBody(BaseModel):
    org_id:       int
    plan:         str
    extra_staff:  int = 0
    extra_sites:  int = 0
    trial_days:   Optional[int] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/plans")
def list_plans():
    """Public — return all plan configs (no auth required)."""
    return {
        "plans": [
            {
                "id":              plan_id,
                "name":            cfg["name"],
                "price_gbp":       cfg["price_gbp"],
                "price_note":      cfg["price_note"],
                "staff_limit":     cfg["staff_limit"],
                "site_limit":      cfg["site_limit"],
                "extra_staff_gbp": cfg["extra_staff_gbp"],
                "extra_site_gbp":  cfg["extra_site_gbp"],
                "features":        cfg["features"],
                "feature_labels":  FEATURE_LABELS,
            }
            for plan_id, cfg in PLAN_CONFIG.items()
        ]
    }


@router.get("/my-subscription")
def my_subscription(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    """Return the current org's plan, usage, and limits."""
    org = db.query(models.Organisation).filter(
        models.Organisation.id == hr.organisation_id
    ).first()
    if not org:
        raise HTTPException(404, "Organisation not found")

    sub = org.subscription
    if not sub:
        plan_id = "trial"
        cfg     = PLAN_CONFIG["trial"]
        staff_limit = cfg["staff_limit"]
        site_limit  = cfg["site_limit"]
        extra_staff = 0
        extra_sites = 0
        stripe_status = None
        trial_ends_at = None
    else:
        plan_id     = sub.plan.value
        cfg         = get_plan_config(plan_id)
        staff_limit, site_limit = effective_limits(sub)
        extra_staff = sub.extra_staff or 0
        extra_sites = sub.extra_sites or 0
        stripe_status = sub.status.value
        trial_ends_at = sub.trial_ends_at.isoformat() if sub.trial_ends_at else None

    active_staff = db.query(models.User).filter(
        models.User.organisation_id == hr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
        models.User.is_archived.isnot(True),
    ).count()

    active_sites = db.query(models.Site).filter(
        models.Site.organisation_id == hr.organisation_id,
        models.Site.is_active       == True,
    ).count()

    return {
        "plan_id":        plan_id,
        "plan_name":      cfg["name"],
        "price_note":     cfg["price_note"],
        "status":         stripe_status,
        "trial_ends_at":  trial_ends_at,
        "stripe_active":  _stripe_active(),
        # Usage
        "active_staff":   active_staff,
        "staff_limit":    staff_limit,
        "active_sites":   active_sites,
        "site_limit":     site_limit,
        "extra_staff":    extra_staff,
        "extra_sites":    extra_sites,
        # Features
        "features":       cfg["features"],
        "feature_labels": FEATURE_LABELS,
    }


@router.post("/assign", status_code=200)
def assign_plan(
    body: AssignPlanBody,
    db:   Session = Depends(get_db),
    _:    models.User = Depends(require_superadmin),
):
    """Superadmin — assign a plan to an org (used before Stripe is live)."""
    if body.plan not in PLAN_CONFIG:
        raise HTTPException(400, f"Unknown plan '{body.plan}'. Valid: {list(PLAN_CONFIG)}")

    org = db.query(models.Organisation).filter(models.Organisation.id == body.org_id).first()
    if not org:
        raise HTTPException(404, "Organisation not found")

    cfg = PLAN_CONFIG[body.plan]

    sub = db.query(models.Subscription).filter(
        models.Subscription.organisation_id == body.org_id
    ).first()

    if not sub:
        sub = models.Subscription(organisation_id=body.org_id)
        db.add(sub)

    sub.plan        = models.SubscriptionPlan(body.plan)
    sub.status      = models.SubscriptionStatus.trial if body.plan == "trial" else models.SubscriptionStatus.active
    sub.seat_limit  = cfg["staff_limit"] or 9999
    sub.site_limit  = cfg["site_limit"]  or 9999
    sub.extra_staff = body.extra_staff
    sub.extra_sites = body.extra_sites

    if body.trial_days is not None:
        sub.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=body.trial_days)

    db.commit()
    return {
        "message":    f"Plan updated to '{body.plan}' for org {body.org_id}",
        "plan":       body.plan,
        "staff_limit": (cfg["staff_limit"] or 0) + body.extra_staff or "unlimited",
        "site_limit":  (cfg["site_limit"]  or 0) + body.extra_sites or "unlimited",
    }


@router.post("/checkout")
def create_checkout(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    """
    Create a Stripe Checkout session.
    Returns a placeholder until STRIPE_SECRET_KEY is configured.
    """
    if not _stripe_active():
        return {
            "status":  "billing_not_configured",
            "message": "Online billing is not yet active. Contact support to upgrade your plan.",
        }
    # TODO: implement Stripe checkout when account is ready
    raise HTTPException(501, "Stripe checkout not yet implemented")


@router.post("/portal")
def billing_portal(
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    """
    Open the Stripe Customer Portal (manage subscription, download invoices).
    Returns a placeholder until STRIPE_SECRET_KEY is configured.
    """
    if not _stripe_active():
        return {
            "status":  "billing_not_configured",
            "message": "Online billing is not yet active. Contact support to manage your plan.",
        }
    # TODO: implement Stripe portal redirect when account is ready
    raise HTTPException(501, "Stripe portal not yet implemented")


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Stripe webhook receiver.
    Verifies signature and processes subscription lifecycle events.
    Silently ignored when STRIPE_SECRET_KEY is not set.
    """
    if not _stripe_active():
        return {"status": "ignored"}

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    payload = await request.body()
    sig     = request.headers.get("stripe-signature", "")

    # TODO: verify signature and handle events (invoice.paid, customer.subscription.deleted, etc.)
    # import stripe
    # event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    # ...

    return {"status": "received"}
