from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date

from database import get_db
from schemas import TimelogCreate, TimelogOut, TimelogSummary
from auth_utils import get_current_user, require_hr, org_guard
import models

router = APIRouter()


def _calc(start: str, end: str):
    sh, sm = map(int, start.split(":"))
    eh, em = map(int, end.split(":"))
    s_mins = sh * 60 + sm
    e_mins = eh * 60 + em
    if e_mins <= s_mins:
        return (24 * 60 - s_mins + e_mins), True
    return e_mins - s_mins, False


@router.post("/", response_model=TimelogOut, status_code=201)
def create(
    req:  TimelogCreate,
    db:   Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    mins, overnight = _calc(req.start_time, req.end_time)
    entry = models.Timelog(
        organisation_id = user.organisation_id,
        user_id         = user.id,
        date            = req.date,
        start_time      = req.start_time,
        end_time        = req.end_time,
        site_name       = req.site_name,
        overnight       = overnight,
        total_mins      = mins,
        notes           = req.notes,
        clocked_via_qr  = req.clocked_via_qr,
        gps_lat         = req.gps_lat,
        gps_lng         = req.gps_lng,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/my", response_model=TimelogSummary)
def my_logs(
    db:   Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    entries = (
        db.query(models.Timelog)
        .filter(models.Timelog.user_id == user.id)
        .order_by(models.Timelog.date.desc())
        .all()
    )
    total = sum(e.total_mins or 0 for e in entries)
    return TimelogSummary(
        total_mins  = total,
        total_hrs   = round(total / 60, 2),
        entry_count = len(entries),
        entries     = entries,
    )


@router.delete("/{entry_id}", status_code=204)
def delete(
    entry_id: int,
    db:       Session = Depends(get_db),
    user:     models.User = Depends(get_current_user),
):
    e = db.query(models.Timelog).filter(
        models.Timelog.id      == entry_id,
        models.Timelog.user_id == user.id,
    ).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    db.delete(e)
    db.commit()


# HR — all logs for this org
@router.get("/all")
def all_logs(
    staff_id:  int  = None,
    from_date: date = None,
    to_date:   date = None,
    db:        Session = Depends(get_db),
    hr:        models.User = Depends(require_hr),
):
    q = db.query(models.Timelog).filter(
        models.Timelog.organisation_id == hr.organisation_id
    )
    if staff_id:  q = q.filter(models.Timelog.user_id  == staff_id)
    if from_date: q = q.filter(models.Timelog.date     >= from_date)
    if to_date:   q = q.filter(models.Timelog.date     <= to_date)
    entries = q.order_by(models.Timelog.date.desc()).all()
    total   = sum(e.total_mins or 0 for e in entries)
    return {
        "total_mins":  total,
        "total_hrs":   round(total / 60, 2),
        "entry_count": len(entries),
        "entries":     [
            {
                "id":         e.id,
                "user_id":    e.user_id,
                "date":       str(e.date),
                "start_time": e.start_time,
                "end_time":   e.end_time,
                "site_name":  e.site_name,
                "overnight":  e.overnight,
                "total_mins": e.total_mins,
                "notes":      e.notes,
            }
            for e in entries
        ],
    }
