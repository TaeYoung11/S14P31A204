import type { MutableRefObject } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type {
  FloorOpening,
  FloorRoom,
  FloorWall,
  Point2D,
} from '../../types'
import type { AxisAlignedRect } from '../../utils/geometry2d'
import type { RoomDragState } from './TwoDRoomsLayer'
import { computeTwoDMarqueeSelection } from './twoDCanvasSelection.utils'
import { getProjectedWallPosition, getSnappedOpeningWallPosition, findNearestWallForOpeningDrag } from './twoDCanvas.utils'

interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

interface UseTwoDCanvasStageHandlersParams {
  getCanvasPoint: (stage: Konva.Stage) => Point2D | null
  cancelWallDraft: () => void
  startPinDraftAt: (point: Point2D) => void
  getSnappedWallPoint: (raw: Point2D, start: Point2D | null, isOrthogonalLocked: boolean) => Point2D
  findOpeningById: (openingId: string) => FloorOpening | undefined
  isWallTool: boolean
  isDrawingWall: boolean
  isPanMode: boolean
  isSpacePressed: boolean
  isMiddlePanning: boolean
  isInteractionLockedByCollaboration: boolean
  isGridSnapEnabled: boolean
  selectedTool: string
  wallDraftStart: Point2D | null
  wallDraftType: FloorWall['type']
  wallDraftThicknessMm: number
  wallDraftHeightMm: number
  wallMinLength: number
  openingSnapThreshold: number
  openingMinClearanceMm: number
  gridSnapStepPx: number
  rooms: FloorRoom[]
  dedupedRenderWalls: FloorWall[]
  openings: FloorOpening[]
  openingTargetWalls: FloorWall[]
  wallById: Map<string, FloorWall>
  marquee: MarqueeRect | null
  wallDragState: { wallId: string; lastPoint: Point2D } | null
  roomDragState: RoomDragState | null
  openingDragState: { openingId: string } | null
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onSelect?: (id: string | null, isShift?: boolean) => void
  onWallCreate?: (
    start: Point2D,
    end: Point2D,
    options?: { type?: FloorWall['type']; thickness?: number; heightMm?: number },
  ) => void
  onWallMove?: (wallId: string, dx: number, dy: number) => void
  onOpeningMove?: (openingId: string, wallPosition: number, wallId?: string) => void
  onTwoDMarqueeSelect?: (
    payload: { roomIds: string[]; wallIds: string[]; openingIds: string[] },
    append?: boolean,
  ) => void
  onMarqueeSelect?: (ids: string[], append?: boolean) => void
  onWheelZoom?: (factor: number) => void
  setIsMiddlePanning: (value: boolean) => void
  setIsDrawingWall: (value: boolean) => void
  setWallDraftStart: (value: Point2D | null) => void
  setWallDraftEnd: (value: Point2D | null) => void
  setWallDragState: (value: { wallId: string; lastPoint: Point2D } | null) => void
  setRoomDragState: (value: RoomDragState | null) => void
  setOpeningDragState: (value: { openingId: string } | null) => void
  setOpeningSnapGuide: (value: { wallId: string; wallPosition: number } | null) => void
  setMarquee: (value: MarqueeRect | null) => void
  isDrawingMarquee: MutableRefObject<boolean>
  marqueeStart: MutableRefObject<Point2D | null>
  marqueeAppendRef: MutableRefObject<boolean>
  skipStageClickClearRef: MutableRefObject<boolean>
}

/**
 * TwoDCanvas Stage 이벤트 핸들러를 조립한다.
 * - 복잡한 상호작용 분기를 캔버스 본문에서 분리해 가독성을 높인다.
 * - 기존 동작은 동일하게 유지한다.
 */
export function useTwoDCanvasStageHandlers({
  getCanvasPoint,
  cancelWallDraft,
  startPinDraftAt,
  getSnappedWallPoint,
  findOpeningById,
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
  wallMinLength,
  openingSnapThreshold,
  openingMinClearanceMm,
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
}: UseTwoDCanvasStageHandlersParams) {
  /** 마퀴 선택 시작 상태를 초기화한다. */
  const beginMarqueeSelection = (point: Point2D, append: boolean) => {
    isDrawingMarquee.current = true
    marqueeStart.current = point
    marqueeAppendRef.current = append
    setMarquee({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  /** 현재 포인터 기준으로 마퀴 선택 사각형을 갱신한다. */
  const updateMarqueeSelection = (point: Point2D) => {
    if (!marqueeStart.current) return
    const startX = marqueeStart.current.x
    const startY = marqueeStart.current.y
    setMarquee({
      x: Math.min(startX, point.x),
      y: Math.min(startY, point.y),
      width: Math.abs(point.x - startX),
      height: Math.abs(point.y - startY),
    })
  }

  /** 벽 도구 클릭 시 드래프트 시작/연속 생성을 처리한다. */
  const placeWallDraftPoint = (
    stagePoint: Point2D,
    isOrthogonalLocked: boolean,
    cancelBubble: () => void,
  ) => {
    const snappedPoint = getSnappedWallPoint(stagePoint, wallDraftStart, isOrthogonalLocked)
    skipStageClickClearRef.current = true
    cancelBubble()
    onWallSelect?.(null)
    setOpeningSnapGuide(null)

    if (!isDrawingWall || !wallDraftStart) {
      setIsDrawingWall(true)
      setWallDraftStart(snappedPoint)
      setWallDraftEnd(snappedPoint)
      return
    }

    const distance = Math.hypot(snappedPoint.x - wallDraftStart.x, snappedPoint.y - wallDraftStart.y)
    if (distance < wallMinLength) return
    onWallCreate?.(wallDraftStart, snappedPoint, {
      type: wallDraftType,
      thickness: wallDraftThicknessMm,
      heightMm: wallDraftHeightMm,
    })
    // CAD 스타일 연속 생성: 마지막 끝점을 다음 시작점으로 사용한다.
    setWallDraftStart(snappedPoint)
    setWallDraftEnd(snappedPoint)
  }

  /** 개구부 드래그 이동 중 스냅 위치 계산과 상태 반영을 처리한다. */
  const moveOpeningDrag = (stagePoint: Point2D): boolean => {
    if (!openingDragState) return false
    const opening = findOpeningById(openingDragState.openingId)
    if (!opening) return true
    const wall = findNearestWallForOpeningDrag(stagePoint, opening.wallId, openingTargetWalls, wallById)
    if (!wall) return true
    const wallPosition = getProjectedWallPosition(stagePoint, wall)
    const snapped = getSnappedOpeningWallPosition({
      rawWallPosition: wallPosition,
      wall,
      movingOpeningId: openingDragState.openingId,
      movingWidthMm: opening.widthMm,
      openings,
      isGridSnapEnabled,
      gridSnapStepPx,
      snapThreshold: openingSnapThreshold,
      openingMinClearanceMm,
    })
    onOpeningMove?.(openingDragState.openingId, snapped.wallPosition, wall.id)
    setOpeningSnapGuide(
      snapped.guidePosition === null
        ? null
        : { wallId: wall.id, wallPosition: snapped.guidePosition },
    )
    return true
  }

  /** 벽 드래그 이동량 계산과 적용을 처리한다. */
  const moveWallDrag = (stagePoint: Point2D): boolean => {
    if (!wallDragState) return false
    const dx = stagePoint.x - wallDragState.lastPoint.x
    const dy = stagePoint.y - wallDragState.lastPoint.y
    if (dx !== 0 || dy !== 0) {
      onWallMove?.(wallDragState.wallId, dx, dy)
      setWallDragState({ wallId: wallDragState.wallId, lastPoint: stagePoint })
    }
    return true
  }

  /** 마우스 업 시 마퀴 선택 종료 및 선택 결과 반영을 수행한다. */
  const finalizeMarqueeSelection = () => {
    if (!isDrawingMarquee.current) return
    isDrawingMarquee.current = false
    marqueeStart.current = null

    if (marquee && (marquee.width > 5 || marquee.height > 5)) {
      const selection = computeTwoDMarqueeSelection({
        marquee: marquee as AxisAlignedRect,
        rooms,
        walls: dedupedRenderWalls,
        openings,
        wallById,
      })

      if (onTwoDMarqueeSelect) {
        onTwoDMarqueeSelect(selection, marqueeAppendRef.current)
      } else {
        onMarqueeSelect?.(selection.roomIds, marqueeAppendRef.current)
      }
    }

    setMarquee(null)
    marqueeAppendRef.current = false
  }

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return

    if (isWallTool && e.evt.button === 2 && isDrawingWall) {
      e.evt.preventDefault()
      cancelWallDraft()
      return
    }

    if (e.evt.button === 1) {
      e.evt.preventDefault()
      setIsMiddlePanning(true)
      stage.draggable(true)
      stage.startDrag()
      stage.container().style.cursor = 'grabbing'
      return
    }

    if (e.evt.button !== 0) return
    if (isInteractionLockedByCollaboration) return
    if (selectedTool === 'selection') {
      if (isPanMode) return
      if (e.target.getType() !== 'Stage') return
      const point = getCanvasPoint(stage)
      if (!point) return
      beginMarqueeSelection(point, e.evt.shiftKey)
      return
    }
    if (!isWallTool) return
    const point = getCanvasPoint(stage)
    if (!point) return
    placeWallDraftPoint(point, e.evt.shiftKey, () => { e.cancelBubble = true })
  }

  const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return

    if (isDrawingMarquee.current && marqueeStart.current) {
      const pos = getCanvasPoint(stage)
      if (!pos) return
      updateMarqueeSelection(pos)
      return
    }

    const point = getCanvasPoint(stage)
    if (!point) return
    if (moveOpeningDrag(point)) return
    if (moveWallDrag(point)) return

    if (!isDrawingWall || !isWallTool) return
    setWallDraftEnd(getSnappedWallPoint(point, wallDraftStart, e.evt.shiftKey))
  }

  const onMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return

    if (isMiddlePanning) {
      stage.stopDrag()
      stage.container().style.cursor = isSpacePressed || selectedTool === 'hand' ? 'grab' : 'default'
      setIsMiddlePanning(false)
    }

    if (wallDragState) setWallDragState(null)
    if (roomDragState) setRoomDragState(null)
    if (openingDragState) {
      setOpeningDragState(null)
      setOpeningSnapGuide(null)
    }
    finalizeMarqueeSelection()
  }

  const onClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target.getType() !== 'Stage') return
    if (isPanMode) return
    if (isInteractionLockedByCollaboration) {
      const stage = e.target.getStage()
      if (!stage) return
      const point = getCanvasPoint(stage)
      if (!point) return
      startPinDraftAt(point)
      return
    }
    if (skipStageClickClearRef.current) {
      skipStageClickClearRef.current = false
      return
    }
    onSelect?.(null)
    onWallSelect?.(null)
    onOpeningSelect?.(null)
    setOpeningSnapGuide(null)
  }

  const onDblClick = () => {
    if (!isWallTool || !isDrawingWall) return
    cancelWallDraft()
  }

  const onContextMenu = (e: KonvaEventObject<MouseEvent>) => {
    if (!isWallTool || !isDrawingWall) return
    e.evt.preventDefault()
    cancelWallDraft()
  }

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    if (!e.evt.ctrlKey && !e.evt.metaKey) return
    e.evt.preventDefault()
    onWheelZoom?.(e.evt.deltaY < 0 ? 1.1 : 0.9)
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClick,
    onDblClick,
    onContextMenu,
    onWheel,
  }
}
