import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type Konva from 'konva'
import type {
  CanvasViewTransform,
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
import { captureKonvaStagePreview } from '../../utils/canvasPreviewCapture'
import { FloorPlanEmpty, FloorPlanLoading } from './TwoDCanvasOverlays'
import type { RoomDragState } from './TwoDRoomsLayer'
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
  distancePointToSegment,
  snapCoordinate,
  wallThicknessMmToPx,
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
  projectId?: string
  stageSize: { width: number; height: number }
  sitePoints?: number[]
  viewTransform?: CanvasViewTransform | null
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
  /** 기존 IFC source 조회 대기 중이면 생성 버튼을 비활성화한다. */
  isCheckingIfcSource?: boolean
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
  selectedWallForChat?: { wallId: string } | null
  onSelectWallForChat?: (wallId: string) => void
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
  onPreviewCapture?: (imageUrl: string) => void
}

const createSharedPanStorageKey = (projectId?: string) => (
  projectId ? `editor:workspace-viewport:pan:${projectId}` : null
)

const createLegacyTwoDPanStorageKey = (projectId?: string) => (
  projectId ? `editor:2d-viewport:pan:${projectId}` : null
)

const readStoredTwoDPanOffset = (projectId?: string): { x: number; y: number } => {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const sharedStorageKey = createSharedPanStorageKey(projectId)
  const legacyStorageKey = createLegacyTwoDPanStorageKey(projectId)
  const storageKeys = [sharedStorageKey, legacyStorageKey].filter((value): value is string => Boolean(value))
  if (storageKeys.length === 0) return { x: 0, y: 0 }
  try {
    for (const key of storageKeys) {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
      const x = typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : 0
      const y = typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : 0
      if (sharedStorageKey && key !== sharedStorageKey) {
        try {
          window.localStorage.setItem(sharedStorageKey, JSON.stringify({ x, y }))
        } catch {
          // localStorage 접근 실패는 치명적이지 않아 무시한다.
        }
      }
      return { x, y }
    }
    return { x: 0, y: 0 }
  } catch {
    return { x: 0, y: 0 }
  }
}

/**
 * 2D 평면도 캔버스
 * - 미생성 상태: 생성 시작 버튼 화면
 * - 생성 중: 로딩 애니메이션 화면
 * - 생성 완료: Konva Stage 기반 평면도 렌더링
 * - 손 도구: Stage draggable로 패닝 지원
 */
export function TwoDCanvas({
  projectId,
  stageSize,
  sitePoints = [],
  viewTransform = null,
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
  isCheckingIfcSource = false,
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
  selectedWallForChat,
  onSelectWallForChat,
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
  onPreviewCapture,
}: TwoDCanvasProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const isSpacePressed = useSpacePanning()
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const [panOffsetByProjectId, setPanOffsetByProjectId] = useState<Record<string, { x: number; y: number }>>({})
  const [anonymousPanOffset, setAnonymousPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [wallDragState, setWallDragState] = useState<{ wallId: string; lastPoint: Point2D } | null>(null)
  const [roomDragState, setRoomDragState] = useState<RoomDragState | null>(null)
  const [openingDragState, setOpeningDragState] = useState<{ openingId: string } | null>(null)
  const [resizingRoomBubbleId, setResizingRoomBubbleId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [wallContextMenu, setWallContextMenu] = useState<{ wallId: string; x: number; y: number } | null>(null)
  const isDrawingMarquee = useRef(false)
  const marqueeStart = useRef<Point2D | null>(null)
  const marqueeAppendRef = useRef(false)
  const skipStageClickClearRef = useRef(false)
  const workspaceDragTransactionRef = useRef(false)
  const isPanMode = selectedTool === 'hand' || isSpacePressed || isMiddlePanning
  const baseOffsetX = (stageSize.width * (1 - scale)) / 2
  const baseOffsetY = (stageSize.height * (1 - scale)) / 2
  const storedProjectPanOffset = useMemo(() => readStoredTwoDPanOffset(projectId), [projectId])
  const panOffset = projectId
    ? (panOffsetByProjectId[projectId] ?? storedProjectPanOffset)
    : anonymousPanOffset
  const applyPanOffset = useCallback((nextPanOffset: { x: number; y: number }) => {
    if (!projectId) {
      setAnonymousPanOffset(nextPanOffset)
      return
    }
    setPanOffsetByProjectId((prev) => {
      const current = prev[projectId]
      if (current && current.x === nextPanOffset.x && current.y === nextPanOffset.y) return prev
      return {
        ...prev,
        [projectId]: nextPanOffset,
      }
    })
  }, [projectId])

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
    viewTransform,
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
    setPanOffset: applyPanOffset,
  })

  const handleStageDragEnd = (e: Parameters<typeof onStageDragEnd>[0]) => {
    onStageDragEnd(e)
    if (e.target.getType() !== 'Stage') return
    const nextPanOffset = {
      x: e.target.x() - baseOffsetX,
      y: e.target.y() - baseOffsetY,
    }
    applyPanOffset(nextPanOffset)
    if (typeof window === 'undefined') return
    const storageKey = createSharedPanStorageKey(projectId)
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextPanOffset))
    } catch {
      // localStorage 접근 실패는 치명적이지 않아 무시한다.
    }
  }

  const gridLines = useCanvasGridLines({
    isGridVisible,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    scale,
    baseOffsetX,
    baseOffsetY,
    panOffsetX: panOffset.x,
    panOffsetY: panOffset.y,
    gridStepPx: gridSnapStepPx,
  })

  useEffect(() => {
    if (
      !onPreviewCapture ||
      !isGenerated ||
      isGenerating ||
      (rooms.length === 0 && walls.length === 0) ||
      stageSize.width <= 0 ||
      stageSize.height <= 0
    ) return

    const timerId = window.setTimeout(() => {
      const stage = stageRef.current
      if (!stage) return

      try {
        const imageUrl = captureKonvaStagePreview(stage)
        onPreviewCapture(imageUrl)
      } catch {
        // 캔버스 캡처 실패는 카드 썸네일 fallback으로 처리한다.
      }
    }, 250)

    return () => window.clearTimeout(timerId)
  }, [
    isGenerated,
    isGenerating,
    onPreviewCapture,
    openings,
    overlayLayers,
    panOffset.x,
    panOffset.y,
    rooms,
    scale,
    sitePoints,
    stageSize.height,
    stageSize.width,
    viewTransform,
    walls,
  ])

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
    onWorkspaceEditStart,
    onWorkspaceEditCommit,
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
    workspaceDragTransactionRef,
  })

  const findContextMenuWallId = (point: Point2D): string | null => {
    let nearestWallId: string | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    dedupedRenderWalls.forEach((wall) => {
      const distance = distancePointToSegment(point, wall.start, wall.end)
      const hitThreshold = Math.max(
        24 / Math.max(scale, 0.25),
        wallThicknessMmToPx(wall.thickness) + 14,
      )
      if (distance <= hitThreshold && distance < nearestDistance) {
        nearestWallId = wall.id
        nearestDistance = distance
      }
    })

    return nearestWallId
  }

  const handleCanvasContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!onSelectWallForChat || isInteractionLockedByCollaboration || isResizeTool) return
    const stage = stageRef.current
    if (!stage) return

    stage.setPointersPositions(event.nativeEvent)
    const point = getCanvasPoint(stage)
    const wallId = point ? findContextMenuWallId(point) : null
    if (!wallId) {
      setWallContextMenu(null)
      return
    }
    setWallContextMenu({ wallId, x: event.clientX, y: event.clientY })
  }

  useEffect(() => {
    if (!wallContextMenu) return
    const close = () => setWallContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [wallContextMenu])

  // ── 생성 전 / 생성 중 화면 ───────────────────────────────────────────────
  // 첫 generation일 때만 FloorPlanLoading을 표시한다.
  // 이미 생성된 평면도에 대한 IFC 편집 후속 처리(CONVERTING) 중에는
  // 기존 캔버스를 유지해 매 편집마다 깜빡이는 현상을 막는다.
  if (!isGenerated && !isGenerating) return <FloorPlanEmpty onGenerate={onGenerate} canGenerate={canGenerate} isCheckingIfcSource={isCheckingIfcSource} />
  if (isGenerating && !isGenerated) return <FloorPlanLoading />

  // ── 생성 완료: Konva 평면도 렌더링 ───────────────────────────────────────
  return (
    <div className="absolute inset-0" onContextMenu={handleCanvasContextMenu}>
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
        onStageDragEnd={handleStageDragEnd}
        stageHandlers={stageHandlers}
        sitePoints={sitePoints}
        viewTransform={viewTransform}
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
        chatSelectedWallId={selectedWallForChat?.wallId ?? null}
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
        outsideOpeningIds={siteValidation.outsideOpeningIds}
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
      {wallContextMenu && (
        <div
          className="fixed z-[9999] min-w-[140px] rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg"
          style={{ top: wallContextMenu.y, left: wallContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div className="border-b border-[#E2E8F0] px-3 py-1.5 text-[11px] font-semibold text-[#64748B]">
            대상: 벽
          </div>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-[12px] text-[#1F2937] hover:bg-[#F0F2FF] hover:text-[#3B45B3]"
            onClick={() => {
              const wall = wallById.get(wallContextMenu.wallId)
              onSelectWallForChat?.(wall?.globalId ?? wallContextMenu.wallId)
              setWallContextMenu(null)
            }}
          >
            채팅에서 선택
          </button>
        </div>
      )}
    </div>
  )
}
