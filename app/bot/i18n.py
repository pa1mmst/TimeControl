"""Загрузка переводов из app/i18n/*.json (SPEC: ни одной строки текста в коде)."""
import json
from pathlib import Path

_DIR = Path(__file__).resolve().parent.parent / "i18n"
_cache: dict[str, dict] = {}
_DEFAULT = "ru"


def _load(lang: str) -> dict:
    if lang not in _cache:
        path = _DIR / f"{lang}.json"
        if not path.exists():
            path = _DIR / f"{_DEFAULT}.json"
        _cache[lang] = json.loads(path.read_text(encoding="utf-8"))
    return _cache[lang]


def t(lang, key: str, **kwargs) -> str:
    """t(user.lang, 'hours_saved_self', hours=8, task='Сбор урожая')"""
    code = getattr(lang, "value", lang) or _DEFAULT
    text = _load(code).get(key) or _load(_DEFAULT).get(key) or key
    return text.format(**kwargs) if kwargs else text
