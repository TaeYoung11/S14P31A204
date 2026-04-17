from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Integer
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

class BIMHistory(Base):
    __tablename__ = "bim_history"

    id = Column(String, primary_key=True, index=True, default=lambda: f"hist_{uuid.uuid4().hex[:8]}")
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    command_text = Column(String, nullable=False)
    action_type = Column(String, nullable=False)  # modify, delete, add, undo, redo
    snapshot_path = Column(String, nullable=True)  # Path to the IFC backup file
    affected_elements_count = Column(Integer, default=0)
    delta_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
