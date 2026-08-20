"""Главный файл приложения. Подключает все модули (роутеры)."""
from fastapi import FastAPI

from app.routers import clients, users

app = FastAPI(title="AgroWork")

app.include_router(users.router)
app.include_router(clients.router)


@app.get("/")
def health():
    """Проверка, что сервер жив."""
    return {"status": "ok"}
