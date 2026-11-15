"""Единый словарь (ТЗ 11.11.2026, этап 1, п. 4.1): в интерфейсе и в боте нет старых слов.

Проверяются русские тексты, которые реально видит пользователь:
- значения ключей словаря Mini App, которые код запрашивает литералом t('...');
- видимый текст index.html;
- тексты бота app/i18n/ru.json.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_JS = (ROOT / "webapp" / "app.js").read_text(encoding="utf-8")
INDEX = (ROOT / "webapp" / "index.html").read_text(encoding="utf-8")
BOT_RU = json.loads((ROOT / "app" / "i18n" / "ru.json").read_text(encoding="utf-8"))

# Старое слово -> каким должно быть (для сообщения об ошибке).
OLD_TERMS = {
    r"[Сс]отрудник": "Люди (список), роль: Работник",
    r"\bКоманда\b": "Люди",
    r"[Нн]ачислен": "Заработано",
    r"\bФОТ\b": "Заработано / К выплате",
    r"[Мм]не причитается": "К выплате",
    r"[Вв]вести часы": "Записать часы",
    r"[Бб]ез часов": "Не отметился",
    r"[Сс]егодня не отмечено": "Сегодня часов нет",
    r"[Мм]атриц": "Часы по дням",
    r"[Пп]редпросмотр": "Проверить расчёт",
    r"[Зз]акрыть период": "Закрыть расчёт",
    r"[Уу]чётчик": "роли нет (решение владельца 15.11.2026)",
    r"[Сс]водк": "Деньги / Отчёты",
}


def _ru_block() -> str:
    start = APP_JS.index("        ru: {")
    return APP_JS[start:APP_JS.index("\n        }", start)]


def _used_ru_texts() -> dict[str, str]:
    pairs = dict(re.findall(r"'([A-Za-z0-9_.]+)'\s*:\s*'((?:[^'\\]|\\.)*)'", _ru_block()))
    used = set(re.findall(r"\bt\('([A-Za-z0-9_.]+)'", APP_JS))
    used |= set(re.findall(r'data-i18n(?:-placeholder)?="([A-Za-z0-9_.]+)"', APP_JS + INDEX))
    dynamic_prefixes = set(re.findall(r"\bt\('([A-Za-z0-9_]+\.)'\s*\+", APP_JS))
    return {k: v for k, v in pairs.items()
            if k in used or any(k.startswith(p) for p in dynamic_prefixes)}


def _visible_html_text() -> str:
    s = re.sub(r"<!--.*?-->", " ", INDEX, flags=re.DOTALL)
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", s, flags=re.DOTALL)
    return re.sub(r"<[^>]+>", " ", s)


def _hits(texts: dict[str, str]) -> list[str]:
    out = []
    for key, text in texts.items():
        for pattern, should in OLD_TERMS.items():
            if re.search(pattern, text):
                out.append(f"{key}: «{text}» — нужно: {should}")
    return out


def test_app_dictionary_uses_new_terms():
    assert _hits(_used_ru_texts()) == []


def test_index_html_uses_new_terms():
    assert _hits({"index.html": _visible_html_text()}) == []


def test_bot_texts_use_new_terms():
    assert _hits(BOT_RU) == []
