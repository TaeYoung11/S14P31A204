from __future__ import annotations

from types import SimpleNamespace

from ai_planning_2d import ifc_extractor as subject


class FakeEntity(SimpleNamespace):
    def __init__(self, ifc_class: str, **kwargs):
        super().__init__(**kwargs)
        self._ifc_class = ifc_class

    def is_a(self, ifc_class: str | None = None):
        if ifc_class is None:
            return self._ifc_class
        return self._ifc_class == ifc_class


def _wall_with_representations(*representations):
    return SimpleNamespace(
        ObjectPlacement=None,
        Representation=SimpleNamespace(Representations=list(representations)),
    )


def _matrix_with_translation(x: float, y: float):
    return (
        (1.0, 0.0, 0.0, x),
        (0.0, 1.0, 0.0, y),
        (0.0, 0.0, 1.0, 0.0),
        (0.0, 0.0, 0.0, 1.0),
    )


def test_wall_length_uses_plan_profile_before_vertical_extrusion_depth(monkeypatch) -> None:
    monkeypatch.setattr(subject.ifcopenshell.util.element, "get_psets", lambda _: {})
    body = SimpleNamespace(
        RepresentationIdentifier="Body",
        Items=[
            FakeEntity(
                "IfcExtrudedAreaSolid",
                SweptArea=FakeEntity("IfcRectangleProfileDef", XDim=11.305, YDim=0.2),
                ExtrudedDirection=FakeEntity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
                Depth=2.7,
            )
        ],
    )

    assert subject._get_wall_length_mm(_wall_with_representations(body)) == 11305.0


def test_wall_length_can_fall_back_to_box_plan_dimension(monkeypatch) -> None:
    monkeypatch.setattr(subject.ifcopenshell.util.element, "get_psets", lambda _: {})
    box = SimpleNamespace(
        RepresentationIdentifier="Box",
        Items=[
            FakeEntity("IfcBoundingBox", XDim=8.4, YDim=0.2, ZDim=2.7),
        ],
    )

    assert subject._get_wall_length_mm(_wall_with_representations(box)) == 8400.0


def test_wall_length_uses_depth_only_for_horizontal_extrusions(monkeypatch) -> None:
    monkeypatch.setattr(subject.ifcopenshell.util.element, "get_psets", lambda _: {})
    body = SimpleNamespace(
        RepresentationIdentifier="Body",
        Items=[
            FakeEntity(
                "IfcExtrudedAreaSolid",
                SweptArea=FakeEntity("IfcCircleProfileDef"),
                ExtrudedDirection=FakeEntity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
                Depth=4.2,
            )
        ],
    )

    assert subject._get_wall_length_mm(_wall_with_representations(body)) == 4200.0


def test_wall_body_segment_uses_profile_position_and_wall_placement() -> None:
    body = SimpleNamespace(
        RepresentationIdentifier="Body",
        Items=[
            FakeEntity(
                "IfcExtrudedAreaSolid",
                SweptArea=FakeEntity(
                    "IfcRectangleProfileDef",
                    XDim=5.0,
                    YDim=0.2,
                    Position=FakeEntity(
                        "IfcAxis2Placement2D",
                        Location=FakeEntity("IfcCartesianPoint", Coordinates=(2.5, 0.0)),
                    ),
                ),
                Position=FakeEntity(
                    "IfcAxis2Placement3D",
                    Location=FakeEntity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
                ),
            )
        ],
    )

    assert subject._extract_wall_body_segment_mm(
        _wall_with_representations(body),
        _matrix_with_translation(10.0, 20.0),
    ) == ((10000.0, 20000.0), (15000.0, 20000.0))


def test_space_rectangle_profile_uses_centered_profile_coordinates() -> None:
    space = SimpleNamespace(
        Representation=SimpleNamespace(
            Representations=[
                SimpleNamespace(
                    RepresentationIdentifier="Body",
                    Items=[
                        FakeEntity(
                            "IfcExtrudedAreaSolid",
                            SweptArea=FakeEntity("IfcRectangleProfileDef", XDim=3.0, YDim=2.0),
                        )
                    ],
                )
            ]
        )
    )

    assert subject._extract_space_body_polygon(space) == [
        (-1500.0, -1000.0),
        (1500.0, -1000.0),
        (1500.0, 1000.0),
        (-1500.0, 1000.0),
    ]
