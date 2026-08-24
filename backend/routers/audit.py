"""
Audit log router — read-only endpoints for HR and superadmin.
Writes are done via audit_utils.log_action() called from other routers.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from auth_utils import require_hr, require_superadmin
from audit_utils import ACTION_LABELS
import models

router = APIRouter()


def _format(row: models.AuditLog) -> dict:
    detail = None
    if row.detail:
        try:
            detail = json.loads(row.detail)
        except Exception:
            detail = row.detail
    return {
        "id":           row.id,
        "created_at":   row.created_at.isoformat() if row.created_at else None,
        "actor_name":   row.actor_name,
        "actor_role":   row.actor_role,
        "action":       row.action,
        "action_label": ACTION_LABELS.get(row.action, row.action),
        "entity_type":  row.entity_type,
        "entity_id":    row.entity_id,
        "entity_name":  row.entity_name,
        "detail":       detail,
    }


@router.get("/")
def get_audit_log(
    page:        int = Query(1, ge=1),
    per_page:    int = Query(50, ge=1, le=200),
    action:      str = Query(None),
    search:      str = Query(None),
    date_from:   str = Query(None),
    date_to:     str = Query(None),
    db:          Session = Depends(get_db),
    hr:          models.User = Depends(require_hr),
):
    q = db.query(models.AuditLog).filter(
        models.AuditLog.organisation_id == hr.organisation_id
    )
    if action:
        q = q.filter(models.AuditLog.action == action)
    if search:
        term = f'%{search.lower()}%'
        q = q.filter(
            models.AuditLog.entity_name.ilike(term) |
            models.AuditLog.actor_name.ilike(term)
        )
    if date_from:
        try:
            q = q.filter(models.AuditLog.created_at >= datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(models.AuditLog.created_at <= datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc))
        except ValueError:
            pass

    total = q.count()
    rows  = q.order_by(models.AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    (total + per_page - 1) // per_page,
        "items":    [_format(r) for r in rows],
        "actions":  list(ACTION_LABELS.keys()),
    }


@router.get("/superadmin")
def get_audit_log_all(
    page:     int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    org_id:   int = Query(None),
    action:   str = Query(None),
    db:       Session = Depends(get_db),
    _:        models.User = Depends(require_superadmin),
):
    q = db.query(models.AuditLog)
    if org_id:
        q = q.filter(models.AuditLog.organisation_id == org_id)
    if action:
        q = q.filter(models.AuditLog.action == action)

    total = q.count()
    rows  = q.order_by(models.AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page":  page,
        "items": [_format(r) for r in rows],
    }
