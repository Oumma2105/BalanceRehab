import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = os.getenv("BALANCEREHAB_DATABASE_URL", f"sqlite:///{DATA_DIR / 'balancerehab.db'}")

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
            "mean_resultant_sway": "FLOAT",
            "max_resultant_sway": "FLOAT",
            "rms_sway": "FLOAT",
            "path_length": "FLOAT",
            "sensor_quality": "FLOAT",
        },
        "posture_samples": {
            "stability_score": "FLOAT",
            "body_center_x": "FLOAT",
            "body_center_y": "FLOAT",
            "shoulder_center_x": "FLOAT",
            "shoulder_center_y": "FLOAT",
            "hip_center_x": "FLOAT",
            "hip_center_y": "FLOAT",
            "head_center_x": "FLOAT",
            "head_center_y": "FLOAT",
            "estimated_body_sway": "FLOAT",
            "hand_arm_compensation": "FLOAT",
            "movement_label": "VARCHAR(64)",
            "movement_intent": "VARCHAR(64)",
            "label_confidence": "FLOAT",
            "raw_landmarks_json": "TEXT",
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

        # Rename legacy acquisition mode values to canonical names.
        connection.execute(text("UPDATE sessions SET acquisition_mode = 'board' WHERE acquisition_mode = 'board_future'"))
        connection.execute(text("UPDATE sessions SET acquisition_mode = 'combined' WHERE acquisition_mode = 'combined_future'"))
