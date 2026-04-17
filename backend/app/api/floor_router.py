import json
import logging
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Response
from pydantic import BaseModel

from app.models.floor_models import (
    FloorProject, SimulationRequest, ExportRequest, Room
)
from app.services.floor_service import FloorService

logger = logging.getLogger("floor_planner")
router = APIRouter(prefix="/floor", tags=["floor-planner"])
floor_service = FloorService()

# 메모리 내 프로젝트 저장소 (Prototype)
_projects: Dict[str, FloorProject] = {}

class ProjectCreate(BaseModel):
    name: str

@router.post("/projects", response_model=FloorProject)
async def create_project(data: ProjectCreate):
    project = floor_service.create_project(data.name)
    _projects[project.id] = project
    return project

@router.get("/projects/{project_id}", response_model=FloorProject)
async def get_project(project_id: str):
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail="Floor project not found")
    return _projects[project_id]

@router.put("/projects/{project_id}", response_model=FloorProject)
async def update_project(project_id: str, project: FloorProject):
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail="Floor project not found")
    _projects[project_id] = project
    return project

@router.post("/projects/{project_id}/simulate")
async def run_simulation(project_id: str, request: SimulationRequest):
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail="Floor project not found")
    
    project = _projects[project_id]
    result = floor_service.run_simulation(project, request)
    
    # 시뮬레이션 결과로 프로젝트 내 방 위치 업데이트
    room_map = {r.id: r for r in result.rooms}
    updated_rooms = []
    for r in project.rooms:
        if r.id in room_map:
            updated_rooms.append(room_map[r.id])
        else:
            updated_rooms.append(r)
    
    project.rooms = updated_rooms
    _projects[project_id] = project
    return result

@router.post("/projects/{project_id}/export")
async def export_project(project_id: str, request: ExportRequest):
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail="Floor project not found")
    
    project = _projects[project_id]
    
    if request.format == "json":
        data = floor_service.export_to_json(project, request.include_floors)
        return Response(
            content=json.dumps(data, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={project.name}.json"}
        )
    elif request.format == "ifc":
        try:
            ifc_bytes = floor_service.export_to_ifc(project, request.include_floors)
            return Response(
                content=ifc_bytes,
                media_type="application/octet-stream",
                headers={"Content-Disposition": f"attachment; filename={project.name}.ifc"}
            )
        except NotImplementedError as e:
            raise HTTPException(status_code=501, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported export format: {request.format}")


# --- WebSocket 연결 관리 (드래그 동기화용) ---

class FloorConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str):
        await websocket.accept()
        self.active_connections.setdefault(project_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        if project_id in self.active_connections:
            if websocket in self.active_connections[project_id]:
                self.active_connections[project_id].remove(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]

    async def broadcast(self, message: dict, project_id: str, exclude: Optional[WebSocket] = None):
        for connection in list(self.active_connections.get(project_id, [])):
            if connection == exclude:
                continue
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection, project_id)

manager = FloorConnectionManager()

@router.websocket("/projects/{project_id}/ws")
async def floor_websocket_endpoint(websocket: WebSocket, project_id: str):
    await manager.connect(websocket, project_id)
    try:
        while True:
            data = await websocket.receive_json()
            # 예: {"type": "room_drag", "room_id": "...", "x": 1.0, "y": 2.0}
            if data.get("type") == "room_drag" and project_id in _projects:
                room_id = data.get("room_id")
                new_x = data.get("x")
                new_y = data.get("y")
                
                project = _projects[project_id]
                for room in project.rooms:
                    if room.id == room_id:
                        room.x = new_x
                        room.y = new_y
                        room.locked = True  # 드래그 중인 방은 위치 고정
                        break
                
                # 다른 클라이언트에게 위치 브로드캐스트
                await manager.broadcast({
                    "type": "room_update",
                    "room_id": room_id,
                    "x": new_x,
                    "y": new_y
                }, project_id, exclude=websocket)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, project_id)
