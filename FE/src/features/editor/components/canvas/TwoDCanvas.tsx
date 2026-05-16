import { useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import type {
  ConnectionData,
  FloorCommentPin,
  FloorLayerOverlay,
  FloorOpening,
  FloorRoom,
  FloorWall,
  Point2D,
} from '../../types'
import {
  FLOOR_MM_PER_PX,
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_PRESETS,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
  FLOOR_PLAN_EDIT_AUTHORITY,
} from '../../constants'
import { toCanvasPolygon } from '../../utils/siteBoundaryValidation'
import { useSpacePanning } from '../../hooks/useSpacePanning'
import { FloorPlanEmpty, FloorPlanLoading } from './TwoDCanvasOverlays'
import type { RoomDragState } from './TwoDRoomsLayer'
import { TwoDSiteValidationBanner } from './TwoDSiteValidationBanner'
import { TwoDCanvasStage } from './TwoDCanvasStage'
import { useCanvasGridLines } from './useCanvasGridLines'
import { useCanvasCoordinateHelpers } from './useCanvasCoordinateHelpers'
import { useOpeningSnapGuide } from './useOpeningSnapGuide'
import { useOpeningActions } from './useOpeningActions'
import { usePinDraft } from './usePinDraft'
import { useRoomResizeActions } from './useRoomResizeActions'
import { useStagePanInteraction } from './useStagePanInteraction'
import { useTwoDCanvasDerivedData } from './useTwoDCanvasDerivedData'
import { useWallSnap } from './useWallSnap'
import { useWallDraftState } from './useWallDraftState'
import { useTwoDCanvasStageHandlers } from './twoDCanvasStageHandlers'
import {
  ROOM_POLYGON_MIN_VERTEX_COUNT,
  snapCoordinate,
} from './twoDCanvas.utils'

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const DEFAULT_GRID_SNAP_SIZE_PX = 10
const WALL_SNAP_DISTANCE = 14
const WALL_MIN_LENGTH = 8

/** 개구부 최소/최대 표시 길이(px) */
const OPENING_SNAP_THRESHOLD = 0.03
const OPENING_CREATE_SNAP_THRESHOLD = 0.06
const OPENING_MIN_CLEARANCE_MM = 300
// ── Props ─────────────────────────────────────────────────────────────────────

interface TwoDCanvasProps {
  stageSize: { width: number; height: number }
  sitePoints?: number[]
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  commentPins?: FloorCommentPin[]
  currentUserId?: string | null
  onPinClick?: (id: string) => void
  onPinCreate?: (x: number, y: number, content?: string) => void
  onPinDelete?: (id: string) => void
  deletingPinId?: string | null
  rooms?: FloorRoom[]
  overlayLayers?: FloorLayerOverlay[]
  connections?: ConnectionData[]
  /** 평면도 생성 완료 여부 */
  isGenerated?: boolean
  /** 평면도 생성 중(로딩) 여부 */
  isGenerating?: boolean
  /** "평면도 생성" 버튼 클릭 핸들러 */
  onGenerate?: () => void
  /** 생성 가능 여부(버블 존재 여부) */
  canGenerate?: boolean
  isGridVisible?: boolean
  selectedId?: string | null
  selectedIds?: string[]
  onSelect?: (id: string | null, isShift?: boolean) => void
  onMarqueeSelect?: (ids: string[], append?: boolean) => void
  onTwoDMarqueeSelect?: (
    payload: { roomIds: string[]; wallIds: string[]; openingIds: string[] },
    append?: boolean,
  ) => void
  onRoomMove?: (bubbleId: string, x: number, y: number) => void
  onRoomResize?: (bubbleId: string, x: number, y: number, width: number, height: number) => void
  onRoomPolygonChange?: (bubbleId: string, polygon: Point2D[]) => void
  onWorkspaceEditStart?: () => void
  onWorkspaceEditCommit?: () => void
  walls?: FloorWall[]
  openings?: FloorOpening[]
  selectedWallId?: string | null
  selectedWallIds?: string[]
  selectedOpeningId?: string | null
  selectedOpeningIds?: string[]
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onWallCreate?: (
    start: Point2D,
    end: Point2D,
    options?: { type?: FloorWall['type']; thickness?: number; heightMm?: number },
  ) => void
  onWallMove?: (wallId: string, dx: number, dy: number) => void
  onWallEndpointChange?: (wallId: string, endpoint: 'start' | 'end', point: Point2D) => void
  onWallDelete?: (wallId: string) => void
  onOpeningCreate?: (
    wallId: string,
    type: FloorOpening['type'],
    wallPosition: number,
    preferredId?: string,
  ) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onOpeningMove?: (openingId: string, wallPosition: number, wallId?: string) => void
  onOpeningDelete?: (openingId: string) => void
  wallCreatePreset?: { type: FloorWall['type']; thickness: number; heightMm: number }
  isGridSnapEnabled?: boolean
  gridSnapIntervalMm?: number
  scale?: number
  selectedTool?: string
  onWheelZoom?: (factor: number) => void
}

/**
 * 2D 평면도 캔버스
 * - 미생성 상태: 생성 시작 버튼 화면
 * - 생성 중: 로딩 애니메이션 화면
 * - 생성 완료: Konva Stage 기반 평면도 렌더링
 * - 손 도구: Stage draggable로 패닝 지원
 */
export function TwoDCanvas({
  stageSize,
  sitePoints = [],
  isCollaborationMode,
  selectedPinId,
  commentPins = [],
  currentUserId,
  onPinClick,
  onPinCreate,
  onPinDelete,
  deletingPinId,
  rooms = [],
  overlayLayers = [],
  connections = [],
  isGenerated = false,
  isGenerating = false,
  onGenerate,
  canGenerate = true,
  isGridVisible = false,
  selectedId,
  selectedIds = [],
  onSelect,
  onMarqueeSelect,
  onTwoDMarqueeSelect,
  onRoomMove,
  onRoomResize,
  onRoomPolygonChange,
  onWorkspaceEditStart,
  onWorkspaceEditCommit,
  walls = [],
  openings = [],
  selectedWallId = null,
  selectedWallIds = [],
  selectedOpeningId = null,
  selectedOpeningIds = [],
  onWallSelect,
  onWallCreate,
  onWallMove,
  onWallEndpointChange,
  onWallDelete,
  onOpeningCreate,
  onOpeningSelect,
  onOpeningMove,
  onOpeningDelete,
  wallCreatePreset,
  isGridSnapEnabled = true,
  gridSnapIntervalMm = 250,
  scale = 1,
  selectedTool = 'selection',
  onWheelZoom,
}: TwoDCanvasProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const isSpacePressed = useSpacePanning()
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [wallDragState, setWallDragState] = useState<{ wallId: string; lastPoint: Point2D } | null>(null)
  const [roomDragState, setRoomDragState] = useState<RoomDragState | null>(null)
  const [openingDragState, setOpeningDragState] = useState<{ openingId: string } | null>(null)
  const [resizingRoomBubbleId, setResizingRoomBubbleId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const isDrawingMarquee = useRef(false)
  const marqueeStart = useRef<Point2D | null>(null)
  const marqueeAppendRef = useRef(false)
  const skipStageClickClearRef = useRef(false)
  const isPanMode = selectedTool === 'hand' || isSpacePressed || isMiddlePanning
  const baseOffsetX = (stageSize.width * (1 - scale)) / 2
  const baseOffsetY = (stageSize.height * (1 - scale)) / 2

  const isWallTool = selectedTool === 'wall'
  const isDoorTool = selectedTool === 'door'
  const isWindowTool = selectedTool === 'window'
  const isResizeTool = selectedTool === 'resize'
  const isWallFirstEditing = FLOOR_PLAN_EDIT_AUTHORITY === 'wall-first'
  const isOpeningTool = isDoorTool || isWindowTool
  const gridSnapStepPx = Math.max(gridSnapIntervalMm / FLOOR_MM_PER_PX, DEFAULT_GRID_SNAP_SIZE_PX / 4)
  // 리사이즈도 이동/벽 생성과 동일한 전역 스냅 간격을 사용한다.
  const resizeSnapStepPx = gridSnapStepPx
  const snapResizeHandle = (value: number) =>
    snapCoordinate(value, isGridSnapEnabled, resizeSnapStepPx)
  const wallDraftType = wallCreatePreset?.type ?? 'general'
  const wallDraftThicknessMm = Math.min(
    Math.max(
      Math.round(wallCreatePreset?.thickness ?? FLOOR_WALL_PRESETS.general.thickness),
      FLOOR_WALL_THICKNESS_MIN_MM,
    ),
    FLOOR_WALL_THICKNESS_MAX_MM,
  )
  const wallDraftHeightMm = Math.min(
    Math.max(
      Math.round(wallCreatePreset?.heightMm ?? FLOOR_WALL_PRESETS.general.heightMm),
      FLOOR_WALL_HEIGHT_MIN_MM,
    ),
    FLOOR_WALL_HEIGHT_MAX_MM,
  )
  const isInteractionLockedByCollaboration = Boolean(isCollaborationMode)
  const sitePolygon = useMemo(() => toCanvasPolygon(sitePoints), [sitePoints])
  const {
    isDrawingWall,
    wallDraftStart,
    wallDraftEnd,
    setIsDrawingWall,
    setWallDraftStart,
    setWallDraftEnd,
    cancelWallDraft,
  } = useWallDraftState({ isWallTool })
  const { openingSnapGuide, setOpeningSnapGuide, showTemporaryOpeningSnapGuide } = useOpeningSnapGuide()
  const {
    startPinDraftAt,
  } = usePinDraft({ isCollaborationMode, onPinCreate })
  const {
    getCanvasPoint,
    syncHandlePosition,
    handleMouseEnter,
    handleMouseLeave,
  } = useCanvasCoordinateHelpers({
    scale,
    baseOffsetX,
    baseOffsetY,
    panOffsetX: panOffset.x,
    panOffsetY: panOffset.y,
    isPanMode,
  })
  const { getSnappedWallPoint } = useWallSnap({
    walls,
    rooms,
    isGridSnapEnabled,
    gridSnapStepPx,
    wallSnapDistance: WALL_SNAP_DISTANCE,
    roomPolygonMinVertexCount: ROOM_POLYGON_MIN_VERTEX_COUNT,
  })

  const { onStageDragMove, onStageDragStart, onStageDragEnd } = useStagePanInteraction({
    stageRef,
    isPanMode,
    isMiddlePanning,
    baseOffsetX,
    baseOffsetY,
    setPanOffset,
  })

  const gridLines = useCanvasGridLines({
    isGridVisible,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    scale,
    baseOffsetX,
    baseOffsetY,
    panOffsetX: panOffset.x,
    panOffsetY: panOffset.y,
  })

  const {
    fallbackDoorList,
    openingTargetWalls,
    wallById,
    openingById,
    dedupedRenderWalls,
    siteValidation,
    dimensionGuides,
    selectedWallGeometryKey,
  } = useTwoDCanvasDerivedData({
    isGenerated,
    rooms,
    openings,
    walls,
    connections,
    sitePoints,
    selectedWallId,
  })
  const { createOpeningOnWall, promoteFallbackDoorToOpening } = useOpeningActions({
    isOpeningTool,
    isDoorTool,
    openings,
    openingTargetWalls,
    wallById,
    isGridSnapEnabled,
    gridSnapStepPx,
    openingCreateSnapThreshold: OPENING_CREATE_SNAP_THRESHOLD,
    openingMinClearanceMm: OPENING_MIN_CLEARANCE_MM,
    onOpeningCreate,
    setOpeningSnapGuide,
    showTemporaryOpeningSnapGuide,
  })
  const { canResizeRoom, applyRoomResize, beginRoomResize, commitRoomResize } = useRoomResizeActions({
    rooms,
    hasSite: siteValidation.hasSite,
    sitePolygon,
    onRoomResize,
    onWorkspaceEditStart,
    onWorkspaceEditCommit,
  })

  const stageHandlers = useTwoDCanvasStageHandlers({
    getCanvasPoint,
    cancelWallDraft,
    startPinDraftAt,
    getSnappedWallPoint,
    findOpeningById: (openingId) => openingById.get(openingId),
    isWallTool,
    isDrawingWall,
    isPanMode,
    isSpacePressed,
    isMiddlePanning,
    isInteractionLockedByCollaboration,
    isGridSnapEnabled,
    selectedTool,
    wallDraftStart,
    wallDraftType,
    wallDraftThicknessMm,
    wallDraftHeightMm,
    wallMinLength: WALL_MIN_LENGTH,
    openingSnapThreshold: OPENING_SNAP_THRESHOLD,
    openingMinClearanceMm: OPENING_MIN_CLEARANCE_MM,
    gridSnapStepPx,
    rooms,
    dedupedRenderWalls,
    openings,
    openingTargetWalls,
    wallById,
    marquee,
    wallDragState,
    roomDragState,
    openingDragState,
    onWallSelect,
    onOpeningSelect,
    onSelect,
    onWallCreate,
    onWallMove,
    onOpeningMove,
    onTwoDMarqueeSelect,
    onMarqueeSelect,
    onWheelZoom,
    setIsMiddlePanning,
    setIsDrawingWall,
    setWallDraftStart,
    setWallDraftEnd,
    setWallDragState,
    setRoomDragState,
    setOpeningDragState,
    setOpeningSnapGuide,
    setMarquee,
    isDrawingMarquee,
    marqueeStart,
    marqueeAppendRef,
    skipStageClickClearRef,
  })

  // ── 생성 전 / 생성 중 화면 ───────────────────────────────────────────────
  if (!isGenerated && !isGenerating) return <FloorPlanEmpty onGenerate={onGenerate} canGenerate={canGenerate} />
  if (isGenerating) return <FloorPlanLoading />

  // ── 생성 완료: Konva 평면도 렌더링 ───────────────────────────────────────
  return (
    <div className="absolute inset-0">
      <TwoDCanvasStage
        stageRef={stageRef}
        stageSize={stageSize}
        scale={scale}
        baseOffsetX={baseOffsetX}
        baseOffsetY={baseOffsetY}
        panOffset={panOffset}
        isPanMode={isPanMode}
        onStageDragMove={onStageDragMove}
        onStageDragStart={onStageDragStart}
        onStageDragEnd={onStageDragEnd}
        stageHandlers={stageHandlers}
        sitePoints={sitePoints}
        isGridVisible={isGridVisible}
        gridLines={gridLines}
        dimensionGuides={dimensionGuides}
        overlayLayers={overlayLayers}
        rooms={rooms}
        selectedId={selectedId ?? null}
        selectedIds={selectedIds}
        selectedTool={selectedTool}
        isWallTool={isWallTool}
        isOpeningTool={isOpeningTool}
        isResizeTool={isResizeTool}
        isWallFirstEditing={isWallFirstEditing}
        isPanModeEnabled={isPanMode}
        isInteractionLockedByCollaboration={isInteractionLockedByCollaboration}
        isGridSnapEnabled={isGridSnapEnabled}
        gridSnapStepPx={gridSnapStepPx}
        sitePolygon={sitePolygon}
        siteValidation={siteValidation}
        roomDragState={roomDragState}
        resizingRoomBubbleId={resizingRoomBubbleId}
        canResizeRoom={canResizeRoom}
        applyRoomResize={applyRoomResize}
        beginRoomResize={beginRoomResize}
        commitRoomResize={commitRoomResize}
        snapResizeHandle={snapResizeHandle}
        getCanvasPoint={getCanvasPoint}
        syncHandlePosition={syncHandlePosition}
        onRoomMove={onRoomMove}
        onRoomPolygonChange={onRoomPolygonChange}
        onSelect={onSelect}
        onWallSelect={onWallSelect}
        onOpeningSelect={onOpeningSelect}
        onRoomDragStateChange={setRoomDragState}
        onResizingRoomBubbleIdChange={setResizingRoomBubbleId}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        dedupedRenderWalls={dedupedRenderWalls}
        selectedWallId={selectedWallId}
        selectedWallIds={selectedWallIds}
        selectedWallGeometryKey={selectedWallGeometryKey}
        wallById={wallById}
        openingSnapGuide={openingSnapGuide}
        outsideWallIds={siteValidation.outsideWallIds}
        isDrawingWall={isDrawingWall}
        wallDraftStart={wallDraftStart}
        wallDraftEnd={wallDraftEnd}
        wallDraftType={wallDraftType}
        wallDraftThicknessMm={wallDraftThicknessMm}
        onWallDelete={onWallDelete}
        onWallEndpointChange={onWallEndpointChange}
        onWallDragStart={setWallDragState}
        openings={openings}
        selectedOpeningId={selectedOpeningId}
        selectedOpeningIds={selectedOpeningIds}
        createOpeningOnWall={createOpeningOnWall}
        onOpeningDelete={onOpeningDelete}
        onOpeningDragStart={setOpeningDragState}
        onClearOpeningSnapGuide={() => setOpeningSnapGuide(null)}
        fallbackDoorList={fallbackDoorList}
        isDoorTool={isDoorTool}
        promoteFallbackDoorToOpening={promoteFallbackDoorToOpening}
        isCollaborationMode={Boolean(isCollaborationMode)}
        commentPins={commentPins}
        selectedPinId={selectedPinId ?? null}
        currentUserId={currentUserId ?? null}
        onPinClick={onPinClick}
        onPinDelete={onPinDelete}
        deletingPinId={deletingPinId ?? null}
        marquee={marquee}
      />
      <TwoDSiteValidationBanner siteValidation={siteValidation} />

    </div>
  )
}
