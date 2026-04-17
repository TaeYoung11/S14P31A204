from __future__ import annotations

import logging
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.authoring_state import authoring_state

router = APIRouter()
logger = logging.getLogger("bim_websocket")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str):
        await websocket.accept()
        self.active_connections.setdefault(project_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        if project_id not in self.active_connections:
            return
        if websocket in self.active_connections[project_id]:
            self.active_connections[project_id].remove(websocket)
        if not self.active_connections[project_id]:
            del self.active_connections[project_id]

    async def send_json(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)

    async def broadcast(self, message: dict, project_id: str):
        for connection in list(self.active_connections.get(project_id, [])):
            try:
                await connection.send_json(message)
            except Exception:
                logger.exception("Failed to broadcast websocket message for project %s", project_id)
                self.disconnect(connection, project_id)


manager = ConnectionManager()


@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await manager.connect(websocket, project_id)
    joined_session_id = None

    try:
        await manager.send_json(
            websocket,
            {
                "type": "connected",
                "project_id": project_id,
                "message": f"Connected to {project_id}",
                "model_revision": authoring_state.get_revision(project_id),
            },
        )
        await manager.send_json(websocket, authoring_state.serialize_presence(project_id))
        await manager.send_json(websocket, authoring_state.serialize_locks(project_id))
        await manager.send_json(websocket, authoring_state.serialize_previews(project_id))

        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "ping":
                await manager.send_json(websocket, {"type": "pong"})
                continue

            if message_type == "presence.join":
                joined_session_id = data.get("session_id")
                if joined_session_id:
                    authoring_state.touch_session(
                        project_id,
                        joined_session_id,
                        display_name=data.get("display_name"),
                    )
                    await manager.broadcast(authoring_state.serialize_presence(project_id), project_id)
                continue

            if message_type == "selection.set":
                session_id = data.get("session_id")
                if session_id:
                    authoring_state.touch_session(
                        project_id,
                        session_id,
                        selection=data.get("selection"),
                    )
                    await manager.broadcast(authoring_state.serialize_presence(project_id), project_id)
                continue

            if message_type == "lock.acquire":
                session_id = data.get("session_id")
                if session_id:
                    result = authoring_state.acquire_lock(
                        project_id,
                        session_id,
                        scope=data.get("scope", "element"),
                        scope_key=data.get("scope_key", ""),
                        label=data.get("label", "lock"),
                        bbox=data.get("bbox"),
                    )
                    if not result["ok"]:
                        await manager.send_json(
                            websocket,
                            {
                                "type": "commit.rejected",
                                "project_id": project_id,
                                "session_id": session_id,
                                "message": f"Locked by {result['conflict'].get('session_id', 'another session')}",
                            },
                        )
                    await manager.broadcast(authoring_state.serialize_locks(project_id), project_id)
                continue

            if message_type == "lock.release":
                session_id = data.get("session_id")
                if session_id:
                    authoring_state.release_lock(
                        project_id,
                        session_id,
                        scope=data.get("scope"),
                        scope_key=data.get("scope_key"),
                    )
                    await manager.broadcast(authoring_state.serialize_locks(project_id), project_id)
                continue

            if message_type == "preview.cancel":
                session_id = data.get("session_id")
                if session_id:
                    authoring_state.clear_preview(project_id, session_id)
                    await manager.broadcast(authoring_state.serialize_previews(project_id), project_id)
                continue

    except WebSocketDisconnect:
        pass
    finally:
        if joined_session_id:
            authoring_state.remove_session(project_id, joined_session_id)
            await manager.broadcast(authoring_state.serialize_presence(project_id), project_id)
            await manager.broadcast(authoring_state.serialize_locks(project_id), project_id)
            await manager.broadcast(authoring_state.serialize_previews(project_id), project_id)
        manager.disconnect(websocket, project_id)
