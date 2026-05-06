import type { ComponentProps } from 'react'
import { AssistantPanel } from '../../panels/AssistantPanel'
import { AttributesPanel } from '../../panels/AttributesPanel'
import { FloorViewPanel } from '../../panels/FloorViewPanel'
import { HierarchyPanel } from '../../panels/HierarchyPanel'
import { ZoningPanel } from '../../panels/ZoningPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'

export type AttributesSectionProps = ComponentProps<typeof AttributesPanel>
export type ZoningSectionProps = ComponentProps<typeof ZoningPanel>
export type FloorViewSectionProps = ComponentProps<typeof FloorViewPanel>
export type HierarchySectionProps = ComponentProps<typeof HierarchyPanel>
export type AssistantSectionProps = ComponentProps<typeof AssistantPanel>

/**
 * 속성 패널 props 매핑
 */
export function buildAttributesSectionProps(vm: EditorRightPanelsProps): AttributesSectionProps {
  return {
    mode: vm.mode,
    isOpen: vm.panelOpenState.attributes,
    offset: vm.panelOffsets.attributes,
    width: vm.panelWidths.attributes,
    height: vm.panelHeights.attributes,
    zIndex: vm.panelZIndexes.attributes,
    selectedBubble: vm.selectedBubble,
    selectedWall: vm.selectedWall,
    selectedOpening: vm.selectedOpening,
    connections: vm.selectedBubbleConnections,
    zones: vm.selectedBubbleZones,
    onLabelChange: vm.onLabelChange,
    onTypeChange: vm.onTypeChange,
    onWidthChange: vm.onWidthChange,
    onHeightChange: vm.onHeightChange,
    onWidthCommit: vm.onWidthCommit,
    onHeightCommit: vm.onHeightCommit,
    onRatioChange: vm.onRatioChange,
    onColorChange: vm.onColorChange,
    onMaterialChange: vm.onMaterialChange,
    onWallTypeChange: vm.onWallTypeChange,
    onWallThicknessChange: vm.onWallThicknessChange,
    onWallHeightChange: vm.onWallHeightChange,
    onWallMaterialChange: vm.onWallMaterialChange,
    onOpeningSizeChange: vm.onOpeningSizeChange,
    onWindowSillHeightChange: vm.onWindowSillHeightChange,
    onDoorSwingDirectionChange: vm.onDoorSwingDirectionChange,
    onDoorHingeSideChange: vm.onDoorHingeSideChange,
    onDragStart: vm.onPanelDragStart,
    onResizeStart: vm.onPanelResizeStart,
    onToggle: vm.onTogglePanel,
  }
}

/**
 * 버블 모드 조닝 패널 props 매핑
 */
export function buildZoningSectionProps(vm: EditorRightPanelsProps): ZoningSectionProps | null {
  if (vm.mode !== 'bubble') return null
  return {
    isOpen: vm.panelOpenState.zoning,
    offset: vm.panelOffsets.zoning,
    width: vm.panelWidths.zoning,
    height: vm.panelHeights.zoning,
    zIndex: vm.panelZIndexes.zoning,
    zoningListItems: vm.zoningListItems,
    onOpenZoningModal: vm.onOpenZoningModal,
    onOpenEditZoningModal: vm.onOpenEditZoningModal,
    onDeleteZoning: vm.onDeleteZoning,
    onDragStart: vm.onPanelDragStart,
    onResizeStart: vm.onPanelResizeStart,
    onToggle: vm.onTogglePanel,
  }
}

/**
 * 3D 모드 FloorView 패널 props 매핑
 */
export function buildFloorViewSectionProps(vm: EditorRightPanelsProps): FloorViewSectionProps | null {
  if (vm.mode !== '3d') return null
  return {
    isOpen: vm.panelOpenState.floorView,
    offset: vm.panelOffsets.floorView,
    width: vm.panelWidths.floorView,
    height: vm.panelHeights.floorView,
    zIndex: vm.panelZIndexes.floorView,
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
    onChangeOverlayLayerOpacity: vm.onChangeOverlayLayerOpacity,
    onDragStart: vm.onPanelDragStart,
    onResizeStart: vm.onPanelResizeStart,
    onToggle: vm.onTogglePanel,
  }
}

/**
 * 3D 모드 Hierarchy 패널 props 매핑
 */
export function buildHierarchySectionProps(vm: EditorRightPanelsProps): HierarchySectionProps | null {
  if (vm.mode !== '3d') return null
  return {
    isOpen: vm.panelOpenState.hierarchy,
    offset: vm.panelOffsets.hierarchy,
    width: vm.panelWidths.hierarchy,
    height: vm.panelHeights.hierarchy,
    zIndex: vm.panelZIndexes.hierarchy,
    onDragStart: vm.onPanelDragStart,
    onResizeStart: vm.onPanelResizeStart,
    onToggle: vm.onTogglePanel,
  }
}

/**
 * 어시스턴트 패널 props 매핑
 */
export function buildAssistantSectionProps(vm: EditorRightPanelsProps): AssistantSectionProps | null {
  if (vm.mode === 'view') return null
  return {
    isOpen: vm.panelOpenState.assistant,
    offset: vm.panelOffsets.assistant,
    width: vm.panelWidths.assistant,
    height: vm.panelHeights.assistant,
    zIndex: vm.panelZIndexes.assistant,
    provider: vm.llmProvider,
    prompt: vm.llmPrompt,
    status: vm.llmStatus,
    isLoading: vm.llmIsLoading,
    message: vm.llmMessage,
    suggestions: vm.llmSuggestions,
    preview: vm.llmPreview,
    canRun: vm.llmCanRun,
    onPromptChange: vm.onLlmPromptChange,
    onRun: vm.onRunLlmEdit,
    onApply: vm.onApplyLlmEdit,
    onDiscard: vm.onDiscardLlmEdit,
    floorProjectImportMessage: vm.floorProjectImportMessage,
    onImportFloorProjectIfc: vm.onImportFloorProjectIfc,
    onDragStart: vm.onPanelDragStart,
    onResizeStart: vm.onPanelResizeStart,
    onToggle: vm.onTogglePanel,
  }
}
