import type { EditorPageViewModel } from '../types/editorPageViewModel'
import type { EditorCanvasContentProps } from '../types/editorCanvasContentProps'
import { createSafeFloorRoomPolygonHandler } from './floorRoomPolygonGuard'

type CanvasPropsSubset<K extends keyof EditorCanvasContentProps> = Pick<EditorCanvasContentProps, K>

/** 공통 캔버스 컨텍스트(모드/뷰포트/협업 기본 상태)를 매핑한다. */
function buildCanvasContextProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'projectId'
  | 'mode'
  | 'containerRef'
  | 'stageSize'
  | 'zoom'
  | 'isCollaborationMode'
  | 'selectedPinId'
  | 'commentPins'
  | 'handlePinClick'
  | 'handleCreateCommentPin'
  | 'isGridVisible'
  | 'selectedTool'
  | 'handleWheelZoom'
  | 'canvasZoom'
> {
  return {
    projectId: vm.projectId,
    mode: vm.mode,
    containerRef: vm.containerRef,
    stageSize: vm.stageSize,
    zoom: vm.zoom,
    isCollaborationMode: vm.isCollaborationMode,
    selectedPinId: vm.selectedPinId,
    commentPins: vm.commentPins,
    handlePinClick: vm.handlePinClick,
    handleCreateCommentPin: vm.handleCreateCommentPin,
    isGridVisible: vm.isGridVisible,
    selectedTool: vm.selectedTool,
    handleWheelZoom: vm.handleWheelZoom,
    canvasZoom: vm.canvasZoom,
  }
}

/** 버블 모드 캔버스 데이터/상호작용을 매핑한다. */
function buildBubbleCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'sitePoints'
  | 'bubbles'
  | 'connections'
  | 'autoZones'
  | 'manualZones'
  | 'selectedId'
  | 'selectedIds'
  | 'connectingFromId'
  | 'openEditModal'
  | 'handleBubbleDrag'
  | 'handleBubbleDragStart'
  | 'handleBubbleDragEnd'
  | 'handleBubbleSelectWithTool'
  | 'handleDeleteBubble'
  | 'handleConnectionClick'
  | 'selectedConnectionPair'
  | 'handleConnectionCreate'
  | 'handleBubbleLabelEdit'
  | 'handleEmptyCanvasDblClick'
  | 'handleMarqueeSelect'
  | 'clearSelection'
  | 'handleBubbleResize'
  | 'isBubbleReadOnly'
> {
  return {
    // 버블/2D/3D 대지 일관성을 위해 단일 소스(sitePlanPoints)만 사용한다.
    sitePoints: vm.sitePoints,
    bubbles: vm.bubbles,
    connections: vm.connections,
    autoZones: vm.autoZones,
    manualZones: vm.manualZones,
    selectedId: vm.selectedId,
    selectedIds: vm.selectedIds,
    connectingFromId: vm.connectingFromId,
    openEditModal: vm.openEditModal,
    handleBubbleDrag: vm.handleBubbleDrag,
    handleBubbleDragStart: vm.handleBubbleDragStart,
    handleBubbleDragEnd: vm.handleBubbleDragEnd,
    handleBubbleSelectWithTool: vm.handleBubbleSelectWithTool,
    handleDeleteBubble: vm.handleDeleteBubble,
    handleConnectionClick: vm.handleConnectionClick,
    selectedConnectionPair: vm.selectedConnectionPair,
    handleConnectionCreate: vm.handleConnectionCreate,
    handleBubbleLabelEdit: vm.handleBubbleLabelEdit,
    handleEmptyCanvasDblClick: vm.handleEmptyCanvasDblClick,
    handleMarqueeSelect: vm.handleMarqueeSelect,
    clearSelection: vm.clearSelection,
    handleBubbleResize: vm.handleBubbleResize,
    isBubbleReadOnly: vm.isBubbleReadOnly,
  }
}

/** 2D/3D 공통 평면 데이터와 자동 생성 상태를 매핑한다. */
function buildFloorPlanProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'sitePlanPoints'
  | 'floorRooms'
  | 'floorLayerOverlayItems'
  | 'floorPlanConnections'
  | 'isFloorPlanGenerated'
  | 'isFloorPlanGenerating'
  | 'handleGenerateFloorPlan'
  | 'canGenerateFloorPlanFromBubble'
  | 'handleBubbleSelect'
  | 'handleSelectIfcElement'
  | 'handleDeleteIfcElement'
  | 'selectedIfcElement'
  | 'threeDDeleteRequestToken'
  | 'ifcElementChanges'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
  | 'localFloorData'
> {
  return {
    sitePlanPoints: vm.sitePlanPoints,
    floorRooms: vm.floorRooms,
    floorLayerOverlayItems: vm.floorLayerOverlayItems,
    floorPlanConnections: vm.floorPlanConnections,
    isFloorPlanGenerated: vm.isFloorPlanGenerated,
    isFloorPlanGenerating: vm.isFloorPlanGenerating,
    handleGenerateFloorPlan: vm.handleGenerateFloorPlan,
    canGenerateFloorPlanFromBubble: vm.canGenerateFloorPlanFromBubble,
    handleBubbleSelect: vm.handleBubbleSelect,
    handleSelectIfcElement: vm.handleSelectIfcElement,
    handleDeleteIfcElement: vm.handleDeleteIfcElement,
    selectedIfcElement: vm.selectedIfcElement,
    threeDDeleteRequestToken: vm.threeDDeleteRequestToken,
    ifcElementChanges: vm.ifcElementChanges,
    currentIfcUrl: vm.currentIfcUrl,
    currentIfcAssetId: vm.currentIfcAssetId,
    localFloorData: vm.localFloorData,
  }
}

/** 2D 벽/개구부/룸 편집 상태와 핸들러를 매핑한다. */
function buildTwoDStructureProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'floorWallsForHierarchy'
  | 'floorOpenings'
  | 'selectedFloorWallId'
  | 'selectedFloorWallIds'
  | 'selectedFloorOpeningId'
  | 'selectedFloorOpeningIds'
  | 'handleSelectFloorWall'
  | 'handleCreateFloorWall'
  | 'wallCreatePreset'
  | 'handleMoveFloorWall'
  | 'handleUpdateFloorWallEndpoint'
  | 'handleDeleteFloorWall'
  | 'handleCreateFloorOpening'
  | 'handleSelectFloorOpening'
  | 'handleMoveFloorOpening'
  | 'handleDeleteFloorOpening'
  | 'handleMoveFloorRoom'
  | 'handleResizeFloorRoom'
  | 'handleUpdateFloorRoomPolygon'
  | 'beginWorkspaceSnapshotTransaction'
  | 'commitWorkspaceSnapshotTransaction'
  | 'handleTwoDMarqueeSelect'
> {
  const safeHandleUpdateFloorRoomPolygon = createSafeFloorRoomPolygonHandler(
    vm.handleUpdateFloorRoomPolygon,
  )

  return {
    floorWallsForHierarchy: vm.floorWallsForHierarchy,
    floorOpenings: vm.floorOpenings,
    selectedFloorWallId: vm.selectedFloorWallId,
    selectedFloorWallIds: vm.selectedFloorWallIds,
    selectedFloorOpeningId: vm.selectedFloorOpeningId,
    selectedFloorOpeningIds: vm.selectedFloorOpeningIds,
    handleSelectFloorWall: vm.handleSelectFloorWall,
    handleCreateFloorWall: vm.handleCreateFloorWall,
    wallCreatePreset: vm.wallCreatePreset,
    handleMoveFloorWall: vm.handleMoveFloorWall,
    handleUpdateFloorWallEndpoint: vm.handleUpdateFloorWallEndpoint,
    handleDeleteFloorWall: vm.handleDeleteFloorWall,
    handleCreateFloorOpening: vm.handleCreateFloorOpening,
    handleSelectFloorOpening: vm.handleSelectFloorOpening,
    handleMoveFloorOpening: vm.handleMoveFloorOpening,
    handleDeleteFloorOpening: vm.handleDeleteFloorOpening,
    handleMoveFloorRoom: vm.handleMoveFloorRoom,
    handleResizeFloorRoom: vm.handleResizeFloorRoom,
    handleUpdateFloorRoomPolygon: safeHandleUpdateFloorRoomPolygon,
    beginWorkspaceSnapshotTransaction: vm.beginWorkspaceSnapshotTransaction,
    commitWorkspaceSnapshotTransaction: vm.commitWorkspaceSnapshotTransaction,
    handleTwoDMarqueeSelect: vm.handleTwoDMarqueeSelect,
  }
}

/** 2D 레이어 패널 상태/동작을 매핑한다. */
function buildTwoDLayerPanelProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'floorLayers'
  | 'activeFloorLayerId'
  | 'isLayerOverlayMode'
  | 'overlayLayerIds'
  | 'overlayOpacityByLayerId'
  | 'addFloorLayer'
  | 'renameFloorLayer'
  | 'deleteFloorLayer'
  | 'setActiveFloorLayerId'
  | 'toggleLayerOverlayMode'
  | 'handleToggleOverlayLayer'
  | 'handleSetOverlayLayerOpacity'
> {
  return {
    floorLayers: vm.floorLayers,
    activeFloorLayerId: vm.activeFloorLayerId,
    isLayerOverlayMode: vm.isLayerOverlayMode,
    overlayLayerIds: vm.overlayLayerIds,
    overlayOpacityByLayerId: vm.overlayOpacityByLayerId,
    addFloorLayer: vm.addFloorLayer,
    renameFloorLayer: vm.renameFloorLayer,
    deleteFloorLayer: vm.deleteFloorLayer,
    setActiveFloorLayerId: vm.setActiveFloorLayerId,
    toggleLayerOverlayMode: vm.toggleLayerOverlayMode,
    handleToggleOverlayLayer: vm.handleToggleOverlayLayer,
    handleSetOverlayLayerOpacity: vm.handleSetOverlayLayerOpacity,
  }
}

/** 라벨 오버레이 및 캔버스 컨트롤 관련 상태/동작을 매핑한다. */
function buildCanvasControlProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'labelEditState'
  | 'confirmLabelEdit'
  | 'closeLabelEdit'
  | 'isGridSnapEnabled'
  | 'gridSnapIntervalMm'
  | 'isLibraryOpen'
  | 'setIsLibraryOpen'
  | 'handleOpenExportSelectionModal'
  | 'handleZoomIn'
  | 'handleZoomOut'
  | 'handleZoomChange'
  | 'handleSetSelectedTool'
  | 'toggleGrid'
  | 'toggleGridSnap'
  | 'handleSetGridSnapIntervalMm'
  | 'handleToggleCollaboration'
  | 'handleOpenGenerate3DModal'
> {
  return {
    labelEditState: vm.labelEditState,
    confirmLabelEdit: vm.confirmLabelEdit,
    closeLabelEdit: vm.closeLabelEdit,
    isGridSnapEnabled: vm.isGridSnapEnabled,
    gridSnapIntervalMm: vm.gridSnapIntervalMm,
    isLibraryOpen: vm.isLibraryOpen,
    setIsLibraryOpen: vm.setIsLibraryOpen,
    handleOpenExportSelectionModal: vm.handleOpenExportSelectionModal,
    handleZoomIn: vm.handleZoomIn,
    handleZoomOut: vm.handleZoomOut,
    handleZoomChange: vm.handleZoomChange,
    handleSetSelectedTool: vm.handleSetSelectedTool,
    toggleGrid: vm.toggleGrid,
    toggleGridSnap: vm.toggleGridSnap,
    handleSetGridSnapIntervalMm: vm.handleSetGridSnapIntervalMm,
    handleToggleCollaboration: vm.handleToggleCollaboration,
    handleOpenGenerate3DModal: vm.handleOpenGenerate3DModal,
  }
}

/**
 * EditorPage ViewModel에서 캔버스 영역 전용 props를 구성한다.
 * 캔버스 렌더링에 필요한 필드만 명시적으로 전달해 조합부 의도를 분리한다.
 */
export function buildEditorCanvasContentProps(
  vm: EditorPageViewModel,
): EditorCanvasContentProps {
  return {
    ...buildCanvasContextProps(vm),
    ...buildBubbleCanvasProps(vm),
    ...buildFloorPlanProps(vm),
    ...buildTwoDStructureProps(vm),
    ...buildTwoDLayerPanelProps(vm),
    ...buildCanvasControlProps(vm),
  }
}
