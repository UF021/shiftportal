import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from auth_utils import get_current_user, require_hr
import models

router = APIRouter()


class SendMessageRequest(BaseModel):
    title:         str
    body:          str
    priority:      str = 'normal'          # 'normal' | 'urgent' | 'info'
    recipient_id:  Optional[int] = None    # single recipient (kept for compatibility)
    recipient_ids: Optional[List[int]] = None  # multi-select — takes priority over recipient_id


# ── HR: send a message ────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def send_message(
    req: SendMessageRequest,
    db:  Session     = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    # Resolve recipient list
    if req.recipient_ids is not None:
        # Multi-select path
        if len(req.recipient_ids) == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No recipients selected")
        targets = db.query(models.User).filter(
            models.User.id.in_(req.recipient_ids),
            models.User.organisation_id == hr.organisation_id,
            models.User.role            == models.UserRole.staff,
            models.User.is_blocked      == False,
            models.User.is_active       == True,
        ).all()
        if not targets:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No valid recipients found")
        stored_ids = [t.id for t in targets]
        msg = models.Message(
            organisation_id = hr.organisation_id,
            sent_by         = hr.id,
            recipient_id    = None,
            recipient_ids   = json.dumps(stored_ids),
            title           = req.title.strip(),
            body            = req.body.strip(),
            priority        = req.priority,
            read_by         = '[]',
        )
    elif req.recipient_id:
        # Single-recipient path (legacy / direct message)
        target = db.query(models.User).filter(
            models.User.id              == req.recipient_id,
            models.User.organisation_id == hr.organisation_id,
        ).first()
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipient not found")
        msg = models.Message(
            organisation_id = hr.organisation_id,
            sent_by         = hr.id,
            recipient_id    = req.recipient_id,
            recipient_ids   = None,
            title           = req.title.strip(),
            body            = req.body.strip(),
            priority        = req.priority,
            read_by         = '[]',
        )
    else:
        # Broadcast — recipient_id = None, recipient_ids = None
        msg = models.Message(
            organisation_id = hr.organisation_id,
            sent_by         = hr.id,
            recipient_id    = None,
            recipient_ids   = None,
            title           = req.title.strip(),
            body            = req.body.strip(),
            priority        = req.priority,
            read_by         = '[]',
        )

    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"message": "Message sent", "id": msg.id}


# ── Staff: get my messages ────────────────────────────────────────────────────

@router.get("/my")
def my_messages(
    db:   Session     = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    all_org_msgs = (
        db.query(models.Message)
        .filter(models.Message.organisation_id == user.organisation_id)
        .order_by(models.Message.sent_at.desc())
        .all()
    )

    result = []
    for m in all_org_msgs:
        # Determine visibility
        if m.recipient_ids is not None:
            ids = json.loads(m.recipient_ids)
            if user.id not in ids:
                continue
        elif m.recipient_id is not None:
            if m.recipient_id != user.id:
                continue
        # else: broadcast — visible to all

        read_ids = json.loads(m.read_by or '[]')
        personalised_body = m.body.replace('{first_name}', user.first_name)
        result.append({
            "id":           m.id,
            "title":        m.title,
            "body":         personalised_body,
            "priority":     m.priority,
            "sent_at":      m.sent_at.isoformat() if m.sent_at else None,
            "is_read":      user.id in read_ids,
            "is_broadcast": m.recipient_id is None and m.recipient_ids is None,
            "sender_name":  m.sender.full_name if m.sender else "HR",
        })
    return result


# ── Staff: mark a message as read ─────────────────────────────────────────────

@router.patch("/{msg_id}/read")
def mark_read(
    msg_id: int,
    db:     Session     = Depends(get_db),
    user:   models.User = Depends(get_current_user),
):
    msg = db.query(models.Message).filter(models.Message.id == msg_id).first()
    if not msg or msg.organisation_id != user.organisation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

    read_ids = json.loads(msg.read_by or '[]')
    if user.id not in read_ids:
        read_ids.append(user.id)
        msg.read_by = json.dumps(read_ids)
        db.commit()
    return {"ok": True}


# ── HR: all sent messages with read receipts ──────────────────────────────────

@router.get("/all")
def all_messages(
    db: Session     = Depends(get_db),
    hr: models.User = Depends(require_hr),
):
    total_staff = db.query(models.User).filter(
        models.User.organisation_id == hr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
        models.User.is_blocked      == False,
    ).count()

    rows = (
        db.query(models.Message)
        .filter(models.Message.organisation_id == hr.organisation_id)
        .order_by(models.Message.sent_at.desc())
        .all()
    )

    # Build a name lookup for multi-recipient display
    all_staff_map = {
        u.id: u.full_name
        for u in db.query(models.User).filter(
            models.User.organisation_id == hr.organisation_id,
            models.User.role            == models.UserRole.staff,
        ).all()
    }

    result = []
    for m in rows:
        read_ids   = json.loads(m.read_by or '[]')
        read_count = len(read_ids)

        if m.recipient_ids is not None:
            ids = json.loads(m.recipient_ids)
            names = [all_staff_map.get(i, '—') for i in ids]
            if len(names) <= 2:
                recipient_name = ', '.join(names)
            else:
                recipient_name = f"{names[0]}, {names[1]} +{len(names) - 2} more"
            denom = len(ids)
        elif m.recipient_id:
            recipient_name = m.recipient.full_name if m.recipient else "—"
            denom          = 1
        else:
            recipient_name = "All Staff"
            denom          = total_staff

        result.append({
            "id":             m.id,
            "title":          m.title,
            "body":           m.body,
            "priority":       m.priority,
            "sent_at":        m.sent_at.isoformat() if m.sent_at else None,
            "recipient_name": recipient_name,
            "is_broadcast":   m.recipient_id is None and m.recipient_ids is None,
            "read_count":     read_count,
            "total_staff":    denom,
            "sender_name":    m.sender.full_name if m.sender else "HR",
        })
    return result
