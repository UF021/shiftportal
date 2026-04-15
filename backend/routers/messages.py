import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from auth_utils import get_current_user, require_hr
import models

router = APIRouter()


class SendMessageRequest(BaseModel):
    title:        str
    body:         str
    priority:     str = 'normal'   # 'normal' | 'urgent' | 'info'
    recipient_id: Optional[int] = None   # None = broadcast to all staff


# ── HR: send a message ────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def send_message(
    req: SendMessageRequest,
    db:  Session     = Depends(get_db),
    hr:  models.User = Depends(require_hr),
):
    if req.recipient_id:
        target = db.query(models.User).filter(models.User.id == req.recipient_id).first()
        if not target or target.organisation_id != hr.organisation_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipient not found")

    msg = models.Message(
        organisation_id = hr.organisation_id,
        sent_by         = hr.id,
        recipient_id    = req.recipient_id,
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
    # Broadcast messages (recipient_id is None) + personal messages for this user
    rows = (
        db.query(models.Message)
        .filter(
            models.Message.organisation_id == user.organisation_id,
            (
                (models.Message.recipient_id == None) |
                (models.Message.recipient_id == user.id)
            ),
        )
        .order_by(models.Message.sent_at.desc())
        .all()
    )
    result = []
    for m in rows:
        read_ids = json.loads(m.read_by or '[]')
        result.append({
            "id":         m.id,
            "title":      m.title,
            "body":       m.body,
            "priority":   m.priority,
            "sent_at":    m.sent_at.isoformat() if m.sent_at else None,
            "is_read":    user.id in read_ids,
            "is_broadcast": m.recipient_id is None,
            "sender_name": m.sender.full_name if m.sender else "HR",
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
    # Total active staff count for read-receipt denominator
    total_staff = db.query(models.User).filter(
        models.User.organisation_id == hr.organisation_id,
        models.User.role            == models.UserRole.staff,
        models.User.is_active       == True,
    ).count()

    rows = (
        db.query(models.Message)
        .filter(models.Message.organisation_id == hr.organisation_id)
        .order_by(models.Message.sent_at.desc())
        .all()
    )
    result = []
    for m in rows:
        read_ids   = json.loads(m.read_by or '[]')
        read_count = len(read_ids)
        if m.recipient_id:
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
            "is_broadcast":   m.recipient_id is None,
            "read_count":     read_count,
            "total_staff":    denom,
            "sender_name":    m.sender.full_name if m.sender else "HR",
        })
    return result
