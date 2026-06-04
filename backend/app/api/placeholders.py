from fastapi import APIRouter

router = APIRouter(tags=["mvp-placeholders"])


@router.get("/dashboard/summary")
def dashboard_summary():
    return {
        "total_patients": 0,
        "total_sessions": 0,
        "average_stability_score": None,
        "last_assessment": None,
        "mode": "demo",
    }
