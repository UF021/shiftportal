"""
Lightweight audit-log helper.

Call log_action() inside any endpoint *before* db.commit() so the audit row
is committed atomically with the action it records.  If the action rolls back,
the audit row rolls back too — no phantom entries.
"""
import json
from sqlalchemy.orm import Session
import models


ACTION_LABELS = {
    'shift.manual_add':    'Manual shift added',
    'shift.edit':          'Shift edited',
    'shift.delete':        'Shift deleted',
    'staff.activate':      'Staff activated',
    'staff.reject':        'Registration rejected',
    'staff.block':         'Portal access blocked',
    'staff.unblock':       'Portal access restored',
    'staff.archive':       'Staff archived',
    'staff.unarchive':     'Staff unarchived',
    'holiday.approve':     'Holiday approved',
    'holiday.reject':      'Holiday rejected',
    'org.plan_change':     'Plan changed',
    'org.toggle':          'Organisation toggled',
    'org.trial_extend':    'Trial extended',
    'gdpr.erase':          'Personal data erased (GDPR)',
    'staff.import':        'Bulk CSV import',
}


def log_action(
    db:          Session,
    org_id:      int,
    actor:       'models.User',
    action:      str,
    entity_type: str,
    entity_id:   'str | int | None' = None,
    entity_name: str = '',
    detail:      dict = None,
):
    db.add(models.AuditLog(
        organisation_id = org_id,
        actor_id        = actor.id if actor else None,
        actor_name      = actor.full_name if actor else 'System',
        actor_role      = actor.role.value if actor else 'system',
        action          = action,
        entity_type     = entity_type,
        entity_id       = str(entity_id) if entity_id is not None else None,
        entity_name     = entity_name or '',
        detail          = json.dumps(detail) if detail else None,
    ))
