"""Словарь Mini App (webapp/i18n.json): каждый ключ, который фронт запрашивает литералом,
есть в ru, uk и es, а лишних (никем не запрашиваемых) ключей нет.

Без перевода пользователь видит служебное имя ключа (например, «todayFixByManager»):
t() возвращает сам ключ, если перевода нет.
Код ищется в исходниках webapp/src/*.js и в webapp/index.html (app.js из них собирается).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = "".join(p.read_text(encoding="utf-8")
              for p in sorted((ROOT / "webapp" / "src").glob("*.js")))
INDEX = (ROOT / "webapp" / "index.html").read_text(encoding="utf-8")
I18N = json.loads((ROOT / "webapp" / "i18n.json").read_text(encoding="utf-8"))
LANGS = ("ru", "uk", "es")


def _literal_keys() -> set[str]:
    used = set(re.findall(r"\bt\('([A-Za-z0-9_.]+)'", SRC))
    used |= set(re.findall(r'data-i18n(?:-placeholder)?="([A-Za-z0-9_.]+)"', SRC + INDEX))
    # t('status.' + s) — динамический ключ, литерально виден только префикс.
    return {k for k in used if not k.endswith(".")}


def _dynamic_prefixes() -> set[str]:
    return set(re.findall(r"\bt\('([A-Za-z0-9_]+\.)'\s*\+", SRC))


def test_sources_present():
    assert SRC, "нет исходников webapp/src/*.js"
    assert set(I18N) == set(LANGS), sorted(I18N)
    assert _literal_keys(), "не найдено ни одного t('...') — сломан разбор исходников"


def test_all_used_keys_translated():
    used = _literal_keys()
    missing = {lang: sorted(used - set(I18N[lang])) for lang in LANGS}
    assert missing == {lang: [] for lang in LANGS}, missing


def test_dynamic_prefixes_have_keys():
    for prefix in _dynamic_prefixes():
        for lang in LANGS:
            assert any(k.startswith(prefix) for k in I18N[lang]), (lang, prefix)


def test_no_unused_keys():
    """Лишних ключей нет: каждый ключ словаря код запрашивает — литералом t('ключ'),
    через data-i18n / data-i18n-placeholder или динамическим префиксом t('status.' + x).
    Ключ, переданный в t() через переменную, тест не видит — пишите t('ключ') литералом.
    """
    used = _literal_keys()
    prefixes = _dynamic_prefixes()
    unused = {lang: sorted(k for k in I18N[lang]
                           if k not in used and not any(k.startswith(p) for p in prefixes))
              for lang in LANGS}
    assert unused == {lang: [] for lang in LANGS}, unused


def test_languages_have_same_keys():
    ru = set(I18N["ru"])
    for lang in ("uk", "es"):
        other = set(I18N[lang])
        assert ru == other, {"нет в " + lang: sorted(ru - other), "лишние в " + lang: sorted(other - ru)}


def test_values_are_non_empty_strings():
    bad = [(lang, k) for lang in LANGS for k, v in I18N[lang].items()
           if not isinstance(v, str) or not v.strip()]
    assert bad == []
