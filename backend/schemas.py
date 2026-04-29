from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import date, datetime


# ── Auth ─────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    user_id:      int
    org_id:       Optional[int]
    name:         str
    org_slug:     Optional[str]


# ── Organisation ──────────────────────────────────────────────────────────────
class OrgCreate(BaseModel):
    name:          str
    slug:          str
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    address:       Optional[str] = None
    # HR admin account
    hr_first_name: str
    hr_last_name:  str
    hr_password:   str

    @field_validator("slug")
    @classmethod
    def slug_valid(cls, v):
        import re
        if not re.match(r'^[a-z0-9-]+$', v):
            raise ValueError("Slug must be lowercase letters, numbers and hyphens only")
        return v


class OrgBrandingUpdate(BaseModel):
    brand_name:               Optional[str] = None
    brand_colour:             Optional[str] = None
    brand_logo_url:           Optional[str] = None
    brand_email:              Optional[str] = None
    contract_employer_name:   Optional[str] = None
    contract_employer_address:Optional[str] = None
    contract_employer_email:  Optional[str] = None
    contract_employer_phone:  Optional[str] = None
    contract_signatory_name:  Optional[str] = None
    contract_signatory_role:  Optional[str] = None
    contract_min_pay:         Optional[str] = None
    contract_max_pay:         Optional[str] = None


class OrgOut(BaseModel):
    id:                       int
    slug:                     str
    name:                     str
    contact_email:            str
    brand_name:               Optional[str]
    brand_colour:             Optional[str]
    brand_email:              Optional[str]
    brand_logo_url:           Optional[str]
    contract_employer_name:   Optional[str]
    contract_employer_address:Optional[str]
    contract_employer_email:  Optional[str]
    contract_employer_phone:  Optional[str]
    contract_signatory_name:  Optional[str]
    contract_signatory_role:  Optional[str]
    contract_min_pay:         Optional[str]
    contract_max_pay:         Optional[str]
    is_active:                bool
    created_at:               Optional[datetime]

    model_config = {"from_attributes": True}


# ── Registration ──────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    org_slug:      str          # which organisation to join
    title:         Optional[str] = None
    first_name:    str
    last_name:     str
    date_of_birth: Optional[date] = None
    nationality:   Optional[str] = None
    email:         EmailStr
    phone:         Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city:          Optional[str] = None
    postcode:      Optional[str] = None
    ni_number:     Optional[str] = None
    right_to_work: bool = True
    sia_licence:   Optional[str] = None
    sia_expiry:    Optional[date] = None
    nok_name:      Optional[str] = None
    nok_phone:     Optional[str] = None
    nok_relation:  Optional[str] = None
    decl_policy:       bool = False
    decl_portal:       bool = False
    decl_line_manager: bool = False
    decl_pay_schedule: bool = False
    decl_trained:      bool = False
    decl_accurate:     bool = False
    decl_contact:      bool = False
    password: str

    @field_validator("password")
    @classmethod
    def pw_len(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ── User / Staff profile ──────────────────────────────────────────────────────
class UserProfile(BaseModel):
    id:                    int
    organisation_id:       Optional[int]
    role:                  str
    email:                 str
    staff_id:              Optional[str]
    title:                 Optional[str]
    first_name:            str
    last_name:             str
    full_name:             str
    date_of_birth:         Optional[date]
    nationality:           Optional[str]
    phone:                 Optional[str]
    full_address:          Optional[str]
    employment_start_date: Optional[date]
    pay_rate:              Optional[float]
    ni_number:             Optional[str]
    sia_licence:           Optional[str]
    sia_expiry:            Optional[date]
    right_to_work:         bool
    nok_name:              Optional[str]
    nok_phone:             Optional[str]
    nok_relation:          Optional[str]
    is_active:             bool
    registered_at:         Optional[datetime]

    model_config = {"from_attributes": True}


class UserListItem(BaseModel):
    id:                    int
    staff_id:              Optional[str]
    full_name:             str
    email:                 str
    phone:                 Optional[str]
    sia_licence:           Optional[str]
    sia_expiry:            Optional[date]
    pay_rate:              Optional[float]
    employment_start_date: Optional[date]
    is_active:             bool

    model_config = {"from_attributes": True}


class ActivateRequest(BaseModel):
    staff_id:              Optional[str] = "TBC"
    employment_start_date: Optional[date] = None
    pay_rate:              Optional[float] = None
    assigned_site_id:      Optional[int] = None


class EditUserRequest(BaseModel):
    # Employment
    staff_id:              Optional[str]   = None
    employment_start_date: Optional[date]  = None
    pay_rate:              Optional[float] = None
    assigned_site_id:      Optional[int]   = None
    assigned_sites:        Optional[str]   = None
    right_to_work:         Optional[bool]  = None
    # SIA / compliance
    ni_number:             Optional[str]   = None
    sia_licence:           Optional[str]   = None
    sia_expiry:            Optional[date]  = None
    # Personal
    title:                 Optional[str]   = None
    first_name:            Optional[str]   = None
    last_name:             Optional[str]   = None
    date_of_birth:         Optional[date]  = None
    nationality:           Optional[str]   = None
    phone:                 Optional[str]   = None
    # Address
    address_line1:         Optional[str]   = None
    address_line2:         Optional[str]   = None
    city:                  Optional[str]   = None
    postcode:              Optional[str]   = None
    # Next of kin
    nok_name:              Optional[str]   = None
    nok_phone:             Optional[str]   = None
    nok_relation:          Optional[str]   = None


# ── Site ──────────────────────────────────────────────────────────────────────
class SiteCreate(BaseModel):
    code:    str
    name:    str
    group:   Optional[str] = None
    address: Optional[str] = None


class SiteOut(BaseModel):
    id:       int
    code:     str
    name:     str
    group:    Optional[str]
    address:  Optional[str]
    is_active: bool
    site_lat: Optional[float] = None
    site_lng: Optional[float] = None

    model_config = {"from_attributes": True}


# ── Timelog ───────────────────────────────────────────────────────────────────
class TimelogCreate(BaseModel):
    date:       date
    start_time: str
    end_time:   str
    site_name:  str
    notes:      Optional[str] = None
    clocked_via_qr: bool = False
    gps_lat:    Optional[float] = None
    gps_lng:    Optional[float] = None


class TimelogOut(BaseModel):
    id:         int
    date:       date
    start_time: str
    end_time:   str
    site_name:  Optional[str]
    overnight:  bool
    total_mins: Optional[int]
    notes:      Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TimelogSummary(BaseModel):
    total_mins:  int
    total_hrs:   float
    entry_count: int
    entries:     list[TimelogOut]


# ── Holiday ───────────────────────────────────────────────────────────────────
class HolidayCreate(BaseModel):
    from_date: date
    to_date:   date
    note:      Optional[str] = None


class HolidayOut(BaseModel):
    id:                   int
    from_date:            date
    to_date:              date
    days:                 int
    note:                 Optional[str]
    status:               str
    submitted_at:         Optional[datetime]
    reviewed_at:          Optional[datetime]
    holiday_pay_hours:    Optional[float] = None
    holiday_pay_flagged:  Optional[bool]  = False

    model_config = {"from_attributes": True}


class HolidaySummary(BaseModel):
    total_allowance: int = 20
    approved_days:   int
    pending_days:    int
    remaining_days:  int
    requests:        list[HolidayOut]


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_staff:       int
    pending_regs:      int
    sia_expired:       int
    sia_expiring_soon: int
    total_hours_period:float


# ── Superadmin ────────────────────────────────────────────────────────────────
class SuperDashboard(BaseModel):
    total_orgs:        int
    active_orgs:       int
    trial_orgs:        int
    total_staff:       int
    orgs:              list[dict]
