"""Тестовые данные для браузерных сценариев (tests/test_browser.py).

Запуск: DATABASE_URL=sqlite:///path.db python tests/browser/seed.py
Создаёт схему и фиксированный набор данных, печатает JSON с id и tg_id.
Все даты — относительно today_local(), чтобы «Этот месяц» и «Сегодня» совпадали
с тем, что видит приложение.
"""
import json
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

if not os.environ.get("DATABASE_URL"):
    sys.exit("DATABASE_URL не задан")

from sqlalchemy.orm import Session

import app.models as m
from app.db import Base, engine
from app.tz import today_local

TG_MANAGER = 555000111
TG_WORKER = 555000222      # Пётр: основной работник сценариев
TG_WORKER2 = 555000333     # Олег: второй работник
TG_WORKER3 = 555000444     # Иван: назначен на «Сбор урожая», сегодня не отметился

Base.metadata.create_all(engine)
today = today_local()

with Session(engine) as s:
    def add(obj):
        s.add(obj)
        s.flush()
        return obj

    mgr = add(m.User(tg_id=TG_MANAGER, name="Анна Руководитель", is_manager=True,
                     hourly_rate=Decimal(0), lang=m.Lang.ru))
    w1 = add(m.User(tg_id=TG_WORKER, name="Пётр Сидоров", hourly_rate=Decimal("12.50"),
                    lang=m.Lang.ru))
    w2 = add(m.User(tg_id=TG_WORKER2, name="Олег Иванов", hourly_rate=Decimal("10.00"),
                    lang=m.Lang.ru))
    w3 = add(m.User(tg_id=TG_WORKER3, name="Иван Петров", hourly_rate=Decimal("11.00"),
                    lang=m.Lang.ru))
    cl = add(m.Client(name="Ферма Солнечная"))
    loc1 = add(m.Location(client_id=cl.id, name="Поле 1 (север)"))
    loc2 = add(m.Location(client_id=cl.id, name="Поле 2"))

    t1 = add(m.Task(title="Сбор урожая — томаты", client_id=cl.id,
                    status=m.TaskStatus.active, created_by=mgr.id, date_start=today))
    t2 = add(m.Task(title="Полив", client_id=cl.id,
                    status=m.TaskStatus.active, created_by=mgr.id, date_start=today))
    add(m.TaskLocation(task_id=t1.id, location_id=loc1.id))
    add(m.TaskLocation(task_id=t2.id, location_id=loc2.id))
    for task, user in ((t1, w1), (t1, w2), (t1, w3), (t2, w1), (t2, w2)):
        add(m.TaskAssignment(task_id=task.id, user_id=user.id))

    # Сегодня: Пётр 4 ч на «Поливе» (50,00 €), Олег 6 ч на «Поливе» (60,00 €).
    # На «Сборе урожая» сегодня часов нет ни у кого — их записывают сценарии.
    add(m.WorkEntry(user_id=w1.id, task_id=t2.id, location_id=loc2.id, work_date=today,
                    hours=Decimal(4), rate_snapshot=w1.hourly_rate, entered_by=w1.id))
    add(m.WorkEntry(user_id=w2.id, task_id=t2.id, location_id=loc2.id, work_date=today,
                    hours=Decimal(6), rate_snapshot=w2.hourly_rate, entered_by=w2.id))
    # Аванс Петру сегодня: 20,00 €. К выплате Петру = 50,00 − 20,00 = 30,00 €.
    add(m.Advance(user_id=w1.id, amount=Decimal("20.00"), date=today,
                  comment="seed", created_by=mgr.id))
    add(m.InventoryItem(name="Секатор №3", holder_id=w1.id))
    s.commit()

    print(json.dumps({
        "today": today.isoformat(),
        "manager": {"id": mgr.id, "tg_id": TG_MANAGER, "name": mgr.name},
        "worker": {"id": w1.id, "tg_id": TG_WORKER, "name": w1.name},
        "worker2": {"id": w2.id, "tg_id": TG_WORKER2, "name": w2.name},
        "worker3": {"id": w3.id, "tg_id": TG_WORKER3, "name": w3.name},
        "task_harvest": t1.id,
        "task_water": t2.id,
    }, ensure_ascii=False))
