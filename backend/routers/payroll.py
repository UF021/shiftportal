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

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import require_hr
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
            models.User.is_archived           == False,
            models.User.is_erased             == False,
        )
        .all()
    )

    user_mins   = defaultdict(int)
    user_shifts = defaultdict(int)
    user_obj    = {}

    for co in clock_outs:
        uid = co.user_id
        user_mins[uid]   += co.shift_minutes
        user_shifts[uid] += 1
        if uid not in user_obj:
            user_obj[uid] = co.user

    employees = []
    for uid, u in sorted(
        user_obj.items(),
        key=lambda x: ((x[1].last_name or '').lower(), (x[1].first_name or '').lower()),
    ):
        mins  = user_mins[uid]
        hours = round(mins / 60, 2)
        rate  = u.pay_rate or 0.0
        gross = round(hours * rate, 2)
        employees.append({
            "user_id":    uid,
            "name":       f"{u.first_name or ''} {u.last_name or ''}".strip(),
            "email":      u.email,
            "staff_id":   u.staff_id or "—",
            "staff_type": u.staff_type or "payroll",
            "pay_rate":   rate,
            "shifts":     user_shifts[uid],
            "minutes":    mins,
            "hours":      hours,
            "gross_pay":  gross,
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
    from_date: date    = Query(...),
    to_date:   date    = Query(...),
    db:        Session = Depends(get_db),
    hr:        models.User = Depends(require_hr),
):
    if (to_date - from_date).days > MAX_DAYS:
        from fastapi import HTTPException
        raise HTTPException(400, "Date range must not exceed 366 days")

    data = _calc(from_date, to_date, hr.organisation_id, db)

    out = io.StringIO()
    w   = csv.writer(out)

    # Header block
    w.writerow(["Payroll Export"])
    w.writerow(["Period", f"{from_date} to {to_date}"])
    w.writerow(["Generated", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")])
    w.writerow([])

    # Column headers
    w.writerow([
        "Staff ID", "Full Name", "Email",
        "Staff Type", "Shifts", "Hours Worked",
        "Pay Rate (£/hr)", "Gross Pay (£)",
    ])

    for e in data["employees"]:
        w.writerow([
            e["staff_id"],
            e["name"],
            e["email"],
            e["staff_type"].title(),
            e["shifts"],
            f"{e['hours']:.2f}",
            f"{e['pay_rate']:.2f}",
            f"{e['gross_pay']:.2f}",
        ])

    # Totals row
    w.writerow([])
    w.writerow([
        "", "TOTALS", "", "",
        sum(e["shifts"] for e in data["employees"]),
        f"{data['total_hours']:.2f}",
        "",
        f"{data['total_gross']:.2f}",
    ])

    out.seek(0)
    filename = f"payroll_{from_date}_{to_date}.csv"
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
