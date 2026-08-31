"""Главный файл приложения. Подключает все модули (роутеры)."""
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # читает .env из рабочей папки (BOT_TOKEN и т.д.)

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.bot.router import router as bot_router
from app.bot.telegram import setup_webhook
from app.routers import users, clients, tasks, work_entries, payroll, reports, inventory

app = FastAPI(title="AgroWork")

app.include_router(users.router)
app.include_router(clients.router)
app.include_router(tasks.router)
app.include_router(work_entries.router)
app.include_router(payroll.router)
app.include_router(reports.router)
app.include_router(inventory.router)
app.include_router(bot_router)

@app.on_event("startup")
def _bot_webhook():
    setup_webhook()  # no-op, если BOT_TOKEN/BOT_WEBHOOK_URL не заданы

# ---- Telegram Mini App (статика) ----
_WEBAPP_DIR = Path(__file__).resolve().parent.parent / "webapp"

@app.get("/")
@app.get("/app")
def mini_app():
    """Главная страница Mini App (одна и та же на / и /app)."""
    return FileResponse(_WEBAPP_DIR / "index.html")

app.mount("/app/static", StaticFiles(directory=str(_WEBAPP_DIR)), name="webapp")

@app.get("/health")
def health():
    """Проверка, что сервер жив (для мониторинга/скриптов)."""
    return {"status": "ok"}
