"""create_element operation handler."""

from __future__ import annotations

import logging
import math
from typing import Any

import ifcopenshell
import ifcopenshell.api.root

from ai_authoring.engine_3d import (
    create_door_with_opening,
    create_generic_element,
    create_roof,
    create_slab,
    create_stair_preset,
    create_wall,
    create_window_with_opening,
    find_host_wall,
)
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import (
    assign_space_to_storey,
    create_local_placement,
    create_space_representation,
    ensure_body_context,
    owner_history,
    resolve_storey,
    update_space,
)

logger = logging.getLogger(__name__)

_AZIMUTH_THRESHOLDS: list[tuple[float, str]] = [
    (45.0, "north"),
    (135.0, "east"),
    (225.0, "south"),
    (315.0, "west"),
]


def _azimuth_to_direction(deg: float) -> str:
    deg = deg % 360
    for threshold, name in _AZIMUTH_THRESHOLDS:
        if deg < threshold:
            return name
    return "north"


def _start_end_to_length_and_direction(
    start: dict[str, float],
    end: dict[str, float],
) -> tuple[float, str]:
    dx = end["x"] - start["x"]
    dy = end["y"] - start["y"]
    length_mm = math.hypot(dx, dy)
    azimuth = math.degrees(math.atan2(dx, dy)) % 360
    return length_mm, _azimuth_to_direction(azimuth)


def _optional_int(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        logger.error("create_element handler: invalid integer %s=%r", field_name, value)
        return None


def _optional_float(value: Any, field_name: str) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.error("create_element handler: invalid number %s=%r", field_name, value)
        return None


@register("create_element")
class CreateElementHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
    ) -> ifcopenshell.entity_instance | None:
        element_type: str = parameters.get("element_type") or ""
        if not element_type:
            logger.error("create_element handler: missing element_type")
            return None

        storey_id = parameters.get("storey_id")
        resolved_storey = resolve_storey(model, storey, storey_id=storey_id)
        if resolved_storey is None:
            logger.error("create_element handler: failed to resolve storey")
            return None

        if element_type == "IfcSpace":
            return self._create_space(model, resolved_storey, parameters)

        dims: dict[str, Any] = parameters.get("dimensions_mm") or {}
        start: dict[str, Any] = parameters.get("start_mm") or {}
        end: dict[str, Any] | None = parameters.get("end_mm")

        x_mm = float(start.get("x", 0.0))
        y_mm = float(start.get("y", 0.0))
        z_mm = float(start.get("z", 0.0))

        if end:
            length_mm, direction = _start_end_to_length_and_direction(start, end)
        elif parameters.get("length_mm") is not None:
            length_mm = float(parameters["length_mm"])
            direction = _azimuth_to_direction(float(parameters.get("azimuth_deg", 0.0)))
        else:
            length_mm = float(dims.get("length", 3000.0))
            direction = str(parameters.get("direction") or "north").lower()

        width_default = 1000.0 if element_type == "IfcStair" else 200.0
        height_default = 1800.0 if element_type == "IfcStair" else 2400.0
        width_mm = float(dims.get("width", width_default))
        height_mm = float(dims.get("height", height_default))
        color: str | None = parameters.get("color")
        material_name: str | None = parameters.get("material")

        common = dict(
            x_mm=x_mm,
            y_mm=y_mm,
            z_mm=z_mm,
            direction=direction,
            length_mm=length_mm,
            width_mm=width_mm,
            height_mm=height_mm,
            color=color,
            material_name=material_name,
        )

        if element_type == "IfcWall":
            return create_wall(model, resolved_storey, **common)
        if element_type == "IfcSlab":
            return create_slab(model, resolved_storey, **common)
        if element_type == "IfcRoof":
            return create_roof(
                model,
                resolved_storey,
                **common,
                shape_preset=str(parameters.get("roof_shape_preset") or "FLAT"),
                ridge_height_mm=float(parameters.get("ridge_height_mm") or 1200.0),
            )
        if element_type == "IfcStair":
            step_count = _optional_int(parameters.get("step_count"), "step_count")
            riser_height_mm = _optional_float(
                parameters.get("riser_height_mm"),
                "riser_height_mm",
            )
            tread_depth_mm = _optional_float(
                parameters.get("tread_depth_mm"),
                "tread_depth_mm",
            )
            if (
                (parameters.get("step_count") is not None and step_count is None)
                or (parameters.get("riser_height_mm") is not None and riser_height_mm is None)
                or (parameters.get("tread_depth_mm") is not None and tread_depth_mm is None)
            ):
                return None
            return create_stair_preset(
                model,
                resolved_storey,
                **common,
                step_count=step_count,
                riser_height_mm=riser_height_mm,
                tread_depth_mm=tread_depth_mm,
            )
        if element_type in ("IfcDoor", "IfcWindow"):
            host_wall_global_id = parameters.get("host_wall_global_id")
            host_wall = find_host_wall(model, host_wall_global_id, x_mm, y_mm, z_mm)
            if host_wall is None:
                logger.error(
                    "create_element handler: failed to resolve host wall for %s",
                    element_type,
                )
                return None
            sill_height_mm = parameters.get("sill_height_mm")
            if element_type == "IfcDoor":
                return create_door_with_opening(
                    model,
                    resolved_storey,
                    **common,
                    host_wall=host_wall,
                    sill_height_mm=float(sill_height_mm or 0.0),
                )
            return create_window_with_opening(
                model,
                resolved_storey,
                **common,
                host_wall=host_wall,
                sill_height_mm=float(sill_height_mm if sill_height_mm is not None else 900.0),
            )
        return create_generic_element(model, resolved_storey, element_type, **common)

    def _create_space(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance,
        parameters: dict[str, Any],
    ) -> ifcopenshell.entity_instance | None:
        dims = parameters.get("dimensions_mm") or {}
        width_mm = dims.get("width")
        height_mm = dims.get("height")
        if width_mm is None or height_mm is None:
            logger.error("create_element handler: IfcSpace requires width/height dimensions_mm")
            return None

        start = parameters.get("start_mm") or {}
        x_m = float(start.get("x", 0.0)) / 1000.0
        y_m = float(start.get("y", 0.0)) / 1000.0
        z_m = float(start.get("z", 0.0)) / 1000.0
        properties = parameters.get("properties") or {}
        pset_name = str(parameters.get("pset_name") or "Batang_SpaceDimensions")

        space = ifcopenshell.api.root.create_entity(
            model,
            ifc_class="IfcSpace",
            name=str(properties.get("name") or "Space"),
        )
        space.OwnerHistory = owner_history(model)
        space.CompositionType = "ELEMENT"
        space.ObjectPlacement = create_local_placement(
            model=model,
            relative_to=getattr(storey, "ObjectPlacement", None),
            location=(x_m, y_m, z_m),
        )
        space.Representation = create_space_representation(
            model=model,
            width_m=float(width_mm) / 1000.0,
            height_m=float(height_mm) / 1000.0,
            context=ensure_body_context(model),
        )
        assign_space_to_storey(model, space=space, storey=storey)
        update_space(
            model=model,
            space=space,
            dimensions_mm={"width": width_mm, "height": height_mm},
            properties=properties,
            pset_updates=parameters.get("pset_updates") or {},
            pset_name=pset_name,
        )
        return space
