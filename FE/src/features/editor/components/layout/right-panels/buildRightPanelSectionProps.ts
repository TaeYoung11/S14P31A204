import type { ComponentProps } from 'react'
import { AssistantPanel } from '../../panels/AssistantPanel'
import { AttributesPanel } from '../../panels/AttributesPanel'
import { FloorViewPanel } from '../../panels/FloorViewPanel'
import { HierarchyPanel } from '../../panels/HierarchyPanel'
import { ZoningPanel } from '../../panels/ZoningPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import type { FloorLayer } from '../../../types'

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
    selectedIfcElement: vm.selectedIfcElement,
    connections: vm.selectedBubbleConnections,
    zones: vm.selectedBubbleZones,
    onLabelChange: vm.onLabelChange,
    onTypeChange: vm.onTypeChange,
    onWidthChange: vm.onWidthChange,
    onHeightChange: vm.onHeightChange,
    onThicknessChange: vm.onThicknessChange,
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
 *
 * IFC 기반 3D라면 IfcBuildingStorey에서 파싱한 층 목록을, 그렇지 않으면 2D 편집 레이어를 사용한다.
 */
export function buildFloorViewSectionProps(vm: EditorRightPanelsProps): FloorViewSectionProps | null {
  if (vm.mode !== '3d') return null

  // IFC 층이 파싱된 경우: FloorLayer 형식으로 변환해 FloorViewPanel에 전달한다.
  const hasIfcStoreys = (vm.ifcStoreys?.length ?? 0) > 0
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
    isOpen: vm.panelOpenState.floorView,
    offset: vm.panelOffsets.floorView,
    width: vm.panelWidths.floorView,
    height: vm.panelHeights.floorView,
    zIndex: vm.panelZIndexes.floorView,
    layers,
    activeLayerId,
    isGenerated,
    isViewOnly: true,
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

  return {
    isOpen: vm.panelOpenState.hierarchy,
    offset: vm.panelOffsets.hierarchy,
    width: vm.panelWidths.hierarchy,
    height: vm.panelHeights.hierarchy,
    zIndex: vm.panelZIndexes.hierarchy,
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
