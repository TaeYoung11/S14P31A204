from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "BIM 3D Service"
    API_V1_STR: str = "/api/v1"
    
    # Ollama Settings
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen2.5:7b"
    
    # Database Settings
    DATABASE_URL: str = "postgresql://postgres:1234@localhost:5432/bim_db"
    
    # Redis Settings
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Stable Diffusion Settings
    SD_BASE_URL: str = "http://localhost:7860"
    
    # Storage Settings
    STORAGE_DIR: str = "storage"
    IFC_STORAGE_DIR: str = "storage/ifc"
    BACKUP_STORAGE_DIR: str = "storage/backups"
    RENDER_STORAGE_DIR: str = "storage/renders"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
