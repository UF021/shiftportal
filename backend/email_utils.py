"""
Centralised email sending for all Tyma notifications.

All outbound email goes through send_email().  If RESEND_API_KEY is not set
the call is a no-op so the rest of the app works normally in dev/test.

From-address:  EMAIL_FROM env var (default: noreply@tyma.io).
               Must be a domain verified with Resend.
BCC:           BCC_EMAIL env var (optional — useful for support audit trail).
"""
import os
import logging
import resend

log = logging.getLogger(__name__)


def send_email(
    to:         str,
    subject:    str,
    body:       str,
    from_name:  str = "Tyma Notifications",
    reply_to:   str = None,
) -> bool:
    api_key   = os.getenv("RESEND_API_KEY")
    from_addr = os.getenv("EMAIL_FROM", "hr@ikanfm.co.uk")
    bcc       = os.getenv("BCC_EMAIL")

    if not api_key:
        log.info("[EMAIL] No RESEND_API_KEY — skipping send to %s | %s", to, subject)
        return False

    try:
        resend.api_key = api_key
        payload: dict = {
            "from":    f"{from_name} <{from_addr}>",
            "to":      [to],
            "subject": subject,
            "text":    body,
        }
        if bcc:
            payload["bcc"] = [bcc]
        if reply_to:
            payload["reply_to"] = reply_to
        resend.Emails.send(payload)
        log.info("[EMAIL] Sent '%s' to %s", subject, to)
        return True
    except Exception as exc:
        log.error("[EMAIL] Failed to send '%s' to %s: %s", subject, to, exc)
        return False


def org_sender(org) -> str:
    """Display name for org-specific emails: 'Acme Security via Tyma'."""
    return f"{org.brand_name or org.name} via Tyma"


def org_reply_to(org) -> str:
    """Reply-to address routes replies back to the org."""
    return org.brand_email or org.contact_email
