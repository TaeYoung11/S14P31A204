"""IFC semantic element reader tests."""

from pathlib import Path

import pytest

from ai_rendering.ifc2img.semantics import (
    IfcSemanticBounds,
    IfcSemanticElement,
    IfcSemanticScreenMaskStats,
    SUPPORTED_SEMANTIC_CATEGORIES,
    build_front_direction_candidates,
    diagnose_projection_vertical_inversion,
    extract_ifc_semantic_summary,
)


def test_extract_ifc_semantic_summary_collects_key_elements(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc should expose floor, roof, wall, window, and door semantics."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert set(summary.categories) == set(SUPPORTED_SEMANTIC_CATEGORIES)
    assert summary.categories["FLOOR"].count == 1
    assert summary.categories["ROOF"].count >= 1
    assert summary.categories["WALL"].count >= 1
    assert summary.categories["WINDOW"].count >= 1
    assert summary.categories["DOOR"].count >= 1
    assert len(summary.elements) == sum(
        category.count for category in summary.categories.values()
    )


def test_extract_ifc_semantic_summary_keeps_floor_below_roof(
    ifc4_fixture: Path,
) -> None:
    """IFC semantic z ranges should show that the fixture itself is not upside-down."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)
    floor = summary.categories["FLOOR"]
    roof = summary.categories["ROOF"]

    assert floor.z_min == pytest.approx(-0.362)
    assert floor.z_max == pytest.approx(0.0)
    assert roof.z_min is not None
    assert roof.z_max is not None
    assert floor.z_max < roof.z_min
    assert roof.z_max == pytest.approx(6.5)


def test_shinchan_semantic_summary_fixture_smoke_has_required_categories_and_z_order(
    ifc4_fixture: Path,
) -> None:
    """Fixture smoke: shinchan.ifc should include core categories and z order."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert set(summary.categories) == {"FLOOR", "ROOF", "WALL", "WINDOW", "DOOR"}
    assert all(summary.categories[category].count > 0 for category in summary.categories)
    assert summary.categories["FLOOR"].z_max is not None
    assert summary.categories["ROOF"].z_min is not None
    assert summary.categories["FLOOR"].z_max < summary.categories["ROOF"].z_min


def test_ifc_semantic_summary_to_dict_is_manifest_ready(
    ifc4_fixture: Path,
) -> None:
    """The summary dict should be stable enough to embed in debug manifests."""
    payload = extract_ifc_semantic_summary(ifc4_fixture).to_dict()

    assert payload["sourceIfcPath"] == str(ifc4_fixture)
    assert payload["categories"]["FLOOR"]["count"] == 1
    assert payload["categories"]["ROOF"]["count"] >= 1
    assert payload["lowestFloor"]["category"] == "FLOOR"
    assert payload["highestRoof"]["category"] == "ROOF"
    assert payload["lowestFloor"]["bounds"]["zMax"] < payload["highestRoof"]["bounds"]["zMin"]
    assert len(payload["doorCandidates"]) >= 1
    assert all(door["category"] == "DOOR" for door in payload["doorCandidates"])
    assert len(payload["frontDirectionCandidates"]) >= 1
    assert payload["mainDoorCandidate"]["doorEntityId"] in {
        candidate["doorEntityId"]
        for candidate in payload["frontDirectionCandidates"]
    }
    assert payload["mainDoorCandidate"]["nearestFootprintSide"] in {
        "min_x",
        "max_x",
        "min_y",
        "max_y",
    }
    assert len(payload["mainDoorCandidate"]["frontVector"]) == 3
    assert payload["mainDoorCandidate"]["frontVector"][2] == 0.0
    assert payload["elements"][0]["bounds"]["zMin"] is not None


def test_build_front_direction_candidates_prefers_exterior_door() -> None:
    """Door near footprint edge and exterior wall should become front candidate."""
    floor = _semantic_element(
        "FLOOR",
        1,
        "IfcSlab",
        "FLOOR",
        (0.0, 0.0, 0.0),
        (10.0, 10.0, 0.2),
    )
    front_wall = _semantic_element(
        "WALL",
        2,
        "IfcWall",
        None,
        (0.0, -0.1, 0.0),
        (10.0, 0.2, 3.0),
    )
    back_wall = _semantic_element(
        "WALL",
        3,
        "IfcWall",
        None,
        (0.0, 9.8, 0.0),
        (10.0, 10.1, 3.0),
    )
    exterior_door = _semantic_element(
        "DOOR",
        4,
        "IfcDoor",
        None,
        (4.5, 0.0, 0.0),
        (5.5, 0.25, 2.2),
        name="main door",
    )
    interior_door = _semantic_element(
        "DOOR",
        5,
        "IfcDoor",
        None,
        (1.0, 5.0, 0.0),
        (2.0, 5.2, 2.0),
        name="interior door",
    )

    candidates = build_front_direction_candidates(
        [floor, front_wall, back_wall, exterior_door, interior_door]
    )

    assert candidates[0].door_entity_id == 4
    assert candidates[0].nearest_footprint_side == "min_y"
    assert candidates[0].front_vector == (0.0, -1.0, 0.0)
    assert candidates[0].exterior_wall_near is True
    assert candidates[0].nearest_wall_entity_id == 2


def test_diagnose_projection_vertical_inversion_flags_floor_above_roof(
    ifc4_fixture: Path,
) -> None:
    """Floor below roof in IFC but above roof on screen is suspicious."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    diagnostics = diagnose_projection_vertical_inversion(
        summary,
        {
            "FLOOR": IfcSemanticScreenMaskStats(
                category="FLOOR",
                pixel_count=100,
                y_min=30,
                y_max=100,
                image_height=448,
            ),
            "ROOF": IfcSemanticScreenMaskStats(
                category="ROOF",
                pixel_count=100,
                y_min=260,
                y_max=340,
                image_height=448,
            ),
        },
    )

    assert diagnostics.vertical_inversion_suspected is True
    assert diagnostics.floor_below_roof_in_world is True
    assert diagnostics.floor_above_roof_on_screen is True
    assert diagnostics.floor_screen_region == "top"
    assert diagnostics.roof_screen_region == "bottom"
    assert diagnostics.projection_vertical_inversion_suspected is True
    assert diagnostics.to_dict()["projectionVerticalInversionSuspected"] is True
    assert diagnostics.to_dict()["verticalInversionSuspected"] is True


def test_diagnose_projection_vertical_inversion_accepts_floor_below_roof_on_screen(
    ifc4_fixture: Path,
) -> None:
    """Floor below roof in both IFC and screen space should not be suspicious."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    diagnostics = diagnose_projection_vertical_inversion(
        summary,
        {
            "FLOOR": IfcSemanticScreenMaskStats(
                category="FLOOR",
                pixel_count=100,
                y_min=300,
                y_max=360,
                image_height=448,
            ),
            "ROOF": IfcSemanticScreenMaskStats(
                category="ROOF",
                pixel_count=100,
                y_min=30,
                y_max=100,
                image_height=448,
            ),
        },
    )

    assert diagnostics.vertical_inversion_suspected is False
    assert diagnostics.floor_below_roof_in_world is True
    assert diagnostics.floor_above_roof_on_screen is False
    assert diagnostics.projection_vertical_inversion_suspected is False
    assert diagnostics.to_dict()["projectionVerticalInversionSuspected"] is False
    assert diagnostics.floor_screen_region == "bottom"
    assert diagnostics.roof_screen_region == "top"


def _semantic_element(
    category: str,
    entity_id: int,
    ifc_type: str,
    predefined_type: str | None,
    min_xyz: tuple[float, float, float],
    max_xyz: tuple[float, float, float],
    *,
    name: str | None = None,
) -> IfcSemanticElement:
    center_xyz = tuple(
        (min_value + max_value) / 2
        for min_value, max_value in zip(min_xyz, max_xyz, strict=True)
    )
    return IfcSemanticElement(
        category=category,
        entity_id=entity_id,
        ifc_type=ifc_type,
        predefined_type=predefined_type,
        name=name,
        vertex_count=8,
        face_count=12,
        bounds=IfcSemanticBounds(
            min_xyz=min_xyz,
            max_xyz=max_xyz,
            center_xyz=center_xyz,
        ),
    )
