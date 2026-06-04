from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.demo_seed import seed_demo_data

router = APIRouter(prefix="/demo", tags=["demo-data"])


@router.post("/seed")
def seed_demo(reset: bool = False, db: Session = Depends(get_db)):
    return seed_demo_data(db, reset=reset)
