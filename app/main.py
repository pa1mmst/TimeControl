"""Главный файл приложения. Подключает все модули (роутеры)."""
from fastapi import FastAPI

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

@app.get("/")
def health():
    """Проверка, что сервер жив."""
    return {"status": "ok"}
