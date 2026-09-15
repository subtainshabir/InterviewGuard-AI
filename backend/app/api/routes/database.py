from fastapi import APIRouter

from app.db.session import check_database_connection

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/database")
def get_database_health() -> dict:
    if check_database_connection():
        return {"status": "ok", "database": "connected"}
    return {"status": "error", "database": "unavailable"}