"""
Payroll summary and export router.

Aggregates completed shifts (clock_out events with shift_minutes > 0)
per employee across a date range and calculates gross pay at the
stored pay_rate. Exports a CSV compatible with manual import into
Xero, QuickBooks, or any payroll processor.
"""
import io
import csv
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import require_hr
from bank_holidays import is_bank_holiday
import models

router = APIRouter()

MAX_DAYS = 366   # prevent absurdly large queries


def _calc(from_date: date, to_date: date, org_id: int, db: Session) -> dict:
    """
    Core payroll calculation.  Returns a dict with period, totals, and
    per-employee breakdown sorted by surname then first name.
    """
    from_dt = datetime(from_date.year, from_date.month, from_date.day,
                       tzinfo=timezone.utc)
    to_dt   = datetime(to_date.year,   to_date.month,   to_date.day,
                       23, 59, 59, tzinfo=timezone.utc)

    import pytz
    UK_TZ = pytz.timezone('Europe/London')

    # All real clock-outs in the period (excludes HOLIDAY PAY)
    from sqlalchemy import func as _func
    clock_outs = (
        db.query(models.ClockEvent)
        .join(models.User, models.ClockEvent.user_id == models.User.id)
        .filter(
            models.ClockEvent.organisation_id == org_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_out,
            models.ClockEvent.shift_minutes   != None,
            models.ClockEvent.shift_minutes   > 0,
            models.ClockEvent.timestamp       >= from_dt,
            models.ClockEvent.timestamp       <= to_dt,
            _func.coalesce(models.ClockEvent.entry_notes, '') != '[HOLIDAY PAY]',
            models.User.is_archived           == False,
            models.User.is_erased             == False,
        )
        .all()
    )

    # HOLIDAY PAY clock-outs in the period
    holiday_pay_outs = (
        db.query(models.ClockEvent)
        .filter(
            models.ClockEvent.organisation_id == org_id,
            models.ClockEvent.event_type      == models.ClockEventType.clock_out,
            models.ClockEvent.shift_minutes   != None,
            models.ClockEvent.shift_minutes   > 0,
            models.ClockEvent.timestamp       >= from_dt,
            models.ClockEvent.timestamp       <= to_dt,
            models.ClockEvent.entry_notes     == '[HOLIDAY PAY]',
        )
        .all()
    )

    user_mins         = defaultdict(int)
    user_shifts       = defaultdict(int)
    user_bh_mins      = defaultdict(int)
    user_obj          = {}

    for co in clock_outs:
        uid = co.user_id
        user_mins[uid]   += co.shift_minutes
        user_shifts[uid] += 1
        if uid not in user_obj:
            user_obj[uid] = co.user
        # Bank holiday check using UK date of the clock-out
        date_str = co.timestamp.astimezone(UK_TZ).strftime('%Y-%m-%d')
        if is_bank_holiday(date_str):
            user_bh_mins[uid] += co.shift_minutes

    user_hol_mins = defaultdict(int)
    for co in holiday_pay_outs:
        user_hol_mins[co.user_id] += co.shift_minutes
        if co.user_id not in user_obj:
            u2 = db.query(models.User).filter(models.User.id == co.user_id).first()
            if u2 and not u2.is_archived and not u2.is_erased:
                user_obj[co.user_id] = u2

    employees = []
    for uid, u in sorted(
        user_obj.items(),
        key=lambda x: ((x[1].last_name or '').lower(), (x[1].first_name or '').lower()),
    ):
        mins      = user_mins[uid]
        hours     = round(mins / 60, 2)
        bh_hours  = round(user_bh_mins[uid] / 60, 2)
        hol_hours = round(user_hol_mins[uid] / 60, 2)
        rate      = u.pay_rate or 0.0
        gross     = round((hours + hol_hours) * rate, 2)

        addr_parts = [p for p in [
            u.address_line1, u.address_line2, u.city, u.postcode
        ] if p]
        address = ', '.join(addr_parts) if addr_parts else ''

        is_new = bool(
            u.employment_start_date
            and from_date <= u.employment_start_date <= to_date
        )

        employees.append({
            "user_id":              uid,
            "payroll_number":       u.payroll_number or "",
            "name":                 f"{u.first_name or ''} {u.last_name or ''}".strip(),
            "email":                u.email,
            "staff_id":             u.staff_id or "—",
            "staff_type":           u.staff_type or "payroll",
            "address":              address,
            "ni_number":            u.ni_number or "",
            "date_of_birth":        str(u.date_of_birth) if u.date_of_birth else "",
            "phone":                u.phone or "",
            "employment_start_date": str(u.employment_start_date) if u.employment_start_date else "",
            "is_new_employee":      is_new,
            "pay_rate":             rate,
            "shifts":               user_shifts[uid],
            "minutes":              mins,
            "hours":                hours,
            "bank_holiday_hours":   bh_hours,
            "holiday_pay_hours":    hol_hours,
            "gross_pay":            gross,
        })

    total_hours = round(sum(e["hours"] for e in employees), 2)
    total_gross = round(sum(e["gross_pay"] for e in employees), 2)

    return {
        "period":      {"from": str(from_date), "to": str(to_date)},
        "total_hours": total_hours,
        "total_gross": total_gross,
        "employees":   employees,
    }


@router.get("/summary")
def payroll_summary(
    from_date: date    = Query(..., description="Period start (YYYY-MM-DD)"),
    to_date:   date    = Query(..., description="Period end   (YYYY-MM-DD)"),
    db:        Session = Depends(get_db),
    hr:        models.User = Depends(require_hr),
):
    if (to_date - from_date).days > MAX_DAYS:
        from fastapi import HTTPException
        raise HTTPException(400, "Date range must not exceed 366 days")
    return _calc(from_date, to_date, hr.organisation_id, db)


@router.get("/export.csv")
def payroll_export_csv(
    from_date:  date           = Query(...),
    to_date:    date           = Query(...),
    staff_type: Optional[str]  = Query(None, description="Filter: 'payroll' or 'subcontract'"),
    db:         Session        = Depends(get_db),
    hr:         models.User    = Depends(require_hr),
):
    if (to_date - from_date).days > MAX_DAYS:
        raise HTTPException(400, "Date range must not exceed 366 days")

    data = _calc(from_date, to_date, hr.organisation_id, db)

    employees = data["employees"]
    if staff_type:
        employees = [e for e in employees if e["staff_type"] == staff_type]

    out = io.StringIO()
    w   = csv.writer(out)

    label = "Payroll Staff Only" if staff_type == "payroll" else \
            "Subcontract Staff Only" if staff_type else "All Staff"

    # Header block
    w.writerow(["Payroll Export", label])
    w.writerow(["Period", f"{from_date} to {to_date}"])
    w.writerow(["Generated", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")])
    w.writerow([])

    # Column headers
    w.writerow([
        "Payroll No.", "Full Name", "Email", "Staff Type",
        "Address", "NI Number", "Date of Birth", "Phone",
        "Employment Start", "New This Period?",
        "Shifts", "Hours Worked", "Bank Holiday Hours", "Holiday Pay Hours",
        "Pay Rate (£/hr)", "Gross Pay (£)", "Staff ID",
    ])

    for e in employees:
        w.writerow([
            e["payroll_number"],
            e["name"],
            e["email"],
            e["staff_type"].title(),
            e["address"],
            e["ni_number"],
            e["date_of_birth"],
            e["phone"],
            e["employment_start_date"],
            "Yes" if e["is_new_employee"] else "",
            e["shifts"],
            f"{e['hours']:.2f}",
            f"{e['bank_holiday_hours']:.2f}",
            f"{e['holiday_pay_hours']:.2f}",
            f"{e['pay_rate']:.2f}",
            f"{e['gross_pay']:.2f}",
            e["staff_id"],
        ])

    # Totals row
    w.writerow([])
    w.writerow([
        "", "TOTALS", "", "", "", "", "", "", "", "",
        sum(e["shifts"] for e in employees),
        f"{sum(e['hours'] for e in employees):.2f}",
        f"{sum(e['bank_holiday_hours'] for e in employees):.2f}",
        f"{sum(e['holiday_pay_hours'] for e in employees):.2f}",
        "",
        f"{sum(e['gross_pay'] for e in employees):.2f}",
        "",
    ])

    out.seek(0)
    suffix = f"_{staff_type}" if staff_type else ""
    filename = f"payroll_{from_date}_{to_date}{suffix}.csv"
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/staff-numbers")
def get_staff_numbers(
    db: Session        = Depends(get_db),
    hr: models.User    = Depends(require_hr),
):
    """All active staff in the org with their current payroll numbers."""
    users = (
        db.query(models.User)
        .filter(
            models.User.organisation_id == hr.organisation_id,
            models.User.is_archived     == False,
            models.User.is_erased       == False,
            models.User.is_pending      == False,
        )
        .order_by(models.User.last_name, models.User.first_name)
        .all()
    )
    return [
        {
            "user_id":        u.id,
            "name":           f"{u.first_name or ''} {u.last_name or ''}".strip(),
            "staff_type":     u.staff_type or "payroll",
            "payroll_number": u.payroll_number or "",
        }
        for u in users
    ]


@router.patch("/staff/{user_id}/payroll-number")
def update_payroll_number(
    user_id:        int,
    payroll_number: str    = Body(..., embed=True),
    db:             Session = Depends(get_db),
    hr:             models.User = Depends(require_hr),
):
    user = db.query(models.User).filter(
        models.User.id              == user_id,
        models.User.organisation_id == hr.organisation_id,
    ).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.payroll_number = payroll_number.strip() or None
    db.commit()
    return {"ok": True}
