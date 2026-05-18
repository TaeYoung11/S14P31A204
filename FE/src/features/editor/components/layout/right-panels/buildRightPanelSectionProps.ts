import type { ComponentProps } from 'react'
import { AssistantPanel } from '../../panels/AssistantPanel'
import { AttributesPanel } from '../../panels/AttributesPanel'
import { FloorViewPanel } from '../../panels/FloorViewPanel'
import { HierarchyPanel } from '../../panels/HierarchyPanel'
import { buildHierarchyGroups } from '../../panels/hierarchyPanelData'
import type { BubbleFloorSectionProps } from '../../panels/sections/BubbleFloorSection'
import { ZoningSection } from '../../panels/sections/ZoningSection'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import type { PanelKey } from '../../../types'

export type AttributesSectionProps = ComponentProps<typeof AttributesPanel>
export type ZoningSectionProps = ComponentProps<typeof ZoningSection>
export type FloorViewSectionProps = ComponentProps<typeof FloorViewPanel>
export type HierarchySectionProps = ComponentProps<typeof HierarchyPanel> & {
  selectedRoomId?: string | null
  selectedFloorWallId?: string | null
  selectedFloorOpeningId?: string | null
  onSelectRoom?: (id: string) => void
  onSelectWall?: (id: string) => void
  onSelectOpening?: (id: string) => void
}
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
 */
export function buildFloorViewSectionProps(vm: EditorRightPanelsProps): FloorViewSectionProps | null {
  if (!isFloorWorkspaceMode(vm.mode)) return null
  return {
    ...buildCommonPanelFrameProps(vm, 'floorView'),
    layers: vm.floorLayers,
    activeLayerId: vm.activeFloorLayerId,
    isGenerated: vm.isFloorPlanGenerated,
    isLayerOverlayMode: vm.isLayerOverlayMode,
    selectedOverlayLayerIds: vm.selectedOverlayLayerIds,
    overlayOpacityByLayerId: vm.overlayOpacityByLayerId,
    onSelectLayer: vm.onSelectFloorLayer,
    onAddLayer: vm.onAddFloorLayer,
    onRenameLayer: vm.onRenameFloorLayer,
    onDeleteLayer: vm.onDeleteFloorLayer,
    onToggleLayerOverlayMode: vm.onToggleLayerOverlayMode,
    onToggleOverlayLayer: vm.onToggleOverlayLayer,
    onSelectSingleOverlayLayer: vm.onSelectSingleOverlayLayer,
    onChangeOverlayLayerOpacity: vm.onChangeOverlayLayerOpacity,
  }
}

/**
 * 3D 모드 Hierarchy 패널 props 매핑
 */
export function buildHierarchySectionProps(vm: EditorRightPanelsProps): HierarchySectionProps | null {
  if (!isFloorWorkspaceMode(vm.mode)) return null
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
    ...hierarchySource,
    selectedRoomId: vm.selectedRoomId,
    selectedFloorWallId: vm.selectedFloorWallId,
    selectedFloorOpeningId: vm.selectedFloorOpeningId,
    onSelectRoom: vm.onSelectRoom,
    onSelectWall: vm.onSelectWall,
    onSelectOpening: vm.onSelectOpening,
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
