from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_domain import LayoutImportV1, RoomType


def test_layout_import_v1_accepts_minimal_payload() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                {
                    "id": "room-living-01",
                    "name": "거실",
                    "type": "living",
                    "width": 4.2,
                    "height": 3.8,
                    "floor": 1,
                    "x": 5.0,
                    "y": 4.0,
                    "angle": 0.0,
                    "locked": False,
                }
            ],
        }
    )

    assert request.schema_version == "v1"
    assert request.id.hex == "550e8400e29b41d4a716446655440000"
    assert request.rooms[0].type is RoomType.LIVING


def test_layout_import_v1_maps_zone_id_alias() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                {
                    "id": "room-living-01",
                    "name": "거실",
                    "type": "living",
                    "width": 4.2,
                    "height": 3.8,
                    "floor": 1,
                    "x": 5.0,
                    "y": 4.0,
                    "angle": 0.0,
                    "locked": False,
                    "zoneId": "zone-common",
                }
            ],
        }
    )

    assert request.rooms[0].zone_id == "zone-common"


def test_layout_import_v1_rejects_unknown_schema_version() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v2",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    {
                        "id": "room-living-01",
                        "name": "거실",
                        "type": "living",
                        "width": 4.2,
                        "height": 3.8,
                        "floor": 1,
                        "x": 5.0,
                        "y": 4.0,
                        "angle": 0.0,
                        "locked": False,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_self_adjacency() -> None:
    with pytest.raises(ValidationError, match="서로 달라야"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    {
                        "id": "room-living-01",
                        "name": "거실",
                        "type": "living",
                        "width": 4.2,
                        "height": 3.8,
                        "floor": 1,
                        "x": 5.0,
                        "y": 4.0,
                        "angle": 0.0,
                        "locked": False,
                    }
                ],
                "adjacency": [
                    {
                        "from_room_id": "room-living-01",
                        "to_room_id": "room-living-01",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_boundary_with_repeated_points_only() -> None:
    with pytest.raises(ValidationError, match="서로 다른 점이 최소 3개"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    {
                        "id": "room-living-01",
                        "name": "거실",
                        "type": "living",
                        "width": 4.2,
                        "height": 3.8,
                        "floor": 1,
                        "x": 5.0,
                        "y": 4.0,
                        "angle": 0.0,
                        "locked": False,
                    }
                ],
                "boundaries": [
                    {
                        "floor": 1,
                        "polygon": [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]],
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_collinear_boundary_points() -> None:
    with pytest.raises(ValidationError, match="면적이 0"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    {
                        "id": "room-living-01",
                        "name": "거실",
                        "type": "living",
                        "width": 4.2,
                        "height": 3.8,
                        "floor": 1,
                        "x": 5.0,
                        "y": 4.0,
                        "angle": 0.0,
                        "locked": False,
                    }
                ],
                "boundaries": [
                    {
                        "floor": 1,
                        "polygon": [[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]],
                    }
                ],
            }
        )
