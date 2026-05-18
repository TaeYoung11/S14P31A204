from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_domain import LayoutImportV1, LayoutImportV2, LayoutImportV3, RoomType, parse_layout_import


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
                    "name": "침실",
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


def test_layout_import_v1_rejects_mixed_boundary_formats() -> None:
    with pytest.raises(
        ValidationError,
        match="outer_polygon_mm and polygon_mm cannot be provided together",
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
                        "polygon": [
                            [0.0, 0.0],
                            [10000.0, 0.0],
                            [10000.0, 8000.0],
                            [0.0, 8000.0],
                        ],
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


def test_layout_import_v2_accepts_semantic_metadata_for_inferred_openings() -> None:
    request = LayoutImportV2.model_validate(
        {
            "schema_version": "v2",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                {
                    **_base_room(),
                    "id": "room-1",
                    "type": "entrance",
                    "source_bubble_id": "bubble-entry",
                    "original_label": "현관",
                    "original_type": "현관",
                    "material": "tile",
                    "color": "#AABBCC",
                    "wall_type": "load_bearing",
                },
                {
                    **_base_room(),
                    "id": "room-2",
                    "name": "Living",
                    "x": 4200.0,
                },
            ],
            "adjacency": [
                {
                    "id": "conn-1",
                    "from_room_id": "room-1",
                    "to_room_id": "room-2",
                    "strength": 1.0,
                    "intent": "open_passage",
                    "connection_strength": "strong",
                    "source_bubble_id": "room-1",
                    "target_bubble_id": "room-2",
                }
            ],
            "generation_options": {
                "generate_spaces": True,
                "generate_walls": True,
                "generate_slabs": True,
                "generate_roof": True,
                "generate_openings": True,
            },
        }
    )

    room = request.rooms[0]
    assert room.type is RoomType.ENTRANCE
    assert room.source_bubble_id == "bubble-entry"
    assert room.original_label == "현관"
    assert room.wall_type is not None
    assert room.wall_type.value == "load_bearing"
    assert request.generation_options.generate_openings is True
    assert request.adjacency is not None
    assert request.adjacency[0].intent is not None
    assert request.adjacency[0].intent.value == "open_passage"
    assert request.adjacency[0].connection_strength is not None
    assert request.adjacency[0].connection_strength.value == "strong"
    assert request.adjacency[0].source_bubble_id == "room-1"
    assert request.adjacency[0].target_bubble_id == "room-2"


@pytest.mark.parametrize(
    ("bubble_metadata", "message"),
    [
        (
            {"source_bubble_id": "bubble-1"},
            "source_bubble_id and target_bubble_id must both be provided together",
        ),
        (
            {"target_bubble_id": "bubble-2"},
            "source_bubble_id and target_bubble_id must both be provided together",
        ),
        (
            {"source_bubble_id": "bubble-1", "target_bubble_id": "bubble-1"},
            "source_bubble_id and target_bubble_id must be different",
        ),
    ],
)
def test_layout_import_v2_rejects_invalid_adjacency_bubble_id_pair(
    bubble_metadata: dict[str, str],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        LayoutImportV2.model_validate(
            {
                "schema_version": "v2",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [
                    {**_base_room(), "id": "room-1"},
                    {**_base_room(), "id": "room-2", "x": 4200.0},
                ],
                "adjacency": [
                    {
                        "from_room_id": "room-1",
                        "to_room_id": "room-2",
                        "strength": 1.0,
                        **bubble_metadata,
                    }
                ],
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


def test_layout_import_v3_accepts_explicit_openings() -> None:
    request = LayoutImportV3.model_validate(
        {
            "schema_version": "v3",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                _base_room(),
                {
                    **_base_room(),
                    "id": "room-bed-01",
                    "name": "Bedroom",
                    "type": "bedroom",
                    "x": 9200.0,
                    "y": 4000.0,
                },
            ],
            "generation_options": {
                "generate_spaces": True,
                "generate_walls": True,
                "generate_slabs": True,
                "generate_roof": True,
                "generate_openings": True,
            },
            "generation_policy": {
                "boundary_wall_mode": "outer_boundary",
                "shared_wall_policy": "from_adjacency",
                "roof_shape": "flat",
                "opening_policy": "explicit_only",
            },
            "openings": [
                {
                    "id": "opening-door-01",
                    "type": "door",
                    "floor": 1,
                    "host_wall_ref": "wall-room-room-living-01-room-bed-01",
                    "x": 7100.0,
                    "y": 4000.0,
                    "width": 900.0,
                    "height": 2100.0,
                }
            ],
        }
    )

    assert request.openings is not None
    assert request.openings[0].type.value == "door"
    assert request.generation_policy.opening_policy.value == "explicit_only"


def test_layout_import_v3_rejects_explicit_openings_without_generate_openings() -> None:
    with pytest.raises(ValidationError, match="explicit openings require generate_openings=true"):
        LayoutImportV3.model_validate(
            {
                "schema_version": "v3",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [_base_room()],
                "openings": [
                    {
                        "id": "opening-door-01",
                        "type": "door",
                        "floor": 1,
                        "host_wall_ref": "wall-boundary-1-seg-1",
                        "x": 5000.0,
                        "y": 0.0,
                        "width": 900.0,
                        "height": 2100.0,
                    }
                ],
            }
        )


def test_layout_import_v3_rejects_invalid_host_wall_ref_pattern() -> None:
    with pytest.raises(ValidationError, match="opening.host_wall_ref"):
        LayoutImportV3.model_validate(
            {
                "schema_version": "v3",
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
                "openings": [
                    {
                        "id": "opening-door-01",
                        "type": "door",
                        "floor": 1,
                        "host_wall_ref": "room-wall-1",
                        "x": 5000.0,
                        "y": 0.0,
                        "width": 900.0,
                        "height": 2100.0,
                    }
                ],
            }
        )


def test_layout_import_v3_rejects_malformed_shared_host_wall_ref() -> None:
    with pytest.raises(ValidationError, match="opening.host_wall_ref"):
        LayoutImportV3.model_validate(
            {
                "schema_version": "v3",
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
                "openings": [
                    {
                        "id": "opening-door-01",
                        "type": "door",
                        "floor": 1,
                        "host_wall_ref": "wall-room-room-living-01",
                        "x": 5000.0,
                        "y": 0.0,
                        "width": 900.0,
                        "height": 2100.0,
                    }
                ],
            }
        )


def test_layout_import_v3_rejects_non_positive_opening_dimensions() -> None:
    with pytest.raises(ValidationError):
        LayoutImportV3.model_validate(
            {
                "schema_version": "v3",
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
                "openings": [
                    {
                        "id": "opening-door-01",
                        "type": "door",
                        "floor": 1,
                        "host_wall_ref": "wall-boundary-1-seg-1",
                        "x": 5000.0,
                        "y": 0.0,
                        "width": 0.0,
                        "height": -1.0,
                    }
                ],
            }
        )


def test_layout_import_v3_rejects_duplicate_opening_ids() -> None:
    with pytest.raises(ValidationError, match="opening.id values must be unique"):
        LayoutImportV3.model_validate(
            {
                "schema_version": "v3",
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
                "openings": [
                    {
                        "id": "opening-door-01",
                        "type": "door",
                        "floor": 1,
                        "host_wall_ref": "wall-boundary-1-seg-1",
                        "x": 5000.0,
                        "y": 0.0,
                        "width": 900.0,
                        "height": 2100.0,
                    },
                    {
                        "id": "opening-door-01",
                        "type": "window",
                        "floor": 1,
                        "host_wall_ref": "wall-boundary-1-seg-2",
                        "x": 10000.0,
                        "y": 3000.0,
                        "width": 1200.0,
                        "height": 1200.0,
                    },
                ],
            }
        )


def test_layout_import_v3_accepts_generate_openings_true_with_empty_openings() -> None:
    request = LayoutImportV3.model_validate(
        {
            "schema_version": "v3",
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
            "openings": [],
        }
    )

    assert request.openings == []


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
    request_v3 = parse_layout_import(
        {
            "schema_version": "v3",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [_base_room()],
        }
    )

    assert isinstance(request_v1, LayoutImportV1)
    assert isinstance(request_v2, LayoutImportV2)
    assert isinstance(request_v3, LayoutImportV3)
