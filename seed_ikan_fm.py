"""
seed_ikan_fm.py — Run ONCE after first deployment to set up:
  1. Platform superadmin account
  2. Ikan FM as the first organisation (with 30-day trial)
  3. All 22 Ikan FM sites (Showcase + Vue)
  4. HR admin account for Ikan FM

Usage:
  python seed_ikan_fm.py

Or via Railway CLI:
  railway run python seed_ikan_fm.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.database import SessionLocal, engine, Base
from backend import models
from backend.auth_utils import hash_password
from datetime import datetime, timezone, timedelta

Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("─" * 60)
print("ShiftPortal — Ikan FM Seed Script")
print("─" * 60)

# ── 1. Super-admin ────────────────────────────────────────────────────────────
SA_EMAIL    = "admin@ikanfm.co.uk"
SA_PASSWORD = "SuperAdmin2026!"   # ← CHANGE AFTER FIRST LOGIN

existing_sa = db.query(models.User).filter(models.User.email == SA_EMAIL).first()
if existing_sa:
    print(f"✓ Superadmin already exists: {SA_EMAIL}")
else:
    sa = models.User(
        organisation_id = None,
        role            = models.UserRole.superadmin,
        email           = SA_EMAIL,
        hashed_password = hash_password(SA_PASSWORD),
        is_active       = True,
        first_name      = "Festus",
        last_name       = "Akinbusoye",
    )
    db.add(sa); db.flush()
    print(f"✅ Superadmin created: {SA_EMAIL}")

# ── 2. Ikan FM Organisation ───────────────────────────────────────────────────
ORG_SLUG  = "ikan-fm"
ORG_NAME  = "Ikan Facilities Management Limited"
HR_EMAIL  = "hr@ikanfm.co.uk"
HR_PASS   = "IkanFM2026!"   # ← CHANGE AFTER FIRST LOGIN

existing_org = db.query(models.Organisation).filter(models.Organisation.slug == ORG_SLUG).first()
if existing_org:
    print(f"✓ Organisation already exists: {ORG_SLUG}")
    org = existing_org
else:
    org = models.Organisation(
        slug          = ORG_SLUG,
        name          = ORG_NAME,
        contact_email = HR_EMAIL,
        contact_phone = "0845 539 5330",
        address       = "Regus House, Fairbourne Drive, Atterbury, Milton Keynes MK10 9RG",
        brand_name    = "Ikan Facilities Management",
        brand_colour  = "#6abf3f",
        brand_email   = HR_EMAIL,
        contract_employer_name    = ORG_NAME,
        contract_employer_address = "Regus House, Fairbourne Drive, Atterbury, Milton Keynes MK10 9RG",
        contract_employer_email   = HR_EMAIL,
        contract_employer_phone   = "0845 539 5330",
        contract_signatory_name   = "Festus Akinbusoye",
        contract_signatory_role   = "Director",
        contract_min_pay          = "National Minimum Wage (NMW)",
        contract_max_pay          = "£14",
        is_active     = True,
    )
    db.add(org); db.flush()
    print(f"✅ Organisation created: {ORG_NAME}")

# ── 3. Subscription (30-day trial, unlimited seats) ───────────────────────────
existing_sub = db.query(models.Subscription).filter(models.Subscription.organisation_id == org.id).first()
if existing_sub:
    print(f"✓ Subscription already exists for {ORG_SLUG}")
else:
    sub = models.Subscription(
        organisation_id = org.id,
        plan            = models.SubscriptionPlan.trial,
        status          = models.SubscriptionStatus.trial,
        seat_limit      = 9999,
        trial_ends_at   = datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(sub)
    print(f"✅ 30-day trial subscription created")

# ── 4. HR Admin ───────────────────────────────────────────────────────────────
existing_hr = db.query(models.User).filter(models.User.email == HR_EMAIL).first()
if existing_hr:
    print(f"✓ HR admin already exists: {HR_EMAIL}")
else:
    hr = models.User(
        organisation_id = org.id,
        role            = models.UserRole.hr,
        email           = HR_EMAIL,
        hashed_password = hash_password(HR_PASS),
        is_active       = True,
        first_name      = "Festus",
        last_name       = "Akinbusoye",
    )
    db.add(hr)
    print(f"✅ HR admin created: {HR_EMAIL}")

# ── 5. Sites ─────────────────────────────────────────────────────────────────
SITES = [
    # Showcase cinemas
    ("sc-avonmeads",    "Showcase Avonmeads",                    "Showcase",  "Avonmeads Retail Park, Bristol BS2 0SP"),
    ("sc-bluewater",    "Showcase Bluewater",                    "Showcase",  "Bluewater Shopping Centre, Greenhithe DA9 9SJ"),
    ("sc-cardiff",      "Showcase Cardiff",                      "Showcase",  "Nantgarw Rd, Cardiff CF15 7QQ"),
    ("sc-reading",      "Showcase Reading",                      "Showcase",  "Loddon Bridge Rd, Reading RG5 4XZ"),
    ("sc-teeside",      "Showcase Teeside",                      "Showcase",  "Xscape, Middlesbrough TS3 8BX"),
    ("sc-southampton",  "Showcase Southampton",                  "Showcase",  "West Quay, Southampton SO15 1GH"),
    # Vue cinemas
    ("vc-dagenham",     "Vue Cinema — Dagenham",                 "Vue",       "Dagenham Leisure Park, RM10 7XL"),
    ("vc-purley",       "Vue Cinema — Purley Way",               "Vue",       "Grants Retail Park, Croydon CR0 4UZ"),
    ("vc-finchley",     "Vue Cinema — Finchley North",           "Vue",       "Great North Leisure Park, N12 0GL"),
    ("vc-woodgreen",    "Vue Cinema — Wood Green",               "Vue",       "The Mall, Wood Green N22 6YQ"),
    ("vc-starcity",     "Vue Cinema — Star City Birmingham",     "Vue",       "Watson Rd, Birmingham B7 5SA"),
    ("vc-harrow",       "Vue Cinema — Harrow",                   "Vue",       "St George's Shopping Centre, HA1 1HS"),
    ("vc-leeds",        "Vue Cinema — Leeds Kirkstall",          "Vue",       "Kirkstall Bridge, Leeds LS5 3BF"),
    ("vc-islington",    "Vue Cinema — Islington",                "Vue",       "Islington Square, N1 1TA"),
    ("vc-thurrock",     "Vue Cinema — Thurrock",                 "Vue",       "Lakeside Retail Park, RM20 2ZP"),
    ("vc-cribbs",       "Vue Cinema — Cribbs Causeway Bristol",  "Vue",       "The Mall at Cribbs Causeway, BS34 5DG"),
    ("vc-doncaster",    "Vue Cinema — Doncaster",                "Vue",       "Frenchgate, Doncaster DN1 1QT"),
    ("vc-whitecity",    "Vue Cinema — Westfield White City",     "Vue",       "Westfield London, W12 7GF"),
    ("vc-shepherds",    "Vue Cinema — Shepherds Bush",           "Vue",       "Westfield London W12 8PP"),
    ("vc-stratford",    "Vue Cinema — Westfield Stratford",      "Vue",       "Westfield Stratford City E20 1EJ"),
    ("vc-nottingham",   "Vue Cinema — Nottingham",               "Vue",       "The Corner House, NG1 4DB"),
    ("other",           "Other",                                 "Other",     ""),
]

added_sites = 0
for code, name, group, address in SITES:
    existing = db.query(models.Site).filter(
        models.Site.organisation_id == org.id,
        models.Site.code == code,
    ).first()
    if not existing:
        db.add(models.Site(
            organisation_id = org.id,
            code    = code,
            name    = name,
            group   = group,
            address = address,
            is_active = True,
        ))
        added_sites += 1

print(f"✅ {added_sites} new sites added ({len(SITES) - added_sites} already existed)")

# ── Commit ────────────────────────────────────────────────────────────────────
db.commit()
db.close()

print()
print("─" * 60)
print("Seed complete! Summary:")
print(f"  Superadmin:  {SA_EMAIL} / {SA_PASSWORD}")
print(f"  HR Login:    {HR_EMAIL} / {HR_PASS}")
print(f"  Portal:      /login/{ORG_SLUG}")
print(f"  Register:    /register/{ORG_SLUG}")
print()
print("⚠️  Change both passwords immediately after first login!")
print("─" * 60)
