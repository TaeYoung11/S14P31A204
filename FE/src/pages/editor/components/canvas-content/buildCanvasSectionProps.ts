import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'

export interface ThreeDCoordinates {
  x: number
  y: number
  z: number
}

export interface CanvasModeRendererSectionProps {
  mode: EditorCanvasRenderProps['mode']
  zoom: EditorCanvasRenderProps['zoom']
  canvasZoom: EditorCanvasRenderProps['canvasZoom']
  renderProps: EditorCanvasRenderProps
  onOpenExport: EditorCanvasRenderProps['handleOpenExportSelectionModal']
  isRotationLocked: boolean
  onThreeDCoordinatesChange: (coords: ThreeDCoordinates) => void
}

export interface CanvasLabelOverlaySectionProps {
  mode: EditorCanvasRenderProps['mode']
  labelEditState: EditorCanvasRenderProps['labelEditState']
  onConfirm: EditorCanvasRenderProps['confirmLabelEdit']
  onCancel: EditorCanvasRenderProps['closeLabelEdit']
}

export interface CanvasTwoDLeftPanelsSectionProps {
  mode: EditorCanvasRenderProps['mode']
  isCollaborationMode: EditorCanvasRenderProps['isCollaborationMode']
  layers: EditorCanvasRenderProps['floorLayers']
  activeLayerId: EditorCanvasRenderProps['activeFloorLayerId']
  isGenerated: EditorCanvasRenderProps['isFloorPlanGenerated']
  isLayerOverlayMode: EditorCanvasRenderProps['isLayerOverlayMode']
  selectedOverlayLayerIds: EditorCanvasRenderProps['overlayLayerIds']
  overlayOpacityByLayerId: EditorCanvasRenderProps['overlayOpacityByLayerId']
  onAddLayer: EditorCanvasRenderProps['addFloorLayer']
  onRenameLayer: EditorCanvasRenderProps['renameFloorLayer']
  onDeleteLayer: EditorCanvasRenderProps['deleteFloorLayer']
  onSelectLayer: EditorCanvasRenderProps['setActiveFloorLayerId']
  onToggleLayerOverlayMode: EditorCanvasRenderProps['toggleLayerOverlayMode']
  onToggleOverlayLayer: EditorCanvasRenderProps['handleToggleOverlayLayer']
  onChangeOverlayLayerOpacity: EditorCanvasRenderProps['handleSetOverlayLayerOpacity']
  rooms: EditorCanvasRenderProps['floorRooms']
  walls: EditorCanvasRenderProps['floorWallsForHierarchy']
  openings: EditorCanvasRenderProps['floorOpenings']
  selectedRoomId: EditorCanvasRenderProps['selectedId']
  onSelectRoom: EditorCanvasRenderProps['handleBubbleSelect']
}

export interface CanvasZoomControlsSectionProps {
  mode: EditorCanvasRenderProps['mode']
  zoom: EditorCanvasRenderProps['zoom']
  selectedTool: EditorCanvasRenderProps['selectedTool']
  isGridVisible: EditorCanvasRenderProps['isGridVisible']
  isGridSnapEnabled: EditorCanvasRenderProps['isGridSnapEnabled']
  gridSnapIntervalMm: EditorCanvasRenderProps['gridSnapIntervalMm']
  onZoomIn: EditorCanvasRenderProps['handleZoomIn']
  onZoomOut: EditorCanvasRenderProps['handleZoomOut']
  onSetZoom: EditorCanvasRenderProps['handleZoomChange']
  onSetTool: EditorCanvasRenderProps['handleSetSelectedTool']
  onToggleGrid: EditorCanvasRenderProps['toggleGrid']
  onToggleGridSnap: EditorCanvasRenderProps['toggleGridSnap']
  onGridSnapIntervalChange: EditorCanvasRenderProps['handleSetGridSnapIntervalMm']
  isRotationLocked: boolean
  onToggleRotationLock: () => void
  threeDCoordinates: ThreeDCoordinates
}

export interface CanvasCollaborationBarSectionProps {
  mode: EditorCanvasRenderProps['mode']
  isCollaborationMode: EditorCanvasRenderProps['isCollaborationMode']
  onToggleCollaboration: EditorCanvasRenderProps['handleToggleCollaboration']
}

/**
 * 모드 본문 렌더러 props 매핑
 */
export function buildCanvasModeRendererSectionProps(
  renderProps: EditorCanvasRenderProps,
  isRotationLocked: boolean,
  onThreeDCoordinatesChange: (coords: ThreeDCoordinates) => void,
): CanvasModeRendererSectionProps {
  return {
    mode: renderProps.mode,
    zoom: renderProps.zoom,
    canvasZoom: renderProps.canvasZoom,
    renderProps,
    onOpenExport: renderProps.handleOpenExportSelectionModal,
    isRotationLocked,
    onThreeDCoordinatesChange,
  }
}

/**
 * 라벨 오버레이 props 매핑
 */
export function buildCanvasLabelOverlaySectionProps(
  renderProps: EditorCanvasRenderProps,
): CanvasLabelOverlaySectionProps {
  return {
    mode: renderProps.mode,
    labelEditState: renderProps.labelEditState,
    onConfirm: renderProps.confirmLabelEdit,
    onCancel: renderProps.closeLabelEdit,
  }
}

/**
 * 2D 좌측 패널 props 매핑
 */
export function buildCanvasTwoDLeftPanelsSectionProps(
  renderProps: EditorCanvasRenderProps,
): CanvasTwoDLeftPanelsSectionProps {
  return {
    mode: renderProps.mode,
    isCollaborationMode: renderProps.isCollaborationMode,
    layers: renderProps.floorLayers,
    activeLayerId: renderProps.activeFloorLayerId,
    isGenerated: renderProps.isFloorPlanGenerated,
    isLayerOverlayMode: renderProps.isLayerOverlayMode,
    selectedOverlayLayerIds: renderProps.overlayLayerIds,
    overlayOpacityByLayerId: renderProps.overlayOpacityByLayerId,
    onAddLayer: renderProps.addFloorLayer,
    onRenameLayer: renderProps.renameFloorLayer,
    onDeleteLayer: renderProps.deleteFloorLayer,
    onSelectLayer: renderProps.setActiveFloorLayerId,
    onToggleLayerOverlayMode: renderProps.toggleLayerOverlayMode,
    onToggleOverlayLayer: renderProps.handleToggleOverlayLayer,
    onChangeOverlayLayerOpacity: renderProps.handleSetOverlayLayerOpacity,
    rooms: renderProps.floorRooms,
    walls: renderProps.floorWallsForHierarchy,
    openings: renderProps.floorOpenings,
    selectedRoomId: renderProps.selectedId,
    onSelectRoom: renderProps.handleBubbleSelect,
  }
}

/**
 * 줌 컨트롤 props 매핑
 */
export function buildCanvasZoomControlsSectionProps(
  renderProps: EditorCanvasRenderProps,
  isRotationLocked: boolean,
  onToggleRotationLock: () => void,
  threeDCoordinates: ThreeDCoordinates,
): CanvasZoomControlsSectionProps {
  return {
    mode: renderProps.mode,
    zoom: renderProps.zoom,
    selectedTool: renderProps.selectedTool,
    isGridVisible: renderProps.isGridVisible,
    isGridSnapEnabled: renderProps.isGridSnapEnabled,
    gridSnapIntervalMm: renderProps.gridSnapIntervalMm,
    onZoomIn: renderProps.handleZoomIn,
    onZoomOut: renderProps.handleZoomOut,
    onSetZoom: renderProps.handleZoomChange,
    onSetTool: renderProps.handleSetSelectedTool,
    onToggleGrid: renderProps.toggleGrid,
    onToggleGridSnap: renderProps.toggleGridSnap,
    onGridSnapIntervalChange: renderProps.handleSetGridSnapIntervalMm,
    isRotationLocked,
    onToggleRotationLock,
    threeDCoordinates,
  }
}

/**
 * 협업 하단 바 props 매핑
 */
export function buildCanvasCollaborationBarSectionProps(
  renderProps: EditorCanvasRenderProps,
): CanvasCollaborationBarSectionProps {
  return {
    mode: renderProps.mode,
    isCollaborationMode: renderProps.isCollaborationMode,
    onToggleCollaboration: renderProps.handleToggleCollaboration,
  }
}
