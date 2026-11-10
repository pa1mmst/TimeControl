"""Ежедневный бэкап SQLite (online, через API src.backup — без остановки приложения).

Запуск: python tools/backup_db.py [путь_к_бд] [каталог_бэкапов]
По умолчанию: DB_PATH из окружения (или app.db) → backups/ рядом с базой.
Ротация: хранит последние 30 файлов backup_*.db, старые удаляет.
"""
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEEP = 30


def main() -> None:
    src_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        os.getenv("DB_PATH", ROOT / "app.db"))
    dst_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else src_path.parent / "backups"
    dst_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst_path = dst_dir / f"backup_{stamp}.db"

    src = sqlite3.connect(str(src_path))
    dst = sqlite3.connect(str(dst_path))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    backups = sorted(dst_dir.glob("backup_*.db"))
    for old in backups[:-KEEP]:
        old.unlink()

    print(dst_path)


if __name__ == "__main__":
    main()
