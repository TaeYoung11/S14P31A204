from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.util.element as element_util
import ifcopenshell.util.placement as placement_util
import ifcopenshell.util.unit as unit_util

from app.core.config import settings
from app.models.bim_command import BIMCommand, BIMTarget

IFC_STORAGE_PATH = Path(settings.IFC_STORAGE_DIR)
RGBColor = Tuple[float, float, float]

MATERIAL_COLOR_MAP: Dict[str, RGBColor] = {
    "concrete": (0.62, 0.62, 0.62),
    "glass": (0.58, 0.78, 0.86),
    "wood": (0.60, 0.40, 0.22),
    "brick": (0.84, 0.38, 0.22),
    "marble": (0.91, 0.91, 0.89),
    "tile": (0.86, 0.74, 0.56),
    "steel": (0.55, 0.58, 0.62),
    "gypsum": (0.94, 0.93, 0.90),
    "aluminum": (0.73, 0.75, 0.78),
    "insulation": (0.97, 0.84, 0.35),
    "orange": (0.95, 0.45, 0.12),
    "red": (0.82, 0.16, 0.16),
    "yellow": (0.94, 0.78, 0.16),
    "green": (0.24, 0.60, 0.28),
    "blue": (0.18, 0.42, 0.82),
    "white": (0.95, 0.95, 0.95),
    "black": (0.14, 0.14, 0.14),
    "gray": (0.50, 0.50, 0.50),
    "brown": (0.45, 0.28, 0.16),
    "beige": (0.84, 0.78, 0.65),
}

COLOR_KEYWORD_MAP: List[Tuple[Tuple[str, ...], RGBColor]] = [
    (("orange", "주황", "오렌지"), MATERIAL_COLOR_MAP["orange"]),
    (("red", "빨강", "빨간"), MATERIAL_COLOR_MAP["red"]),
    (("yellow", "노랑", "노란"), MATERIAL_COLOR_MAP["yellow"]),
    (("green", "초록", "녹색"), MATERIAL_COLOR_MAP["green"]),
    (("blue", "파랑", "파란"), MATERIAL_COLOR_MAP["blue"]),
    (("white", "하양", "흰색"), MATERIAL_COLOR_MAP["white"]),
    (("black", "검정", "검은"), MATERIAL_COLOR_MAP["black"]),
    (("gray", "grey", "회색", "그레이"), MATERIAL_COLOR_MAP["gray"]),
    (("brown", "갈색"), MATERIAL_COLOR_MAP["brown"]),
    (("beige", "베이지"), MATERIAL_COLOR_MAP["beige"]),
]


class BIMService:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.ifc_path = IFC_STORAGE_PATH / f"{project_id}.ifc"
        self._ifc_file: Optional[ifcopenshell.file] = None

    def load(self) -> "BIMService":
        if not self.ifc_path.exists():
            raise FileNotFoundError(f"IFC file not found: {self.ifc_path}")
        if self._ifc_file is None:
            self._ifc_file = ifcopenshell.open(str(self.ifc_path))
        return self

    def save(self) -> None:
        if self._ifc_file is not None:
            self._ifc_file.write(str(self.ifc_path))

    def _unit_scale(self) -> float:
        try:
            return float(unit_util.calculate_unit_scale(self._ifc_file))
        except Exception:
            return 1.0

    def _project_to_mm(self, value: float) -> float:
        return float(value) * self._unit_scale() * 1000.0

    def _effective_storey_elevation_mm(self, storey: ifcopenshell.entity_instance) -> float:
        placement = getattr(storey, "ObjectPlacement", None)
        if placement is not None:
            try:
                matrix = placement_util.get_local_placement(placement)
                return self._project_to_mm(float(matrix[2][3]))
            except Exception:
                pass

        elevation = getattr(storey, "Elevation", None)
        if elevation is not None:
            return self._project_to_mm(float(elevation))
        return 0.0

    def find_storeys(self) -> List[Dict]:
        storeys = self._ifc_file.by_type("IfcBuildingStorey")
        return [
            {
                "id": storey.id(),
                "guid": storey.GlobalId,
                "name": storey.Name,
                "elevation": self._effective_storey_elevation_mm(storey),
            }
            for storey in storeys
        ]

    def find_storey_by_floor(self, floor: int) -> Optional[ifcopenshell.entity_instance]:
        for storey in self._ifc_file.by_type("IfcBuildingStorey"):
            if self._parse_floor_number(storey.Name) == floor:
                return storey
        return None

    def find_elements(self, target: BIMTarget) -> List[ifcopenshell.entity_instance]:
        ifc_type = self._element_type_to_ifc(target.element_type.value)
        all_elements = list(self._ifc_file.by_type(ifc_type))

        if target.floor is not None:
            storey = self.find_storey_by_floor(target.floor)
            if storey is None:
                return []
            storey_elements = set(element_util.get_decomposition(storey))
            elements = [element for element in all_elements if element in storey_elements]
        else:
            elements = all_elements

        if target.room and elements:
            elements = self._filter_by_room(elements, target.room)

        if target.direction and elements:
            direction = target.direction.lower()
            elements = [
                element
                for element in elements
                if direction in str(element.Name or "").lower()
            ]

        if target.element_guid:
            elements = [element for element in elements if element.GlobalId == target.element_guid]

        return elements

    def _filter_by_room(
        self,
        elements: List[ifcopenshell.entity_instance],
        room_name: str,
    ) -> List[ifcopenshell.entity_instance]:
        spaces = self._ifc_file.by_type("IfcSpace")
        target_space = next(
            (
                space
                for space in spaces
                if room_name.lower() in str(space.Name or space.LongName or "").lower()
            ),
            None,
        )
        if not target_space:
            return elements

        related_elements = []
        for relation in self._ifc_file.by_type("IfcRelSpaceBoundary"):
            if relation.RelatingSpace == target_space and relation.RelatedBuildingElement:
                related_elements.append(relation.RelatedBuildingElement)

        return [element for element in elements if element in related_elements] or elements

    def modify_material(
        self,
        element: ifcopenshell.entity_instance,
        material_name: str,
        source_text: Optional[str] = None,
    ) -> Dict:
        before = self._get_material_name(element)
        explicit_color_name = self._get_explicit_color_name(source_text)
        red, green, blue = self._resolve_surface_color(material_name, source_text)

        materials = self._ifc_file.by_type("IfcMaterial")
        ifc_material = next((material for material in materials if material.Name == material_name), None)
        if ifc_material is None:
            ifc_material = ifcopenshell.api.run(
                "material.add_material",
                self._ifc_file,
                name=material_name,
            )

        style_name = self._get_style_name(material_name, explicit_color_name)
        style = next(
            (
                surface_style
                for surface_style in self._ifc_file.by_type("IfcSurfaceStyle")
                if surface_style.Name == style_name
            ),
            None,
        )
        if style is None:
            style = ifcopenshell.api.run("style.add_style", self._ifc_file, name=style_name)

        self._apply_surface_style(style, red, green, blue)

        body_context = self._get_body_context()
        assign_material_style = explicit_color_name is None or explicit_color_name == material_name.lower()
        if body_context is not None and assign_material_style:
            try:
                ifcopenshell.api.run(
                    "style.assign_material_style",
                    self._ifc_file,
                    material=ifc_material,
                    style=style,
                    context=body_context,
                )
            except Exception:
                pass

        ifcopenshell.api.run(
            "material.assign_material",
            self._ifc_file,
            products=[element],
            type="IfcMaterial",
            material=ifc_material,
        )

        if element.Representation:
            for representation in element.Representation.Representations:
                try:
                    rep_items = list(getattr(representation, "Items", None) or [])
                    styles = [style] * max(len(rep_items), 1)
                    ifcopenshell.api.run(
                        "style.assign_representation_styles",
                        self._ifc_file,
                        shape_representation=representation,
                        styles=styles,
                    )
                except Exception:
                    pass

        return {
            "before": before,
            "after": material_name,
            "color": {"red": red, "green": green, "blue": blue},
        }

    def modify_thickness(self, element: ifcopenshell.entity_instance, thickness_mm: float) -> Dict:
        before = 0.0
        unit_scale = 1.0

        for unit in self._ifc_file.by_type("IfcSIUnit"):
            if unit.UnitType != "LENGTHUNIT":
                continue
            if unit.Prefix == "MILLI":
                unit_scale = 1000.0
            elif unit.Prefix == "CENTI":
                unit_scale = 100.0
            break

        if element.Representation:
            for representation in element.Representation.Representations:
                for item in getattr(representation, "Items", []) or []:
                    if not item.is_a("IfcExtrudedAreaSolid"):
                        continue
                    profile = item.SweptArea
                    if not profile.is_a("IfcRectangleProfileDef"):
                        continue

                    new_value = float(thickness_mm) / 1000.0 if unit_scale == 1.0 else float(thickness_mm)
                    if profile.XDim < profile.YDim:
                        before = profile.XDim * (1000.0 if unit_scale == 1.0 else 1.0)
                        profile.XDim = new_value
                    else:
                        before = profile.YDim * (1000.0 if unit_scale == 1.0 else 1.0)
                        profile.YDim = new_value

        return {"before": before, "after": thickness_mm}

    def delete_element(self, element: ifcopenshell.entity_instance) -> Dict:
        guid = element.GlobalId
        name = element.Name or element.is_a()
        element_util.remove_deep(self._ifc_file, element)
        return {"guid": guid, "name": name}

    def create_snapshot(self, command_text: str) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        snapshot_name = f"{self.project_id}_{timestamp}.ifc"
        snapshot_path = Path(settings.BACKUP_STORAGE_DIR) / snapshot_name
        shutil.copy2(self.ifc_path, snapshot_path)
        return str(snapshot_path)

    def restore_snapshot(self, snapshot_path: str) -> None:
        snapshot = Path(snapshot_path)
        if not snapshot.exists():
            raise FileNotFoundError(f"Snapshot file not found: {snapshot_path}")
        self._ifc_file = None
        shutil.copy2(snapshot, self.ifc_path)
        self.load()

    def execute_command(self, command: BIMCommand, create_backup: bool = True) -> Dict:
        self.load()

        snapshot_path = self.create_snapshot(command.original_text) if create_backup else None
        elements = self.find_elements(command.target)

        if not elements and command.action != "add":
            return {"status": "error", "message": "Target elements were not found."}

        if command.action == "add":
            return {
                "status": "error",
                "message": "Adding new elements is handled by the authoring service.",
            }

        delta_changes = []
        for element in elements:
            change_info = {
                "guid": element.GlobalId,
                "element_type": element.is_a(),
                "operation": command.action,
            }

            if command.action == "modify" and command.changes:
                props = {}

                if command.changes.material:
                    props["material"] = self.modify_material(
                        element,
                        command.changes.material.value,
                        command.original_text,
                    )
                if command.changes.thickness:
                    props["thickness"] = self.modify_thickness(element, command.changes.thickness)

                change_info["properties_changed"] = props
                change_info["geometry_changed"] = bool(command.changes.thickness or command.changes.height)

            elif command.action == "delete":
                change_info.update(self.delete_element(element))

            delta_changes.append(change_info)

        if delta_changes:
            self.save()

        return {
            "project_id": self.project_id,
            "timestamp": datetime.utcnow().isoformat(),
            "changes": delta_changes,
            "snapshot_path": snapshot_path,
        }

    def _parse_floor_number(self, name: str) -> Optional[int]:
        match = re.search(r"(-?\d+)", str(name))
        return int(match.group(1)) if match else None

    def _element_type_to_ifc(self, element_type: str) -> str:
        mapping = {
            "wall": "IfcWall",
            "slab": "IfcSlab",
            "column": "IfcColumn",
            "beam": "IfcBeam",
            "window": "IfcWindow",
            "door": "IfcDoor",
            "stair": "IfcStair",
            "roof": "IfcRoof",
            "ramp": "IfcRamp",
        }
        return mapping.get(element_type.lower(), "IfcBuildingElement")

    def _get_material_name(self, element: ifcopenshell.entity_instance) -> str:
        try:
            materials = element_util.get_material(element)
            if materials:
                if hasattr(materials, "Name"):
                    return materials.Name
                if hasattr(materials, "ForLayerSet"):
                    return materials.ForLayerSet.LayerSetName
        except Exception:
            pass
        return "Unknown"

    def _resolve_surface_color(
        self,
        material_name: str,
        source_text: Optional[str] = None,
    ) -> RGBColor:
        explicit_color_name = self._get_explicit_color_name(source_text)
        if explicit_color_name:
            return MATERIAL_COLOR_MAP[explicit_color_name]
        return MATERIAL_COLOR_MAP.get(material_name.lower(), MATERIAL_COLOR_MAP["gray"])

    def _get_explicit_color_name(self, source_text: Optional[str] = None) -> Optional[str]:
        source = (source_text or "").lower()
        for keywords, color in COLOR_KEYWORD_MAP:
            if any(keyword in source for keyword in keywords):
                for name, rgb in MATERIAL_COLOR_MAP.items():
                    if rgb == color:
                        return name
        return None

    def _get_style_name(self, material_name: str, explicit_color_name: Optional[str]) -> str:
        if explicit_color_name and explicit_color_name != material_name.lower():
            return f"{material_name}_{explicit_color_name}_style"
        return f"{material_name}_style"

    def _get_body_context(self):
        for context in self._ifc_file.by_type("IfcGeometricRepresentationSubContext"):
            if str(getattr(context, "ContextIdentifier", "")).lower() == "body":
                return context
        for context in self._ifc_file.by_type("IfcGeometricRepresentationContext"):
            if str(getattr(context, "ContextType", "")).lower() == "model":
                return context
        return None

    def _apply_surface_style(
        self,
        style: ifcopenshell.entity_instance,
        red: float,
        green: float,
        blue: float,
    ) -> None:
        attributes = {
            "SurfaceColour": {
                "Name": None,
                "Red": red,
                "Green": green,
                "Blue": blue,
            }
        }

        existing_styles = list(getattr(style, "Styles", None) or [])
        shading = next(
            (
                item
                for item in existing_styles
                if item.is_a("IfcSurfaceStyleShading") or item.is_a("IfcSurfaceStyleRendering")
            ),
            None,
        )
        if shading is not None:
            try:
                ifcopenshell.api.run(
                    "style.edit_surface_style",
                    self._ifc_file,
                    style=shading,
                    attributes=attributes,
                )
                return
            except Exception:
                pass

        ifcopenshell.api.run(
            "style.add_surface_style",
            self._ifc_file,
            style=style,
            ifc_class="IfcSurfaceStyleShading",
            attributes=attributes,
        )
