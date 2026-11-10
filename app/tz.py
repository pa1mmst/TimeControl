"""Локальное время хозяйства: испанские сельхозработы живут по Europe/Madrid."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Madrid")


def today_local() -> date:
    return datetime.now(TZ).date()
