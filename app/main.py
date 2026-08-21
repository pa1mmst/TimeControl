"""Главный файл приложения. Подключает все модули (роутеры)."""
from fastapi import FastAPI

from app.routers import users, clients, tasks, work_entries

app = FastAPI(title="AgroWork")

app.include_router(users.router)
app.include_router(clients.router)
app.include_router(tasks.router)
app.include_router(work_entries.router)

@app.get("/")
def health():
    """Проверка, что сервер жив."""
    return {"status": "ok"}
