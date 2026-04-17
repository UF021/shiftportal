"""
Multi-tenant data model.

Isolation strategy: every table that contains customer data has an
organisation_id foreign key.  The API layer enforces this at the
query level — users can only see rows that belong to their org.

Hierarchy:
  Organisation  (one per business — Ikan FM, Client Co, etc.)
    └── Sites           (locations: Star City, Harrow, etc.)
    └── Users           (HR admins + staff members)
        └── Timelogs    (shift records)
        └── Holidays    (leave requests)
    └── OrgSettings     (branding: logo, colours, contract header)
    └── Subscription    (plan, seats, billing status)

Super-admin users have organisation_id = NULL and can see everything.
"""

import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime,
    Float, Text, LargeBinary, ForeignKey, Enum as SAEnum, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


# ── Enumerations ─────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    superadmin = "superadmin"   # platform owner
    hr         = "hr"           # org HR admin
    staff      = "staff"        # security officer


class RegistrationStatus(str, enum.Enum):
    pending  = "pending"
    active   = "active"
    rejected = "rejected"


class HolidayStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"


class SubscriptionPlan(str, enum.Enum):
    trial      = "trial"       # 30-day free trial
    starter    = "starter"     # £49/mo — up to 25 staff
    growth     = "growth"      # £99/mo — up to 75 staff
    enterprise = "enterprise"  # £199/mo — unlimited


class SubscriptionStatus(str, enum.Enum):
    active    = "active"
    trial     = "trial"
    past_due  = "past_due"
    cancelled = "cancelled"


# ── Organisation ──────────────────────────────────────────────────────────────

class Organisation(Base):
    __tablename__ = "organisations"

    id              = Column(Integer, primary_key=True, index=True)
    slug            = Column(String(80), unique=True, index=True, nullable=False)
    # e.g. "ikan-fm" → portal.ikanfm.co.uk or app.shiftportal.co.uk/ikan-fm

    name            = Column(String(200), nullable=False)
    contact_email   = Column(String(255), nullable=False)
    contact_phone   = Column(String(30), nullable=True)
    address         = Column(String(500), nullable=True)

    # Branding (white-label)
    brand_name      = Column(String(200), nullable=True)   # defaults to name
    brand_logo_url  = Column(String(500), nullable=True)
    brand_colour    = Column(String(7),   nullable=True, default="#6abf3f")
    brand_email     = Column(String(255), nullable=True)   # hr@ikanfm.co.uk

    # Contract template fields (org-level, not per-staff)
    contract_employer_name    = Column(String(200), nullable=True)
    contract_employer_address = Column(String(500), nullable=True)
    contract_employer_email   = Column(String(255), nullable=True)
    contract_employer_phone   = Column(String(30),  nullable=True)
    contract_signatory_name   = Column(String(200), nullable=True)
    contract_signatory_role   = Column(String(100), nullable=True)
    contract_min_pay          = Column(String(50),  nullable=True, default="National Minimum Wage (NMW)")
    contract_max_pay          = Column(String(50),  nullable=True, default="£14")

    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    users           = relationship("User",         back_populates="organisation", cascade="all, delete")
    sites           = relationship("Site",         back_populates="organisation", cascade="all, delete")
    subscription    = relationship("Subscription", back_populates="organisation", uselist=False)


# ── Subscription ──────────────────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), unique=True)

    plan            = Column(SAEnum(SubscriptionPlan), default=SubscriptionPlan.trial)
    status          = Column(SAEnum(SubscriptionStatus), default=SubscriptionStatus.trial)
    seat_limit      = Column(Integer, default=25)      # max active staff
    trial_ends_at   = Column(DateTime(timezone=True), nullable=True)

    # Stripe
    stripe_customer_id      = Column(String(100), nullable=True)
    stripe_subscription_id  = Column(String(100), nullable=True)

    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    organisation    = relationship("Organisation", back_populates="subscription")


# ── Site ──────────────────────────────────────────────────────────────────────

class Site(Base):
    __tablename__ = "sites"

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)

    code            = Column(String(80),  nullable=False)   # "vc-harrow"
    name            = Column(String(200), nullable=False)   # "Vue Cinema — Harrow"
    group           = Column(String(100), nullable=True)    # "Vue" / "Showcase"
    address         = Column(String(300), nullable=True)
    site_lat        = Column(Float, nullable=True)
    site_lng        = Column(Float, nullable=True)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    organisation    = relationship("Organisation", back_populates="sites")
    timelogs        = relationship("Timelog", back_populates="site_obj")


# ── User (staff + HR) ─────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=True)
    # NULL organisation_id = superadmin

    role            = Column(SAEnum(UserRole), default=UserRole.staff, nullable=False)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active       = Column(Boolean, default=False)  # False until HR activates

    # HR-assigned
    staff_id        = Column(String(30), nullable=True, default="TBC")
    employment_start_date = Column(Date, nullable=True)
    pay_rate        = Column(Float, nullable=True)
    assigned_site_id= Column(Integer, ForeignKey("sites.id"), nullable=True)

    # Personal (from registration)
    title           = Column(String(10),  nullable=True)
    first_name      = Column(String(100), nullable=False)
    last_name       = Column(String(100), nullable=False)
    date_of_birth   = Column(Date,        nullable=True)
    nationality     = Column(String(100), nullable=True)
    phone           = Column(String(30),  nullable=True)
    address_line1   = Column(String(200), nullable=True)
    address_line2   = Column(String(200), nullable=True)
    city            = Column(String(100), nullable=True)
    postcode        = Column(String(20),  nullable=True)

    # Employment documents
    ni_number       = Column(String(20),  nullable=True)
    sia_licence     = Column(String(50),  nullable=True)
    sia_expiry      = Column(Date,        nullable=True)
    right_to_work   = Column(Boolean,     default=True)

    # Multi-site assignments (comma-separated site names)
    assigned_sites  = Column(Text, nullable=True)

    # Next of kin
    nok_name        = Column(String(200), nullable=True)
    nok_phone       = Column(String(30),  nullable=True)
    nok_relation    = Column(String(100), nullable=True)

    # Declarations
    decl_policy       = Column(Boolean, default=False)
    decl_portal       = Column(Boolean, default=False)
    decl_line_manager = Column(Boolean, default=False)
    decl_pay_schedule = Column(Boolean, default=False)
    decl_trained      = Column(Boolean, default=False)
    decl_accurate     = Column(Boolean, default=False)
    decl_contact      = Column(Boolean, default=False)

    # Timestamps
    registered_at   = Column(DateTime(timezone=True), server_default=func.now())
    activated_at    = Column(DateTime(timezone=True), nullable=True)
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organisation    = relationship("Organisation", back_populates="users")
    timelogs        = relationship("Timelog",      back_populates="user", cascade="all, delete")
    holidays        = relationship("Holiday",      back_populates="user", cascade="all, delete", foreign_keys="[Holiday.user_id]")
    clock_events    = relationship("ClockEvent",   back_populates="user", cascade="all, delete", foreign_keys="[ClockEvent.user_id]")
    assigned_site   = relationship("Site", foreign_keys=[assigned_site_id])

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def full_address(self):
        return ", ".join(p for p in [self.address_line1, self.address_line2, self.city, self.postcode] if p)


# ── Timelog ───────────────────────────────────────────────────────────────────

class Timelog(Base):
    __tablename__ = "timelogs"

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    site_id         = Column(Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True)

    date            = Column(Date,      nullable=False)
    start_time      = Column(String(5), nullable=False)   # "09:00"
    end_time        = Column(String(5), nullable=False)   # "17:00"
    site_name       = Column(String(200), nullable=True)  # stored for history
    overnight       = Column(Boolean, default=False)
    total_mins      = Column(Integer, nullable=True)
    notes           = Column(Text, nullable=True)

    # QR clock-in source
    clocked_via_qr  = Column(Boolean, default=False)
    gps_lat         = Column(Float, nullable=True)
    gps_lng         = Column(Float, nullable=True)

    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    user            = relationship("User", back_populates="timelogs")
    site_obj        = relationship("Site", back_populates="timelogs")


# ── ClockEvent ────────────────────────────────────────────────────────────────

class ClockEventType(str, enum.Enum):
    clock_in  = "clock_in"
    clock_out = "clock_out"


class ClockEvent(Base):
    __tablename__ = "clock_events"

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    site_id         = Column(Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True)

    event_type      = Column(SAEnum(ClockEventType), nullable=False)
    timestamp       = Column(DateTime(timezone=True), server_default=func.now())
    scheduled_start = Column(String(5), nullable=True)   # '18:00'
    is_late         = Column(Boolean, default=False)
    minutes_late    = Column(Integer, default=0)
    gps_lat         = Column(Float, nullable=True)
    gps_lng         = Column(Float, nullable=True)
    gps_verified    = Column(Boolean, default=False)
    shift_minutes   = Column(Integer, nullable=True)     # filled on clock-out
    entry_notes     = Column(String(500), nullable=True) # HR manual entry reason

    user            = relationship("User", back_populates="clock_events", foreign_keys=[user_id])
    site            = relationship("Site")


# ── OrgDocument ───────────────────────────────────────────────────────────────

class OrgDocument(Base):
    __tablename__ = 'org_documents'

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False)
    doc_key         = Column(String(100), nullable=False)   # e.g. 'pay_calendar'
    doc_name        = Column(String(200), nullable=False)   # Display name
    doc_url         = Column(String(1000), nullable=True)   # Google Drive / Dropbox link
    doc_content     = Column(LargeBinary,  nullable=True)   # uploaded PDF binary
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by      = Column(Integer, ForeignKey('users.id'), nullable=True)

    __table_args__  = (UniqueConstraint('organisation_id', 'doc_key'),)


# ── Holiday ───────────────────────────────────────────────────────────────────

class Holiday(Base):
    __tablename__ = "holidays"

    id              = Column(Integer, primary_key=True, index=True)
    organisation_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    from_date       = Column(Date, nullable=False)
    to_date         = Column(Date, nullable=False)
    days            = Column(Integer, nullable=False)
    note            = Column(Text, nullable=True)
    status          = Column(SAEnum(HolidayStatus), default=HolidayStatus.pending)

    holiday_pay_hours   = Column(Float,   nullable=True)
    holiday_pay_flagged = Column(Boolean, default=False)

    submitted_at    = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    user            = relationship("User", back_populates="holidays", foreign_keys=[user_id])
    reviewer        = relationship("User", foreign_keys=[reviewed_by_id])


# ── ClockFailure ───────────────────────────────────────────────────────────────

class ClockFailure(Base):
    __tablename__ = 'clock_failures'

    id               = Column(Integer, primary_key=True)
    organisation_id  = Column(Integer, ForeignKey('organisations.id', ondelete='CASCADE'))
    user_id          = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    staff_id_entered = Column(String(20), nullable=True)
    site_id          = Column(Integer, ForeignKey('sites.id', ondelete='SET NULL'), nullable=True)
    failure_reason   = Column(String(200))   # 'gps_mismatch' | 'id_not_found' | 'name_mismatch' | 'account_blocked'
    gps_lat          = Column(Float, nullable=True)
    gps_lng          = Column(Float, nullable=True)
    distance_metres  = Column(Float, nullable=True)
    attempted_at     = Column(DateTime(timezone=True), server_default=func.now())
    ip_address       = Column(String(50), nullable=True)

    user             = relationship("User", foreign_keys=[user_id])
    site             = relationship("Site", foreign_keys=[site_id])


# ── Message ───────────────────────────────────────────────────────────────────

class Message(Base):
    __tablename__ = 'messages'

    id              = Column(Integer, primary_key=True)
    organisation_id = Column(Integer, ForeignKey('organisations.id', ondelete='CASCADE'))
    sent_by         = Column(Integer, ForeignKey('users.id'))
    recipient_id    = Column(Integer, ForeignKey('users.id'), nullable=True)   # None = broadcast to all staff
    title           = Column(String(200), nullable=False)
    body            = Column(Text, nullable=False)
    priority        = Column(String(20), default='normal')   # 'normal' | 'urgent' | 'info'
    sent_at         = Column(DateTime(timezone=True), server_default=func.now())
    read_by         = Column(Text, default='[]')             # JSON array of user_ids

    sender          = relationship("User", foreign_keys=[sent_by])
    recipient       = relationship("User", foreign_keys=[recipient_id])


# ── JobApplication ────────────────────────────────────────────────────────────

class ApplicationStatus(str, enum.Enum):
    submitted    = 'submitted'
    under_review = 'under_review'
    accepted     = 'accepted'
    rejected     = 'rejected'


class JobApplication(Base):
    __tablename__ = 'job_applications'

    id                       = Column(Integer, primary_key=True, index=True)
    organisation_id          = Column(Integer, ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False)
    submitted_at             = Column(DateTime(timezone=True), server_default=func.now())
    status                   = Column(SAEnum(ApplicationStatus), default=ApplicationStatus.submitted)
    status_updated_at        = Column(DateTime(timezone=True), nullable=True)
    status_updated_by        = Column(Integer, ForeignKey('users.id'), nullable=True)
    hr_notes                 = Column(Text, nullable=True)
    reference                = Column(String(20), nullable=True)   # e.g. RL047

    # Personal details
    title                    = Column(String(10),  nullable=False)
    first_name               = Column(String(100), nullable=False)
    last_name                = Column(String(100), nullable=False)
    date_of_birth            = Column(String(20),  nullable=False)
    email                    = Column(String(200), nullable=False)
    phone                    = Column(String(30),  nullable=False)
    address                  = Column(String(500), nullable=False)

    # Employment docs
    ni_number                = Column(String(20),  nullable=False)
    sia_licence              = Column(String(30),  nullable=False)
    sia_expiry               = Column(String(20),  nullable=False)
    sia_badge_data           = Column(LargeBinary, nullable=True)
    sia_badge_filename       = Column(String(200), nullable=True)

    # Immigration
    nationality              = Column(String(100), nullable=False)
    right_to_work            = Column(Boolean, default=False)
    immigration_doc_data     = Column(LargeBinary, nullable=True)
    immigration_doc_filename = Column(String(200), nullable=True)

    # Work details
    commute_method           = Column(String(200), nullable=False)
    employment_history       = Column(Text, nullable=False)

    # Emergency contact
    nok_name                 = Column(String(200), nullable=False)
    nok_phone                = Column(String(30),  nullable=False)

    # Declarations
    info_accurate            = Column(Boolean, default=False)
    consent_references       = Column(Boolean, default=False)

    # Registration tracking
    registration_sent_at     = Column(DateTime(timezone=True), nullable=True)
    registered_user_id       = Column(Integer, ForeignKey('users.id'), nullable=True)

    reviewer                 = relationship("User", foreign_keys=[status_updated_by])


# ── GPSCapture ────────────────────────────────────────────────────────────────

class GPSCapture(Base):
    __tablename__ = 'gps_captures'

    id              = Column(Integer, primary_key=True)
    organisation_id = Column(Integer, ForeignKey('organisations.id', ondelete='CASCADE'))
    site_id         = Column(Integer, ForeignKey('sites.id', ondelete='CASCADE'))
    latitude        = Column(Float, nullable=False)
    longitude       = Column(Float, nullable=False)
    accuracy        = Column(Float, nullable=True)
    captured_by     = Column(String(200), nullable=True)
    notes           = Column(String(500), nullable=True)
    captured_at     = Column(DateTime(timezone=True), server_default=func.now())
    approved        = Column(Boolean, default=False)

    site            = relationship("Site")


# ── PreRegistration ───────────────────────────────────────────────────────────

class PreRegistration(Base):
    __tablename__ = 'pre_registrations'

    id              = Column(Integer, primary_key=True)
    organisation_id = Column(Integer, ForeignKey('organisations.id', ondelete='CASCADE'))
    token           = Column(String(64), unique=True, nullable=False)
    email           = Column(String(200), nullable=False)
    first_name      = Column(String(100))
    last_name       = Column(String(100))
    date_of_birth   = Column(String(20))
    address         = Column(String(500))
    phone           = Column(String(30))
    ni_number       = Column(String(20))
    sia_licence     = Column(String(30))
    sia_expiry      = Column(String(20))
    nok_name        = Column(String(200))
    nok_phone       = Column(String(30))
    staff_id        = Column(String(20), nullable=True)   # application reference, becomes staff ID
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    used            = Column(Boolean, default=False)
    application_id  = Column(Integer, ForeignKey('job_applications.id'), nullable=True)
