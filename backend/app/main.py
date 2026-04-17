from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
import os

from app.core.database import engine, Base
# Import models to register them with Base
from app.models.project import Project
from app.models.history import BIMHistory

# Ensure storage directories exist at module level
# This is necessary because StaticFiles checks for directory existence on initialization
os.makedirs(settings.IFC_STORAGE_DIR, exist_ok=True)
os.makedirs(settings.BACKUP_STORAGE_DIR, exist_ok=True)
os.makedirs(settings.RENDER_STORAGE_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to BIM 3D Service API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.PROJECT_NAME}

# Routers
from app.api.router import api_router
from app.api.websocket import router as ws_router
from app.api.floor_router import router as floor_router

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(floor_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)

# Static Files for Renders
app.mount("/static/renders", StaticFiles(directory=settings.RENDER_STORAGE_DIR), name="renders")

