from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_domain import LayoutImportV1, LayoutImportV2, RoomType, parse_layout_import


def _base_room(*, zone_id: str | None = None) -> dict[str, object]:
    room: dict[str, object] = {
        "id": "room-living-01",
        "name": "Living Room",
        "type": "living",
        "width": 4200,
        "height": 3800,
        "floor": 1,
        "x": 5000.5,
        "y": 4000.25,
        "angle": 0.0,
        "locked": False,
    }
    if zone_id is not None:
        room["zoneId"] = zone_id
    return room


def test_layout_import_v1_accepts_minimal_payload() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
        }
    )

    assert request.schema_version == "v1"
    assert request.id.hex == "550e8400e29b41d4a716446655440000"
    assert request.rooms[0].type is RoomType.LIVING
    assert request.rooms[0].x == 5000.5
    assert request.rooms[0].y == 4000.25


def test_layout_import_v1_maps_zone_id_alias() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room(zone_id="zone-common")],
            "zones": [
                {
                    "id": "zone-common",
                    "name": "Common Zone",
                    "color": "#FF5733",
                }
            ],
        }
    )

    assert request.rooms[0].zone_id == "zone-common"


def test_layout_import_v1_accepts_space_height_mm() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
            "modeling_defaults": {
                "space_height_mm": 2700,
            },
        }
    )

    assert request.modeling_defaults is not None
    assert request.modeling_defaults.space_height_mm == 2700


def test_layout_import_v1_rejects_float_room_dimensions() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [{**_base_room(), "width": 4200.5}],
            }
        )


def test_layout_import_v1_rejects_unknown_schema_version() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v2",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
            }
        )


def test_layout_import_v1_rejects_self_adjacency() -> None:
    with pytest.raises(ValidationError, match="must be different"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "adjacency": [
                    {
                        "from_room_id": "room-living-01",
                        "to_room_id": "room-living-01",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v1_accepts_canonical_adjacency() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                _base_room(),
                {
                    **_base_room(),
                    "id": "room-bed-01",
                    "name": "Bedroom",
                    "type": "bedroom",
                },
            ],
            "adjacency": [
                {
                    "room_a_id": "room-bed-01",
                    "room_b_id": "room-living-01",
                    "strength": 0.8,
                }
            ],
        }
    )

    assert request.adjacency is not None
    assert request.adjacency[0].room_a_id == "room-bed-01"
    assert request.adjacency[0].room_b_id == "room-living-01"


def test_layout_import_v1_accepts_legacy_adjacency() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                _base_room(),
                {
                    **_base_room(),
                    "id": "room-bed-01",
                    "name": "\uce68\uc2e4",
                    "type": "bedroom",
                },
            ],
            "adjacency": [
                {
                    "from_room_id": "room-bed-01",
                    "to_room_id": "room-living-01",
                    "strength": 0.5,
                }
            ],
        }
    )

    assert request.adjacency is not None
    assert request.adjacency[0].from_room_id == "room-bed-01"


def test_layout_import_v1_rejects_partial_canonical_adjacency() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "adjacency": [
                    {
                        "room_a_id": "room-living-01",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_unknown_canonical_adjacency_room() -> None:
    with pytest.raises(
        ValidationError,
        match="room_a_id must reference an existing room",
    ):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "adjacency": [
                    {
                        "room_a_id": "missing-room",
                        "room_b_id": "room-living-01",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_mixed_adjacency_formats() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    _base_room(),
                    {
                        **_base_room(),
                        "id": "room-bed-01",
                        "name": "Bedroom",
                        "type": "bedroom",
                    },
                ],
                "adjacency": [
                    {
                        "room_a_id": "room-bed-01",
                        "room_b_id": "room-living-01",
                        "from_room_id": "room-bed-01",
                        "to_room_id": "room-living-01",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_boundary_with_repeated_points_only() -> None:
    with pytest.raises(ValidationError, match="at least 3 distinct points"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "boundaries": [
                    {
                        "floor": 1,
                        "polygon": [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]],
                    }
                ],
            }
        )


def test_layout_import_v1_accepts_legacy_polygon_boundary() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
            "boundaries": [
                {
                    "floor": 1,
                    "polygon": [
                        [0.0, 0.0],
                        [10000.0, 0.0],
                        [10000.0, 8000.0],
                        [0.0, 8000.0],
                    ],
                }
            ],
        }
    )

    assert request.boundaries is not None
    assert request.boundaries[0].polygon_mm is not None


def test_layout_import_v1_accepts_outer_polygon_mm() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
            "boundaries": [
                {
                    "floor": 1,
                    "outer_polygon_mm": [
                        [0.0, 0.0],
                        [10000.0, 0.0],
                        [10000.0, 8000.0],
                        [0.0, 8000.0],
                    ],
                }
            ],
        }
    )

    assert request.boundaries is not None
    assert request.boundaries[0].outer_polygon_mm is not None


def test_layout_import_v1_accepts_outer_polygon_with_holes() -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
            "boundaries": [
                {
                    "floor": 1,
                    "outer_polygon_mm": [
                        [0.0, 0.0],
                        [10000.0, 0.0],
                        [10000.0, 8000.0],
                        [0.0, 8000.0],
                    ],
                    "holes_mm": [
                        [
                            [2000.0, 2000.0],
                            [4000.0, 2000.0],
                            [4000.0, 4000.0],
                        ]
                    ],
                }
            ],
        }
    )

    assert request.boundaries is not None
    assert request.boundaries[0].holes_mm is not None


def test_layout_import_v1_rejects_holes_without_outer_polygon() -> None:
    with pytest.raises(ValidationError, match="holes_mm requires outer_polygon_mm"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "boundaries": [
                    {
                        "floor": 1,
                        "polygon_mm": [
                            [0.0, 0.0],
                            [10000.0, 0.0],
                            [10000.0, 8000.0],
                            [0.0, 8000.0],
                        ],
                        "holes_mm": [
                            [
                                [2000.0, 2000.0],
                                [4000.0, 2000.0],
                                [4000.0, 4000.0],
                            ]
                        ],
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_boundary_without_polygon() -> None:
    with pytest.raises(
        ValidationError,
        match="either outer_polygon_mm or polygon_mm",
    ):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "boundaries": [
                    {
                        "floor": 1,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_collinear_boundary_points() -> None:
    with pytest.raises(ValidationError, match="non-zero"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "boundaries": [
                    {
                        "floor": 1,
                        "polygon": [[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]],
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_duplicate_room_ids() -> None:
    with pytest.raises(ValidationError, match="room.id values must be unique"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    _base_room(),
                    {
                        **_base_room(),
                        "name": "Bedroom",
                        "type": "bedroom",
                    },
                ],
            }
        )


def test_layout_import_v1_rejects_duplicate_zone_ids() -> None:
    with pytest.raises(ValidationError, match="zone.id values must be unique"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "zones": [
                    {
                        "id": "zone-common",
                        "name": "Common",
                        "color": "#FF5733",
                    },
                    {
                        "id": "zone-common",
                        "name": "Private",
                        "color": "#335CFF",
                    },
                ],
            }
        )


def test_layout_import_v1_rejects_unknown_zone_reference() -> None:
    with pytest.raises(ValidationError, match="zoneId must reference an existing zone"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room(zone_id="missing-zone")],
            }
        )


def test_layout_import_v1_rejects_duplicate_boundary_floors() -> None:
    with pytest.raises(ValidationError, match="duplicate floor values"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "boundaries": [
                    {
                        "floor": 1,
                        "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
                    },
                    {
                        "floor": 1,
                        "polygon": [[2.0, 2.0], [3.0, 2.0], [3.0, 3.0]],
                    },
                ],
            }
        )


def test_layout_import_v1_rejects_unknown_adjacency_from_room() -> None:
    with pytest.raises(ValidationError, match="from_room_id must reference an existing room"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "adjacency": [
                    {
                        "from_room_id": "missing-room",
                        "to_room_id": "room-living-01",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v1_rejects_unknown_adjacency_to_room() -> None:
    with pytest.raises(ValidationError, match="to_room_id must reference an existing room"):
        LayoutImportV1.model_validate(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "adjacency": [
                    {
                        "from_room_id": "room-living-01",
                        "to_room_id": "missing-room",
                        "strength": 0.8,
                    }
                ],
            }
        )


def test_layout_import_v2_accepts_defaults_and_generation_policy() -> None:
    request = LayoutImportV2.model_validate(
        {
            "schema_version": "v2",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
        }
    )

    assert request.generation_options.generate_spaces is True
    assert request.generation_options.generate_walls is True
    assert request.generation_options.generate_slabs is True
    assert request.generation_options.generate_roof is True
    assert request.generation_options.generate_openings is False
    assert request.generation_policy.boundary_wall_mode.value == "outer_boundary"
    assert request.generation_policy.shared_wall_policy.value == "from_adjacency"
    assert request.generation_policy.roof_shape.value == "flat"


def test_layout_import_v2_accepts_extended_modeling_defaults() -> None:
    request = LayoutImportV2.model_validate(
        {
            "schema_version": "v2",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
            "modeling_defaults": {
                "space_height_mm": 2700,
                "wall_thickness_mm": 200,
                "slab_thickness_mm": 180,
                "roof_height_mm": 400,
            },
        }
    )

    assert request.modeling_defaults is not None
    assert request.modeling_defaults.wall_thickness_mm == 200
    assert request.modeling_defaults.slab_thickness_mm == 180
    assert request.modeling_defaults.roof_height_mm == 400


def test_layout_import_v2_rejects_unsupported_generation_policy() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV2.model_validate(
            {
                "schema_version": "v2",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "generation_policy": {
                    "boundary_wall_mode": "centerline"
                },
            }
        )


def test_layout_import_v2_rejects_generate_openings_true() -> None:
    with pytest.raises(ValidationError, match="opening rules are not supported"):
        LayoutImportV2.model_validate(
            {
                "schema_version": "v2",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "generation_options": {
                    "generate_spaces": True,
                    "generate_walls": True,
                    "generate_slabs": True,
                    "generate_roof": True,
                    "generate_openings": True,
                },
            }
        )


def test_layout_import_v2_rejects_generate_spaces_false() -> None:
    with pytest.raises(
        ValidationError,
        match="generate_spaces=false is not supported",
    ):
        LayoutImportV2.model_validate(
            {
                "schema_version": "v2",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "generation_options": {
                    "generate_spaces": False,
                    "generate_walls": True,
                    "generate_slabs": True,
                    "generate_roof": True,
                    "generate_openings": False,
                },
            }
        )


def test_parse_layout_import_discriminates_between_versions() -> None:
    request_v1 = parse_layout_import(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
        }
    )
    request_v2 = parse_layout_import(
        {
            "schema_version": "v2",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
        }
    )

    assert isinstance(request_v1, LayoutImportV1)
    assert isinstance(request_v2, LayoutImportV2)
