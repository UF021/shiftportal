import pytz
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone, timedelta

from database import get_db
from schemas import HolidayCreate, HolidayOut, HolidaySummary
from auth_utils import get_current_user, require_hr, org_guard
from audit_utils import log_action
from email_utils import send_email, org_sender, org_reply_to
import models

UK_TZ = pytz.timezone('Europe/London')

router = APIRouter()
ALLOWANCE = 20


@router.post("/", response_model=HolidayOut, status_code=201)
def request(
    req:  HolidayCreate,
    db:   Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if req.to_date < req.from_date:
        raise HTTPException(400, "End date must be after start date")
    ahead = (req.from_date - date.today()).days
    if ahead < 28:
        raise HTTPException(
            400,
            f"Requests must be submitted at least 4 weeks in advance. "
            f"Your selected date is {ahead} day(s) away."
        )
    days = (req.to_date - req.from_date).days + 1
    h = models.Holiday(
        organisation_id = user.organisation_id,
        user_id         = user.id,
        from_date       = req.from_date,
        to_date         = req.to_date,
        days            = days,
        note            = req.note,
        status          = models.HolidayStatus.pending,
    )
    db.add(h); db.commit(); db.refresh(h)
    return h


@router.get("/my", response_model=HolidaySummary)
def my_holidays(
    db:   Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    reqs = db.query(models.Holiday).filter(models.Holiday.user_id == user.id)\
             .order_by(models.Holiday.from_date.desc()).all()
    approved = sum(h.days for h in reqs if h.status == models.HolidayStatus.approved)
    pending  = sum(h.days for h in reqs if h.status == models.HolidayStatus.pending)
    return HolidaySummary(
        approved_days  = approved,
        pending_days   = pending,
        remaining_days = ALLOWANCE - approved - pending,
        requests       = reqs,
    )


@router.patch("/{hol_id}/approve")
def approve(hol_id: int, db: Session = Depends(get_db), hr: models.User = Depends(require_hr)):
    h = db.query(models.Holiday).filter(models.Holiday.id == hol_id).first()
    if not h: raise HTTPException(404, "Not found")
    org_guard(hr, h.organisation_id)

    # Calculate holiday pay from last 3 months of clock events
    three_months_ago = datetime.now(timezone.utc) - timedelta(days=91)
    clock_outs = db.query(models.ClockEvent).filter(
        models.ClockEvent.user_id    == h.user_id,
        models.ClockEvent.event_type == models.ClockEventType.clock_out,
        models.ClockEvent.shift_minutes != None,
        models.ClockEvent.timestamp  >= three_months_ago,
    ).all()
    if clock_outs:
        avg_shift_mins = sum(e.shift_minutes for e in clock_outs) / len(clock_outs)
        avg_shift_hours = round(avg_shift_mins / 60, 2)
        h.holiday_pay_hours   = round(h.days * avg_shift_hours, 2)
        h.holiday_pay_flagged = True

    h.status         = models.HolidayStatus.approved
    h.reviewed_at    = datetime.now(timezone.utc)
    h.reviewed_by_id = hr.id

    # Create a HOLIDAY PAY clock entry for each day of the approved holiday
    if h.holiday_pay_hours and h.holiday_pay_hours > 0:
        avg_mins_per_day = round((h.holiday_pay_hours / h.days) * 60)
        current = h.from_date
        while current <= h.to_date:
            # Skip if a HOLIDAY PAY clock-in already exists for this day (idempotent)
            day_start_utc = UK_TZ.localize(datetime(current.year, current.month, current.day, 9, 0)).astimezone(timezone.utc)
            day_end_utc   = day_start_utc + timedelta(hours=24)
            already = db.query(models.ClockEvent).filter(
                models.ClockEvent.user_id    == h.user_id,
                models.ClockEvent.event_type == models.ClockEventType.clock_in,
                models.ClockEvent.timestamp  >= day_start_utc,
                models.ClockEvent.timestamp  <  day_end_utc,
                models.ClockEvent.entry_notes == '[HOLIDAY PAY]',
            ).first()
            if not already:
                clock_in_ts  = day_start_utc
                clock_out_ts = clock_in_ts + timedelta(minutes=avg_mins_per_day)
                ci = models.ClockEvent(
                    organisation_id = h.organisation_id,
                    user_id         = h.user_id,
                    site_id         = None,
                    event_type      = models.ClockEventType.clock_in,
                    timestamp       = clock_in_ts,
                    scheduled_start = None,
                    is_late         = False,
                    minutes_late    = 0,
                    gps_verified    = False,
                    entry_notes     = '[HOLIDAY PAY]',
                )
                co = models.ClockEvent(
                    organisation_id = h.organisation_id,
                    user_id         = h.user_id,
                    site_id         = None,
                    event_type      = models.ClockEventType.clock_out,
                    timestamp       = clock_out_ts,
                    shift_minutes   = avg_mins_per_day,
                    entry_notes     = '[HOLIDAY PAY]',
                )
                db.add(ci)
                db.add(co)
            current += timedelta(days=1)

    staff = db.query(models.User).filter(models.User.id == h.user_id).first()
    org   = db.query(models.Organisation).filter(models.Organisation.id == h.organisation_id).first()
    log_action(db, h.organisation_id, hr, 'holiday.approve', 'holiday', h.id,
               staff.full_name if staff else 'Unknown',
               {"from_date": str(h.from_date), "to_date": str(h.to_date), "days": h.days})
    db.commit()
    if staff and staff.email:
        send_email(
            to        = staff.email,
            subject   = f"Holiday approved — {h.from_date} to {h.to_date}",
            body      = (
                f"Dear {staff.first_name},\n\n"
                f"Your holiday request has been approved.\n\n"
                f"  From:  {h.from_date}\n"
                f"  To:    {h.to_date}\n"
                f"  Days:  {h.days}\n\n"
                f"Your leave balance has been updated accordingly. "
                f"If you have any questions please contact HR.\n\n"
                f"Regards,\nHR Team"
            ),
            from_name = org_sender(org) if org else "Tyma Notifications",
            reply_to  = org_reply_to(org) if org else None,
        )
    return {"message": "Approved", "holiday_pay_hours": h.holiday_pay_hours}


@router.patch("/{hol_id}/reject")
def reject(hol_id: int, db: Session = Depends(get_db), hr: models.User = Depends(require_hr)):
    h = db.query(models.Holiday).filter(models.Holiday.id == hol_id).first()
    if not h: raise HTTPException(404, "Not found")
    org_guard(hr, h.organisation_id)
    h.status = models.HolidayStatus.rejected
    h.reviewed_at = datetime.now(timezone.utc)
    h.reviewed_by_id = hr.id
    staff = db.query(models.User).filter(models.User.id == h.user_id).first()
    org   = db.query(models.Organisation).filter(models.Organisation.id == h.organisation_id).first()
    log_action(db, h.organisation_id, hr, 'holiday.reject', 'holiday', h.id,
               staff.full_name if staff else 'Unknown',
               {"from_date": str(h.from_date), "to_date": str(h.to_date), "days": h.days})
    db.commit()
    if staff and staff.email:
        send_email(
            to        = staff.email,
            subject   = f"Holiday request not approved — {h.from_date} to {h.to_date}",
            body      = (
                f"Dear {staff.first_name},\n\n"
                f"We regret to inform you that your holiday request has not been approved at this time.\n\n"
                f"  From:  {h.from_date}\n"
                f"  To:    {h.to_date}\n"
                f"  Days:  {h.days}\n\n"
                f"If you would like to discuss this, please contact HR directly.\n\n"
                f"Regards,\nHR Team"
            ),
            from_name = org_sender(org) if org else "Tyma Notifications",
            reply_to  = org_reply_to(org) if org else None,
        )
    return {"message": "Rejected"}


@router.get("/all")
def all_holidays(
    status_filter: str = None,
    db: Session = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    q = db.query(models.Holiday).filter(models.Holiday.organisation_id == hr.organisation_id)
    if status_filter:
        q = q.filter(models.Holiday.status == status_filter)
    return q.order_by(models.Holiday.submitted_at.desc()).all()
