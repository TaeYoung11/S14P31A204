import type { EditorPageViewModel } from './editorPageViewModel'

/** 공통 캔버스 렌더링 컨텍스트 */
type CanvasContextProps = Pick<
  EditorPageViewModel,
  | 'mode'
  | 'containerRef'
  | 'stageSize'
  | 'isCollaborationMode'
  | 'selectedPinId'
  | 'commentPins'
  | 'handlePinClick'
  | 'handleCreateCommentPin'
  | 'isGridVisible'
  | 'selectedTool'
  | 'zoom'
  | 'handleWheelZoom'
>

/** 버블 모드 캔버스 상호작용 */
type BubbleCanvasProps = Pick<
  EditorPageViewModel,
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
>

/** 2D/3D 공통 평면 데이터 */
type FloorPlanCanvasProps = Pick<
  EditorPageViewModel,
  | 'floorRooms'
  | 'floorLayerOverlayItems'
  | 'floorPlanConnections'
  | 'isFloorPlanGenerated'
  | 'isFloorPlanGenerating'
  | 'handleGenerateFloorPlan'
  | 'canGenerateFloorPlanFromBubble'
  | 'handleBubbleSelect'
>

/** 2D 벽/개구부 편집 상호작용 */
type TwoDStructureProps = Pick<
  EditorPageViewModel,
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
  | 'handleTwoDMarqueeSelect'
>

/** 2D 레이어 패널 상태/동작 */
type TwoDLayerPanelProps = Pick<
  EditorPageViewModel,
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
>

/** 라벨 편집 오버레이 */
type LabelEditProps = Pick<
  EditorPageViewModel,
  | 'labelEditState'
  | 'confirmLabelEdit'
  | 'closeLabelEdit'
>

/** 줌/그리드/도구 컨트롤 */
type CanvasControlProps = Pick<
  EditorPageViewModel,
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
>

/** EditorPage가 EditorCanvasContent에 전달하는 전체 props 계약 */
export type EditorCanvasContentProps =
  & CanvasContextProps
  & BubbleCanvasProps
  & FloorPlanCanvasProps
  & TwoDStructureProps
  & TwoDLayerPanelProps
  & LabelEditProps
  & CanvasControlProps

