"""create_element operation handler.

engine_request.v2 스키마의 create_element 파라미터를 engine_3d 함수 호출로 변환한다.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import (
    create_generic_element,
    create_roof,
    create_slab,
    create_wall,
)
from ai_authoring.operations.registry import register

logger = logging.getLogger(__name__)

# azimuth(북 기준 시계방향 °) 구간별 방향 이름
_AZIMUTH_THRESHOLDS: list[tuple[float, str]] = [
    (45.0, "north"),
    (135.0, "east"),
    (225.0, "south"),
    (315.0, "west"),
    (360.0, "north"),
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
    """linearElementGeometry(start_mm, end_mm) → (length_mm, direction)"""
    dx = end["x"] - start["x"]
    dy = end["y"] - start["y"]
    length_mm = math.hypot(dx, dy)
    azimuth = math.degrees(math.atan2(dx, dy)) % 360
    return length_mm, _azimuth_to_direction(azimuth)


@register("create_element")
class CreateElementHandler:
    """engine_request.v2 create_element → engine_3d 함수 라우터."""

    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance,
        parameters: dict[str, Any],
    ) -> ifcopenshell.entity_instance | None:
        element_type: str = parameters["element_type"]
        dims: dict[str, Any] = parameters.get("dimensions_mm") or {}
        start: dict[str, Any] = parameters.get("start_mm") or {}
        end: dict[str, Any] | None = parameters.get("end_mm")

        x_mm = float(start.get("x", 0.0))
        y_mm = float(start.get("y", 0.0))
        z_mm = float(start.get("z", 0.0))

        # length + direction 결정
        if end:
            # linearElementGeometry: start_mm + end_mm
            length_mm, direction = _start_end_to_length_and_direction(start, end)
        elif parameters.get("length_mm") is not None:
            # polarElementGeometry: start_mm + azimuth_deg + length_mm
            length_mm = float(parameters["length_mm"])
            direction = _azimuth_to_direction(float(parameters.get("azimuth_deg", 0.0)))
        else:
            length_mm = float(dims.get("length", 3000.0))
            direction = str(parameters.get("direction") or "north").lower()

        width_mm = float(dims.get("width", 200.0))
        height_mm = float(dims.get("height", 2400.0))
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
            return create_wall(model, storey, **common)
        if element_type == "IfcSlab":
            return create_slab(model, storey, **common)
        if element_type == "IfcRoof":
            return create_roof(
                model,
                storey,
                **common,
                shape_preset=str(parameters.get("roof_shape_preset") or "FLAT"),
                ridge_height_mm=float(parameters.get("ridge_height_mm") or 1200.0),
            )
        # IfcColumn, IfcBeam, IfcDoor, IfcWindow, IfcStair 등
        return create_generic_element(model, storey, element_type, **common)
