from fastapi import APIRouter

from app.api.routes import candidates, database, health, interviews

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(database.router)
api_router.include_router(candidates.router)
api_router.include_router(interviews.router)