import logging
import os
import shutil
import sys
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.websocket import manager
from app.core.config import settings
from app.core.database import get_db
from app.models.authoring import (
    AuthoringCommitRequest,
    AuthoringSessionRequest,
    BlankProjectConfig,
    ProjectCreateRequest,
    ProjectStartMode,
)
from app.models.history import BIMHistory
from app.models.project import Project
from app.services.authoring_service import (
    AuthoringConflictError,
    AuthoringService,
    AuthoringValidationError,
)
from app.services.authoring_state import authoring_state
from app.services.bim_service import BIMService
from app.services.diff_service import DiffService
from app.services.nlp_service import parse_command
from app.models.render import RenderPreviewRequest, RenderPreviewResponse
from app.services.render_service import generate_photorealistic_render
import httpx

logger = logging.getLogger("bim_router")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)

router = APIRouter()


def _get_project_or_404(project_id: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _broadcast_authoring_state(project_id: str) -> None:
    await manager.broadcast(authoring_state.serialize_presence(project_id), project_id)
    await manager.broadcast(authoring_state.serialize_locks(project_id), project_id)
    await manager.broadcast(authoring_state.serialize_previews(project_id), project_id)


@router.post("/")
async def create_project(
    payload: Optional[ProjectCreateRequest] = Body(default=None),
    name: Optional[str] = None,
    description: Optional[str] = None,
    start_mode: Optional[ProjectStartMode] = None,
    db: Session = Depends(get_db),
):
    if payload is None:
        if not name:
            raise HTTPException(status_code=400, detail="Project name is required")
        payload = ProjectCreateRequest(
            name=name,
            description=description,
            start_mode=start_mode or ProjectStartMode.UPLOAD,
        )

    project = Project(name=payload.name, description=payload.description)
    db.add(project)
    db.flush()

    authoring_service = AuthoringService(project.id)
    if payload.start_mode == ProjectStartMode.BLANK:
        blank_model = payload.blank_model or BlankProjectConfig()
        authoring_service.bootstrap_blank_model(project, blank_model)
        authoring_state.set_revision(project.id, 0)
    else:
        project.meta_info = {
            "start_mode": payload.start_mode.value,
            "model_revision": 0,
            "storeys": [],
            "authoring_supported": False,
        }
        authoring_state.set_revision(project.id, 0)

    db.commit()
    db.refresh(project)
    return project


@router.get("/")
async def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).all()


@router.get("/{project_id}")
async def get_project(project_id: str, db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if project.ifc_uploaded:
        AuthoringService(project.id).sync_project_meta(project)
        db.commit()
        db.refresh(project)
    return project


@router.post("/{project_id}/upload")
async def upload_ifc(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)

    if not file.filename.lower().endswith(".ifc"):
        raise HTTPException(status_code=400, detail="Only .ifc files are supported")

    file_path = os.path.join(settings.IFC_STORAGE_DIR, f"{project_id}.ifc")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    project.ifc_filename = file.filename
    project.ifc_uploaded = True

    authoring_service = AuthoringService(project.id)
    authoring_state.set_revision(project.id, 0)
    authoring_service.sync_project_meta(project)

    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}/model")
async def download_ifc(project_id: str, db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not project.ifc_uploaded:
        raise HTTPException(status_code=404, detail="IFC model not found")

    file_path = os.path.join(settings.IFC_STORAGE_DIR, f"{project_id}.ifc")
    return FileResponse(
        path=file_path,
        filename=project.ifc_filename or f"{project_id}.ifc",
        media_type="application/octet-stream",
    )


@router.post("/{project_id}/export")
async def export_project_to_bim(
    project_id: str,
    apply_zone_colors: bool = False,
    db: Session = Depends(get_db)
):
    project = _get_project_or_404(project_id, db)
    
    # Retrieve floor project data from meta_info
    meta = project.meta_info or {}
    floor_project = meta.get("floorProject")
    if not floor_project:
        raise HTTPException(status_code=400, detail="No floor plan data found in project metadata.")

    try:
        service = AuthoringService(project.id)
        # 1. Run the export engine
        service.export_project_to_ifc(floor_project, apply_zone_colors=apply_zone_colors)
        
        # 2. Update project status in DB
        project.ifc_uploaded = True
        project.ifc_filename = f"{project.name or project_id}.ifc"
        
        # 3. Re-sync meta to get revision 0 and other BIM info
        service.sync_project_meta(project)
        db.commit()
        db.refresh(project)
        
        return {
            "status": "success",
            "message": "Project exported to BIM successfully",
            "ifc_filename": project.ifc_filename,
            "project": project
        }
    except Exception as error:
        db.rollback()
        logger.exception("[%s] Export failed", project_id)
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/export-from-floor")
async def export_from_floor_to_bim(
    payload: Dict[str, Any] = Body(...),
    apply_zone_colors: bool = False,
    db: Session = Depends(get_db)
):
    """Bridge endpoint to create a persistent 3D Project from an in-memory FloorProject."""
    # 1. Create a new persistent Project record
    project = Project(
        name=payload.get("name", "Exported Design"),
        description="BIM model exported from Floor Planner",
        meta_info={"floorProject": payload}
    )
    db.add(project)
    db.flush()

    try:
        service = AuthoringService(project.id)
        # 2. Generate the IFC file
        service.export_project_to_ifc(payload, apply_zone_colors=apply_zone_colors)
        
        # 3. Finalize metadata
        project.ifc_uploaded = True
        project.ifc_filename = f"{project.name}.ifc"
        service.sync_project_meta(project)
        
        db.commit()
        db.refresh(project)
        
        return {
            "status": "success",
            "project": project
        }
    except Exception as error:
        db.rollback()
        logger.exception("Floor to BIM export failed")
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/{project_id}/authoring/sessions")
async def create_authoring_session(
    project_id: str,
    payload: AuthoringSessionRequest,
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    if not project.ifc_uploaded:
        raise HTTPException(status_code=400, detail="Upload or create an IFC model first")

    service = AuthoringService(project.id)
    try:
        service.sync_project_meta(project)
        db.commit()
        db.refresh(project)

        session = service.create_session(project, payload.display_name)
        await _broadcast_authoring_state(project_id)
        return session
    except FileNotFoundError as error:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(error)) from error
    except AuthoringValidationError as error:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        db.rollback()
        logger.exception("[%s] Failed to create authoring session", project_id)
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/{project_id}/authoring/commit")
async def authoring_commit(
    project_id: str,
    payload: AuthoringCommitRequest,
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    if not project.ifc_uploaded:
        raise HTTPException(status_code=404, detail="Project or IFC not found")

    service = AuthoringService(project.id)

    try:
        result = service.process_operation(
            project=project,
            request=payload,
            db=db,
            source_label=f"{payload.operation.action.value} {payload.operation.element_type.value}",
        )
        db.commit()
        db.refresh(project)
    except AuthoringConflictError as error:
        db.rollback()
        message = str(error)
        await manager.broadcast(
            {"type": "commit.rejected", "project_id": project_id, "session_id": payload.session_id, "message": message},
            project_id,
        )
        raise HTTPException(status_code=409, detail=message) from error
    except AuthoringValidationError as error:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception:
        db.rollback()
        raise

    if result["mode"] == "preview":
        await manager.broadcast(
            {
                "type": "preview.state",
                "project_id": project_id,
                "previews": [result["preview"]],
            },
            project_id,
        )
    else:
        delta = DiffService.calculate_delta(project_id, result.get("changes", []))
        delta["model_revision"] = result.get("model_revision", 0)
        await manager.broadcast(
            {
                "type": "commit.accepted",
                "project_id": project_id,
                "session_id": payload.session_id,
                "model_revision": result.get("model_revision", 0),
                "changes": result.get("changes", []),
            },
            project_id,
        )
        await manager.broadcast(delta, project_id)

    await _broadcast_authoring_state(project_id)
    return result


@router.post("/{project_id}/command")
async def execute_bim_command(project_id: str, text: str, db: Session = Depends(get_db)):
    logger.info("[%s] Command execution started: %s", project_id, text)
    total_start_time = time.time()

    project = _get_project_or_404(project_id, db)
    if not project.ifc_uploaded:
        raise HTTPException(status_code=404, detail="Project or IFC not found")

    await manager.broadcast(
        DiffService.format_processing_status("analyzing", "Analyzing BIM instruction..."),
        project_id,
    )

    try:
        nlp_start = time.time()
        command = await parse_command(user_text=text)
        logger.info("[%s] NLP parsing took %.2fs", project_id, time.time() - nlp_start)

        if command.needs_clarification:
            await manager.broadcast(
                DiffService.format_processing_status("success", command.clarification_question or "Please clarify the command."),
                project_id,
            )
            return {"status": "needs_clarification", "question": command.clarification_question}

        if command.action == "unsupported":
            await manager.broadcast(
                DiffService.format_error("UNSUPPORTED", "Unsupported command."),
                project_id,
            )
            return {"status": "error", "message": "Unsupported command."}

        await manager.broadcast(
            DiffService.format_processing_status("modifying", "Applying BIM changes..."),
            project_id,
        )

        bim_start = time.time()
        service = AuthoringService(project.id)
        result = service.execute_chat_command(project, command, text, db)
        logger.info("[%s] BIM modification took %.3fs", project_id, time.time() - bim_start)

        if result.get("status") == "error":
            await manager.broadcast(
                DiffService.format_error("BIM_ERROR", result.get("message", "Unknown BIM error")),
                project_id,
            )
            return {"status": "error", "message": result.get("message")}

        history = BIMHistory(
            project_id=project_id,
            command_text=text,
            action_type=command.action,
            snapshot_path=result.get("snapshot_path"),
            affected_elements_count=len(result.get("changes", [])),
            delta_json=result.get("changes", []),
        )
        db.add(history)
        db.commit()
        db.refresh(project)

        delta = DiffService.calculate_delta(project_id, result.get("changes", []))
        delta["model_revision"] = int((project.meta_info or {}).get("model_revision", 0))
        await manager.broadcast(delta, project_id)
        await _broadcast_authoring_state(project_id)

        logger.info("[%s] Total execution took %.2fs", project_id, time.time() - total_start_time)
        return {
            "status": "success",
            "affected_elements": len(result.get("changes", [])),
            "history_id": history.id,
            "model_revision": delta["model_revision"],
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("[%s] Internal error during command execution", project_id)
        await manager.broadcast(DiffService.format_error("INTERNAL_ERROR", str(error)), project_id)
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/{project_id}/history")
async def get_project_history(project_id: str, db: Session = Depends(get_db)):
    return (
        db.query(BIMHistory)
        .filter(BIMHistory.project_id == project_id)
        .order_by(BIMHistory.created_at.desc())
        .all()
    )


@router.post("/{project_id}/undo")
async def undo_command(project_id: str, db: Session = Depends(get_db)):
    last_action = (
        db.query(BIMHistory)
        .filter(
            BIMHistory.project_id == project_id,
            BIMHistory.action_type != "undo",
            BIMHistory.action_type != "redo",
        )
        .order_by(BIMHistory.created_at.desc())
        .first()
    )

    if not last_action or not last_action.snapshot_path:
        raise HTTPException(status_code=400, detail="Nothing to undo")

    try:
        service = BIMService(project_id)
        redo_snapshot = service.create_snapshot("redo_backup")
        service.restore_snapshot(last_action.snapshot_path)

        project = _get_project_or_404(project_id, db)
        revision = int((project.meta_info or {}).get("model_revision", 0)) + 1
        project.meta_info = {**(project.meta_info or {}), "model_revision": revision}
        authoring_state.set_revision(project_id, revision)

        undo_record = BIMHistory(
            project_id=project_id,
            command_text=f"Undo: {last_action.command_text}",
            action_type="undo",
            snapshot_path=redo_snapshot,
            affected_elements_count=last_action.affected_elements_count,
        )
        db.add(undo_record)
        db.commit()

        await manager.broadcast({"type": "model_reset", "message": "Undo applied"}, project_id)
        await _broadcast_authoring_state(project_id)
        return {"status": "success", "undone_command": last_action.command_text}
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/{project_id}/redo")
async def redo_command(project_id: str, db: Session = Depends(get_db)):
    last_undo = (
        db.query(BIMHistory)
        .filter(
            BIMHistory.project_id == project_id,
            BIMHistory.action_type == "undo",
        )
        .order_by(BIMHistory.created_at.desc())
        .first()
    )

    if not last_undo or not last_undo.snapshot_path:
        raise HTTPException(status_code=400, detail="Nothing to redo")

    try:
        service = BIMService(project_id)
        service.restore_snapshot(last_undo.snapshot_path)

        project = _get_project_or_404(project_id, db)
        revision = int((project.meta_info or {}).get("model_revision", 0)) + 1
        project.meta_info = {**(project.meta_info or {}), "model_revision": revision}
        authoring_state.set_revision(project_id, revision)

        redo_record = BIMHistory(
            project_id=project_id,
            command_text=f"Redo: {last_undo.command_text.replace('Undo: ', '')}",
            action_type="redo",
            affected_elements_count=last_undo.affected_elements_count,
        )

        db.delete(last_undo)
        db.add(redo_record)
        db.commit()

        await manager.broadcast({"type": "model_reset", "message": "Redo applied"}, project_id)
        await _broadcast_authoring_state(project_id)
        return {"status": "success", "redone_command": redo_record.command_text}
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/{project_id}/render-preview", response_model=RenderPreviewResponse)
async def render_preview(
    project_id: str,
    payload: RenderPreviewRequest,
    db: Session = Depends(get_db),
):
    """
    BIM 뷰어 스크린샷을 기반으로 Stable Diffusion img2img 실사 렌더링 생성.
    """
    project = _get_project_or_404(project_id, db)
    if not project.ifc_uploaded:
        raise HTTPException(status_code=404, detail="IFC model not found")

    # SD 서버 연결 확인
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.get(f"{settings.SD_BASE_URL}/sdapi/v1/options")
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Stable Diffusion server is not running. Start AUTOMATIC1111 with --api flag."
        )

    try:
        result = await generate_photorealistic_render(project_id, payload)
        return result
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="SD rendering timed out (>600s)")
    except Exception as e:
        logger.exception("[%s] Render failed", project_id)
        raise HTTPException(status_code=500, detail=str(e))
