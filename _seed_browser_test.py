import os
os.environ['DATABASE_URL'] = 'sqlite:///./_browser_test.db'
from app.db import Base, engine
from sqlalchemy.orm import Session
import app.models as m

for cls in (m.User, m.Client, m.Location, m.Task, m.TaskLocation):
    print(cls.__name__, [c.name for c in cls.__table__.columns])

Base.metadata.create_all(engine)
s = Session(engine)


def mk(cls, **kw):
    ok = {k: v for k, v in kw.items() if hasattr(cls, k)}
    o = cls(**ok)
    s.add(o)
    s.flush()
    return o


mg = s.query(m.User).filter_by(tg_id=555000111).first()
if not mg:
    mg = mk(m.User, tg_id=555000111, name='Test Manager', is_manager=True, lang=m.Lang.ru)
w = s.query(m.User).filter_by(tg_id=555000222).first()
if not w:
    w = mk(m.User, tg_id=555000222, name='Petr Worker', is_manager=False, lang=m.Lang.ru)
cl = s.query(m.Client).first() or mk(m.Client, name='Test Farm')
loc = s.query(m.Location).first() or mk(m.Location, name='Field 1', client_id=cl.id)
s.commit()
print('SEED mg=%s w=%s client=%s loc=%s tasks=%s' % (mg.id, w.id, cl.id, loc.id, s.query(m.Task).count()))
