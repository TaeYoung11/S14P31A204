import type { ComponentProps } from 'react'
import { AssistantPanel } from '../../panels/AssistantPanel'
import { AttributesPanel } from '../../panels/AttributesPanel'
import { FloorViewPanel } from '../../panels/FloorViewPanel'
import { HierarchyPanel } from '../../panels/HierarchyPanel'
import { buildHierarchyGroups } from '../../panels/hierarchyPanelData'
import type { BubbleFloorSectionProps } from '../../panels/sections/BubbleFloorSection'
import { ZoningSection } from '../../panels/sections/ZoningSection'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import type { FloorLayer, PanelKey } from '../../../types'

export type AttributesSectionProps = ComponentProps<typeof AttributesPanel>
export type ZoningSectionProps = ComponentProps<typeof ZoningSection>
export type FloorViewSectionProps = ComponentProps<typeof FloorViewPanel>
export type HierarchySectionProps = ComponentProps<typeof HierarchyPanel>
export type AssistantSectionProps = ComponentProps<typeof AssistantPanel>

function isFloorWorkspaceMode(mode: EditorRightPanelsProps['mode']): boolean {
  return mode === '2d' || mode === '3d'
}

function coalesceArray<T>(items: T[] | null | undefined): T[] {
  return items ?? []
}

/**
 * 모든 우측 패널에서 공통으로 사용하는 프레임 props를 구성한다.
 * - 열림 상태
 * - 위치/크기/zIndex
 * - 드래그/리사이즈/토글 핸들러
 */
function buildCommonPanelFrameProps(vm: EditorRightPanelsProps, panelKey: PanelKey) {
  return {
    isOpen: vm.panelOpenState[panelKey],
    offset: vm.panelOffsets[panelKey],
    width: vm.panelWidths[panelKey],
    height: vm.panelHeights[panelKey],
    zIndex: vm.panelZIndexes[panelKey],
    onDragStart: vm.onPanelDragStart,
    onResizeStart: vm.onPanelResizeStart,
    onToggle: vm.onTogglePanel,
  }
}

/**
 * 속성 패널 props 매핑
 */
export function buildAttributesSectionProps(vm: EditorRightPanelsProps): AttributesSectionProps {
  return {
    mode: vm.mode,
    ...buildCommonPanelFrameProps(vm, 'attributes'),
    selectedBubble: vm.selectedBubble,
    isThreeDEditingLocked: vm.isThreeDEditingLocked,
    selectedWall: vm.selectedWall,
    selectedOpening: vm.selectedOpening,
    selectedIfcElement: vm.selectedIfcElement,
    connections: vm.selectedBubbleConnections,
    zones: vm.selectedBubbleZones,
    onLabelChange: vm.onLabelChange,
    onTypeChange: vm.onTypeChange,
    onWidthChange: vm.onWidthChange,
    onHeightChange: vm.onHeightChange,
    onThicknessChange: vm.onThicknessChange,
    onPositionChange: vm.onPositionChange,
    onRotationChange: vm.onRotationChange,
    onRoofShapeChange: vm.onRoofShapeChange,
    onWidthCommit: vm.onWidthCommit,
    onHeightCommit: vm.onHeightCommit,
    onRatioChange: vm.onRatioChange,
    onColorChange: vm.onColorChange,
    onBubbleFloorChange: vm.onBubbleFloorChange,
    bubbleFloors: vm.bubbleFloors,
    onMaterialChange: vm.onMaterialChange,
    onWallTypeChange: vm.onWallTypeChange,
    onWallThicknessChange: vm.onWallThicknessChange,
    onWallHeightChange: vm.onWallHeightChange,
    onWallMaterialChange: vm.onWallMaterialChange,
    onOpeningSizeChange: vm.onOpeningSizeChange,
    onWindowSillHeightChange: vm.onWindowSillHeightChange,
    onDoorSwingDirectionChange: vm.onDoorSwingDirectionChange,
    onDoorHingeSideChange: vm.onDoorHingeSideChange,
  }
}

/**
 * 버블 모드 조닝 패널 props 매핑
 */
export function buildZoningSectionProps(vm: EditorRightPanelsProps): ZoningSectionProps | null {
  if (vm.mode !== 'bubble') return null
  return {
    zoningListItems: vm.zoningListItems,
    onOpenZoningModal: vm.onOpenZoningModal,
    onOpenEditZoningModal: vm.onOpenEditZoningModal,
    onDeleteZoning: vm.onDeleteZoning,
  }
}

/**
 * 3D 모드 FloorView 패널 props 매핑
 *
 * IFC 기반 3D라면 IfcBuildingStorey에서 파싱한 층 목록을, 그렇지 않으면 2D 편집 레이어를 사용한다.
 */
export function buildFloorViewSectionProps(vm: EditorRightPanelsProps): FloorViewSectionProps | null {
  if (!isFloorWorkspaceMode(vm.mode)) return null

  // IFC 층이 파싱된 경우: FloorLayer 형식으로 변환해 FloorViewPanel에 전달한다.
  const hasIfcStoreys = vm.mode === '3d' && (vm.ifcStoreys?.length ?? 0) > 0
  const ifcStoreyLayers: FloorLayer[] | undefined = hasIfcStoreys
    ? vm.ifcStoreys!.map((s) => ({ id: String(s.expressId), name: s.name, rooms: [] }))
    : undefined

  const layers = ifcStoreyLayers ?? vm.floorLayers
  const activeLayerId = hasIfcStoreys ? (vm.activeIfcStoreyId ?? null) : (vm.activeFloorLayerId ?? null)
  const onSelectLayer = hasIfcStoreys ? vm.onSelectIfcStorey : vm.onSelectFloorLayer
  // IFC 층은 isGenerated 여부와 무관하게 항상 표시한다.
  const isGenerated = hasIfcStoreys ? true : vm.isFloorPlanGenerated

  // IFC 겹쳐보기: expressId를 문자열로 변환해 FloorViewPanel의 selectedOverlayLayerIds와 호환시킨다.
  const selectedOverlayLayerIds = hasIfcStoreys
    ? (vm.overlayIfcStoreyExpressIds?.map(String) ?? [])
    : (vm.selectedOverlayLayerIds ?? [])
  const onToggleOverlayLayer = hasIfcStoreys ? vm.onToggleIfcStoreyOverlay : vm.onToggleOverlayLayer
  // IFC 모드에서는 겹쳐보기 활성 여부를 overlay IDs 유무로 판단한다.
  const isLayerOverlayMode = hasIfcStoreys
    ? (vm.overlayIfcStoreyExpressIds?.length ?? 0) > 0
    : vm.isLayerOverlayMode
  const libraryCountByLayerId = hasIfcStoreys
    ? (vm.libraryElements ?? []).reduce((acc, element) => {
        if (!Number.isFinite(element.storeyExpressId)) return acc
        const key = String(element.storeyExpressId)
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {} as Record<string, number>)
    : undefined

  return {
    ...buildCommonPanelFrameProps(vm, 'floorView'),
    layers,
    activeLayerId,
    isGenerated,
    isViewOnly: hasIfcStoreys ? true : undefined,
    isLayerOverlayMode,
    selectedOverlayLayerIds,
    overlayOpacityByLayerId: vm.overlayOpacityByLayerId,
    libraryCountByLayerId,
    onSelectLayer,
    onAddLayer: vm.onAddFloorLayer,
    onRenameLayer: vm.onRenameFloorLayer,
    onDeleteLayer: vm.onDeleteFloorLayer,
    onToggleLayerOverlayMode: vm.onToggleLayerOverlayMode,
    onToggleOverlayLayer,
    onSelectSingleOverlayLayer: hasIfcStoreys ? undefined : vm.onSelectSingleOverlayLayer,
    onChangeOverlayLayerOpacity: vm.onChangeOverlayLayerOpacity,
  }
}

/**
 * 3D 모드 Hierarchy 패널 props 매핑
 */
export function buildHierarchySectionProps(vm: EditorRightPanelsProps): HierarchySectionProps | null {
  if (!isFloorWorkspaceMode(vm.mode)) return null
  const deletedIfcIdSet = new Set<number>()
  ;(vm.ifcElementChanges ?? []).forEach((change) => {
    if (!change.deleted) return
    if (Number.isFinite(change.localId)) deletedIfcIdSet.add(change.localId as number)
    ;(change.localIds ?? []).forEach((id) => {
      if (Number.isFinite(id)) deletedIfcIdSet.add(id)
    })
    if (
      !Number.isFinite(change.localId) &&
      (!change.localIds || change.localIds.length === 0) &&
      Number.isFinite(change.expressId)
    ) {
      // legacy fallback: localId 정보가 없는 오래된 change만 expressId를 사용한다.
      deletedIfcIdSet.add(change.expressId)
    }
  })
  const filteredIfcStoreys = (vm.ifcStoreys ?? []).map((storey) => {
    const nextLocalIds = new Set(
      Array.from(storey.elementLocalIds).filter((localId) => !deletedIfcIdSet.has(localId)),
    )
    const nextElements = (storey.elements ?? []).filter((element) => !deletedIfcIdSet.has(element.localId))
    return {
      ...storey,
      elementLocalIds: nextLocalIds,
      elements: nextElements,
    }
  })
  const libraryElementsByStoreyId = (vm.libraryElements ?? []).reduce((acc, element) => {
    if (!Number.isFinite(element.storeyExpressId)) return acc
    const key = String(element.storeyExpressId)
    if (!acc[key]) acc[key] = []
    acc[key].push(element)
    return acc
  }, {} as Record<string, NonNullable<EditorRightPanelsProps['libraryElements']>>)

  const hierarchySource = {
    floorRooms: coalesceArray(vm.floorRooms),
    floorWalls: coalesceArray(vm.floorWalls),
    floorOpenings: coalesceArray(vm.floorOpenings),
    floorLayers: coalesceArray(vm.floorLayers),
    activeFloorLayerId: vm.activeFloorLayerId ?? null,
    ifcElementHierarchy: vm.ifcElementHierarchy ?? null,
  }

  return {
    ...buildCommonPanelFrameProps(vm, 'hierarchy'),
    ifcStoreys: filteredIfcStoreys,
    activeIfcStoreyId: vm.activeIfcStoreyId,
    overlayIfcStoreyExpressIds: vm.overlayIfcStoreyExpressIds,
    overlayOpacityByLayerId: vm.overlayOpacityByLayerId,
    libraryElementsByStoreyId,
    onSelectIfcStorey: vm.onSelectIfcStorey,
    onSelectIfcElementByLocalId: vm.onSelectIfcElementByLocalId,
    onSelectLibraryElementById: vm.onSelectLibraryElementById,
    onToggleIfcStoreyOverlay: vm.onToggleIfcStoreyOverlay,
    onChangeOverlayLayerOpacity: vm.onChangeOverlayLayerOpacity,
    ...hierarchySource,
    groups: buildHierarchyGroups(hierarchySource),
  }
}

/**
 * 어시스턴트 패널 props 매핑
 */
export function buildAssistantSectionProps(vm: EditorRightPanelsProps): AssistantSectionProps | null {
  if (vm.mode === 'view') return null
  return {
    ...buildCommonPanelFrameProps(vm, 'assistant'),
    provider: vm.llmProvider,
    prompt: vm.llmPrompt,
    status: vm.llmStatus,
    isLoading: vm.llmIsLoading,
    message: vm.llmMessage,
    suggestions: vm.llmSuggestions,
    preview: vm.llmPreview,
    selectedWallForChat: vm.selectedWallForChat,
    canRun: vm.llmCanRun,
    activeJobId: vm.llmActiveJobId,
    jobProgress: vm.llmJobProgress,
    clarificationArtifact: vm.llmClarificationArtifact,
    chatLogs: vm.llmChatLogs,
    isChatLogsLoading: vm.llmIsChatLogsLoading,
    onPromptChange: vm.onLlmPromptChange,
    onRun: vm.onRunLlmEdit,
    onApply: vm.onApplyLlmEdit,
    onDiscard: vm.onDiscardLlmEdit,
    onSelectAlternative: vm.onSelectLlmAlternative,
    onClearSelectedWall: vm.onClearSelectedWall,
    floorProjectImportMessage: vm.floorProjectImportMessage,
  }
}

/**
 * InspectorPanel의 버블 층 섹션 props를 매핑한다.
 * 버블 모드 외 상황에서도 null-safe 기본값을 반환해 렌더 분기 단순화를 보장한다.
 */
export function buildBubbleFloorSectionProps(vm: EditorRightPanelsProps): BubbleFloorSectionProps {
  return {
    floors: coalesceArray(vm.bubbleFloors),
    summaries: coalesceArray(vm.bubbleFloorSummaries),
    activeFloor: vm.activeBubbleFloor ?? 1,
    isReadOnly: vm.isBubbleReadOnly ?? false,
    onSelectFloor: vm.onSelectBubbleFloor,
    onAddFloor: vm.onAddBubbleFloor,
    onRenameFloor: vm.onRenameBubbleFloor,
    onDeleteFloor: vm.onDeleteBubbleFloor,
  }
}
