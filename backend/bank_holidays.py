"""
England & Wales bank holiday lookup.

Fetches the official list from https://www.gov.uk/bank-holidays.json and
caches it in-process for 24 hours.  Falls back to the last good cache if
the network request fails.
"""
import logging
from datetime import datetime, timezone

import httpx

log = logging.getLogger(__name__)

_GOV_URL  = "https://www.gov.uk/bank-holidays.json"
_DIVISION = "england-and-wales"
_TTL_SECS = 86_400   # 24 hours

_cache: set[str] = set()
_fetched_at: datetime | None = None


def _refresh() -> None:
    global _cache, _fetched_at
    try:
        r = httpx.get(_GOV_URL, timeout=10, follow_redirects=True)
        r.raise_for_status()
        data   = r.json()
        events = data.get(_DIVISION, {}).get("events", [])
        _cache = {e["date"] for e in events}
        _fetched_at = datetime.now(timezone.utc)
        log.info("[BankHolidays] Loaded %d England & Wales bank holidays", len(_cache))
    except Exception as exc:
        log.warning("[BankHolidays] Fetch failed (%s) — using cached %d dates", exc, len(_cache))


def get_bank_holidays() -> set[str]:
    """Return the set of YYYY-MM-DD strings for all England & Wales bank holidays."""
    now = datetime.now(timezone.utc)
    if (
        _fetched_at is None
        or (now - _fetched_at).total_seconds() > _TTL_SECS
    ):
        _refresh()
    return _cache


def is_bank_holiday(date_str: str) -> bool:
    """Return True if date_str (YYYY-MM-DD) is an England & Wales bank holiday."""
    return date_str in get_bank_holidays()
