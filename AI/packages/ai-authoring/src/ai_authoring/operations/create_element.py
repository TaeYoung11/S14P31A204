"""create_element operation handler."""

from __future__ import annotations

import logging
import math
import re
from typing import Any

import ifcopenshell
import ifcopenshell.api.root

from ai_authoring.engine_3d import (
    create_door_with_opening,
    create_door_with_template_reuse,
    create_generic_element,
    create_roof,
    create_slab,
    create_stair_preset,
    create_wall,
    create_wall_with_template_reuse,
    create_window_with_opening,
    create_window_with_template_reuse,
    find_host_wall,
)
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import (
    assign_space_to_storey,
    create_local_placement,
    create_space_representation,
    ensure_body_context,
    mm_to_model_units,
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

_IFC_GLOBAL_ID_RE = re.compile(r"^[0-9A-Za-z_$]{22}$")


def _azimuth_to_direction(deg: float) -> str:
    deg = deg % 360
    for threshold, name in _AZIMUTH_THRESHOLDS:
        if deg < threshold:
            return name
    return "north"


def _azimuth_to_ref_direction(deg: float) -> tuple[float, float, float]:
    radians = math.radians(deg)
    return (math.sin(radians), math.cos(radians), 0.0)


def _start_end_to_length_and_direction(
    start: dict[str, float],
    end: dict[str, float],
) -> tuple[float, str, tuple[float, float, float]]:
    dx = end["x"] - start["x"]
    dy = end["y"] - start["y"]
    length_mm = math.hypot(dx, dy)
    if length_mm <= 0.0:
        raise ValueError("wall segment length must be positive")
    azimuth = math.degrees(math.atan2(dx, dy)) % 360
    return length_mm, _azimuth_to_direction(azimuth), (dx / length_mm, dy / length_mm, 0.0)


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


def _point_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, list | tuple):
        point: dict[str, Any] = {}
        if len(value) > 0:
            point["x"] = value[0]
        if len(value) > 1:
            point["y"] = value[1]
        if len(value) > 2:
            point["z"] = value[2]
        return point
    return {}


def _opening_dimensions_mm(
    element_type: str,
    dimensions_mm: dict[str, Any],
) -> tuple[float, float, float]:
    """Resolve door/window opening span, wall-thickness direction width, and height.

    Preferred contract: length is the opening span and width is the wall-thickness
    direction. Width-only payloads are accepted for legacy 2D opening commands.
    """
    default_length = 1200.0 if element_type == "IfcWindow" else 900.0
    default_height = 1200.0 if element_type == "IfcWindow" else 2100.0
    length_value = dimensions_mm.get("length")
    if length_value is None:
        length_value = dimensions_mm.get("width")
    thickness_value = (
        dimensions_mm.get("width")
        if dimensions_mm.get("length") is not None
        else None
    )
    return (
        float(length_value or default_length),
        float(thickness_value or 200.0),
        float(dimensions_mm.get("height", default_height)),
    )


def _ifc_global_id_or_none(value: Any) -> str | None:
    # 2D edit payloads may carry a local wall id in this field. Treat only a
    # valid IFC GlobalId as an explicit host; other values use proximity lookup.
    if not isinstance(value, str):
        return None
    return value if _IFC_GLOBAL_ID_RE.fullmatch(value) else None


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
        start: dict[str, Any] = _point_dict(
            parameters.get("start_mm") or parameters.get("center_mm") or {}
        )
        end: dict[str, Any] | None = parameters.get("end_mm")

        x_mm = float(start.get("x", 0.0))
        y_mm = float(start.get("y", 0.0))
        z_mm = float(start.get("z", 0.0))

        ref_direction: tuple[float, float, float] | None = None
        if end:
            length_mm, direction, ref_direction = _start_end_to_length_and_direction(start, end)
        elif parameters.get("length_mm") is not None:
            length_mm = float(parameters["length_mm"])
            azimuth_deg = float(parameters.get("azimuth_deg", 0.0))
            direction = _azimuth_to_direction(azimuth_deg)
            ref_direction = _azimuth_to_ref_direction(azimuth_deg)
        else:
            length_mm = float(dims.get("length", 3000.0))
            direction = str(parameters.get("direction") or "north").lower()

        if element_type in ("IfcDoor", "IfcWindow"):
            length_mm, width_mm, height_mm = _opening_dimensions_mm(element_type, dims)
        else:
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
            template_wall_global_id = parameters.get("template_wall_global_id")
            if template_wall_global_id:
                template_wall = model.by_guid(template_wall_global_id)
                if template_wall is None:
                    logger.error(
                        "create_element handler: failed to resolve template wall %s",
                        template_wall_global_id,
                    )
                    return None
                if end is None:
                    logger.error("create_element handler: template wall create requires end_mm")
                    return None
                return create_wall_with_template_reuse(
                    model,
                    resolved_storey,
                    template_wall=template_wall,
                    name=str(parameters.get("name") or "거실 가벽"),
                    start_mm=start,
                    end_mm=end,
                    width_mm=width_mm,
                    height_mm=height_mm,
                    endpoint_connections=parameters.get("endpoint_connections") or [],
                )
            return create_wall(model, resolved_storey, **common, ref_direction=ref_direction)
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
            host_wall_global_id = _ifc_global_id_or_none(parameters.get("host_wall_global_id"))
            host_wall = find_host_wall(model, host_wall_global_id, x_mm, y_mm, z_mm)
            if host_wall is None:
                logger.error(
                    "create_element handler: failed to resolve host wall for %s",
                    element_type,
            )
                return None
            sill_height_mm = parameters.get("sill_height_mm")
            window_style = parameters.get("window_style")
            require_template_reuse = bool(parameters.get("require_template_reuse"))
            if element_type == "IfcDoor":
                creator = (
                    create_door_with_template_reuse
                    if require_template_reuse
                    else create_door_with_opening
                )
                return creator(
                    model,
                    resolved_storey,
                    **common,
                    host_wall=host_wall,
                    sill_height_mm=float(sill_height_mm or 0.0),
                )
            creator = (
                create_window_with_template_reuse
                if require_template_reuse
                else create_window_with_opening
            )
            return creator(
                model,
                resolved_storey,
                **common,
                host_wall=host_wall,
                sill_height_mm=float(sill_height_mm if sill_height_mm is not None else 900.0),
                window_style=window_style,
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
        x = mm_to_model_units(model, start.get("x"), 0.0)
        y = mm_to_model_units(model, start.get("y"), 0.0)
        z = mm_to_model_units(model, start.get("z"), 0.0)
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
            location=(x, y, z),
        )
        space.Representation = create_space_representation(
            model=model,
            width=mm_to_model_units(model, width_mm, 0.0),
            height=mm_to_model_units(model, height_mm, 0.0),
            depth=mm_to_model_units(model, None, 2700.0),
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
