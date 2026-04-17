from fastapi import APIRouter
from app.api import project_router  # This will be created soon

api_router = APIRouter()
api_router.include_router(project_router.router, prefix="/projects", tags=["projects"])
