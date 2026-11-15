"""webapp/app.js собран из актуальных webapp/src/*.js и webapp/i18n.json.

Сервер отдаёт именно app.js, поэтому правка исходников без пересборки
(`python tools/build_webapp.py`) не дошла бы до пользователя.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_app_js_is_fresh_build():
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "build_webapp.py"), "--check"],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
        env=dict(os.environ, PYTHONIOENCODING="utf-8"), timeout=60, check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
