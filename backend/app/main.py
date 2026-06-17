from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import demo, health, ml, patients, placeholders, reports, sessions
from app.database import init_db

app = FastAPI(
    title="BalanceRehab API",
    description="Educational rehabilitation-support prototype API.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(health.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(ml.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(placeholders.router, prefix="/api")
