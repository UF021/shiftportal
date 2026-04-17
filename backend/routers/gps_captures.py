"""
Public GPS coordinate capture endpoint.
Staff visit /capture-gps, enter their name and site, then submit.
HR reviews and matches each submission to the correct site.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from auth_utils import require_hr
from pydantic import BaseModel
import models

router = APIRouter()


class GPSCaptureSubmit(BaseModel):
    captured_by: Optional[str] = None
    site_name:   str
    latitude:    float
    longitude:   float
    accuracy:    Optional[float] = None


class GPSCaptureApprove(BaseModel):
    site_id: int


# ── Public: submit ────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def submit_capture(
    req: GPSCaptureSubmit,
    db:  Session = Depends(get_db),
):
    """Anyone with the link can submit — no authentication required."""
    capture = models.GPSCapture(
        organisation_id = None,
        site_id         = None,
        site_name       = req.site_name.strip(),
        latitude        = req.latitude,
        longitude       = req.longitude,
        accuracy        = req.accuracy,
        captured_by     = req.captured_by.strip() if req.captured_by else None,
    )
    db.add(capture)
    db.commit()
    db.refresh(capture)
    return {"id": capture.id, "message": "Location submitted. HR will review shortly."}


# ── HR: list all pending captures ────────────────────────────────────────────

@router.get("/")
def list_captures(
    db: Session      = Depends(get_db),
    hr: models.User  = Depends(require_hr),
):
    """HR — returns all captures not yet approved, newest first."""
    captures = (
        db.query(models.GPSCapture)
        .filter(models.GPSCapture.approved == False)  # noqa: E712
        .order_by(models.GPSCapture.captured_at.desc())
        .all()
    )
    return [_fmt(c) for c in captures]


# ── HR: approve — match to a site and write coordinates ──────────────────────

@router.patch("/{capture_id}/approve")
def approve_capture(
    capture_id: int,
    req:        GPSCaptureApprove,
    db:         Session      = Depends(get_db),
    hr:         models.User  = Depends(require_hr),
):
    capture = db.query(models.GPSCapture).filter(
        models.GPSCapture.id == capture_id,
    ).first()
    if not capture:
        raise HTTPException(404, "Capture not found")

    site = db.query(models.Site).filter(
        models.Site.id              == req.site_id,
        models.Site.organisation_id == hr.organisation_id,
    ).first()
    if not site:
        raise HTTPException(404, "Site not found in your organisation")

    capture.approved        = True
    capture.site_id         = site.id
    capture.organisation_id = hr.organisation_id
    site.site_lat           = capture.latitude
    site.site_lng           = capture.longitude
    db.commit()
    return {"message": f"GPS set for {site.name}"}


# ── HR: reject (delete) ───────────────────────────────────────────────────────

@router.delete("/{capture_id}", status_code=204)
def reject_capture(
    capture_id: int,
    db:         Session      = Depends(get_db),
    hr:         models.User  = Depends(require_hr),
):
    capture = db.query(models.GPSCapture).filter(
        models.GPSCapture.id == capture_id,
    ).first()
    if not capture:
        raise HTTPException(404, "Capture not found")
    db.delete(capture)
    db.commit()


# ── helper ────────────────────────────────────────────────────────────────────

def _fmt(c: models.GPSCapture) -> dict:
    return {
        "id":          c.id,
        "captured_by": c.captured_by,
        "site_name":   c.site_name,
        "latitude":    c.latitude,
        "longitude":   c.longitude,
        "accuracy":    c.accuracy,
        "captured_at": c.captured_at.isoformat() if c.captured_at else None,
        "approved":    c.approved,
    }
