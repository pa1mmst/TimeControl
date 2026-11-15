"""Словарь Mini App: каждый ключ, который фронт запрашивает литералом, есть в ru, uk и es.

Без этого пользователь видит служебное имя ключа (например, «fixNoReason»):
t() возвращает сам ключ, если перевода нет.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_JS = (ROOT / "webapp" / "app.js").read_text(encoding="utf-8")
INDEX = (ROOT / "webapp" / "index.html").read_text(encoding="utf-8")
LANGS = ("ru", "uk", "es")


def _dict_keys(lang: str) -> set[str]:
    start = APP_JS.index(f"        {lang}: {{")
    end = APP_JS.index("\n        }", start)
    return set(re.findall(r"'([A-Za-z0-9_.]+)'\s*:", APP_JS[start:end]))


def _used_keys() -> set[str]:
    used = set(re.findall(r"\bt\('([A-Za-z0-9_.]+)'", APP_JS))
    used |= set(re.findall(r'data-i18n(?:-placeholder)?="([A-Za-z0-9_.]+)"', APP_JS + INDEX))
    # t('status.' + s) — динамический ключ, литерально виден только префикс.
    return {k for k in used if not k.endswith(".")}


def test_all_used_keys_translated():
    used = _used_keys()
    missing = {lang: sorted(used - _dict_keys(lang)) for lang in LANGS}
    assert missing == {lang: [] for lang in LANGS}, missing


def test_languages_have_same_keys():
    ru = _dict_keys("ru")
    for lang in ("uk", "es"):
        other = _dict_keys(lang)
        assert ru == other, {"нет в " + lang: sorted(ru - other), "лишние в " + lang: sorted(other - ru)}
