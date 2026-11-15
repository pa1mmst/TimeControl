"""Выбор задания inline-кнопками вместо «8 /t12» (ТЗ этап 1, п. 4.5)."""
import pytest

from app.bot.telegram import WEBHOOK_SECRET
from app.db import SessionLocal
from app.models import (
    Client,
    Task,
    TaskAssignment,
    TaskStatus,
    User,
    WorkEntry,
)

H = {"X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET}
TG = 424242


@pytest.fixture(scope="module")
def world(fresh_db):
    db = SessionLocal()
    boss = User(name="Босс2", is_manager=True, is_active=True, tg_id=424200)
    w = User(name="Рабочий", is_active=True, tg_id=TG, lang="ru")
    db.add_all([boss, w])
    db.flush()
    c = Client(name="Заказчик")
    db.add(c)
    db.flush()
    tasks = [Task(title=n, client_id=c.id, status=TaskStatus.active,
                  created_by=boss.id) for n in ("Сбор урожая", "Полив")]
    foreign = Task(title="Чужое", client_id=c.id, status=TaskStatus.active,
                   created_by=boss.id)
    db.add_all([*tasks, foreign])
    db.flush()
    for tk in tasks:
        db.add(TaskAssignment(task_id=tk.id, user_id=w.id))
    db.commit()
    out = {"uid": w.id, "t1": tasks[0].id, "t2": tasks[1].id, "foreign": foreign.id}
    db.close()
    return out


def _msg(text):
    return {"message": {"chat": {"id": TG}, "from": {"id": TG}, "text": text}}


def _cb(data):
    return {"callback_query": {"id": "c", "from": {"id": TG},
                               "message": {"chat": {"id": TG}}, "data": data}}


def _count(uid, task_id):
    db = SessionLocal()
    n = db.query(WorkEntry).filter(WorkEntry.user_id == uid,
                                   WorkEntry.task_id == task_id).count()
    db.close()
    return n


def test_keyboard_for_two_tasks(client, fake_telegram, world):
    fake_telegram.sent.clear()
    client.post("/bot/webhook", json=_msg("8"), headers=H)
    _chat, text, kb = fake_telegram.sent[-1]
    assert "8" in text and kb is not None
    btns = [b for row in kb["inline_keyboard"] for b in row]
    assert len(btns) == 2
    assert {b["callback_data"] for b in btns} == {
        f"h:{world['t1']}:8", f"h:{world['t2']}:8"}
    assert any("Сбор урожая" in b["text"] for b in btns)
    assert any("Полив" in b["text"] for b in btns)
    assert "/t" not in text


def test_callback_creates_entry_once(client, fake_telegram, world):
    fake_telegram.sent.clear()
    data = f"h:{world['t1']}:8"
    client.post("/bot/webhook", json=_cb(data), headers=H)
    assert _count(world["uid"], world["t1"]) == 1
    assert "Сбор урожая" in fake_telegram.sent[-1][1]
    assert "✅" in fake_telegram.sent[-1][1]
    # повторное нажатие — второй записи нет
    client.post("/bot/webhook", json=_cb(data), headers=H)
    assert _count(world["uid"], world["t1"]) == 1
    assert "⚠️" in fake_telegram.sent[-1][1]


def test_callback_foreign_task(client, fake_telegram, world):
    client.post("/bot/webhook", json=_cb(f"h:{world['foreign']}:8"), headers=H)
    assert _count(world["uid"], world["foreign"]) == 0
    assert "недоступно" in fake_telegram.sent[-1][1]
    client.post("/bot/webhook", json=_cb("h:abc:8"), headers=H)
    client.post("/bot/webhook", json=_cb(f"h:{world['t2']}:99"), headers=H)
    assert _count(world["uid"], world["t2"]) == 0


def test_typed_t_form_still_works(client, fake_telegram, world):
    client.post("/bot/webhook", json=_msg(f"7,5 /t{world['t2']}"), headers=H)
    assert _count(world["uid"], world["t2"]) == 1
    assert "✅" in fake_telegram.sent[-1][1]
