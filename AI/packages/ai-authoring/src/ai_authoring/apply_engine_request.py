from __future__ import annotations

from typing import Any

import ifcopenshell

import ai_authoring.operations  # noqa: F401
from ai_authoring.operations.registry import get
from ai_domain import EngineRequestInlineRef, IfcEditCommandPayload


def apply_engine_request(
    model: ifcopenshell.file,
    engine_request: EngineRequestInlineRef | dict[str, Any],
) -> dict[str, Any]:
    request = (
        engine_request
        if isinstance(engine_request, EngineRequestInlineRef)
        else EngineRequestInlineRef.model_validate(engine_request)
    )
    operation_results: list[dict[str, Any]] = []
    created_ids: list[str] = []
    affected_ids: list[str] = []

    for operation in request.operations:
        handler = get(operation.type)
        if operation.selector is None:
            result = handler.execute(model, None, operation.parameters)
        else:
            result = handler.execute(model, None, operation.parameters, operation.selector)

        normalized_ids: list[str]
        if result is None:
            normalized_ids = []
        elif isinstance(result, list):
            normalized_ids = [str(item) for item in result]
        else:
            normalized_ids = [str(result.GlobalId)]

        if operation.type == "create_element":
            created_ids.extend(normalized_ids)
        affected_ids.extend(normalized_ids)
        operation_results.append(
            {
                "id": operation.id,
                "type": operation.type,
                "affected_ids": normalized_ids,
            }
        )

    return {
        "status": "applied",
        "request_id": request.request_id,
        "mode": request.mode,
        "applied_count": len(affected_ids),
        "summary": f"Applied {len(request.operations)} shared operations.",
        "applied_operations": operation_results,
        "created_ids": created_ids,
        "affected_ids": list(dict.fromkeys(affected_ids)),
    }


def apply_ifc_edit_payload(
    *,
    ifc_path: str,
    output_path: str,
    payload: IfcEditCommandPayload | dict[str, Any],
) -> dict[str, Any]:
    command_payload = (
        payload
        if isinstance(payload, IfcEditCommandPayload)
        else IfcEditCommandPayload.model_validate(payload)
    )
    if command_payload.engineRequest is None:
        raise ValueError("engineRequest is required for local shared apply")

    model = ifcopenshell.open(ifc_path)
    result = apply_engine_request(model, command_payload.engineRequest)
    model.write(output_path)
    result["output_path"] = output_path
    return result
