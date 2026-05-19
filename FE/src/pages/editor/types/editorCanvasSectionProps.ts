import type { EditorPageViewModel } from './editorPageViewModel'

/** 공통 캔버스 렌더링 컨텍스트 */
export type CanvasContextProps = Pick<
  EditorPageViewModel,
  | 'projectId'
  | 'mode'
  | 'containerRef'
  | 'stageSize'
  | 'isWorkspaceBootstrapping'
  | 'isCollaborationMode'
  | 'selectedPinId'
  | 'commentPins'
  | 'currentCollaborationUserId'
  | 'handlePinClick'
  | 'handleCreateCommentPin'
  | 'handleDeletePin'
  | 'deletingPinId'
  | 'isGridVisible'
  | 'selectedTool'
  | 'zoom'
  | 'canvasZoom'
  | 'handleWheelZoom'
>

/** 버블 모드 캔버스 상호작용 */
export type BubbleCanvasProps = Pick<
  EditorPageViewModel,
  | 'sitePoints'
  | 'bubbleCanvasViewTransform'
  | 'siteAreaM2'
  | 'siteAreaPyeong'
  | 'bubbles'
  | 'bubbleFloors'
  | 'bubbleFloorNumbers'
  | 'activeBubbleFloor'
  | 'setActiveBubbleFloor'
  | 'handleAddBubbleFloor'
  | 'handleRenameBubbleFloor'
  | 'handleDeleteBubbleFloor'
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
>

/** 2D/3D 공통 평면 데이터 */
export type FloorPlanCanvasProps = Pick<
  EditorPageViewModel,
  | 'sitePlanPoints'
  | 'floorCanvasViewTransform'
  | 'floorRooms'
  | 'floorLayerOverlayItems'
  | 'floorPlanConnections'
  | 'isFloorPlanGenerated'
  | 'isFloorPlanGenerating'
  | 'handleGenerateFloorPlan'
  | 'canGenerateFloorPlanFromBubble'
  | 'isIfcSourceHydrationPending'
  | 'handleBubbleSelect'
  | 'handleSelectIfcElement'
  | 'handleDeleteIfcElement'
  | 'handleCommitIfcElementTransform'
  | 'selectedIfcElement'
  | 'threeDDeleteRequestToken'
  | 'ifcElementChanges'
  | 'isThreeDEditingLocked'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
  | 'libraryElements'
  | 'handleAddLibraryPreset'
  | 'handleChangeLibraryElement'
  | 'handleDeleteLibraryElement'
  | 'localFloorData'
  | 'activeIfcStoreyExpressId'
  | 'overlayIfcStoreyExpressIds'
  | 'requestedIfcElementLocalId'
  | 'ifcElementSelectionRequestToken'
  | 'requestedLibraryElementId'
  | 'libraryElementSelectionRequestToken'
  | 'handleIfcStoreysLoad'
>

/** 2D 벽/개구부 편집 상호작용 */
export type TwoDStructureProps = Pick<
  EditorPageViewModel,
  | 'floorWallsForHierarchy'
  | 'floorOpenings'
  | 'selectedFloorWallId'
  | 'selectedFloorWallIds'
  | 'selectedFloorOpeningId'
  | 'selectedFloorOpeningIds'
  | 'selectedWallForChat'
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
  | 'selectWallForChat'
>

/** 2D 레이어 패널 상태/동작 */
export type TwoDLayerPanelProps = Pick<
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
  | 'handleSelectSingleOverlayLayer'
  | 'handleSetOverlayLayerOpacity'
>

/** 라벨 편집 오버레이 */
export type LabelEditProps = Pick<
  EditorPageViewModel,
  | 'labelEditState'
  | 'confirmLabelEdit'
  | 'closeLabelEdit'
>

/** 줌/그리드/도구 컨트롤 */
export type CanvasControlProps = Pick<
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
  | 'handleOpenGenerate3DModal'
>
