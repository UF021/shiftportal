"""
Reporting dashboard endpoint.

Aggregates workforce, attendance, holiday, SIA compliance, training,
and incident data into a single JSON payload for the HR reporting dashboard.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import pytz
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import require_hr
import models

router = APIRouter()

UK_TZ = pytz.timezone("Europe/London")
MODULES = [
    ("module1", "Security Awareness"),
    ("module2", "Physical Intervention"),
    ("module3", "First Aid Awareness"),
]


@router.get("/overview")
def reports_overview(
    days: int      = Query(30, ge=7, le=365, description="Lookback window in days"),
    db:   Session  = Depends(get_db),
    hr:   models.User = Depends(require_hr),
):
    org_id  = hr.organisation_id
    now_utc = datetime.now(timezone.utc)
    now_uk  = now_utc.astimezone(UK_TZ)
    today   = now_uk.date()
    period_start_date = today - timedelta(days=days - 1)
    period_start_utc  = datetime(
        period_start_date.year, period_start_date.month, period_start_date.day,
        tzinfo=timezone.utc,
    )

    # ── Workforce ──────────────────────────────────────────────────────────────
    active_q = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_active       == True,
        models.User.is_archived     == False,
        models.User.is_erased       == False,
        models.User.role            == models.UserRole.staff,
    )
    active_staff = active_q.all()
    total_active  = len(active_staff)
    payroll_count = sum(1 for u in active_staff if (u.staff_type or "payroll") == "payroll")
    sub_count     = total_active - payroll_count

    new_this_period = sum(
        1 for u in active_staff
        if u.activated_at and u.activated_at >= period_start_utc
    )

    archived_count = db.query(models.User).filter(
        models.User.organisation_id == org_id,
        models.User.is_archived     == True,
        models.User.role            == models.UserRole.staff,
    ).count()

    # ── Attendance (period) ────────────────────────────────────────────────────
    clock_outs = db.query(models.ClockEvent).filter(
        models.ClockEvent.organisation_id == org_id,
        models.ClockEvent.event_type      == models.ClockEventType.clock_out,
        models.ClockEvent.shift_minutes   != None,
        models.ClockEvent.shift_minutes   > 0,
        models.ClockEvent.timestamp       >= period_start_utc,
    ).all()

    clock_ins_period = db.query(models.ClockEvent).filter(
        models.ClockEvent.organisation_id == org_id,
        models.ClockEvent.event_type      == models.ClockEventType.clock_in,
        models.ClockEvent.timestamp       >= period_start_utc,
    ).all()

    total_shifts = len(clock_outs)
    total_mins   = sum(co.shift_minutes for co in clock_outs)
    total_hours  = round(total_mins / 60, 1)
    late_count   = sum(1 for ci in clock_ins_period if ci.is_late)
    total_ci     = len(clock_ins_period)
    late_rate    = round(late_count / total_ci * 100, 1) if total_ci else 0
    avg_shift    = round(total_mins / total_shifts / 60, 2) if total_shifts else 0

    # Daily breakdown for chart
    daily_map = defaultdict(lambda: {"shifts": 0, "minutes": 0, "late": 0})
    for co in clock_outs:
        d = co.timestamp.astimezone(UK_TZ).date()
        daily_map[d]["shifts"]  += 1
        daily_map[d]["minutes"] += co.shift_minutes
    for ci in clock_ins_period:
        d = ci.timestamp.astimezone(UK_TZ).date()
        if ci.is_late:
            daily_map[d]["late"] += 1

    daily = []
    for i in range(days):
        d = period_start_date + timedelta(days=i)
        entry = daily_map.get(d, {"shifts": 0, "minutes": 0, "late": 0})
        daily.append({
            "date":   str(d),
            "shifts": entry["shifts"],
            "hours":  round(entry["minutes"] / 60, 1),
            "late":   entry["late"],
        })

    # ── Holidays ──────────────────────────────────────────────────────────────
    all_holidays = db.query(models.Holiday).filter(
        models.Holiday.organisation_id == org_id,
    ).all()

    pending_hols = sum(1 for h in all_holidays if h.status == models.HolidayStatus.pending)

    approved_period = [
        h for h in all_holidays
        if h.status == models.HolidayStatus.approved
        and h.to_date >= period_start_date
    ]
    approved_count = len(approved_period)
    approved_days  = sum(h.days or 0 for h in approved_period)

    on_holiday_today = sum(
        1 for h in all_holidays
        if h.status == models.HolidayStatus.approved
        and h.from_date <= today <= h.to_date
    )

    # ── SIA Compliance ─────────────────────────────────────────────────────────
    in30 = today + timedelta(days=30)
    in60 = today + timedelta(days=60)

    sia_expired   = 0
    sia_exp30     = 0
    sia_exp60     = 0
    sia_valid     = 0
    sia_none      = 0
    for u in active_staff:
        if not u.sia_expiry:
            sia_none += 1
        elif u.sia_expiry < today:
            sia_expired += 1
        elif u.sia_expiry <= in30:
            sia_exp30 += 1
        elif u.sia_expiry <= in60:
            sia_exp60 += 1
        else:
            sia_valid += 1

    # ── Training compliance ────────────────────────────────────────────────────
    eligible_ids = {u.id for u in active_staff}
    training_rows = db.query(models.TrainingProgress).filter(
        models.TrainingProgress.organisation_id == org_id,
        models.TrainingProgress.passed          == True,
    ).all()

    passed_by_module = defaultdict(set)
    for t in training_rows:
        if t.user_id in eligible_ids:
            passed_by_module[t.module].add(t.user_id)

    training = []
    for mod_key, mod_label in MODULES:
        passed = len(passed_by_module.get(mod_key, set()))
        pct    = round(passed / total_active * 100) if total_active else 0
        training.append({
            "module":    mod_key,
            "label":     mod_label,
            "eligible":  total_active,
            "passed":    passed,
            "pct":       pct,
        })

    # ── Incidents ─────────────────────────────────────────────────────────────
    incidents_period = db.query(models.IncidentReport).filter(
        models.IncidentReport.organisation_id == org_id,
        models.IncidentReport.submitted_at    >= period_start_utc,
    ).all()

    incidents_total    = len(incidents_period)
    incidents_reviewed = sum(1 for i in incidents_period if i.reviewed_at is not None)

    return {
        "generated_at": now_utc.isoformat(),
        "period_days":  days,
        "workforce": {
            "total_active":    total_active,
            "payroll_count":   payroll_count,
            "subcontract_count": sub_count,
            "new_this_period": new_this_period,
            "archived_count":  archived_count,
        },
        "attendance": {
            "total_shifts":    total_shifts,
            "total_hours":     total_hours,
            "late_count":      late_count,
            "late_rate_pct":   late_rate,
            "avg_shift_hours": avg_shift,
            "daily":           daily,
        },
        "holidays": {
            "pending":           pending_hols,
            "approved_period":   approved_count,
            "approved_days":     approved_days,
            "on_holiday_today":  on_holiday_today,
        },
        "sia": {
            "expired":     sia_expired,
            "expiring_30d": sia_exp30,
            "expiring_60d": sia_exp60,
            "valid":       sia_valid,
            "no_sia":      sia_none,
        },
        "training": training,
        "incidents": {
            "total":      incidents_total,
            "reviewed":   incidents_reviewed,
            "unreviewed": incidents_total - incidents_reviewed,
        },
    }
