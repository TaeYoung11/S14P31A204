from __future__ import annotations

import ifcopenshell


def spatial_elements(
    spatial: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    """주어진 공간 계층 아래의 모든 IFC 요소를 중복 없이 수집한다."""
    elements: list[ifcopenshell.entity_instance] = []
    seen: set[int] = set()

    def add_element(element: ifcopenshell.entity_instance) -> None:
        element_id = int(element.id())
        if element_id not in seen:
            seen.add(element_id)
            elements.append(element)

    def visit(node: ifcopenshell.entity_instance) -> None:
        for rel in getattr(node, "ContainsElements", []) or []:
            for element in getattr(rel, "RelatedElements", []) or []:
                add_element(element)
        for rel in getattr(node, "IsDecomposedBy", []) or []:
            for child in getattr(rel, "RelatedObjects", []) or []:
                visit(child)

    visit(spatial)
    return elements
