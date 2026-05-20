from pathlib import Path

from ai_authoring import floor_plan_project as subject


def test_floor_project_from_ifc_path_maps_ifc_context(monkeypatch) -> None:
    def fake_extract_ifc_context(path: str) -> dict[str, object]:
        assert path.endswith("model.ifc")
        return {
            "storeys": [
                {"id": "storey-1", "floor": 1, "elevation": 0},
            ],
            "spaces": [
                {
                    "id": "space-1",
                    "name": "Room 1",
                    "type": "office",
                    "floor": 1,
                    "polygon": [(0, 0), (1000, 0), (1000, 1000), (0, 1000)],
                    "width": 1000,
                    "height": 1000,
                },
            ],
            "adjacency": [
                {"space_a_id": "space-1", "space_b_id": "space-2", "strength": 0.75},
            ],
            "walls": [
                {
                    "id": "wall-1",
                    "floor": 1,
                    "start": (0, 0),
                    "end": (1000, 0),
                    "thickness": 200,
                    "kind": "INTERIOR",
                },
            ],
            "doors": [
                {
                    "id": "door-1",
                    "floor": 1,
                    "host_wall_id": "wall-1",
                    "position": 500,
                    "width": 900,
                    "height": 2100,
                },
            ],
            "windows": [],
        }

    monkeypatch.setattr(subject, "extract_ifc_context", fake_extract_ifc_context)

    project = subject.floor_project_from_ifc_path(Path("model.ifc"), "project-1")

    assert project["id"] == "project-1"
    assert project["unit"] == "mm"
    assert project["floors"][0]["id"] == "storey-1"
    assert project["rooms"][0]["id"] == "space-1"
    assert project["rooms"][0]["areaM2"] == 1.0
    assert project["walls"][0]["id"] == "wall-1"
    assert project["walls"][0]["floor"] == "storey-1"
    assert project["openings"][0]["id"] == "door-1"
    assert project["openings"][0]["wall_position"] == 0.5
