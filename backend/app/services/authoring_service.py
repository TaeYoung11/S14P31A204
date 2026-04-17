from __future__ import annotations

import math
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.util.element as element_util
import ifcopenshell.util.placement as placement_util
import ifcopenshell.util.unit as unit_util
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.authoring import (
    AuthoringAction,
    AuthoringCommitRequest,
    AuthoringMode,
    AuthoringOperation,
    BlankProjectConfig,
    Vector3,
)
from app.models.bim_command import BIMChanges, BIMCommand, BIMTarget, ElementType, Position
from app.models.history import BIMHistory
from app.models.project import Project
from app.services.authoring_state import authoring_state
from app.services.bim_service import BIMService

IFC_STORAGE_PATH = Path(settings.IFC_STORAGE_DIR)
EXPORT_STOREY_HEIGHT_MM = 3000.0


class AuthoringError(Exception):
    pass


class AuthoringConflictError(AuthoringError):
    pass


class AuthoringValidationError(AuthoringError):
    pass


def _normalize(vector: Tuple[float, float, float]) -> Tuple[float, float, float]:
    length = math.sqrt(sum(value * value for value in vector)) or 1.0
    return tuple(value / length for value in vector)


def _dot(a: Tuple[float, float, float], b: Tuple[float, float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _add(a: Tuple[float, float, float], b: Tuple[float, float, float]) -> Tuple[float, float, float]:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a: Tuple[float, float, float], b: Tuple[float, float, float]) -> Tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _scale(a: Tuple[float, float, float], scalar: float) -> Tuple[float, float, float]:
    return (a[0] * scalar, a[1] * scalar, a[2] * scalar)


def _yaw_from_axis(axis: Tuple[float, float, float]) -> float:
    return math.degrees(math.atan2(axis[1], axis[0]))


def _hex_to_rgb(hex_color: str) -> Tuple[float, float, float]:
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join([c*2 for c in hex_color])
    return tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def _coerce_floor_number(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 1


def _floor_elevation_mm(floor: int, storey_height_mm: float = EXPORT_STOREY_HEIGHT_MM) -> float:
    return (int(floor) - 1) * float(storey_height_mm)


class AuthoringService:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.ifc_path = IFC_STORAGE_PATH / f"{project_id}.ifc"

    def _load_ifc(self) -> ifcopenshell.file:
        if not self.ifc_path.exists():
            raise FileNotFoundError(f"IFC file not found: {self.ifc_path}")
        return ifcopenshell.open(str(self.ifc_path))

    def _schema_name(self, ifc_file: ifcopenshell.file) -> str:
        return str(getattr(ifc_file, "schema", "") or "").upper()

    def _is_ifc4(self, ifc_file: ifcopenshell.file) -> bool:
        return self._schema_name(ifc_file).startswith("IFC4")

    def _unit_scale(self, ifc_file: ifcopenshell.file) -> float:
        try:
            return float(unit_util.calculate_unit_scale(ifc_file))
        except Exception:
            return 1.0

    def _project_to_mm(self, ifc_file: ifcopenshell.file, value: float) -> float:
        return float(value) * self._unit_scale(ifc_file) * 1000.0

    def _mm_to_project(self, ifc_file: ifcopenshell.file, value_mm: float) -> float:
        scale = self._unit_scale(ifc_file) * 1000.0
        return float(value_mm) / (scale or 1000.0)

    def _storey_elevation_mm(self, ifc_file: ifcopenshell.file, storey) -> float:
        if storey is None:
            return 0.0
        placement = getattr(storey, "ObjectPlacement", None)
        if placement is not None:
            try:
                matrix = placement_util.get_local_placement(placement)
                return self._project_to_mm(ifc_file, float(matrix[2][3]))
            except Exception:
                pass
        elevation = getattr(storey, "Elevation", None)
        if elevation is not None:
            return self._project_to_mm(ifc_file, float(elevation))
        return 0.0

    def _create_building_storey(
        self,
        ifc_file: ifcopenshell.file,
        building,
        floor: int,
        elevation_mm: float,
    ):
        storey = ifcopenshell.api.run(
            "root.create_entity",
            ifc_file,
            ifc_class="IfcBuildingStorey",
            name=f"Level {floor}",
        )
        elevation_u = self._mm_to_project(ifc_file, elevation_mm)
        storey.Elevation = elevation_u
        storey.ObjectPlacement = self._create_local_placement(
            ifc_file,
            building.ObjectPlacement,
            (0.0, 0.0, elevation_u),
        )
        ifcopenshell.api.run(
            "aggregate.assign_object",
            ifc_file,
            products=[storey],
            relating_object=building,
        )
        return storey

    def describe_ifc(self) -> Dict[str, Any]:
        service = BIMService(self.project_id).load()
        storeys = service.find_storeys()
        schema = self._schema_name(service._ifc_file)
        return {
            "schema": schema,
            "ifc_uploaded": True,
            "authoring_supported": schema.startswith("IFC4"),
            "storeys": [
                {
                    "id": item["id"],
                    "guid": item["guid"],
                    "name": item["name"],
                    "elevation": item["elevation"],
                }
                for item in storeys
            ],
        }

    def sync_project_meta(self, project: Project) -> Dict[str, Any]:
        meta = deepcopy(project.meta_info or {})
        if project.ifc_uploaded and self.ifc_path.exists():
            meta.update(self.describe_ifc())
        meta.setdefault("start_mode", "upload")
        meta["model_revision"] = authoring_state.get_revision(project.id)
        meta.setdefault("storeys", [])
        project.meta_info = meta
        return meta

    def bootstrap_blank_model(self, project: Project, config: BlankProjectConfig) -> Dict[str, Any]:
        ifc_file = ifcopenshell.api.run("project.create_file", version=config.ifc_schema)
        project_entity = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcProject", name=project.name)
        ifcopenshell.api.run("unit.assign_unit", ifc_file)

        model_context = ifcopenshell.api.run("context.add_context", ifc_file, context_type="Model")
        ifcopenshell.api.run("context.add_context", ifc_file, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model_context)
        ifcopenshell.api.run("context.add_context", ifc_file, context_type="Plan")

        site = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcSite", name="Default Site")
        building = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcBuilding", name="Default Building")
        site.ObjectPlacement = self._create_local_placement(ifc_file, None, (0.0, 0.0, 0.0))
        building.ObjectPlacement = self._create_local_placement(ifc_file, site.ObjectPlacement, (0.0, 0.0, 0.0))
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[site], relating_object=project_entity)
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[building], relating_object=site)

        for index in range(config.storey_count):
            floor = index + 1
            elevation_mm = config.base_elevation_mm + index * config.storey_height_mm
            self._create_building_storey(ifc_file, building, floor, elevation_mm)

        ifc_file.write(str(self.ifc_path))
        project.ifc_filename = f"{project.id}.ifc"
        project.ifc_uploaded = True
        project.meta_info = {"start_mode": "blank", "schema": config.ifc_schema, "model_revision": 0}
        authoring_state.set_revision(project.id, 0)
        return self.sync_project_meta(project)

    def create_session(self, project: Project, display_name: Optional[str]) -> Dict[str, Any]:
        revision = int((project.meta_info or {}).get("model_revision", 0))
        session = authoring_state.create_session(project.id, display_name, revision)
        return {"session_id": session["session_id"], "display_name": session["display_name"], "project_id": project.id, "model_revision": revision}

    def _resolve_storey_guid_for_chat(self, project: Project, command: BIMCommand) -> Optional[str]:
        if command.target.floor is None:
            return None
        service = BIMService(project.id).load()
        storey = service.find_storey_by_floor(command.target.floor)
        return storey.GlobalId if storey is not None else None

    def _ensure_chat_session(self, project: Project) -> str:
        chat_session_id = "chat"
        chat_session = authoring_state.touch_session(project.id, chat_session_id, "AI Assistant")
        if chat_session is not None:
            return chat_session_id
        chat_session = authoring_state.create_session(
            project.id,
            "AI Assistant",
            int((project.meta_info or {}).get("model_revision", 0)),
        )
        return chat_session["session_id"]

    def _extract_requested_chat_features(self, text: str) -> Dict[str, bool]:
        normalized = text.lower()

        def contains_any(*keywords: str) -> bool:
            return any(keyword in normalized for keyword in keywords)

        house = contains_any("집", "주택", "house", "home", "building", "건물")
        walls = house or contains_any("벽", "wall")
        floor = house or contains_any("바닥", "floor", "slab", "슬래브")
        ceiling = house or contains_any("천장", "ceiling")
        roof = house or contains_any("지붕", "roof")
        window = house or contains_any("창문", "window")
        door = house or contains_any("문 ", " 문", "door", "출입문", "현관문")

        return {
            "house": house,
            "walls": walls,
            "floor": floor,
            "ceiling": ceiling,
            "roof": roof,
            "window": window,
            "door": door,
        }

    def _build_compound_chat_specs(
        self,
        project: Project,
        command: BIMCommand,
        text: str,
    ) -> List[Dict[str, Any]]:
        requested = self._extract_requested_chat_features(text)
        requested_count = sum(1 for key in ("walls", "floor", "ceiling", "roof", "window", "door") if requested[key])
        if command.action != "add" or requested_count < 2:
            return []

        storey_guid = self._resolve_storey_guid_for_chat(project, command)
        material = command.changes.material.value if command.changes and command.changes.material else "concrete"
        specs: List[Dict[str, Any]] = []

        if requested["floor"]:
            specs.append(
                {
                    "key": "floor",
                    "element_type": ElementType.SLAB,
                    "target": {"storey_guid": storey_guid},
                    "geometry": {
                        "position": {"x": 3000.0, "y": 2000.0, "z": 0.0},
                        "dimensions": {"length": 6000.0, "width": 4000.0, "thickness": 250.0},
                    },
                    "semantics": {"material": material, "type_name": "Chat Floor Slab", "psets": {}},
                }
            )

        if requested["ceiling"]:
            specs.append(
                {
                    "key": "ceiling",
                    "element_type": ElementType.SLAB,
                    "target": {"storey_guid": storey_guid},
                    "geometry": {
                        "position": {"x": 3000.0, "y": 2000.0, "z": 2850.0},
                        "dimensions": {"length": 6000.0, "width": 4000.0, "thickness": 150.0},
                    },
                    "semantics": {"material": "gypsum", "type_name": "Chat Ceiling Slab", "psets": {}},
                }
            )

        if requested["walls"]:
            wall_specs = [
                ("wall_south", "South Wall", {"x": 0.0, "y": 0.0, "z": 0.0}, {"x": 6000.0, "y": 0.0, "z": 0.0}),
                ("wall_north", "North Wall", {"x": 0.0, "y": 4000.0, "z": 0.0}, {"x": 6000.0, "y": 4000.0, "z": 0.0}),
                ("wall_west", "West Wall", {"x": 0.0, "y": 0.0, "z": 0.0}, {"x": 0.0, "y": 4000.0, "z": 0.0}),
                ("wall_east", "East Wall", {"x": 6000.0, "y": 0.0, "z": 0.0}, {"x": 6000.0, "y": 4000.0, "z": 0.0}),
            ]
            for key, label, start, end in wall_specs:
                specs.append(
                    {
                        "key": key,
                        "element_type": ElementType.WALL,
                        "target": {"storey_guid": storey_guid},
                        "geometry": {
                            "start": start,
                            "end": end,
                            "dimensions": {"length": math.dist((start["x"], start["y"]), (end["x"], end["y"])), "thickness": 200.0, "height": 3000.0},
                        },
                        "semantics": {"material": material, "type_name": label, "psets": {}},
                    }
                )

        if requested["roof"]:
            specs.append(
                {
                    "key": "roof",
                    "element_type": ElementType.ROOF,
                    "target": {"storey_guid": storey_guid},
                    "geometry": {
                        "position": {"x": 3000.0, "y": 2000.0, "z": 3000.0},
                        "template": "gable",
                        "dimensions": {"length": 6000.0, "width": 4000.0, "height": 900.0, "thickness": 250.0, "pitch": 30.0},
                    },
                    "semantics": {"material": material, "type_name": "Chat Roof", "psets": {}},
                }
            )

        if requested["door"]:
            specs.append(
                {
                    "key": "door",
                    "element_type": ElementType.DOOR,
                    "host_ref": "wall_south",
                    "target": {"storey_guid": storey_guid},
                    "geometry": {
                        "position": {"x": 3000.0, "y": 0.0, "z": 0.0},
                        "dimensions": {"width": 900.0, "height": 2100.0, "sill_height": 0.0},
                    },
                    "semantics": {"material": "wood", "type_name": "Chat Front Door", "psets": {}},
                }
            )

        if requested["window"]:
            specs.append(
                {
                    "key": "window",
                    "element_type": ElementType.WINDOW,
                    "host_ref": "wall_north",
                    "target": {"storey_guid": storey_guid},
                    "geometry": {
                        "position": {"x": 3000.0, "y": 4000.0, "z": 900.0},
                        "dimensions": {"width": 1500.0, "height": 1200.0, "sill_height": 900.0},
                    },
                    "semantics": {"material": "glass", "type_name": "Chat Main Window", "psets": {}},
                }
            )

        return specs

    def _spec_to_operation(
        self,
        project: Project,
        revision: int,
        spec: Dict[str, Any],
        created_guids: Dict[str, str],
    ) -> AuthoringOperation:
        target = dict(spec.get("target") or {})
        host_ref = spec.get("host_ref")
        if host_ref:
            target["host_guid"] = created_guids.get(host_ref)
        return AuthoringOperation.model_validate(
            {
                "operation_id": f"chat_{project.id}_{spec.get('key', spec['element_type'].value)}_{revision}",
                "base_revision": revision,
                "mode": "apply",
                "action": "create",
                "element_type": spec["element_type"].value,
                "target": target,
                "geometry": spec["geometry"],
                "semantics": spec["semantics"],
            }
        )

    def _execute_chat_operations(
        self,
        project: Project,
        operations: List[AuthoringOperation],
        session_id: str,
        db: Session,
        source_label: str,
        snapshot_path: str,
    ) -> Dict[str, Any]:
        aggregate_changes: List[Dict[str, Any]] = []
        final_revision = int((project.meta_info or {}).get("model_revision", 0))
        for operation in operations:
            result = self.process_operation(
                project,
                AuthoringCommitRequest(session_id=session_id, operation=operation),
                db,
                source_label,
                False,
                snapshot_path_override=snapshot_path,
                create_snapshot=False,
            )
            aggregate_changes.extend(result.get("changes", []))
            final_revision = result.get("model_revision", final_revision)
        return {
            "status": "success",
            "project_id": project.id,
            "changes": aggregate_changes,
            "model_revision": final_revision,
            "snapshot_path": snapshot_path,
        }

    def translate_chat_command(self, project: Project, command: BIMCommand) -> AuthoringOperation:
        storey_guid = self._resolve_storey_guid_for_chat(project, command)

        base_revision = int((project.meta_info or {}).get("model_revision", 0))
        changes = command.changes or BIMChanges()
        geometry: Dict[str, Any] = {"dimensions": {}}
        target: Dict[str, Any] = {"storey_guid": storey_guid}

        if command.target.element_type == ElementType.WALL:
            length = float(changes.length or 4000.0)
            geometry["start"] = {"x": 0.0, "y": 0.0, "z": 0.0}
            geometry["end"] = {"x": length, "y": 0.0, "z": 0.0}
            geometry["dimensions"] = {"length": length, "thickness": float(changes.thickness or changes.width or 200.0), "height": float(changes.height or 3000.0)}
        elif command.target.element_type == ElementType.SLAB:
            geometry["position"] = {"x": 0.0, "y": 0.0, "z": 0.0}
            geometry["dimensions"] = {"length": float(changes.length or 6000.0), "width": float(changes.width or 4000.0), "thickness": float(changes.thickness or 250.0)}
        elif command.target.element_type == ElementType.COLUMN:
            position = changes.position or Position(x=0.0, y=0.0, z=0.0)
            geometry["position"] = position.model_dump()
            geometry["dimensions"] = {"width": float(changes.width or 400.0), "depth": float(changes.length or 400.0), "height": float(changes.height or 3000.0)}
        elif command.target.element_type == ElementType.BEAM:
            position = changes.position or Position(x=0.0, y=0.0, z=2500.0)
            geometry["position"] = position.model_dump()
            geometry["dimensions"] = {"width": float(changes.width or 300.0), "depth": float(changes.length or 4000.0), "height": float(changes.height or 600.0)}
        elif command.target.element_type == ElementType.DOOR:
            geometry["position"] = (changes.position or Position(x=0.0, y=0.0, z=0.0)).model_dump()
            geometry["dimensions"] = {"width": float(changes.width or 900.0), "height": float(changes.height or 2100.0), "sill_height": 0.0}
        elif command.target.element_type == ElementType.WINDOW:
            geometry["position"] = (changes.position or Position(x=0.0, y=0.0, z=900.0)).model_dump()
            geometry["dimensions"] = {"width": float(changes.width or 1500.0), "height": float(changes.height or 1200.0), "sill_height": float(changes.position.z if changes.position else 900.0)}
        elif command.target.element_type == ElementType.STAIR:
            geometry["position"] = (changes.position or Position(x=0.0, y=0.0, z=0.0)).model_dump()
            geometry["dimensions"] = {"width": float(changes.width or 1200.0), "depth": float(changes.length or 4200.0), "height": float(changes.height or 3000.0)}
            geometry["template"] = "straight"
        elif command.target.element_type == ElementType.ROOF:
            geometry["position"] = (changes.position or Position(x=0.0, y=0.0, z=3000.0)).model_dump()
            geometry["dimensions"] = {"length": float(changes.length or 6000.0), "width": float(changes.width or 4000.0), "height": float(changes.height or 900.0), "thickness": float(changes.thickness or 250.0), "pitch": 30.0}
            geometry["template"] = "gable"
        else:
            raise AuthoringValidationError(f"{command.target.element_type.value} creation is not implemented yet.")

        material = changes.material.value if changes.material else "concrete"
        return AuthoringOperation.model_validate(
            {
                "operation_id": f"chat_{project.id}_{command.target.element_type.value}",
                "base_revision": base_revision,
                "mode": "apply",
                "action": "create",
                "element_type": command.target.element_type.value,
                "target": target,
                "geometry": geometry,
                "semantics": {"material": material, "type_name": f"Chat {command.target.element_type.value.title()}", "psets": {}},
            }
        )

    def execute_chat_command(self, project: Project, command: BIMCommand, text: str, db: Session) -> Dict[str, Any]:
        if command.action == "add":
            chat_session_id = self._ensure_chat_session(project)
            compound_specs = self._build_compound_chat_specs(project, command, text)
            snapshot_path = BIMService(project.id).create_snapshot(text)
            starting_revision = int((project.meta_info or {}).get("model_revision", 0))

            try:
                if compound_specs:
                    created_guids: Dict[str, str] = {}
                    aggregate_changes: List[Dict[str, Any]] = []
                    revision = int((project.meta_info or {}).get("model_revision", 0))
                    for spec in compound_specs:
                        operation = self._spec_to_operation(project, revision, spec, created_guids)
                        result = self.process_operation(
                            project,
                            AuthoringCommitRequest(session_id=chat_session_id, operation=operation),
                            db,
                            text,
                            False,
                            snapshot_path_override=snapshot_path,
                            create_snapshot=False,
                        )
                        revision = result.get("model_revision", revision)
                        changes = result.get("changes", [])
                        aggregate_changes.extend(changes)
                        if spec.get("key") and changes and changes[0].get("guid"):
                            created_guids[spec["key"]] = str(changes[0]["guid"])

                    return {
                        "status": "success",
                        "project_id": project.id,
                        "changes": aggregate_changes,
                        "model_revision": revision,
                        "snapshot_path": snapshot_path,
                    }

                operation = self.translate_chat_command(project, command)
                return self.process_operation(
                    project,
                    AuthoringCommitRequest(session_id=chat_session_id, operation=operation),
                    db,
                    text,
                    False,
                    snapshot_path_override=snapshot_path,
                    create_snapshot=False,
                )
            except Exception:
                BIMService(project.id).restore_snapshot(snapshot_path)
                self._update_project_revision(project, starting_revision)
                authoring_state.set_revision(project.id, starting_revision)
                authoring_state.release_lock(project.id, chat_session_id)
                authoring_state.clear_preview(project.id, chat_session_id)
                raise

        service = BIMService(project.id)
        result = service.execute_command(command)
        if result.get("changes"):
            revision = int((project.meta_info or {}).get("model_revision", 0)) + 1
            self._update_project_revision(project, revision)
            authoring_state.set_revision(project.id, revision)
            result["model_revision"] = revision
        return result

    def process_operation(
        self,
        project: Project,
        request: AuthoringCommitRequest,
        db: Session,
        source_label: Optional[str] = None,
        persist_history: bool = True,
        snapshot_path_override: Optional[str] = None,
        create_snapshot: bool = True,
    ) -> Dict[str, Any]:
        session = authoring_state.touch_session(project.id, request.session_id)
        if session is None:
            raise AuthoringValidationError("Authoring session not found.")

        operation = request.operation
        current_revision = int((project.meta_info or {}).get("model_revision", 0))
        if operation.base_revision != current_revision:
            raise AuthoringConflictError(f"Revision mismatch. Expected {current_revision}, got {operation.base_revision}.")

        if operation.mode == AuthoringMode.CANCEL:
            authoring_state.clear_preview(project.id, request.session_id)
            authoring_state.release_lock(project.id, request.session_id)
            return {"status": "success", "mode": "cancel", "project_id": project.id, "session_id": request.session_id, "model_revision": current_revision, "message": "Preview cancelled."}

        preview = self._build_preview(request.session_id, operation)
        lock_result = authoring_state.acquire_lock(project.id, request.session_id, preview["lock_scope"], preview["lock_scope_key"], preview["label"], preview["bbox"])
        if not lock_result["ok"]:
            owner = lock_result["conflict"].get("session_id", "another session")
            raise AuthoringConflictError(f"Locked by {owner}.")

        authoring_state.upsert_preview(project.id, request.session_id, preview)
        if operation.mode == AuthoringMode.PREVIEW:
            return {"status": "success", "mode": "preview", "project_id": project.id, "session_id": request.session_id, "model_revision": current_revision, "preview": preview, "message": "Preview generated."}

        self._ensure_lock_owner(project.id, request.session_id, preview)
        snapshot_path = snapshot_path_override
        if snapshot_path is None and create_snapshot:
            snapshot_path = BIMService(project.id).create_snapshot(source_label or operation.operation_id)

        if operation.action == AuthoringAction.CREATE:
            changes = self._apply_create(preview)
        elif operation.action == AuthoringAction.UPDATE:
            changes = self._apply_update(preview, operation)
        elif operation.action == AuthoringAction.DELETE:
            changes = self._apply_delete(operation)
        else:
            raise AuthoringValidationError("Unsupported authoring action.")

        next_revision = current_revision + 1
        self._update_project_revision(project, next_revision)
        authoring_state.set_revision(project.id, next_revision)
        authoring_state.clear_preview(project.id, request.session_id)
        authoring_state.release_lock(project.id, request.session_id, preview["lock_scope"], preview["lock_scope_key"])

        if persist_history and changes:
            history = BIMHistory(project_id=project.id, command_text=source_label or f"{operation.action.value} {operation.element_type.value}", action_type=operation.action.value, snapshot_path=snapshot_path, affected_elements_count=len(changes), delta_json=changes)
            db.add(history)

        return {"status": "success", "mode": "apply", "project_id": project.id, "session_id": request.session_id, "model_revision": next_revision, "changes": changes, "snapshot_path": snapshot_path, "message": "Commit applied."}

    def _build_preview(self, session_id: str, operation: AuthoringOperation) -> Dict[str, Any]:
        ifc_file = self._load_ifc()
        if not self._is_ifc4(ifc_file):
            raise AuthoringValidationError("Direct authoring only supports IFC4 models.")

        target_element = None
        if operation.action in {AuthoringAction.UPDATE, AuthoringAction.DELETE}:
            target_element = self._resolve_target_element(ifc_file, operation)
            container = element_util.get_container(target_element)
            if container is not None and container.is_a("IfcBuildingStorey"):
                storey = container
            else:
                storey = self._resolve_storey(ifc_file, operation.target.storey_guid)
        else:
            storey = self._resolve_storey(ifc_file, operation.target.storey_guid)
        storey_guid = storey.GlobalId if storey else None
        storey_elevation_mm = self._storey_elevation_mm(ifc_file, storey)

        if operation.action == AuthoringAction.DELETE:
            return self._preview_delete(ifc_file, operation, session_id, target_element, storey_guid, storey_elevation_mm)

        if operation.action == AuthoringAction.UPDATE:
            return self._preview_update(ifc_file, operation, session_id, target_element, storey_guid)

        if operation.action != AuthoringAction.CREATE:
            raise AuthoringValidationError("Unsupported authoring preview action.")

        if operation.element_type == ElementType.WALL:
            return self._preview_wall(operation, session_id, storey_guid, storey_elevation_mm)
        if operation.element_type == ElementType.SLAB:
            return self._preview_slab(operation, session_id, storey_guid)
        if operation.element_type == ElementType.COLUMN:
            return self._preview_prism(operation, session_id, storey_guid, {"width": 400.0, "depth": 400.0, "height": 3000.0})
        if operation.element_type == ElementType.BEAM:
            return self._preview_prism(operation, session_id, storey_guid, {"width": 300.0, "depth": 4000.0, "height": 600.0})
        if operation.element_type in {ElementType.DOOR, ElementType.WINDOW}:
            return self._preview_hosted_opening(ifc_file, operation, session_id, storey_guid)
        if operation.element_type == ElementType.STAIR:
            return self._preview_stair(operation, session_id, storey_guid)
        if operation.element_type == ElementType.ROOF:
            return self._preview_roof(operation, session_id, storey_guid)

        raise AuthoringValidationError(f"{operation.element_type.value} preview is not implemented yet.")

    def _preview_wall(self, operation: AuthoringOperation, session_id: str, storey_guid: Optional[str], storey_elevation_mm: float) -> Dict[str, Any]:
        dims = operation.geometry.dimensions
        start = operation.geometry.start or operation.geometry.position or Vector3(x=0.0, y=0.0, z=storey_elevation_mm)
        end = operation.geometry.end or Vector3(x=start.x + float(dims.length if dims and dims.length else 4000.0), y=start.y, z=start.z)
        thickness = float(dims.thickness if dims and dims.thickness else 200.0)
        height = float(dims.height if dims and dims.height else 3000.0)
        length = math.dist((start.x, start.y), (end.x, end.y))
        if length < 1.0:
            raise AuthoringValidationError("Wall length must be greater than zero.")
        bbox = {"min": {"x": min(start.x, end.x) - thickness / 2, "y": min(start.y, end.y) - thickness / 2, "z": storey_elevation_mm}, "max": {"x": max(start.x, end.x) + thickness / 2, "y": max(start.y, end.y) + thickness / 2, "z": storey_elevation_mm + height}}
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or "Wall",
            "storey_guid": storey_guid,
            "host_guid": None,
            "geometry": {"start": start.model_dump(), "end": end.model_dump(), "length": length, "thickness": thickness, "height": height},
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "region",
            "lock_scope_key": self._region_lock_key(storey_guid, bbox),
            "warnings": [],
        }

    def _preview_slab(self, operation: AuthoringOperation, session_id: str, storey_guid: Optional[str]) -> Dict[str, Any]:
        dims = operation.geometry.dimensions
        position = operation.geometry.position
        if position is None:
            raise AuthoringValidationError("Slab preview requires geometry.position.")
        length = float(dims.length if dims and dims.length else 6000.0)
        width = float(dims.width if dims and dims.width else 4000.0)
        thickness = float(dims.thickness if dims and dims.thickness else 250.0)
        rotation_z = float(operation.geometry.rotation.z if operation.geometry.rotation else 0.0)
        bbox = {"min": {"x": position.x - length / 2, "y": position.y - width / 2, "z": position.z}, "max": {"x": position.x + length / 2, "y": position.y + width / 2, "z": position.z + thickness}}
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or "Slab",
            "storey_guid": storey_guid,
            "host_guid": None,
            "geometry": {"position": position.model_dump(), "length": length, "width": width, "thickness": thickness, "rotation_z": rotation_z},
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "region",
            "lock_scope_key": self._region_lock_key(storey_guid, bbox),
            "warnings": [],
        }

    def _preview_prism(self, operation: AuthoringOperation, session_id: str, storey_guid: Optional[str], defaults: Dict[str, float]) -> Dict[str, Any]:
        dims = operation.geometry.dimensions
        position = operation.geometry.position
        if position is None:
            raise AuthoringValidationError(f"{operation.element_type.value} preview requires geometry.position.")
        width = float(dims.width if dims and dims.width else defaults["width"])
        depth = float(dims.depth if dims and dims.depth else dims.length if dims and dims.length else defaults["depth"])
        height = float(dims.height if dims and dims.height else defaults["height"])
        rotation_z = float(operation.geometry.rotation.z if operation.geometry.rotation else 0.0)
        bbox = {"min": {"x": position.x - width / 2, "y": position.y - depth / 2, "z": position.z}, "max": {"x": position.x + width / 2, "y": position.y + depth / 2, "z": position.z + height}}
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or operation.element_type.value.title(),
            "storey_guid": storey_guid,
            "host_guid": None,
            "geometry": {"position": position.model_dump(), "width": width, "depth": depth, "height": height, "rotation_z": rotation_z},
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "region",
            "lock_scope_key": self._region_lock_key(storey_guid, bbox),
            "warnings": [],
        }

    def _preview_hosted_opening(self, ifc_file: ifcopenshell.file, operation: AuthoringOperation, session_id: str, storey_guid: Optional[str]) -> Dict[str, Any]:
        position = operation.geometry.position
        host, host_geometry, inferred = self._find_host_wall(ifc_file, storey_guid, operation.target.host_guid, position)
        dims = operation.geometry.dimensions
        width = float(dims.width if dims and dims.width else (900.0 if operation.element_type == ElementType.DOOR else 1500.0))
        height = float(dims.height if dims and dims.height else (2100.0 if operation.element_type == ElementType.DOOR else 1200.0))
        sill = float(dims.sill_height if dims and dims.sill_height is not None else (0.0 if operation.element_type == ElementType.DOOR else 900.0))
        center_local_x = self._resolve_host_offset(host_geometry, position, width)
        opening_depth = host_geometry["thickness_mm"] * 1.2
        bbox = self._oriented_bbox(
            host_geometry["origin_mm"],
            host_geometry["x_axis"],
            host_geometry["y_axis"],
            host_geometry["z_axis"],
            (
                center_local_x,
                float(host_geometry["center_offset_local_mm"][1]),
                sill + height / 2,
            ),
            (width / 2, opening_depth / 2, height / 2),
        )
        warnings = ["Host wall inferred automatically."] if inferred else []
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or operation.element_type.value.title(),
            "storey_guid": storey_guid,
            "host_guid": host.GlobalId,
            "geometry": {"position": position.model_dump() if position else None, "width": width, "height": height, "sill_height": sill, "host_offset_x": center_local_x, "host_center_y": float(host_geometry["center_offset_local_mm"][1]), "host_length": host_geometry["length_mm"], "host_thickness": host_geometry["thickness_mm"], "opening_depth": opening_depth},
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "element",
            "lock_scope_key": host.GlobalId,
            "warnings": warnings,
        }

    def _preview_stair(self, operation: AuthoringOperation, session_id: str, storey_guid: Optional[str]) -> Dict[str, Any]:
        preview = self._preview_prism(operation, session_id, storey_guid, {"width": 1200.0, "depth": 4200.0, "height": 3000.0})
        height = float(preview["geometry"]["height"])
        preview["geometry"]["template"] = operation.geometry.template or "straight"
        preview["geometry"]["riser_count"] = max(int(round(height / 175.0)), 2)
        preview["warnings"] = ["Stair geometry is template-based in this build."]
        return preview

    def _preview_roof(self, operation: AuthoringOperation, session_id: str, storey_guid: Optional[str]) -> Dict[str, Any]:
        dims = operation.geometry.dimensions
        position = operation.geometry.position
        if position is None:
            raise AuthoringValidationError("Roof preview requires geometry.position.")
        length = float(dims.length if dims and dims.length else 6000.0)
        width = float(dims.width if dims and dims.width else 4000.0)
        height = float(dims.height if dims and dims.height else 900.0)
        thickness = float(dims.thickness if dims and dims.thickness else 250.0)
        pitch = float(dims.pitch if dims and dims.pitch is not None else 30.0)
        bbox = {"min": {"x": position.x - length / 2, "y": position.y - width / 2, "z": position.z}, "max": {"x": position.x + length / 2, "y": position.y + width / 2, "z": position.z + max(height, thickness)}}
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or "Roof",
            "storey_guid": storey_guid,
            "host_guid": None,
            "geometry": {"position": position.model_dump(), "length": length, "width": width, "height": height, "thickness": thickness, "pitch": pitch, "template": operation.geometry.template or "gable"},
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "region",
            "lock_scope_key": self._region_lock_key(storey_guid, bbox),
            "warnings": ["Roof geometry is template-based in this build."],
        }

    def _preview_delete(
        self,
        ifc_file: ifcopenshell.file,
        operation: AuthoringOperation,
        session_id: str,
        element,
        storey_guid: Optional[str],
        storey_elevation_mm: float,
    ) -> Dict[str, Any]:
        bbox = {"min": {"x": -250.0, "y": -250.0, "z": storey_elevation_mm}, "max": {"x": 250.0, "y": 250.0, "z": storey_elevation_mm + 500.0}}
        if element is not None:
            if element.is_a("IfcDoor") or element.is_a("IfcWindow"):
                hosted = self._extract_hosted_element_state(ifc_file, element)
                bbox = self._oriented_bbox(
                    hosted["host_geometry"]["origin_mm"],
                    hosted["host_geometry"]["x_axis"],
                    hosted["host_geometry"]["y_axis"],
                    hosted["host_geometry"]["z_axis"],
                    (
                        hosted["host_offset_x"],
                        float(hosted["host_geometry"]["center_offset_local_mm"][1]),
                        hosted["sill_height"] + hosted["height"] / 2,
                    ),
                    (hosted["width"] / 2, hosted["opening_depth"] / 2, hosted["height"] / 2),
                )
            else:
                geometry = self._extract_rectangular_geometry(ifc_file, element)
                if geometry:
                    bbox = self._oriented_bbox(
                        geometry["origin_mm"],
                        geometry["x_axis"],
                        geometry["y_axis"],
                        geometry["z_axis"],
                        geometry["center_offset_local_mm"],
                        (geometry["length_mm"] / 2, geometry["thickness_mm"] / 2, geometry["height_mm"] / 2),
                    )
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": f"Delete {operation.element_type.value}",
            "storey_guid": storey_guid,
            "host_guid": None,
            "geometry": {"element_guid": operation.target.element_guid},
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "element",
            "lock_scope_key": operation.target.element_guid,
            "warnings": [],
        }

    def _preview_update(
        self,
        ifc_file: ifcopenshell.file,
        operation: AuthoringOperation,
        session_id: str,
        element,
        storey_guid: Optional[str],
    ) -> Dict[str, Any]:
        if element.is_a("IfcDoor") or element.is_a("IfcWindow"):
            return self._preview_hosted_update(ifc_file, operation, session_id, element, storey_guid)
        return self._preview_rectangular_update(ifc_file, operation, session_id, element, storey_guid)

    def _preview_rectangular_update(
        self,
        ifc_file: ifcopenshell.file,
        operation: AuthoringOperation,
        session_id: str,
        element,
        storey_guid: Optional[str],
    ) -> Dict[str, Any]:
        current = self._extract_rectangular_geometry(ifc_file, element)
        if not current:
            raise AuthoringValidationError("Selected element does not have a supported rectangular representation.")

        current_anchor = Vector3(
            x=current["origin_mm"][0] + current["x_axis"][0] * float(current["center_offset_local_mm"][0]) + current["y_axis"][0] * float(current["center_offset_local_mm"][1]),
            y=current["origin_mm"][1] + current["x_axis"][1] * float(current["center_offset_local_mm"][0]) + current["y_axis"][1] * float(current["center_offset_local_mm"][1]),
            z=current["origin_mm"][2],
        )
        current_rotation_z = _yaw_from_axis(current["x_axis"])
        next_position = operation.geometry.position or current_anchor
        next_rotation_z = float(operation.geometry.rotation.z if operation.geometry.rotation else current_rotation_z)
        rotation_rad = math.radians(next_rotation_z)
        x_axis = (math.cos(rotation_rad), math.sin(rotation_rad), 0.0)
        y_axis = (-math.sin(rotation_rad), math.cos(rotation_rad), 0.0)
        placement_origin = (
            next_position.x - x_axis[0] * float(current["center_offset_local_mm"][0]) - y_axis[0] * float(current["center_offset_local_mm"][1]),
            next_position.y - x_axis[1] * float(current["center_offset_local_mm"][0]) - y_axis[1] * float(current["center_offset_local_mm"][1]),
            next_position.z,
        )
        bbox = self._oriented_bbox(
            placement_origin,
            x_axis,
            y_axis,
            (0.0, 0.0, 1.0),
            current["center_offset_local_mm"],
            (current["length_mm"] / 2, current["thickness_mm"] / 2, current["height_mm"] / 2),
        )
        geometry: Dict[str, Any] = {
            "position": next_position.model_dump(),
            "placement_origin": {"x": placement_origin[0], "y": placement_origin[1], "z": placement_origin[2]},
            "rotation_z": next_rotation_z,
            "width": current["length_mm"],
            "depth": current["thickness_mm"],
            "height": current["height_mm"],
        }
        if operation.element_type == ElementType.WALL:
            min_x = float(current["min_x_local_mm"])
            max_x = float(current["max_x_local_mm"])
            center_y = float(current["center_offset_local_mm"][1])
            start = _add(
                placement_origin,
                _add(_scale(x_axis, min_x), _scale(y_axis, center_y)),
            )
            end = _add(
                placement_origin,
                _add(_scale(x_axis, max_x), _scale(y_axis, center_y)),
            )
            geometry = {
                "position": next_position.model_dump(),
                "placement_origin": {"x": placement_origin[0], "y": placement_origin[1], "z": placement_origin[2]},
                "rotation_z": next_rotation_z,
                "start": {"x": start[0], "y": start[1], "z": next_position.z},
                "end": {"x": end[0], "y": end[1], "z": next_position.z},
                "length": current["length_mm"],
                "thickness": current["thickness_mm"],
                "height": current["height_mm"],
            }
        elif operation.element_type == ElementType.SLAB:
            geometry = {
                "position": next_position.model_dump(),
                "placement_origin": {"x": placement_origin[0], "y": placement_origin[1], "z": placement_origin[2]},
                "rotation_z": next_rotation_z,
                "length": current["length_mm"],
                "width": current["thickness_mm"],
                "thickness": current["height_mm"],
            }
        elif operation.element_type == ElementType.ROOF:
            geometry = {
                "position": next_position.model_dump(),
                "placement_origin": {"x": placement_origin[0], "y": placement_origin[1], "z": placement_origin[2]},
                "rotation_z": next_rotation_z,
                "length": current["thickness_mm"],
                "width": current["length_mm"],
                "height": current["height_mm"],
                "thickness": current["height_mm"],
                "pitch": float(operation.geometry.dimensions.pitch if operation.geometry.dimensions and operation.geometry.dimensions.pitch is not None else 30.0),
                "template": operation.geometry.template or "gable",
            }
        elif operation.element_type == ElementType.STAIR:
            geometry["template"] = operation.geometry.template or "straight"
            geometry["riser_count"] = int(operation.geometry.dimensions.riser_count if operation.geometry.dimensions and operation.geometry.dimensions.riser_count else max(int(round(current["height_mm"] / 175.0)), 2))

        warnings: List[str] = []
        if operation.element_type == ElementType.STAIR:
            warnings.append("Stair geometry remains template-based during move and rotate.")
        if operation.element_type == ElementType.ROOF:
            warnings.append("Roof geometry remains template-based during move and rotate.")

        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or element.Name or operation.element_type.value.title(),
            "storey_guid": storey_guid,
            "host_guid": None,
            "geometry": geometry,
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "element",
            "lock_scope_key": element.GlobalId,
            "warnings": warnings,
        }

    def _preview_hosted_update(
        self,
        ifc_file: ifcopenshell.file,
        operation: AuthoringOperation,
        session_id: str,
        element,
        storey_guid: Optional[str],
    ) -> Dict[str, Any]:
        if operation.geometry.rotation is not None and operation.geometry.rotation.z is not None:
            raise AuthoringValidationError("Rotate is not supported for hosted doors and windows.")

        hosted = self._extract_hosted_element_state(ifc_file, element)
        dims = operation.geometry.dimensions
        target_width = float(dims.width if dims and dims.width else hosted["width"])
        target_height = float(dims.height if dims and dims.height else hosted["height"])
        sill_height = float(dims.sill_height if dims and dims.sill_height is not None else hosted["sill_height"])
        requested_position = operation.geometry.position or hosted["position"]

        if operation.target.host_guid:
            host, host_geometry, inferred = self._find_host_wall(ifc_file, storey_guid, operation.target.host_guid, requested_position)
        elif operation.geometry.position is not None:
            host, host_geometry, inferred = self._find_host_wall(ifc_file, storey_guid, None, requested_position)
        else:
            host, host_geometry, inferred = hosted["host"], hosted["host_geometry"], False

        center_local_x = self._resolve_host_offset(host_geometry, requested_position, target_width)
        bbox = self._oriented_bbox(
            host_geometry["origin_mm"],
            host_geometry["x_axis"],
            host_geometry["y_axis"],
            host_geometry["z_axis"],
            (
                center_local_x,
                float(host_geometry["center_offset_local_mm"][1]),
                sill_height + target_height / 2,
            ),
            (target_width / 2, host_geometry["thickness_mm"] * 0.6, target_height / 2),
        )
        warnings: List[str] = []
        if inferred and host.GlobalId != hosted["host"].GlobalId:
            warnings.append("Host wall inferred automatically from the requested position.")
        if host.GlobalId != hosted["host"].GlobalId:
            warnings.append("Host wall will change when this update is applied.")
        return {
            "operation_id": operation.operation_id,
            "session_id": session_id,
            "action": operation.action.value,
            "element_type": operation.element_type.value,
            "label": operation.semantics.type_name or element.Name or operation.element_type.value.title(),
            "storey_guid": storey_guid,
            "host_guid": host.GlobalId,
            "geometry": {
                "position": requested_position.model_dump(),
                "width": target_width,
                "height": target_height,
                "sill_height": sill_height,
                "host_offset_x": center_local_x,
                "host_center_y": float(host_geometry["center_offset_local_mm"][1]),
                "host_length": host_geometry["length_mm"],
                "host_thickness": host_geometry["thickness_mm"],
                "opening_depth": host_geometry["thickness_mm"] * 1.2,
            },
            "semantics": operation.semantics.model_dump(),
            "bbox": bbox,
            "lock_scope": "element",
            "lock_scope_key": host.GlobalId,
            "warnings": warnings,
        }

    def _apply_create(self, preview: Dict[str, Any]) -> List[Dict[str, Any]]:
        ifc_file = self._load_ifc()
        storey = self._resolve_storey(ifc_file, preview.get("storey_guid"))
        if storey is None:
            raise AuthoringValidationError("Target storey not found.")
        element_type = preview["element_type"]

        if element_type == ElementType.WALL.value:
            element = self._create_wall(ifc_file, storey, preview)
            opening = None
        elif element_type in {ElementType.SLAB.value, ElementType.COLUMN.value, ElementType.BEAM.value, ElementType.STAIR.value, ElementType.ROOF.value}:
            element = self._create_prism_element(ifc_file, storey, preview)
            opening = None
        elif element_type in {ElementType.DOOR.value, ElementType.WINDOW.value}:
            opening, element = self._create_hosted_element(ifc_file, storey, preview)
        else:
            raise AuthoringValidationError(f"{element_type} creation is not implemented.")

        self._assign_default_psets(ifc_file, element, element_type, preview["semantics"], preview["geometry"])
        self._assign_material(ifc_file, element, preview["semantics"]["material"])
        if opening is not None:
            self._assign_opening_pset(ifc_file, opening, element_type, preview["geometry"])
        ifc_file.write(str(self.ifc_path))

        change = {
            "guid": element.GlobalId,
            "element_type": element.is_a(),
            "operation": "add",
            "properties_changed": {"material": {"after": preview["semantics"]["material"]}, "type_name": {"after": preview["label"]}},
            "geometry_changed": True,
        }
        if opening is not None:
            change["properties_changed"]["opening_guid"] = {"after": opening.GlobalId}
            change["properties_changed"]["host_guid"] = {"after": preview["host_guid"]}
        return [change]

    def _apply_delete(self, operation: AuthoringOperation) -> List[Dict[str, Any]]:
        service = BIMService(self.project_id).load()
        target = BIMTarget(element_type=operation.element_type, element_guid=operation.target.element_guid)
        elements = service.find_elements(target)
        if not elements:
            raise AuthoringValidationError("Target element was not found.")

        changes = []
        for element in elements:
            if element.is_a("IfcDoor") or element.is_a("IfcWindow"):
                opening = element.FillsVoids[0].RelatingOpeningElement if getattr(element, "FillsVoids", None) else None
                removed = service.delete_element(element)
                if opening is not None:
                    try:
                        ifcopenshell.api.run("feature.remove_feature", service._ifc_file, feature=opening)
                    except Exception:
                        try:
                            service.delete_element(opening)
                        except Exception:
                            pass
                changes.append({"guid": removed["guid"], "element_type": operation.element_type.value, "operation": "delete", "properties_changed": {}, "geometry_changed": True})
            else:
                removed = service.delete_element(element)
                changes.append({"guid": removed["guid"], "element_type": operation.element_type.value, "operation": "delete", "properties_changed": {}, "geometry_changed": True})
        service.save()
        return changes

    def _apply_update(self, preview: Dict[str, Any], operation: AuthoringOperation) -> List[Dict[str, Any]]:
        ifc_file = self._load_ifc()
        element = self._resolve_target_element(ifc_file, operation)
        if element.is_a("IfcDoor") or element.is_a("IfcWindow"):
            change = self._apply_hosted_update(ifc_file, element, preview)
        else:
            change = self._apply_rectangular_update(ifc_file, element, preview)
        ifc_file.write(str(self.ifc_path))
        return [change]

    def _apply_rectangular_update(self, ifc_file: ifcopenshell.file, element, preview: Dict[str, Any]) -> Dict[str, Any]:
        geometry = self._extract_rectangular_geometry(ifc_file, element)
        if not geometry:
            raise AuthoringValidationError("Selected element does not have a supported rectangular representation.")

        storey = element_util.get_container(element)
        if storey is None or not storey.is_a("IfcBuildingStorey"):
            raise AuthoringValidationError("Selected element is not contained in a building storey.")

        position = preview["geometry"].get("position")
        placement_origin = preview["geometry"].get("placement_origin") or position
        if not placement_origin:
            raise AuthoringValidationError("Update preview is missing a target position.")

        rotation_z = float(preview["geometry"].get("rotation_z", _yaw_from_axis(geometry["x_axis"])))
        storey_elevation_mm = self._storey_elevation_mm(ifc_file, storey)
        local_position = (
            self._mm_to_project(ifc_file, float(placement_origin["x"])),
            self._mm_to_project(ifc_file, float(placement_origin["y"])),
            self._mm_to_project(ifc_file, float(placement_origin["z"]) - storey_elevation_mm),
        )
        rotation_rad = math.radians(rotation_z)
        element.ObjectPlacement = self._create_local_placement(
            ifc_file,
            storey.ObjectPlacement,
            local_position,
            refdir=(math.cos(rotation_rad), math.sin(rotation_rad), 0.0),
        )
        return {
            "guid": element.GlobalId,
            "element_type": element.is_a(),
            "operation": "modify",
            "properties_changed": {
                "position": {"after": position},
                "placement_origin": {"after": placement_origin},
                "rotation_z": {"after": rotation_z},
            },
            "geometry_changed": True,
        }

    def _apply_hosted_update(self, ifc_file: ifcopenshell.file, element, preview: Dict[str, Any]) -> Dict[str, Any]:
        hosted = self._extract_hosted_element_state(ifc_file, element)
        geometry = preview["geometry"]
        target_host = hosted["host"]
        target_host_guid = preview.get("host_guid")
        if target_host_guid and target_host_guid != hosted["host"].GlobalId:
            try:
                target_host = ifc_file.by_guid(target_host_guid)
            except Exception as error:
                raise AuthoringValidationError("Target host wall was not found.") from error
            if not target_host.is_a("IfcWall"):
                raise AuthoringValidationError("Target host must be an IfcWall.")

        target_storey = element_util.get_container(target_host)
        if target_storey is None or not target_storey.is_a("IfcBuildingStorey"):
            raise AuthoringValidationError("Target host wall is not contained in a building storey.")
        target_host_geometry = self._extract_rectangular_geometry(ifc_file, target_host)
        if not target_host_geometry:
            raise AuthoringValidationError("Target host wall geometry is not supported.")

        offset_u = self._mm_to_project(ifc_file, float(geometry["host_offset_x"]))
        center_y_u = self._mm_to_project(
            ifc_file,
            float(geometry.get("host_center_y", target_host_geometry["center_offset_local_mm"][1])),
        )
        sill_u = self._mm_to_project(ifc_file, float(geometry["sill_height"]))
        width_u = self._mm_to_project(ifc_file, float(geometry["width"]))
        height_u = self._mm_to_project(ifc_file, float(geometry["height"]))
        opening_depth_u = self._mm_to_project(ifc_file, float(geometry["opening_depth"]))
        frame_depth_u = self._mm_to_project(ifc_file, max(float(geometry["host_thickness"]) * 0.25, 60.0))

        if target_host.GlobalId != hosted["host"].GlobalId:
            old_opening = hosted["opening"]
            try:
                ifcopenshell.api.run("feature.remove_feature", ifc_file, feature=old_opening)
            except Exception:
                element_util.remove_deep(ifc_file, old_opening)

            opening = ifcopenshell.api.run(
                "root.create_entity",
                ifc_file,
                ifc_class="IfcOpeningElement",
                name=old_opening.Name or f"{element.Name or element.is_a()} Opening",
            )
            opening.ObjectPlacement = self._create_local_placement(
                ifc_file,
                target_host.ObjectPlacement,
                (offset_u, center_y_u, sill_u),
            )
            opening.Representation = self._create_product_shape(ifc_file, width_u, opening_depth_u, height_u)
            ifcopenshell.api.run("feature.add_feature", ifc_file, feature=opening, element=target_host)
            ifcopenshell.api.run("feature.add_filling", ifc_file, opening=opening, element=element)
            self._assign_opening_pset(ifc_file, opening, preview["element_type"], geometry)
        else:
            opening = hosted["opening"]
            opening.ObjectPlacement = self._create_local_placement(
                ifc_file,
                target_host.ObjectPlacement,
                (offset_u, center_y_u, sill_u),
            )
            opening.Representation = self._create_product_shape(ifc_file, width_u, opening_depth_u, height_u)

        element.ObjectPlacement = self._create_local_placement(
            ifc_file,
            target_host.ObjectPlacement,
            (offset_u, center_y_u, sill_u),
        )
        element.Representation = self._create_product_shape(ifc_file, width_u, frame_depth_u, height_u)
        ifcopenshell.api.run("spatial.assign_container", ifc_file, products=[element], relating_structure=target_storey)
        return {
            "guid": element.GlobalId,
            "element_type": element.is_a(),
            "operation": "modify",
            "properties_changed": {
                "position": {"after": geometry.get("position")},
                "host_guid": {"after": target_host.GlobalId},
                "sill_height": {"after": geometry.get("sill_height")},
                "width": {"after": geometry.get("width")},
                "height": {"after": geometry.get("height")},
            },
            "geometry_changed": True,
        }

    def _ensure_lock_owner(self, project_id: str, session_id: str, preview: Dict[str, Any]) -> None:
        state = authoring_state.get_project_state(project_id)
        lock = state["locks"].get(f"{preview['lock_scope']}:{preview['lock_scope_key']}")
        if lock is None or lock.get("session_id") != session_id:
            raise AuthoringConflictError("Authoring lock is missing or owned by another session.")

    def _update_project_revision(self, project: Project, revision: int) -> None:
        meta = deepcopy(project.meta_info or {})
        meta["model_revision"] = revision
        project.meta_info = meta

    def _resolve_storey(self, ifc_file: ifcopenshell.file, storey_guid: Optional[str]):
        storeys = ifc_file.by_type("IfcBuildingStorey")
        if not storeys:
            return None
        if storey_guid:
            for storey in storeys:
                if storey.GlobalId == storey_guid:
                    return storey
        return storeys[0]

    def _resolve_target_element(self, ifc_file: ifcopenshell.file, operation: AuthoringOperation):
        if not operation.target.element_guid:
            raise AuthoringValidationError(f"{operation.action.value.title()} requires target.element_guid.")
        try:
            element = ifc_file.by_guid(operation.target.element_guid)
        except Exception as error:
            raise AuthoringValidationError("Target element was not found.") from error
        expected_type = BIMService(self.project_id)._element_type_to_ifc(operation.element_type.value)
        if expected_type != "IfcBuildingElement" and not element.is_a(expected_type):
            raise AuthoringValidationError(f"Target element is not an {expected_type}.")
        return element

    def _get_body_context(self, ifc_file: ifcopenshell.file):
        for context in ifc_file.by_type("IfcGeometricRepresentationSubContext"):
            if str(getattr(context, "ContextIdentifier", "")).lower() == "body":
                return context
        for context in ifc_file.by_type("IfcGeometricRepresentationContext"):
            if str(getattr(context, "ContextType", "")).lower() == "model":
                return context
        raise AuthoringValidationError("Body representation context not found.")

    def _extract_curve_points_2d(self, curve) -> List[Tuple[float, float]]:
        if curve is None:
            return []

        if curve.is_a("IfcIndexedPolyCurve"):
            point_list = getattr(curve, "Points", None)
            coord_list = getattr(point_list, "CoordList", None) or []
            points = []
            for coords in coord_list:
                if len(coords) >= 2:
                    points.append((float(coords[0]), float(coords[1])))
            return points

        if curve.is_a("IfcPolyline"):
            points = []
            for point in getattr(curve, "Points", []) or []:
                coords = getattr(point, "Coordinates", None) or []
                if len(coords) >= 2:
                    points.append((float(coords[0]), float(coords[1])))
            return points

        return []

    def _extract_profile_box(
        self,
        ifc_file: ifcopenshell.file,
        profile,
    ) -> Optional[Dict[str, float]]:
        if profile.is_a("IfcRectangleProfileDef"):
            center_x = 0.0
            center_y = 0.0
            position = getattr(profile, "Position", None)
            location = getattr(position, "Location", None) if position else None
            coords = getattr(location, "Coordinates", None) or []
            if len(coords) >= 2:
                center_x = self._project_to_mm(ifc_file, float(coords[0]))
                center_y = self._project_to_mm(ifc_file, float(coords[1]))

            x_dim_mm = self._project_to_mm(ifc_file, float(profile.XDim))
            y_dim_mm = self._project_to_mm(ifc_file, float(profile.YDim))
            return {
                "min_x": center_x - x_dim_mm / 2,
                "max_x": center_x + x_dim_mm / 2,
                "min_y": center_y - y_dim_mm / 2,
                "max_y": center_y + y_dim_mm / 2,
                "size_x": x_dim_mm,
                "size_y": y_dim_mm,
                "center_x": center_x,
                "center_y": center_y,
            }

        if profile.is_a("IfcArbitraryClosedProfileDef"):
            points = self._extract_curve_points_2d(getattr(profile, "OuterCurve", None))
            if len(points) < 3:
                return None
            xs = [self._project_to_mm(ifc_file, point[0]) for point in points]
            ys = [self._project_to_mm(ifc_file, point[1]) for point in points]
            min_x = min(xs)
            max_x = max(xs)
            min_y = min(ys)
            max_y = max(ys)
            return {
                "min_x": min_x,
                "max_x": max_x,
                "min_y": min_y,
                "max_y": max_y,
                "size_x": max_x - min_x,
                "size_y": max_y - min_y,
                "center_x": (min_x + max_x) / 2,
                "center_y": (min_y + max_y) / 2,
            }

        return None

    def _extract_rectangular_geometry(self, ifc_file: ifcopenshell.file, element) -> Optional[Dict[str, Any]]:
        if not element.Representation:
            return None
        placement = placement_util.get_local_placement(element.ObjectPlacement)
        origin = (self._project_to_mm(ifc_file, float(placement[0][3])), self._project_to_mm(ifc_file, float(placement[1][3])), self._project_to_mm(ifc_file, float(placement[2][3])))
        x_axis = _normalize((float(placement[0][0]), float(placement[1][0]), float(placement[2][0])))
        y_axis = _normalize((float(placement[0][1]), float(placement[1][1]), float(placement[2][1])))
        z_axis = _normalize((float(placement[0][2]), float(placement[1][2]), float(placement[2][2])))

        for representation in element.Representation.Representations:
            for item in getattr(representation, "Items", []) or []:
                if not item.is_a("IfcExtrudedAreaSolid"):
                    continue
                profile = item.SweptArea
                profile_box = self._extract_profile_box(ifc_file, profile)
                if not profile_box:
                    continue
                x_dim_mm = profile_box["size_x"]
                y_dim_mm = profile_box["size_y"]
                z_dim_mm = self._project_to_mm(ifc_file, float(item.Depth))
                min_x = profile_box["min_x"]
                max_x = profile_box["max_x"]
                min_y = profile_box["min_y"]
                max_y = profile_box["max_y"]
                center_x = profile_box["center_x"]
                center_y = profile_box["center_y"]
                if element.is_a("IfcWall") and x_dim_mm < y_dim_mm:
                    x_dim_mm, y_dim_mm = y_dim_mm, x_dim_mm
                    x_axis, y_axis = y_axis, x_axis
                    min_x, min_y = min_y, min_x
                    max_x, max_y = max_y, max_x
                    center_x, center_y = center_y, center_x
                return {
                    "origin_mm": origin,
                    "x_axis": x_axis,
                    "y_axis": y_axis,
                    "z_axis": z_axis,
                    "length_mm": x_dim_mm,
                    "thickness_mm": y_dim_mm,
                    "height_mm": z_dim_mm,
                    "min_x_local_mm": min_x,
                    "max_x_local_mm": max_x,
                    "min_y_local_mm": min_y,
                    "max_y_local_mm": max_y,
                    "center_offset_local_mm": (
                        center_x,
                        center_y,
                        z_dim_mm / 2,
                    ),
                }
        return None

    def _extract_hosted_element_state(self, ifc_file: ifcopenshell.file, element) -> Dict[str, Any]:
        fills = list(getattr(element, "FillsVoids", None) or [])
        if not fills:
            raise AuthoringValidationError("Selected element is not hosted by an opening.")
        opening = fills[0].RelatingOpeningElement
        voids = list(getattr(opening, "VoidsElements", None) or [])
        if not voids:
            raise AuthoringValidationError("Selected opening is not linked to a host wall.")
        host = voids[0].RelatingBuildingElement
        host_geometry = self._extract_rectangular_geometry(ifc_file, host)
        if not host_geometry:
            raise AuthoringValidationError("Host wall geometry is not supported.")

        element_geometry = self._extract_rectangular_geometry(ifc_file, element)
        opening_geometry = self._extract_rectangular_geometry(ifc_file, opening)
        if not element_geometry or not opening_geometry:
            raise AuthoringValidationError("Hosted element geometry is not supported.")

        local = self._world_to_local_mm(host_geometry, opening_geometry["origin_mm"])
        return {
            "host": host,
            "host_geometry": host_geometry,
            "opening": opening,
            "position": Vector3(x=opening_geometry["origin_mm"][0], y=opening_geometry["origin_mm"][1], z=opening_geometry["origin_mm"][2]),
            "host_offset_x": local[0],
            "sill_height": local[2],
            "width": element_geometry["length_mm"],
            "height": element_geometry["height_mm"],
            "opening_depth": opening_geometry["thickness_mm"],
        }

    def _find_host_wall(self, ifc_file: ifcopenshell.file, storey_guid: Optional[str], host_guid: Optional[str], position: Optional[Vector3]):
        walls = list(ifc_file.by_type("IfcWall"))
        if storey_guid:
            walls = [wall for wall in walls if getattr(element_util.get_container(wall), "GlobalId", None) == storey_guid]
        if not walls:
            raise AuthoringValidationError("No wall is available to host this element.")

        if host_guid:
            for wall in walls:
                if wall.GlobalId == host_guid:
                    geometry = self._extract_rectangular_geometry(ifc_file, wall)
                    if geometry:
                        return wall, geometry, False
            raise AuthoringValidationError("Specified host wall was not found or is unsupported.")

        if position is None:
            for wall in walls:
                geometry = self._extract_rectangular_geometry(ifc_file, wall)
                if geometry:
                    return wall, geometry, True
            raise AuthoringValidationError("No compatible wall geometry found for hosting.")

        ranked = []
        point = (position.x, position.y, position.z)
        for wall in walls:
            geometry = self._extract_rectangular_geometry(ifc_file, wall)
            if not geometry:
                continue
            local = self._world_to_local_mm(geometry, point)
            if local[0] < geometry["min_x_local_mm"]:
                along = float(geometry["min_x_local_mm"] - local[0])
            elif local[0] > geometry["max_x_local_mm"]:
                along = float(local[0] - geometry["max_x_local_mm"])
            else:
                along = 0.0
            if local[1] < geometry["min_y_local_mm"]:
                across = float(geometry["min_y_local_mm"] - local[1])
            elif local[1] > geometry["max_y_local_mm"]:
                across = float(local[1] - geometry["max_y_local_mm"])
            else:
                across = 0.0
            vertical = local[2]
            if vertical < -100.0 or vertical > geometry["height_mm"] + 100.0:
                continue
            ranked.append((max(along, 0.0) + across, wall, geometry))

        if ranked:
            ranked.sort(key=lambda item: item[0])
            return ranked[0][1], ranked[0][2], True

        for wall in walls:
            geometry = self._extract_rectangular_geometry(ifc_file, wall)
            if geometry:
                return wall, geometry, True
        raise AuthoringValidationError("No compatible wall geometry found for hosting.")

    def _resolve_host_offset(self, host_geometry: Dict[str, Any], position: Optional[Vector3], opening_width: float) -> float:
        if position is None:
            return float(host_geometry["center_offset_local_mm"][0])
        local = self._world_to_local_mm(host_geometry, (position.x, position.y, position.z))
        minimum = float(host_geometry["min_x_local_mm"]) + opening_width / 2 + 50.0
        maximum = float(host_geometry["max_x_local_mm"]) - opening_width / 2 - 50.0
        if minimum > maximum:
            return float(host_geometry["center_offset_local_mm"][0])
        return max(min(local[0], maximum), minimum)

    def _world_to_local_mm(self, geometry: Dict[str, Any], point_mm: Tuple[float, float, float]) -> Tuple[float, float, float]:
        vector = _sub(point_mm, geometry["origin_mm"])
        return (_dot(vector, geometry["x_axis"]), _dot(vector, geometry["y_axis"]), _dot(vector, geometry["z_axis"]))

    def _oriented_bbox(
        self,
        origin: Tuple[float, float, float],
        x_axis: Tuple[float, float, float],
        y_axis: Tuple[float, float, float],
        z_axis: Tuple[float, float, float],
        center_local: Tuple[float, float, float],
        extents: Tuple[float, float, float],
    ) -> Dict[str, Dict[str, float]]:
        center = _add(origin, _add(_scale(x_axis, center_local[0]), _add(_scale(y_axis, center_local[1]), _scale(z_axis, center_local[2]))))
        corners = []
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    corners.append(_add(center, _add(_scale(x_axis, sx * extents[0]), _add(_scale(y_axis, sy * extents[1]), _scale(z_axis, sz * extents[2])))))
        xs = [point[0] for point in corners]
        ys = [point[1] for point in corners]
        zs = [point[2] for point in corners]
        return {"min": {"x": min(xs), "y": min(ys), "z": min(zs)}, "max": {"x": max(xs), "y": max(ys), "z": max(zs)}}

    def _create_wall(self, ifc_file: ifcopenshell.file, storey, preview: Dict[str, Any]):
        geometry = preview["geometry"]
        start = geometry["start"]
        end = geometry["end"]
        length_u = self._mm_to_project(ifc_file, geometry["length"])
        thickness_u = self._mm_to_project(ifc_file, geometry["thickness"])
        height_u = self._mm_to_project(ifc_file, geometry["height"])
        angle = math.atan2(end["y"] - start["y"], end["x"] - start["x"])
        midpoint = (self._mm_to_project(ifc_file, (start["x"] + end["x"]) / 2), self._mm_to_project(ifc_file, (start["y"] + end["y"]) / 2), 0.0)

        element = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcWall", name=preview["label"])
        element.ObjectPlacement = self._create_local_placement(ifc_file, storey.ObjectPlacement, midpoint, refdir=(math.cos(angle), math.sin(angle), 0.0))
        element.Representation = self._create_product_shape(ifc_file, length_u, thickness_u, height_u)
        ifcopenshell.api.run("spatial.assign_container", ifc_file, products=[element], relating_structure=storey)
        return element

    def _create_prism_element(self, ifc_file: ifcopenshell.file, storey, preview: Dict[str, Any]):
        ifc_class = {
            ElementType.SLAB.value: "IfcSlab",
            ElementType.COLUMN.value: "IfcColumn",
            ElementType.BEAM.value: "IfcBeam",
            ElementType.STAIR.value: "IfcStair",
            ElementType.ROOF.value: "IfcRoof",
        }.get(preview["element_type"])
        if ifc_class is None:
            raise AuthoringValidationError(f"{preview['element_type']} creation is not implemented.")

        geometry = preview["geometry"]
        position = geometry["position"]
        width_u = self._mm_to_project(ifc_file, geometry["width"])
        depth_u = self._mm_to_project(ifc_file, geometry.get("depth", geometry.get("length", geometry.get("thickness"))))
        height_u = self._mm_to_project(ifc_file, geometry.get("height", geometry.get("thickness")))
        rotation_z = math.radians(float(geometry.get("rotation_z", 0.0)))
        storey_elevation_mm = self._storey_elevation_mm(ifc_file, storey)
        local_position = (
            self._mm_to_project(ifc_file, position["x"]),
            self._mm_to_project(ifc_file, position["y"]),
            self._mm_to_project(ifc_file, position["z"] - storey_elevation_mm),
        )

        element = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class=ifc_class, name=preview["label"])
        element.ObjectPlacement = self._create_local_placement(ifc_file, storey.ObjectPlacement, local_position, refdir=(math.cos(rotation_z), math.sin(rotation_z), 0.0))
        if ifc_class == "IfcStair":
            riser_count = int(geometry.get("riser_count", max(int(round(geometry.get("height", 3000.0) / 175.0)), 2)))
            element.Representation = self._create_stair_shape(ifc_file, width_u, depth_u, height_u, riser_count)
        elif ifc_class == "IfcRoof":
            thickness_u = self._mm_to_project(ifc_file, geometry.get("thickness", geometry.get("height", 250.0)))
            element.Representation = self._create_roof_shape(
                ifc_file,
                width_u,
                depth_u,
                height_u,
                thickness_u,
                geometry.get("template", "gable"),
            )
        else:
            element.Representation = self._create_product_shape(ifc_file, width_u, depth_u, height_u)
        ifcopenshell.api.run("spatial.assign_container", ifc_file, products=[element], relating_structure=storey)
        return element

    def _create_hosted_element(self, ifc_file: ifcopenshell.file, storey, preview: Dict[str, Any]):
        host, host_geometry, _ = self._find_host_wall(ifc_file, preview.get("storey_guid"), preview.get("host_guid"), None)
        geometry = preview["geometry"]
        width_u = self._mm_to_project(ifc_file, geometry["width"])
        height_u = self._mm_to_project(ifc_file, geometry["height"])
        sill_u = self._mm_to_project(ifc_file, geometry["sill_height"])
        offset_u = self._mm_to_project(ifc_file, geometry["host_offset_x"])
        center_y_u = self._mm_to_project(
            ifc_file,
            float(geometry.get("host_center_y", host_geometry["center_offset_local_mm"][1])),
        )
        opening_depth_u = self._mm_to_project(ifc_file, geometry["opening_depth"])
        frame_depth_u = self._mm_to_project(ifc_file, max(geometry["host_thickness"] * 0.25, 60.0))

        opening = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcOpeningElement", name=f"{preview['label']} Opening")
        opening.ObjectPlacement = self._create_local_placement(ifc_file, host.ObjectPlacement, (offset_u, center_y_u, sill_u))
        opening.Representation = self._create_product_shape(ifc_file, width_u, opening_depth_u, height_u)
        ifcopenshell.api.run("feature.add_feature", ifc_file, feature=opening, element=host)

        ifc_class = "IfcDoor" if preview["element_type"] == ElementType.DOOR.value else "IfcWindow"
        filling = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class=ifc_class, name=preview["label"])
        filling.ObjectPlacement = self._create_local_placement(ifc_file, host.ObjectPlacement, (offset_u, center_y_u, sill_u))
        filling.Representation = self._create_product_shape(ifc_file, width_u, frame_depth_u, height_u)
        ifcopenshell.api.run("spatial.assign_container", ifc_file, products=[filling], relating_structure=storey)
        ifcopenshell.api.run("feature.add_filling", ifc_file, opening=opening, element=filling)
        return opening, filling

    def _assign_default_psets(self, ifc_file: ifcopenshell.file, element, element_type: str, semantics: Dict[str, Any], geometry: Dict[str, Any]) -> None:
        pset_name = {
            ElementType.WALL.value: "Pset_WallCommon",
            ElementType.SLAB.value: "Pset_SlabCommon",
            ElementType.COLUMN.value: "Pset_ColumnCommon",
            ElementType.BEAM.value: "Pset_BeamCommon",
            ElementType.DOOR.value: "Pset_DoorCommon",
            ElementType.WINDOW.value: "Pset_WindowCommon",
            ElementType.STAIR.value: "Pset_StairCommon",
            ElementType.ROOF.value: "Pset_RoofCommon",
        }.get(element_type, "Pset_BuildingElementCommon")
        pset = ifcopenshell.api.run("pset.add_pset", ifc_file, product=element, name=pset_name)
        properties = {"Reference": semantics.get("type_name") or element.Name}
        if element_type in {ElementType.DOOR.value, ElementType.WINDOW.value}:
            properties["IsExternal"] = True
        if element_type == ElementType.STAIR.value:
            properties["NumberOfRiser"] = int(geometry.get("riser_count", max(int(round(float(geometry["height"]) / 175.0)), 2)))
        if element_type == ElementType.ROOF.value:
            properties["PitchAngle"] = float(geometry.get("pitch", 30.0))
        ifcopenshell.api.run("pset.edit_pset", ifc_file, pset=pset, properties=properties)

        for extra_name, extra_props in (semantics.get("psets") or {}).items():
            extra = ifcopenshell.api.run("pset.add_pset", ifc_file, product=element, name=extra_name)
            ifcopenshell.api.run("pset.edit_pset", ifc_file, pset=extra, properties=extra_props)

        if geometry.get("template"):
            template_pset = ifcopenshell.api.run("pset.add_pset", ifc_file, product=element, name="Pset_AuthoringTemplate")
            ifcopenshell.api.run("pset.edit_pset", ifc_file, pset=template_pset, properties={"Template": geometry.get("template")})

    def _assign_opening_pset(self, ifc_file: ifcopenshell.file, opening, element_type: str, geometry: Dict[str, Any]) -> None:
        pset = ifcopenshell.api.run("pset.add_pset", ifc_file, product=opening, name="Pset_OpeningElementCommon")
        ifcopenshell.api.run("pset.edit_pset", ifc_file, pset=pset, properties={"OpeningType": element_type.title(), "SillHeight": float(geometry.get("sill_height", 0.0))})

    def _assign_material(self, ifc_file: ifcopenshell.file, element, material_name: str) -> None:
        helper = BIMService(self.project_id)
        helper._ifc_file = ifc_file
        helper.modify_material(element, str(material_name), str(material_name))

    def _create_product_shape(self, ifc_file: ifcopenshell.file, x_dim: float, y_dim: float, z_dim: float):
        body_context = self._get_body_context(ifc_file)
        profile_position = ifc_file.createIfcAxis2Placement2D(ifc_file.createIfcCartesianPoint((0.0, 0.0)), ifc_file.createIfcDirection((1.0, 0.0)))
        profile = ifc_file.createIfcRectangleProfileDef("AREA", None, profile_position, x_dim, y_dim)
        solid_position = ifc_file.createIfcAxis2Placement3D(ifc_file.createIfcCartesianPoint((0.0, 0.0, 0.0)), ifc_file.createIfcDirection((0.0, 0.0, 1.0)), ifc_file.createIfcDirection((1.0, 0.0, 0.0)))
        solid = ifc_file.createIfcExtrudedAreaSolid(profile, solid_position, ifc_file.createIfcDirection((0.0, 0.0, 1.0)), z_dim)
        shape = ifc_file.createIfcShapeRepresentation(body_context, "Body", "SweptSolid", [solid])
        return ifc_file.createIfcProductDefinitionShape(None, None, [shape])

    def _create_profile_extrusion_shape(
        self,
        ifc_file: ifcopenshell.file,
        profile_points: List[Tuple[float, float]],
        extrusion_depth: float,
    ):
        body_context = self._get_body_context(ifc_file)
        curve_points = [ifc_file.createIfcCartesianPoint(point) for point in [*profile_points, profile_points[0]]]
        profile = ifc_file.createIfcArbitraryClosedProfileDef(
            "AREA",
            None,
            ifc_file.createIfcPolyline(curve_points),
        )
        solid_position = ifc_file.createIfcAxis2Placement3D(
            ifc_file.createIfcCartesianPoint((0.0, -extrusion_depth / 2, 0.0)),
            ifc_file.createIfcDirection((0.0, -1.0, 0.0)),
            ifc_file.createIfcDirection((1.0, 0.0, 0.0)),
        )
        solid = ifc_file.createIfcExtrudedAreaSolid(
            profile,
            solid_position,
            ifc_file.createIfcDirection((0.0, 0.0, -1.0)),
            extrusion_depth,
        )
        shape = ifc_file.createIfcShapeRepresentation(body_context, "Body", "SweptSolid", [solid])
        return ifc_file.createIfcProductDefinitionShape(None, None, [shape])

    def _create_stair_shape(
        self,
        ifc_file: ifcopenshell.file,
        width: float,
        run: float,
        height: float,
        riser_count: int,
    ):
        riser_count = max(int(riser_count), 2)
        tread = run / riser_count
        rise = height / riser_count
        x_start = -run / 2
        profile_points: List[Tuple[float, float]] = [(x_start, 0.0)]
        for riser_index in range(riser_count):
            tread_end = x_start + tread * (riser_index + 1)
            current_rise = rise * riser_index
            next_rise = rise * (riser_index + 1)
            profile_points.append((tread_end, current_rise))
            profile_points.append((tread_end, next_rise))
        profile_points.append((x_start, height))
        return self._create_profile_extrusion_shape(ifc_file, profile_points, width)

    def _create_roof_shape(
        self,
        ifc_file: ifcopenshell.file,
        width: float,
        length: float,
        rise: float,
        thickness: float,
        template: str,
    ):
        half_width = width / 2
        normalized = str(template or "gable").lower()
        if normalized == "flat":
            profile_points = [
                (-half_width, 0.0),
                (half_width, 0.0),
                (half_width, thickness),
                (-half_width, thickness),
            ]
        elif normalized == "shed":
            profile_points = [
                (-half_width, 0.0),
                (half_width, rise),
                (half_width, rise + thickness),
                (-half_width, thickness),
            ]
        else:
            profile_points = [
                (-half_width, 0.0),
                (0.0, rise),
                (half_width, 0.0),
                (half_width, thickness),
                (0.0, rise + thickness),
                (-half_width, thickness),
            ]
        return self._create_profile_extrusion_shape(ifc_file, profile_points, length)

    def _create_local_placement(
        self,
        ifc_file: ifcopenshell.file,
        relative_to,
        point: Tuple[float, float, float],
        axis: Tuple[float, float, float] = (0.0, 0.0, 1.0),
        refdir: Tuple[float, float, float] = (1.0, 0.0, 0.0),
    ):
        """Create an IfcLocalPlacement using explicit keyword arguments to avoid positional ambiguity."""
        location = ifc_file.createIfcCartesianPoint(point)
        axis_direction = ifc_file.createIfcDirection(axis)
        ref_direction = ifc_file.createIfcDirection(refdir)
        
        # 3D placement definition
        placement = ifc_file.createIfcAxis2Placement3D(location, axis_direction, ref_direction)
        
        # Ensure RelativePlacement is always set correctly, even if relative_to is None
        return ifc_file.create_entity(
            "IfcLocalPlacement", 
            PlacementRelTo=relative_to, 
            RelativePlacement=placement
        )

    def export_project_to_ifc(self, project_data: Dict[str, Any], apply_zone_colors: bool = False) -> str:
        """Export a FloorPlanner project (2D) to a new 3D IFC file."""
        # 1. Create a blank IFC4 file
        ifc_file = ifcopenshell.api.run("project.create_file", version="IFC4")
        project_entity = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcProject", name=project_data.get("name", "Floor Plan Project"))
        ifcopenshell.api.run("unit.assign_unit", ifc_file)

        # 2. Setup contexts
        model_context = ifcopenshell.api.run("context.add_context", ifc_file, context_type="Model")
        ifcopenshell.api.run("context.add_context", ifc_file, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model_context)
        
        # 3. Setup spatial structure
        site = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcSite", name="Site")
        building = ifcopenshell.api.run("root.create_entity", ifc_file, ifc_class="IfcBuilding", name="Building")
        
        # Link structure
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[site], relating_object=project_entity)
        ifcopenshell.api.run("aggregate.assign_object", ifc_file, products=[building], relating_object=site)
        
        # Placement
        site.ObjectPlacement = self._create_local_placement(ifc_file, None, (0.0, 0.0, 0.0))
        building.ObjectPlacement = self._create_local_placement(ifc_file, site.ObjectPlacement, (0.0, 0.0, 0.0))

        # 4. Generate elements from rooms
        rooms = project_data.get("rooms", [])
        zones = project_data.get("zones", [])
        zone_map = {z["id"]: z for z in zones} if zones else {}
        floors = sorted({_coerce_floor_number(room.get("floor")) for room in rooms}) or [1]
        storey_map = {
            floor: self._create_building_storey(
                ifc_file,
                building,
                floor,
                _floor_elevation_mm(floor),
            )
            for floor in floors
        }

        wall_thickness_mm = 200.0
        wall_height_mm = 2800.0
        slab_thickness_mm = 150.0

        for room in rooms:
            # Planner uses center-based coords in meters
            room_name = room.get("name", "Unnamed Room")
            room_type = room.get("type", "other")
            floor = _coerce_floor_number(room.get("floor"))
            storey = storey_map[floor]
            storey_elevation_mm = _floor_elevation_mm(floor)
            x_m = float(room.get("x", 0))
            y_m = float(room.get("y", 0))
            w_m = float(room.get("width", 4))
            h_m = float(room.get("height", 4))
            zone_id = room.get("zoneId")

            # Determine visual style
            base_material = room_type
            if apply_zone_colors and zone_id in zone_map:
                base_material = f"Zone_{zone_map[zone_id]['name']}"
                material_color = _hex_to_rgb(zone_map[zone_id]['color'])
            else:
                material_color = None

            # 4a. Create Floor Slab
            slab_preview = {
                "element_type": "slab",
                "label": f"{room_name} Floor",
                "geometry": {
                    "position": {"x": x_m * 1000.0, "y": y_m * 1000.0, "z": storey_elevation_mm - slab_thickness_mm},
                    "width": h_m * 1000.0,
                    "length": w_m * 1000.0,
                    "thickness": slab_thickness_mm
                },
                "semantics": {"material": base_material, "type_name": "Floor Slab", "psets": {}}
            }
            slab = self._create_prism_element(ifc_file, storey, slab_preview)
            if material_color:
                self._apply_custom_color(ifc_file, slab, material_color)

            # 4b. Create 4 Walls (Simplification: Independent boxes for each room)
            # South Wall
            wall_specs = [
                ("South", (x_m * 1000.0 - (w_m * 1000.0 / 2), y_m * 1000.0 - (h_m * 1000.0 / 2)), (x_m * 1000.0 + (w_m * 1000.0 / 2), y_m * 1000.0 - (h_m * 1000.0 / 2))),
                ("North", (x_m * 1000.0 - (w_m * 1000.0 / 2), y_m * 1000.0 + (h_m * 1000.0 / 2)), (x_m * 1000.0 + (w_m * 1000.0 / 2), y_m * 1000.0 + (h_m * 1000.0 / 2))),
                ("West", (x_m * 1000.0 - (w_m * 1000.0 / 2), y_m * 1000.0 - (h_m * 1000.0 / 2)), (x_m * 1000.0 - (w_m * 1000.0 / 2), y_m * 1000.0 + (h_m * 1000.0 / 2))),
                ("East", (x_m * 1000.0 + (w_m * 1000.0 / 2), y_m * 1000.0 - (h_m * 1000.0 / 2)), (x_m * 1000.0 + (w_m * 1000.0 / 2), y_m * 1000.0 + (h_m * 1000.0 / 2))),
            ]

            for side, (sx, sy), (ex, ey) in wall_specs:
                wall_preview = {
                    "element_type": "wall",
                    "label": f"{room_name} {side} Wall",
                    "geometry": {
                        "start": {"x": sx, "y": sy, "z": 0.0},
                        "end": {"x": ex, "y": ey, "z": 0.0},
                        "length": math.dist((sx, sy), (ex, ey)),
                        "thickness": wall_thickness_mm,
                        "height": wall_height_mm
                    },
                    "semantics": {"material": base_material, "type_name": "Standard Wall", "psets": {}}
                }
                wall = self._create_wall(ifc_file, storey, wall_preview)
                if material_color:
                    self._apply_custom_color(ifc_file, wall, material_color)

        # 5. Save the file
        ifc_file.write(str(self.ifc_path))
        return str(self.ifc_path)

    def _apply_custom_color(self, ifc_file: ifcopenshell.file, element, rgb: Tuple[float, float, float]) -> None:
        """Helper to apply ad-hoc color to an element."""
        style = ifcopenshell.api.run("style.add_style", ifc_file, name=f"Color_{rgb}")
        ifcopenshell.api.run("style.add_surface_style", ifc_file, style=style, ifc_class="IfcSurfaceStyleShading", attributes={
            "SurfaceColour": {"Name": None, "Red": rgb[0], "Green": rgb[1], "Blue": rgb[2]}
        })
        ifcopenshell.api.run("style.assign_representation_styles", ifc_file, shape_representation=element.Representation.Representations[0], styles=[style])

    def _region_lock_key(self, storey_guid: Optional[str], bbox: Dict[str, Any]) -> str:
        minimum = bbox["min"]
        maximum = bbox["max"]
        rounded = (round(minimum["x"], -2), round(minimum["y"], -2), round(maximum["x"], -2), round(maximum["y"], -2))
        return f"{storey_guid or 'default'}:{rounded[0]}:{rounded[1]}:{rounded[2]}:{rounded[3]}"
