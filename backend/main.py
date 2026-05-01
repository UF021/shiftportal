import uuid
import re
import logging
from datetime import date as _date
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import engine, Base, SessionLocal
from routers import auth, staff, registrations, timelogs, holidays, organisations, superadmin, clock, messages, applications, gps_captures, contact

log = logging.getLogger(__name__)


def _backfill_accepted_applications():
    """
    One-time idempotent migration: for every accepted JobApplication that has
    no corresponding User record (matched by email within the same org),
    create a staff User with is_active=False so they appear in Staff Records.
    Runs on every startup but only creates records that are missing.
    """
    from auth_utils import hash_password
    import models

    db = SessionLocal()
    try:
        accepted = (
            db.query(models.JobApplication)
            .filter(models.JobApplication.status == models.ApplicationStatus.accepted)
            .all()
        )
        created = 0
        for a in accepted:
            existing = db.query(models.User).filter(
                models.User.email == a.email.lower(),
            ).first()
            if existing:
                continue  # already has a record

            sia_exp_date = None
            if a.sia_expiry:
                try:
                    sia_exp_date = _date.fromisoformat(a.sia_expiry)
                except (ValueError, TypeError):
                    pass

            dob = None
            if a.date_of_birth:
                try:
                    dob = _date.fromisoformat(a.date_of_birth)
                except (ValueError, TypeError):
                    pass

            new_user = models.User(
                organisation_id = a.organisation_id,
                role            = models.UserRole.staff,
                email           = a.email.lower(),
                hashed_password = hash_password(str(uuid.uuid4())),
                is_active       = False,
                staff_id        = a.reference or 'TBC',
                title           = a.title,
                first_name      = a.first_name,
                last_name       = a.last_name,
                date_of_birth   = dob,
                nationality     = a.nationality,
                phone           = a.phone,
                address_line1   = a.address,
                ni_number       = a.ni_number.upper() if a.ni_number else None,
                sia_licence     = a.sia_licence,
                sia_expiry      = sia_exp_date,
                right_to_work   = a.right_to_work,
                nok_name        = a.nok_name,
                nok_phone       = a.nok_phone,
            )
            db.add(new_user)
            created += 1

        if created:
            db.commit()
            print(f"[MIGRATION] Created {created} staff record(s) from accepted applications", flush=True)
        else:
            print("[MIGRATION] No missing staff records — all accepted applications already have accounts", flush=True)
    except Exception as exc:
        db.rollback()
        print(f"[MIGRATION] Backfill failed: {exc}", flush=True)
    finally:
        db.close()


_PC_RE = re.compile(r'\b([A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][ABD-HJLNP-UW-Z]{2})\b', re.IGNORECASE)


def _parse_city_postcode(address: str):
    """Best-effort extraction of city and postcode from a free-text UK address."""
    if not address:
        return None, None
    parts = [p.strip() for p in re.split(r'[\n,]', address) if p.strip()]
    postcode, city = None, None
    for i, part in enumerate(parts):
        m = _PC_RE.search(part)
        if m:
            postcode = m.group(1).upper().replace(' ', '')
            postcode = postcode[:-3] + ' ' + postcode[-3:]   # format: AB1 2CD
            remainder = _PC_RE.sub('', part).strip(' ,')
            city = remainder if remainder else (parts[i - 1] if i > 0 else None)
            break
    if not city:
        city = parts[-1] if parts else None
    return city, postcode


def _migrate_application_city_postcode():
    """
    Adds city/postcode columns to job_applications if missing, then
    retrospectively parses and fills them from existing address strings.
    """
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # Add columns if they don't exist (PostgreSQL syntax)
        db.execute(text("ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS city VARCHAR(100)"))
        db.execute(text("ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS postcode VARCHAR(20)"))
        db.commit()

        # Backfill rows that have no city set yet
        import models as _models
        rows = db.execute(text("SELECT id, address FROM job_applications WHERE city IS NULL")).fetchall()
        updated = 0
        for row in rows:
            city, postcode = _parse_city_postcode(row.address or '')
            db.execute(
                text("UPDATE job_applications SET city = :city, postcode = :pc WHERE id = :id"),
                {"city": city, "pc": postcode, "id": row.id}
            )
            updated += 1
        if updated:
            db.commit()
            print(f"[MIGRATION] Backfilled city/postcode for {updated} application(s)", flush=True)
        else:
            print("[MIGRATION] Application city/postcode columns already up to date", flush=True)
    except Exception as exc:
        db.rollback()
        print(f"[MIGRATION] city/postcode migration failed: {exc}", flush=True)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_application_city_postcode()
    _backfill_accepted_applications()
    yield


app = FastAPI(
    title       = "ShiftPortal API",
    description = "Multi-tenant staff management platform",
    version     = "1.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["Auth"])
app.include_router(staff.router,         prefix="/api/staff",         tags=["Staff"])
app.include_router(registrations.router, prefix="/api/registrations", tags=["Registrations"])
app.include_router(timelogs.router,      prefix="/api/timelogs",      tags=["Timelogs"])
app.include_router(holidays.router,      prefix="/api/holidays",      tags=["Holidays"])
app.include_router(organisations.router, prefix="/api/orgs",          tags=["Organisations"])
app.include_router(superadmin.router,    prefix="/api/superadmin",    tags=["Superadmin"])
app.include_router(clock.router,         prefix="/api/clock",         tags=["Clock"])
app.include_router(messages.router,      prefix="/api/messages",      tags=["Messages"])
app.include_router(applications.router,  prefix="/api/applications",  tags=["Applications"])
app.include_router(gps_captures.router,  prefix="/api/gps-captures",  tags=["GPS Captures"])
app.include_router(contact.router,       prefix="/api/contact",       tags=["Contact"])


@app.get("/")
def root():
    return {"service": "ShiftPortal API", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
