"""Build IFC Edit commands from successful 3D planning preview results."""

from __future__ import annotations

from datetime import UTC
from typing import Any

from ai_domain.worker_messages.command import CommandMessage


IFC_EDIT_ROUTING_KEY = "command.ifc-edit.apply"


def build_ifc_edit_command(
    source_command: CommandMessage,
    planning_result: dict[str, Any],
) -> CommandMessage | None:
    """Convert a preview-ready planning result into an IFC_EDIT_APPLY command."""
    if planning_result.get("status") != "preview_ready":
        return None

    raw_command = planning_result.get("command")
    if not isinstance(raw_command, dict):
        return None

    operations = _build_operations(raw_command)
    if not operations:
        return None

    source_ifc_url = _source_ifc_url(source_command)
    if source_ifc_url is None:
        return None

    ifc_url, validation_url = _derive_output_urls(source_command)
    step_no = source_command.stepNo + 1
    total_steps = max(source_command.totalSteps, step_no)
    engine_request = {
        "schema_version": "v1",
        "request_id": f"{source_command.jobStepId}:ifc-edit",
        "mode": "apply",
        "project_id": source_command.projectId,
        "base_revision_id": source_command.sourceRevisionId,
        "operations": operations,
    }

    return CommandMessage.model_validate(
        {
            "messageId": f"{source_command.messageId}:ifc-edit",
            "schemaVersion": "v1",
            "messageType": "COMMAND",
            "commandType": "IFC_EDIT_APPLY",
            "routingKey": IFC_EDIT_ROUTING_KEY,
            "jobId": source_command.jobId,
            "jobStepId": f"{source_command.jobStepId}:ifc-edit",
            "stepNo": step_no,
            "totalSteps": total_steps,
            "projectId": source_command.projectId,
            "requestedBy": source_command.requestedBy,
            "sourceRevisionId": source_command.sourceRevisionId,
            "sourceSceneStateId": source_command.sourceSceneStateId,
            "sourceSceneType": source_command.sourceSceneType,
            "targetRevisionId": source_command.targetRevisionId,
            "expectedOutputArtifactId": f"{source_command.expectedOutputArtifactId}:ifc-edit",
            "input": {"sourceIfcStorageUrl": source_ifc_url},
            "expectedOutput": {
                "ifcStorageUrl": ifc_url,
                "validationReportStorageUrl": validation_url,
            },
            "payload": {"engineRequest": engine_request},
            "attemptNo": 0,
            "maxAttempts": source_command.maxAttempts,
            "idempotencyKey": f"{source_command.idempotencyKey}:ifc-edit",
            "correlationId": source_command.correlationId,
            "createdAt": source_command.createdAt.astimezone(UTC),
        }
    )


def _build_operations(raw_command: dict[str, Any]) -> list[dict[str, Any]]:
    command_type = raw_command.get("command_type")
    if command_type == "CREATE":
        operation = _build_create_operation(raw_command)
        return [operation] if operation is not None else []
    if command_type == "MODIFY":
        return _build_modify_operations(raw_command)
    if command_type == "DELETE":
        return [_build_delete_operation(raw_command)]
    return []


def _build_create_operation(raw_command: dict[str, Any]) -> dict[str, Any] | None:
    create_info = raw_command.get("create_info")
    if not isinstance(create_info, dict):
        return None

    params: dict[str, Any] = {
        "element_type": create_info.get("element_type") or "IfcWall",
        "storey": create_info.get("storey") or "1F",
        "coordinate_space": "PROJECT_ABSOLUTE_MM",
    }
    start = create_info.get("start_point")
    if isinstance(start, dict):
        params["start_mm"] = {
            "x": start.get("x", 0.0),
            "y": start.get("y", 0.0),
            "z": start.get("z", 0.0),
        }

    dimensions = _create_dimensions(create_info)
    if dimensions:
        params["dimensions_mm"] = dimensions

    for field in (
        "direction",
        "color",
        "host_wall_global_id",
        "sill_height_mm",
        "opening_offset_mm",
        "step_count",
        "riser_height_mm",
        "tread_depth_mm",
        "shape_preset",
        "ridge_height_mm",
        "space_name",
    ):
        value = create_info.get(field)
        if value is not None:
            params[field] = value

    material = _material_name(create_info.get("material"))
    if material is not None:
        params["material"] = material

    return {
        "id": "op-create-001",
        "type": "create_element",
        "parameters": params,
    }


def _build_modify_operations(raw_command: dict[str, Any]) -> list[dict[str, Any]]:
    selector = _build_selector(raw_command.get("target") or {})
    changes = raw_command.get("changes")
    if not isinstance(changes, dict):
        return []

    operations: list[dict[str, Any]] = []
    property_params = _property_params(changes)
    if property_params:
        operations.append(
            {
                "id": "op-update-001",
                "type": "update_element_properties",
                "selector": selector,
                "parameters": property_params,
            }
        )

    transform_params = _transform_params(changes)
    if transform_params:
        operations.append(
            {
                "id": "op-transform-001",
                "type": "transform_elements",
                "selector": selector,
                "parameters": transform_params,
            }
        )
    return operations


def _build_delete_operation(raw_command: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": "op-delete-001",
        "type": "delete_elements",
        "selector": _build_selector(raw_command.get("target") or {}),
        "parameters": {"reason": raw_command.get("raw_instruction") or "chat_delete"},
    }


def _build_selector(raw_target: dict[str, Any]) -> dict[str, Any]:
    selector: dict[str, Any] = {}
    global_id = raw_target.get("global_id")
    if global_id:
        selector["global_ids"] = [global_id]
    for field in ("element_type", "name", "storey", "space_name", "direction", "tag"):
        value = raw_target.get(field)
        if value not in (None, ""):
            selector[field] = value
    if raw_target.get("select_all"):
        selector["select_all"] = True
    return selector or {"element_type": "IfcProduct", "select_all": True}


def _create_dimensions(create_info: dict[str, Any]) -> dict[str, Any]:
    dimensions: dict[str, Any] = {}
    for source, target in (
        ("length_mm", "length"),
        ("width_mm", "width"),
        ("height_mm", "height"),
    ):
        value = create_info.get(source)
        if value is not None:
            dimensions[target] = value
    return dimensions


def _property_params(changes: dict[str, Any]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    dimensions: dict[str, Any] = {}
    for source, target in (
        ("length_mm", "length"),
        ("width_mm", "width"),
        ("height_mm", "height"),
    ):
        value = _dimension_value(changes.get(source))
        if value is not None:
            dimensions[target] = value
    if dimensions:
        params["dimensions_mm"] = dimensions

    material = _material_name(changes.get("material"))
    if material is not None:
        params["material"] = material
    for field in ("color", "face_offset_mm"):
        value = changes.get(field)
        if value is not None:
            params[field] = value
    return params


def _transform_params(changes: dict[str, Any]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    position = changes.get("position_mm")
    if isinstance(position, dict):
        params["translation_mm"] = {
            "x": position.get("x", 0.0),
            "y": position.get("y", 0.0),
            "z": position.get("z", 0.0),
        }
    rotation = changes.get("rotation_deg")
    if rotation is not None:
        if isinstance(rotation, dict):
            params["rotation_deg"] = {
                "x": rotation.get("x", 0.0),
                "y": rotation.get("y", 0.0),
                "z": rotation.get("z", 0.0),
            }
        else:
            params["rotation_deg"] = {"x": 0.0, "y": 0.0, "z": float(rotation)}
    return params


def _dimension_value(value: Any) -> Any:
    if isinstance(value, dict):
        return value.get("value")
    return value


def _material_name(value: Any) -> str | None:
    if isinstance(value, dict):
        name = value.get("name")
        return str(name) if name else None
    return str(value) if value else None


def _source_ifc_url(command: CommandMessage) -> str | None:
    if command.input is not None and command.input.sourceIfcStorageUrl is not None:
        return command.input.sourceIfcStorageUrl
    payload_url = getattr(command.payload, "sourceSceneStorageUrl", None)
    return str(payload_url) if payload_url else None


def _derive_output_urls(command: CommandMessage) -> tuple[str, str]:
    base_url = command.expectedOutput.threeDPlanStorageUrl
    if base_url and "/" in base_url:
        prefix = base_url.rsplit("/", 1)[0]
    else:
        prefix = f"s3://batang-artifacts/jobs/{command.jobId}/steps/{command.stepNo + 1}"
    return (
        f"{prefix}/ifc-edit-result.ifc",
        f"{prefix}/validation-report.json",
    )
