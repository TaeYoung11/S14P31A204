from __future__ import annotations

from pathlib import Path
import sys

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

AuthoringService = None

try:
    import ifcopenshell
    import ifcopenshell.util.element as element_util
    import ifcopenshell.util.placement as placement_util
    import ifcopenshell.util.unit as unit_util
except ModuleNotFoundError:
    ifcopenshell = None
    element_util = None
    placement_util = None
    unit_util = None


if ifcopenshell is not None:
    from app.services.authoring_service import AuthoringService


pytestmark = pytest.mark.skipif(ifcopenshell is None, reason="ifcopenshell is not installed")


def _make_service(tmp_path: Path, project_id: str = "proj_test") -> AuthoringService:
    service = AuthoringService(project_id)
    service.ifc_path = tmp_path / f"{project_id}.ifc"
    return service


def _project_to_mm(ifc_file: ifcopenshell.file, value: float) -> float:
    try:
        scale = float(unit_util.calculate_unit_scale(ifc_file)) * 1000.0
    except Exception:
        scale = 1000.0
    return float(value) * scale


def _placement_z_mm(ifc_file: ifcopenshell.file, product) -> float:
    matrix = placement_util.get_local_placement(product.ObjectPlacement)
    return _project_to_mm(ifc_file, float(matrix[2][3]))


def _open_exported_ifc(path: Path) -> ifcopenshell.file:
    assert path.exists(), f"IFC file was not created: {path}"
    return ifcopenshell.open(str(path))


def test_export_project_to_ifc_creates_multistorey_storeys_and_assigns_elements(tmp_path: Path) -> None:
    service = _make_service(tmp_path, "multi_storey")
    payload = {
        "name": "Multi-storey Export",
        "rooms": [
            {"id": "room-1", "name": "Ground Room", "type": "living", "floor": 1, "x": 0.0, "y": 0.0, "width": 4.0, "height": 4.0},
            {"id": "room-2", "name": "Upper Room", "type": "bedroom", "floor": 2, "x": 0.0, "y": 0.0, "width": 4.0, "height": 4.0},
        ],
    }

    export_path = service.export_project_to_ifc(payload)
    ifc_file = _open_exported_ifc(Path(export_path))

    storeys = {storey.Name: storey for storey in ifc_file.by_type("IfcBuildingStorey")}
    assert set(storeys) == {"Level 1", "Level 2"}
    assert _project_to_mm(ifc_file, storeys["Level 1"].Elevation) == pytest.approx(0.0)
    assert _project_to_mm(ifc_file, storeys["Level 2"].Elevation) == pytest.approx(3000.0)
    assert _placement_z_mm(ifc_file, storeys["Level 1"]) == pytest.approx(0.0)
    assert _placement_z_mm(ifc_file, storeys["Level 2"]) == pytest.approx(3000.0)

    slabs = {slab.Name: slab for slab in ifc_file.by_type("IfcSlab")}
    ground_slab = slabs["Ground Room Floor"]
    upper_slab = slabs["Upper Room Floor"]

    assert element_util.get_container(ground_slab).Name == "Level 1"
    assert element_util.get_container(upper_slab).Name == "Level 2"
    assert _placement_z_mm(ifc_file, upper_slab) == pytest.approx(_placement_z_mm(ifc_file, ground_slab) + 3000.0)

    ground_walls = [wall for wall in ifc_file.by_type("IfcWall") if str(wall.Name).startswith("Ground Room ")]
    upper_walls = [wall for wall in ifc_file.by_type("IfcWall") if str(wall.Name).startswith("Upper Room ")]
    assert len(ground_walls) == 4
    assert len(upper_walls) == 4
    assert all(element_util.get_container(wall).Name == "Level 1" for wall in ground_walls)
    assert all(element_util.get_container(wall).Name == "Level 2" for wall in upper_walls)


def test_export_project_to_ifc_keeps_single_floor_at_ground_level(tmp_path: Path) -> None:
    service = _make_service(tmp_path, "single_storey")
    payload = {
        "name": "Single-storey Export",
        "rooms": [
            {"id": "room-1", "name": "Main Room", "type": "office", "floor": 1, "x": 1.5, "y": 2.0, "width": 5.0, "height": 4.0},
        ],
    }

    export_path = service.export_project_to_ifc(payload)
    ifc_file = _open_exported_ifc(Path(export_path))

    storeys = ifc_file.by_type("IfcBuildingStorey")
    assert len(storeys) == 1
    assert storeys[0].Name == "Level 1"
    assert _project_to_mm(ifc_file, storeys[0].Elevation) == pytest.approx(0.0)
    assert _placement_z_mm(ifc_file, storeys[0]) == pytest.approx(0.0)


def test_export_project_to_ifc_supports_basement_storey_elevation(tmp_path: Path) -> None:
    service = _make_service(tmp_path, "basement_storey")
    payload = {
        "name": "Basement Export",
        "rooms": [
            {"id": "room-1", "name": "Basement Room", "type": "other", "floor": 0, "x": -1.0, "y": -2.0, "width": 3.0, "height": 3.0},
        ],
    }

    export_path = service.export_project_to_ifc(payload)
    ifc_file = _open_exported_ifc(Path(export_path))

    storeys = {storey.Name: storey for storey in ifc_file.by_type("IfcBuildingStorey")}
    assert set(storeys) == {"Level 0"}
    assert _project_to_mm(ifc_file, storeys["Level 0"].Elevation) == pytest.approx(-3000.0)
    assert _placement_z_mm(ifc_file, storeys["Level 0"]) == pytest.approx(-3000.0)
