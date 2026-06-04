from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'balancerehab.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns()


def ensure_sqlite_columns() -> None:
    """Keep the MVP SQLite database usable as the schema grows."""
    migrations = {
        "patients": {
            "dominant_side": "VARCHAR(32)",
            "clinical_goal": "VARCHAR(240)",
        },
        "sessions": {
            "status": "VARCHAR(32)",
            "body_center_deviation": "FLOAT",
        },
        "reports": {
            "report_id": "VARCHAR(64)",
            "patient_id": "INTEGER",
            "downloadable": "BOOLEAN DEFAULT 1",
            "summary": "TEXT",
        },
    }

    with engine.begin() as connection:
        for table, columns in migrations.items():
            existing = {
                row[1]
                for row in connection.execute(text(f"PRAGMA table_info({table})")).fetchall()
            }
            for column, definition in columns.items():
                if column not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
