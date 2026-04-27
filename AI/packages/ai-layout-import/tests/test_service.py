from __future__ import annotations

import pytest

from ai_domain import LayoutImportV1
from ai_layout_import import convert_layout_to_ifc


def test_convert_layout_to_ifc_is_exposed_but_not_implemented_yet() -> None:
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

    with pytest.raises(NotImplementedError, match="티켓 1"):
        convert_layout_to_ifc(request, "model.ifc")
