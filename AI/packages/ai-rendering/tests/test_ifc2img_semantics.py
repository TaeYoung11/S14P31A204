"""IFC semantic element reader tests."""

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from ai_rendering.ifc2img.element_masks import render_ifc_element_masks
from ai_rendering.ifc2img.service import _build_debug_view_payload, _load_debug_geometry
from ai_rendering.ifc2img.semantics import (
    IfcFrontDirectionCandidate,
    IfcSemanticBounds,
    IfcSemanticElement,
    IfcSemanticScreenMaskStats,
    SUPPORTED_SEMANTIC_CATEGORIES,
    build_front_direction_candidates,
    diagnose_projection_vertical_inversion,
    extract_ifc_semantic_summary,
    is_reliable_main_door_candidate,
)
from ai_rendering.ifc2img.views import IFCView


def _mask_y_center(mask: object) -> float:
    arr = np.asarray(mask, dtype=np.uint8)
    ys, _xs = np.nonzero(arr > 0)
    assert len(ys) > 0
    return float(ys.mean())


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


def test_shinchan_semantic_baseline_counts_and_z_ranges(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc semantic baseline count/z values are fixed for regression."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert summary.categories["FLOOR"].count == 1
    assert summary.categories["ROOF"].count == 13
    assert summary.categories["WALL"].count == 38
    assert summary.categories["WINDOW"].count == 15
    assert summary.categories["DOOR"].count == 5
    assert summary.categories["FLOOR"].z_min == pytest.approx(-0.362)
    assert summary.categories["FLOOR"].z_max == pytest.approx(0.0)
    assert summary.categories["ROOF"].z_min == pytest.approx(2.5)
    assert summary.categories["ROOF"].z_max == pytest.approx(6.5)
    assert summary.categories["FLOOR"].z_max < summary.categories["ROOF"].z_min


def test_shinchan_semantic_baseline_lowest_floor_and_highest_roof(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc establishes floor below roof as a semantic baseline fact."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert summary.lowest_floor is not None
    assert summary.highest_roof is not None
    assert summary.lowest_floor.category == "FLOOR"
    assert summary.highest_roof.category == "ROOF"
    assert summary.lowest_floor.bounds.z_min == pytest.approx(-0.362)
    assert summary.lowest_floor.bounds.z_max == pytest.approx(0.0)
    assert summary.highest_roof.bounds.z_min == pytest.approx(5.0)
    assert summary.highest_roof.bounds.z_max == pytest.approx(6.5)
    assert summary.lowest_floor.bounds.z_max < summary.highest_roof.bounds.z_min


def test_shinchan_element_masks_keep_roof_above_floor(
    ifc4_fixture: Path,
) -> None:
    """Element mask projection should preserve semantic roof/floor screen order."""
    geometry = _load_debug_geometry(ifc4_fixture)

    for view in (IFCView.FRONT_DIAGONAL_LEFT, IFCView.FRONT_DIAGONAL_RIGHT):
        payload = _build_debug_view_payload(
            geometry=geometry,
            internal_view=view,
        )
        camera = payload["camera"]
        assert isinstance(camera, dict)

        result = render_ifc_element_masks(
            ifc4_fixture,
            eye=camera["eye"],
            look_at=camera["lookAt"],
            up=camera["up"],
            width=768,
            height=448,
        )

        roof_y_center = _mask_y_center(result.masks["ROOF"])
        floor_y_center = _mask_y_center(result.masks["FLOOR"])

        assert roof_y_center < floor_y_center


def test_shinchan_semantic_baseline_main_door_front_vector(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc front candidate baseline is stable enough for camera work."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)
    candidates = summary.front_direction_candidates
    main = summary.main_door_candidate

    assert len(summary.door_candidates) == summary.categories["DOOR"].count
    assert len(candidates) == summary.categories["DOOR"].count
    assert main is not None
    assert candidates[0] == main
    assert main.door_entity_id == 703
    assert main.nearest_footprint_side == "min_y"
    assert main.exterior_wall_near is True
    assert main.nearest_wall_entity_id == 691
    assert main.nearest_wall_distance == pytest.approx(0.0)
    np.testing.assert_allclose(main.front_vector, (0.0, -1.0, 0.0))
    assert np.linalg.norm(np.asarray(main.front_vector)) == pytest.approx(1.0)
    assert main.score > 0.0


def test_front_direction_candidates_are_sorted_by_score(
    ifc4_fixture: Path,
) -> None:
    """Front candidates should remain score-descending with main door first."""
    candidates = extract_ifc_semantic_summary(ifc4_fixture).front_direction_candidates
    scores = [candidate.score for candidate in candidates]

    assert candidates
    assert scores == sorted(scores, reverse=True)


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


def test_is_reliable_main_door_candidate_accepts_shinchan_main_door(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc main door should be reliable enough for semantic camera work."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert is_reliable_main_door_candidate(summary.main_door_candidate) is True


def test_is_reliable_main_door_candidate_rejects_none() -> None:
    """Missing main door should keep static camera fallback enabled."""
    assert is_reliable_main_door_candidate(None) is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"exterior_wall_near": False},
        {"nearest_footprint_side": "unknown"},
        {"score": 0.0},
        {"front_vector": (0.0, -0.5, 0.0)},
        {"front_vector": (0.0, -1.0, 0.1)},
        {"front_vector": (0.0, float("nan"), 0.0)},
    ],
)
def test_is_reliable_main_door_candidate_rejects_unreliable_candidates(
    overrides: dict[str, object],
) -> None:
    """Unclear door candidates should fall back to static view cameras."""
    candidate = replace(_front_candidate(), **overrides)

    assert is_reliable_main_door_candidate(candidate) is False


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


def _front_candidate() -> IfcFrontDirectionCandidate:
    return IfcFrontDirectionCandidate(
        door_entity_id=4,
        door_name="main door",
        door_center=(5.0, 0.0, 1.0),
        nearest_footprint_side="min_y",
        distance_to_footprint_edge=0.0,
        exterior_wall_near=True,
        nearest_wall_entity_id=2,
        nearest_wall_distance=0.0,
        front_vector=(0.0, -1.0, 0.0),
        score=10.0,
    )
