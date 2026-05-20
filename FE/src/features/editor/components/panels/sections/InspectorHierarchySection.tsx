import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import { buildHierarchyGroups } from '../hierarchyPanelData'
import { InspectorElementHierarchyTree } from './InspectorElementHierarchyTree'
import { InspectorFallbackHierarchy } from './InspectorFallbackHierarchy'
import { InspectorGroupHierarchy } from './InspectorGroupHierarchy'
import { InspectorRoomHierarchy } from './InspectorRoomHierarchy'
import { useInspectorHierarchySectionModel } from './useInspectorHierarchySectionModel'

interface InspectorHierarchySectionProps {
  panelProps: HierarchySectionProps | null
}

/**
 * 인스펙터의 계층 구조 섹션.
 * 화면 조립만 담당하고, 파생 데이터와 세부 렌더링은 hook/하위 컴포넌트로 위임한다.
 */
export function InspectorHierarchySection({ panelProps }: InspectorHierarchySectionProps) {
  const model = useInspectorHierarchySectionModel(panelProps)

  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
  }

  if (model.elementHierarchyTree.length > 0) {
    return (
      <InspectorElementHierarchyTree
        panelProps={panelProps}
        nodes={model.filteredElementHierarchyTree}
        searchQuery={model.elementSearchQuery}
        selectedElementId={model.selectedElementId}
        hiddenElementIdSet={model.hiddenElementIdSet}
        expandedNodeIds={model.expandedElementNodeIds}
        collapsedNodeIds={model.collapsedElementNodeIds}
        onSearchQueryChange={model.setElementSearchQuery}
        onToggleExpand={model.handleToggleElementNodeExpand}
      />
    )
  }

  if (model.rooms.length > 0) {
    return (
      <InspectorRoomHierarchy
        panelProps={panelProps}
        selectedRoomId={model.selectedRoomId}
        selectedFloorWallId={model.selectedFloorWallId}
        selectedFloorOpeningId={model.selectedFloorOpeningId}
        expandedRoomIds={model.expandedRoomIds}
        showSelectedRoomOnly={model.showSelectedRoomOnly}
        hierarchyRooms={model.hierarchyRooms}
        roomLabelByBubbleId={model.roomLabelByBubbleId}
        wallLabelById={model.wallLabelById}
        roomWallsByRoomKey={model.roomWallsByRoomKey}
        roomOpeningsByRoomKey={model.roomOpeningsByRoomKey}
        getRoomKey={model.getRoomKey}
        onExpandAll={model.handleExpandAll}
        onCollapseAll={model.handleCollapseAll}
        onToggleSelectedRoomOnly={() => model.setShowSelectedRoomOnly((prev) => !prev)}
        onToggleRoomExpand={model.handleToggleRoomExpand}
        onSelectRoomByAnyId={model.handleSelectRoomByAnyId}
      />
    )
  }

  const hierarchyGroups = panelProps.groups ?? buildHierarchyGroups({
    floorRooms: panelProps.floorRooms,
    floorWalls: panelProps.floorWalls,
    floorOpenings: panelProps.floorOpenings,
    floorLayers: panelProps.floorLayers,
    activeFloorLayerId: panelProps.activeFloorLayerId,
    ifcElementHierarchy: panelProps.ifcElementHierarchy,
  })

  if (hierarchyGroups.length === 0) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
  }

  const roomGroup = hierarchyGroups.find((group) => group.id === 'rooms')
  const wallGroup = hierarchyGroups.find((group) => group.id === 'walls')
  const openingGroup = hierarchyGroups.find((group) => group.id === 'openings')

  if (model.rooms.length === 0 && roomGroup) {
    return (
      <InspectorFallbackHierarchy
        panelProps={panelProps}
        roomGroup={roomGroup}
        wallGroup={wallGroup}
        openingGroup={openingGroup}
        selectedRoomId={model.selectedRoomId}
        selectedFloorWallId={model.selectedFloorWallId}
        selectedFloorOpeningId={model.selectedFloorOpeningId}
        expandedFallbackRoomIds={model.expandedFallbackRoomIds}
        onToggleFallbackRoomExpand={model.handleToggleFallbackRoomExpand}
      />
    )
  }

  return (
    <InspectorGroupHierarchy
      panelProps={panelProps}
      groups={hierarchyGroups}
      selectedRoomId={model.selectedRoomId}
      selectedFloorWallId={model.selectedFloorWallId}
      selectedFloorOpeningId={model.selectedFloorOpeningId}
      onSelectRoomByAnyId={model.handleSelectRoomByAnyId}
    />
  )
}
