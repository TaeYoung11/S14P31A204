import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

const IFC_HIERARCHY_KEY_CANDIDATES = ['ifcElementHierarchy', 'ifcHierarchy', 'hierarchy', 'elements'] as const

function pickIfcElementHierarchy(lastIfcContext: unknown): unknown {
  if (!lastIfcContext || typeof lastIfcContext !== 'object') return null

  const contextRecord = lastIfcContext as Record<string, unknown>
  for (const key of IFC_HIERARCHY_KEY_CANDIDATES) {
    const candidate = contextRecord[key]
    if (candidate != null) return candidate
  }
  return null
}

/**
 * 계층 구조 패널 렌더링에 필요한 실제 편집 상태를 매핑한다.
 * - floorRooms / floorWalls / floorOpenings: 2D 구조 상태
 * - ifcElementHierarchy: IFC 컨텍스트에서 제공 시 전달
 */
export function buildHierarchyRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'floorRooms'
  | 'floorWalls'
  | 'floorOpenings'
  | 'elementRegistry'
  | 'elementHierarchyTree'
  | 'selectedElementId'
  | 'hiddenElementIds'
  | 'onSelectRegistryElement'
  | 'onToggleElementVisibility'
  | 'selectedRoomId'
  | 'selectedFloorWallId'
  | 'selectedFloorOpeningId'
  | 'onSelectRoom'
  | 'onSelectWall'
  | 'onSelectOpening'
  | 'ifcElementHierarchy'
> {
  return {
    floorRooms: vm.floorRooms,
    floorWalls: vm.floorWallsForHierarchy,
    floorOpenings: vm.floorOpenings,
    elementRegistry: vm.elementRegistry,
    elementHierarchyTree: vm.elementHierarchyTree,
    selectedElementId: vm.selectedElementId,
    hiddenElementIds: vm.hiddenElementIds,
    onSelectRegistryElement: vm.handleSelectRegistryElement,
    onToggleElementVisibility: vm.handleToggleElementVisibility,
    selectedRoomId: vm.selectedId,
    selectedFloorWallId: vm.selectedFloorWallId,
    selectedFloorOpeningId: vm.selectedFloorOpeningId,
    onSelectRoom: vm.handleBubbleSelect,
    onSelectWall: vm.handleSelectFloorWall,
    onSelectOpening: vm.handleSelectFloorOpening,
    ifcElementHierarchy: pickIfcElementHierarchy(vm.lastIfcContext),
  }
}
