"""Time Control — FastAPI application entry point.

This is a minimal, dependency-light skeleton. It:

* loads environment variables from the .env file at the project root;
* builds a portable SQLite connection string (works even when the
  project folder is moved to a path containing spaces, e.g.
  "D:\\Time Control");
* configures CORS and a few always-available endpoints;
* mounts the Telegram Mini App static files (webapp/) when present;
* creates database tables on startup once app/models.py is available.

Run from the project root for development:

    uvicorn app.main:app --reload

or, as a convenience:

    python app/main.py
"""

from __future__ import annotations

import os
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ---------------------------------------------------------------------------
# Paths — never hard-code absolute paths.
# ---------------------------------------------------------------------------

# Project root: parent of the "app" package.  This resolves correctly no
# matter where the project is moved, including "D:\\Time Control".
BASE_DIR = Path(__file__).resolve().parent.parent
WEBAPP_DIR = BASE_DIR / "webapp"

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

load_dotenv(BASE_DIR / ".env")


def _database_url() -> str:
    """Return a usable SQLAlchemy database URL.

    The value from .env may be a relative SQLite URL such as
    "sqlite:///./app.db".  Relative values are anchored to the project
    root and converted to forward slashes so the path survives a move
    to a directory whose name contains spaces.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{(BASE_DIR / 'app.db').as_posix()}"

    if url.startswith("sqlite:///"):
        raw = url[len("sqlite:///"):].replace("\\", "/")

        # Absolute paths are left untouched (Unix "//path", Windows "C:/path").
        is_absolute = raw.startswith("/") or re.match(r"^[A-Za-z]:/", raw) is not None

        if is_absolute:
            url = f"sqlite:///{raw}"
        else:
            clean = raw
            while clean.startswith("./"):
                clean = clean[2:]
            if not clean:
                clean = "app.db"
            url = f"sqlite:///{(BASE_DIR / clean).as_posix()}"

    return url


DATABASE_URL = _database_url()

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
    if DATABASE_URL.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# FastAPI application and lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables and verify the database connection.

    ``app.models`` is imported lazily so the skeleton can boot even
    before the models module has been written.
    """
    try:
        from app import models  # noqa: F401

        Base.metadata.create_all(bind=engine)
    except ImportError:
        pass

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    yield

    engine.dispose()


app = FastAPI(
    title="Time Control API",
    description="Backend for the Time Control Telegram Mini App.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: wide open for development; tighten before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Liveness probe with a quick database check."""
    db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "app": app.title,
        "version": app.version,
        "database": "sqlite" if DATABASE_URL.startswith("sqlite") else "other",
    }


@app.get("/")
def index() -> FileResponse | JSONResponse:
    """Serve the Mini App, or a small JSON intro when webapp/ is absent."""
    index_file = WEBAPP_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return JSONResponse(
        {
            "message": "Time Control API is running",
            "docs": "/docs",
            "health": "/health",
        }
    )


# Mount the Telegram Mini App static files when the webapp directory exists.
if WEBAPP_DIR.is_dir():
    app.mount("/webapp", StaticFiles(directory=WEBAPP_DIR), name="webapp")


# ---------------------------------------------------------------------------
# Optional convenience entry point: python app/main.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    # Allow `python app/main.py` to work no matter the working directory.
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )