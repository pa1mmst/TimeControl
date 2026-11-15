"""Сборка webapp/app.js из исходников Mini App.

Исходники:
- webapp/src/*.js — фрагменты одного IIFE, склеиваются по порядку имён файлов
  (00_head.js открывает IIFE, 90_init.js закрывает; фрагменты по отдельности
  не обязаны быть законченным JS);
- webapp/i18n.json — словарь {"ru": {...}, "uk": {...}, "es": {...}}, вставляется
  на место метки __I18N_JSON__ как `const I18N = <json>;`.

Браузер получает один файл webapp/app.js (как и раньше), поэтому `?v=` в
index.html продолжает сбрасывать кэш. app.js лежит в git — его отдаёт сервер.

    python tools/build_webapp.py          # пересобрать webapp/app.js
    python tools/build_webapp.py --check  # код 1, если app.js устарел
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "webapp" / "src"
I18N_FILE = ROOT / "webapp" / "i18n.json"
OUT_FILE = ROOT / "webapp" / "app.js"
PLACEHOLDER = "__I18N_JSON__"
HEADER = (
    "/* Собрано tools/build_webapp.py из webapp/src и webapp/i18n.json — не править вручную.\n"
    " * Пересобрать: python tools/build_webapp.py */\n"
)


def i18n_literal() -> str:
    data = json.loads(I18N_FILE.read_text(encoding="utf-8"))
    # Отступ внутри IIFE — 4 пробела, как у остального кода.
    return json.dumps(data, ensure_ascii=False, indent=4).replace("\n", "\n    ")


def build() -> str:
    parts = sorted(SRC_DIR.glob("*.js"))
    if not parts:
        raise SystemExit(f"нет исходников в {SRC_DIR}")
    # read_text приводит переводы строк к \n (на Windows git может отдать CRLF).
    code = "".join(p.read_text(encoding="utf-8") for p in parts)
    if code.count(PLACEHOLDER) != 1:
        raise SystemExit(f"метка {PLACEHOLDER} должна встречаться в webapp/src ровно один раз")
    return HEADER + code.replace(PLACEHOLDER, i18n_literal())


def main() -> int:
    parser = argparse.ArgumentParser(description="Сборка webapp/app.js из webapp/src и i18n.json")
    parser.add_argument("--check", action="store_true",
                        help="не писать файл, а проверить, что webapp/app.js совпадает со сборкой")
    args = parser.parse_args()
    fresh = build()
    if args.check:
        current = OUT_FILE.read_text(encoding="utf-8") if OUT_FILE.exists() else ""
        if current != fresh:
            print("webapp/app.js устарел: пересоберите `python tools/build_webapp.py` "
                  "и закоммитьте результат.", file=sys.stderr)
            return 1
        print("webapp/app.js актуален.")
        return 0
    with open(OUT_FILE, "w", encoding="utf-8", newline="\n") as f:
        f.write(fresh)
    print(f"собран {OUT_FILE.relative_to(ROOT).as_posix()} "
          f"({len(fresh.splitlines())} строк)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
