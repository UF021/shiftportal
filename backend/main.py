import uuid
import re
import logging
import pytz
from datetime import date as _date
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import engine, Base, SessionLocal
from routers import auth, staff, registrations, timelogs, holidays, organisations, superadmin, clock, messages, applications, gps_captures, contact, incidents
from scheduled import send_lateness_warnings

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


# Strict UK postcode pattern
_PC_RE = re.compile(r'\b([A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][ABD-HJLNP-UW-Z]{2})\b', re.IGNORECASE)
# Lenient pattern: catches partial/malformed postcodes like "SW1" or "E1 2"
_PC_LOOSE = re.compile(r'\b([A-Z]{1,2}[0-9R][0-9A-Z]?(?:\s?[0-9][A-Z]{0,2})?)\b', re.IGNORECASE)


def _parse_city_postcode(address: str):
    """Best-effort extraction of city and postcode from a free-text UK address."""
    if not address:
        return None, None

    # Normalise: split on newlines and commas
    parts = [p.strip() for p in re.split(r'[\n,]', address) if p.strip()]
    if not parts:
        return None, None

    postcode, city = None, None

    # 1. Try strict postcode regex across all parts
    for i, part in enumerate(parts):
        m = _PC_RE.search(part)
        if m:
            raw = m.group(1).upper().replace(' ', '')
            postcode = raw[:-3] + ' ' + raw[-3:]   # format: AB1 2CD
            remainder = _PC_RE.sub('', part).strip(' ,')
            city = remainder if remainder else (parts[i - 1] if i > 0 else None)
            break

    # 2. If strict match failed, check if the last part looks like a postcode alone
    if not postcode:
        last = parts[-1]
        m = _PC_RE.search(last)
        if m:
            raw = m.group(1).upper().replace(' ', '')
            postcode = raw[:-3] + ' ' + raw[-3:]
            city = parts[-2] if len(parts) >= 2 else None

    # 3. Derive city from address structure if still missing
    if not city:
        # Take second-to-last segment as city if there are multiple parts
        if len(parts) >= 2:
            city = parts[-2] if postcode else parts[-1]
        else:
            city = parts[0]

    # 4. Clean up: strip digits-only or very short garbage values
    if city and (city.isdigit() or len(city) <= 1):
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
        db.execute(text("ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS area_of_employment VARCHAR(200)"))
        db.execute(text("ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS commute_method VARCHAR(100)"))
        db.execute(text("ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS employment_history TEXT"))
        db.commit()

        # Backfill city/postcode for all rows missing either field
        rows = db.execute(text("SELECT id, address, city, postcode FROM job_applications WHERE city IS NULL OR postcode IS NULL")).fetchall()
        updated = 0
        for row in rows:
            city, postcode = _parse_city_postcode(row.address or '')
            db.execute(
                text("UPDATE job_applications SET city = COALESCE(city, :city), postcode = COALESCE(postcode, :pc) WHERE id = :id"),
                {"city": city, "pc": postcode, "id": row.id}
            )
            updated += 1
        if updated:
            db.commit()
            print(f"[MIGRATION] Backfilled city/postcode for {updated} application(s)", flush=True)
        else:
            print("[MIGRATION] Application city/postcode already populated", flush=True)
    except Exception as exc:
        db.rollback()
        print(f"[MIGRATION] city/postcode migration failed: {exc}", flush=True)
    finally:
        db.close()


def _fix_bst_shift_minutes():
    """
    One-time fix: recalculate shift_minutes for clock_out events where the
    duration was under-counted by 1 hour due to the BST timezone bug.
    Affects clock_out events where the matching clock_in occurred during BST
    (UK offset = UTC+1) and had a scheduled_start set.
    Safe to re-run — only updates rows where recalculation changes the value.
    """
    import models as _models
    import pytz
    from datetime import timedelta

    UK_TZ = pytz.timezone('Europe/London')

    def effective_start_uk(clock_in_uk, scheduled_start):
        if not scheduled_start:
            return clock_in_uk
        try:
            h, m = map(int, scheduled_start.split(':'))
        except (ValueError, AttributeError):
            return clock_in_uk
        sched = clock_in_uk.replace(hour=h, minute=m, second=0, microsecond=0)
        return max(clock_in_uk, sched)

    db = SessionLocal()
    try:
        # Fetch all clock_out events that have shift_minutes set
        clock_outs = (
            db.query(_models.ClockEvent)
            .filter(
                _models.ClockEvent.event_type    == _models.ClockEventType.clock_out,
                _models.ClockEvent.shift_minutes != None,
            )
            .all()
        )

        fixed = 0
        for co in clock_outs:
            # Find the matching clock_in (most recent clock_in before this clock_out for same user)
            ci = (
                db.query(_models.ClockEvent)
                .filter(
                    _models.ClockEvent.user_id    == co.user_id,
                    _models.ClockEvent.event_type == _models.ClockEventType.clock_in,
                    _models.ClockEvent.timestamp  < co.timestamp,
                )
                .order_by(_models.ClockEvent.timestamp.desc())
                .first()
            )
            if not ci or not ci.scheduled_start:
                continue

            # Only fix shifts where clock-in was during BST (UTC+1)
            ci_uk = ci.timestamp.astimezone(UK_TZ)
            if ci_uk.utcoffset().total_seconds() != 3600:
                continue  # GMT period — not affected by the bug

            co_uk = co.timestamp.astimezone(UK_TZ)
            eff_start = effective_start_uk(ci_uk, ci.scheduled_start)

            # Handle overnight shifts
            if co_uk < eff_start:
                co_uk += timedelta(days=1)

            correct_mins = int((co_uk - eff_start).total_seconds() / 60)

            if correct_mins != co.shift_minutes:
                co.shift_minutes = correct_mins
                fixed += 1

        if fixed:
            db.commit()
            print(f"[MIGRATION] Fixed BST shift_minutes for {fixed} clock_out event(s)", flush=True)
        else:
            print("[MIGRATION] No BST shift_minutes corrections needed", flush=True)
    except Exception as exc:
        db.rollback()
        print(f"[MIGRATION] BST shift fix failed: {exc}", flush=True)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_application_city_postcode()
    _backfill_accepted_applications()
    _fix_bst_shift_minutes()

    # ── Weekly lateness warning emails — every Monday 08:00 UK time ──────────
    scheduler = BackgroundScheduler(timezone=pytz.timezone('Europe/London'))
    scheduler.add_job(
        send_lateness_warnings,
        CronTrigger(day_of_week='mon', hour=8, minute=0, timezone=pytz.timezone('Europe/London')),
        id='lateness_warnings',
        replace_existing=True,
    )
    scheduler.start()

    # Run immediately on this deploy to catch this coming Monday retrospectively
    import threading
    threading.Thread(target=send_lateness_warnings, daemon=True).start()

    yield
    scheduler.shutdown(wait=False)


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
app.include_router(incidents.router,     prefix="/api/incidents",     tags=["Incidents"])


@app.get("/")
def root():
    return {"service": "ShiftPortal API", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
