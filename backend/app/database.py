from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


def _normalize(url: str) -> str:
    if url.startswith("sqlite:///") and not url.startswith("sqlite:////") and ":memory:" not in url:
        return "sqlite:///" + str(Path(url[len("sqlite:///"):]).resolve())
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalize(settings.database_url)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


NEW_COLUMNS = {"properties": {"indicators": "JSON", "planning": "JSON"}}


def init_db():
    import app.db_models  # noqa: F401
    from sqlalchemy import inspect, text

    Base.metadata.create_all(bind=engine)
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in NEW_COLUMNS.items():
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, kind in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {kind}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
