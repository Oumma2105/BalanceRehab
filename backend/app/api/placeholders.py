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


@router.get("/sessions")
def sessions_placeholder():
    return {
        "message": "Session workflow placeholder. Demo and real acquisition modes are planned.",
        "supported_modes": ["demo", "real"],
    }


@router.get("/reports")
def reports_placeholder():
    return {
        "message": "Report generation placeholder. Reports will display session acquisition mode.",
    }
