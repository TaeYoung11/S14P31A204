# BIM 엔진 설계

## 개요

IfcOpenShell 기반의 IFC 파일 Read/Write 엔진.
자연어에서 변환된 `BIMCommand` 구조체를 실제 IFC 파일 수정으로 적용하고,
변경된 요소의 Delta JSON을 생성하여 3D 뷰어에 전달합니다.

---

## IFC 표준 개요

```
IFC (Industry Foundation Classes)
├── IfcProject
│   └── IfcSite
│       └── IfcBuilding
│           ├── IfcBuildingStorey (층)  ← floor 매핑
│           │   ├── IfcSpace (방/공간)  ← room 매핑
│           │   ├── IfcWall
│           │   ├── IfcSlab
│           │   ├── IfcColumn
│           │   └── IfcWindow / IfcDoor
│           └── ...
```

**지원 IFC 버전**: IFC2x3, IFC4, IFC4.1, IFC4.3

---

## BIM 서비스 구조

```python
# backend/app/services/bim_service.py

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element as element_util
from pathlib import Path
from app.models.bim_command import BIMCommand, BIMTarget, BIMChanges

IFC_STORAGE_PATH = Path("./storage/ifc")


class BIMService:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.ifc_path = IFC_STORAGE_PATH / f"{project_id}.ifc"
        self._ifc_file: ifcopenshell.file | None = None

    def load(self) -> "BIMService":
        """IFC 파일 로드 (캐싱)"""
        if self._ifc_file is None:
            self._ifc_file = ifcopenshell.open(str(self.ifc_path))
        return self

    def save(self):
        """수정된 IFC 파일 저장"""
        self._ifc_file.write(str(self.ifc_path))

    # ──────────────────────────────────────────────
    # 요소 검색
    # ──────────────────────────────────────────────

    def find_storeys(self) -> list[dict]:
        """모든 층 목록 반환"""
        storeys = self._ifc_file.by_type("IfcBuildingStorey")
        return [
            {"id": s.id(), "name": s.Name, "elevation": s.Elevation}
            for s in storeys
        ]

    def find_storey_by_floor(self, floor: int):
        """층 번호로 IfcBuildingStorey 찾기"""
        storeys = self._ifc_file.by_type("IfcBuildingStorey")
        # 이름에서 층 번호 파싱 (예: "3F", "3층", "Level 3")
        for storey in storeys:
            if _parse_floor_number(storey.Name) == floor:
                return storey
        return None

    def find_spaces_by_storey(self, storey) -> list:
        """층에 속한 공간(방) 목록"""
        return [
            rel.RelatedObjects
            for rel in self._ifc_file.by_type("IfcRelAggregates")
            if rel.RelatingObject == storey
        ]

    def find_elements(self, target: BIMTarget) -> list:
        """BIMTarget 기준으로 IFC 요소 검색"""
        ifc_type = _element_type_to_ifc(target.element_type)
        all_elements = self._ifc_file.by_type(ifc_type)

        if target.floor is None:
            return all_elements

        storey = self.find_storey_by_floor(target.floor)
        if storey is None:
            return []

        # 해당 층에 포함된 요소만 필터
        storey_elements = element_util.get_decomposition(storey)
        elements = [e for e in all_elements if e in storey_elements]

        # 방 이름으로 추가 필터
        if target.room:
            elements = self._filter_by_room(elements, target.room, storey)

        return elements

    # ──────────────────────────────────────────────
    # 요소 수정
    # ──────────────────────────────────────────────

    def modify_material(self, element, material_name: str) -> dict:
        """요소의 재질 변경"""
        before = self._get_material_name(element)

        # IfcMaterial 생성 또는 재사용
        materials = self._ifc_file.by_type("IfcMaterial")
        ifc_material = next(
            (m for m in materials if m.Name == material_name), None
        )
        if ifc_material is None:
            ifc_material = self._ifc_file.create_entity("IfcMaterial", Name=material_name)

        # IfcRelAssociatesMaterial로 요소에 재질 연결
        rel = self._ifc_file.create_entity(
            "IfcRelAssociatesMaterial",
            RelatingMaterial=ifc_material,
            RelatedObjects=[element]
        )

        return {"before": before, "after": material_name}

    def add_window(self, wall_element, opening: dict) -> tuple:
        """벽에 창문 추가"""
        # 1. IfcOpeningElement 생성
        opening_elem = self._create_opening(wall_element, opening)

        # 2. IfcWindow 생성
        window = self._ifc_file.create_entity(
            "IfcWindow",
            GlobalId=ifcopenshell.guid.new(),
            Name=f"Window_{ifcopenshell.guid.new()[:6]}",
            OverallHeight=opening.get("height", 1500) / 1000,  # mm → m
            OverallWidth=opening.get("width", 1200) / 1000,
        )

        # 3. IfcRelFillsElement로 개구부-창문 연결
        self._ifc_file.create_entity(
            "IfcRelFillsElement",
            RelatingOpeningElement=opening_elem,
            RelatedBuildingElement=window
        )

        return opening_elem, window

    def modify_thickness(self, wall_element, thickness_mm: float) -> dict:
        """벽 두께 변경"""
        before = self._get_wall_thickness(wall_element)

        # IfcExtrudedAreaSolid의 SweptArea 수정
        representation = wall_element.Representation
        if representation:
            for rep in representation.Representations:
                for item in rep.Items:
                    if item.is_a("IfcExtrudedAreaSolid"):
                        profile = item.SweptArea
                        if profile.is_a("IfcRectangleProfileDef"):
                            profile.XDim = thickness_mm / 1000  # mm → m

        return {"before": before, "after": thickness_mm}

    def delete_element(self, element) -> dict:
        """요소 삭제"""
        guid = element.GlobalId
        description = element.Name or element.is_a()
        ifcopenshell.util.element.remove_deep(self._ifc_file, element)
        return {"deleted_guid": guid, "description": description}

    # ──────────────────────────────────────────────
    # 명령 실행 진입점
    # ──────────────────────────────────────────────

    def execute_command(self, command: BIMCommand) -> dict:
        """BIMCommand 실행 → Delta 반환"""
        self.load()
        elements = self.find_elements(command.target)

        if not elements:
            raise ElementNotFoundException(
                f"'{command.target.room}' ({command.target.floor}층)에서 "
                f"'{command.target.element_type}' 요소를 찾을 수 없습니다."
            )

        delta_changes = []

        for elem in elements:
            change = {"guid": elem.GlobalId, "element_type": elem.is_a(), "operation": command.action}

            if command.action == "modify" and command.changes:
                if command.changes.material:
                    props = self.modify_material(elem, command.changes.material)
                    change["properties_changed"] = {"material": props}

                if command.changes.thickness:
                    props = self.modify_thickness(elem, command.changes.thickness)
                    change["properties_changed"] = {"thickness": props}

                if command.changes.openings:
                    for opening in command.changes.openings:
                        for _ in range(opening.count):
                            _, window = self.add_window(elem, opening.dict())
                            delta_changes.append({
                                "guid": window.GlobalId,
                                "element_type": "IfcWindow",
                                "operation": "add"
                            })

            elif command.action == "delete":
                info = self.delete_element(elem)
                change.update(info)

            delta_changes.append(change)

        self.save()
        return {"changes": delta_changes}
```

---

## IFC 요소 타입 매핑

```python
ELEMENT_TYPE_MAP = {
    "wall":   "IfcWall",
    "slab":   "IfcSlab",
    "column": "IfcColumn",
    "beam":   "IfcBeam",
    "window": "IfcWindow",
    "door":   "IfcDoor",
    "stair":  "IfcStair",
    "roof":   "IfcRoof",
    "ramp":   "IfcRamp",
}

MATERIAL_DISPLAY_MAP = {
    "concrete":   "콘크리트",
    "glass":      "유리",
    "wood":       "목재",
    "brick":      "벽돌",
    "marble":     "대리석",
    "tile":       "타일",
    "steel":      "강철",
    "gypsum":     "석고보드",
    "aluminum":   "알루미늄",
    "insulation": "단열재",
}
```

---

## Undo/Redo (Command 패턴)

```python
from dataclasses import dataclass
from copy import deepcopy

@dataclass
class BIMSnapshot:
    command_text: str
    ifc_backup_path: Path  # IFC 파일 백업 경로
    timestamp: str

class CommandHistory:
    def __init__(self, project_id: str, max_history: int = 20):
        self.project_id = project_id
        self.history: list[BIMSnapshot] = []
        self.current_index: int = -1
        self.max_history = max_history
        self.backup_dir = Path(f"./storage/backups/{project_id}")
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def snapshot(self, ifc_path: Path, command_text: str):
        """현재 상태 스냅샷 저장"""
        # 새 명령 실행 시 이후 이력 제거 (redo 스택 비우기)
        self.history = self.history[:self.current_index + 1]

        snapshot_path = self.backup_dir / f"snap_{len(self.history)}.ifc"
        shutil.copy2(ifc_path, snapshot_path)

        self.history.append(BIMSnapshot(
            command_text=command_text,
            ifc_backup_path=snapshot_path,
            timestamp=datetime.utcnow().isoformat()
        ))
        self.current_index += 1

        # 최대 이력 초과 시 오래된 항목 삭제
        if len(self.history) > self.max_history:
            oldest = self.history.pop(0)
            oldest.ifc_backup_path.unlink(missing_ok=True)
            self.current_index -= 1

    def undo(self, ifc_path: Path) -> Optional[str]:
        """이전 상태로 복원"""
        if self.current_index <= 0:
            return None
        self.current_index -= 1
        snap = self.history[self.current_index]
        shutil.copy2(snap.ifc_backup_path, ifc_path)
        return snap.command_text

    def redo(self, ifc_path: Path) -> Optional[str]:
        """다음 상태로 복원"""
        if self.current_index >= len(self.history) - 1:
            return None
        self.current_index += 1
        snap = self.history[self.current_index]
        shutil.copy2(snap.ifc_backup_path, ifc_path)
        return snap.command_text
```

---

## 에러 처리

```python
class BIMServiceError(Exception):
    pass

class ElementNotFoundException(BIMServiceError):
    """요소를 IFC에서 찾을 수 없음"""
    pass

class UnsupportedOperationError(BIMServiceError):
    """현재 지원하지 않는 BIM 작업"""
    pass

class IFCCorruptedError(BIMServiceError):
    """IFC 파일 손상"""
    pass
```

---

## 지원 범위 (Phase별)

| 기능 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| 재질 변경 | ✅ | ✅ | ✅ |
| 치수 변경 (두께/높이) | ❌ | ✅ | ✅ |
| 창문/문 추가 | ❌ | ✅ | ✅ |
| 요소 삭제 | ❌ | ✅ | ✅ |
| 새 벽/기둥 추가 | ❌ | ✅ | ✅ |
| 속성 조회 (면적 등) | ❌ | ❌ | ✅ |
| 충돌 감지 | ❌ | ❌ | ✅ |
