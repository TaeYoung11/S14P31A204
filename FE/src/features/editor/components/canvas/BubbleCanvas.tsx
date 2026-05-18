import { useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import type { BubbleData, CanvasViewTransform, ConnectionData, FloorLayerOverlay, ZoneData } from '../../types'
import { useSpacePanning } from '../../hooks/useSpacePanning'
import { hexToRgba } from '../../utils/bubbleCalc'
import { rotatePointAround } from '../../utils/canvasViewTransform'
import { validateBubblesInSiteBoundary } from '../../utils/siteBoundaryValidation'
import BubbleZoneLayer from './BubbleZoneLayer'
import CanvasViewTransformGroup from './CanvasViewTransformGroup'
import { AUTO_ZONE_STYLE, MANUAL_ZONE_STYLE } from './bubbleZoneStyles'
import { fitSingleLineFontSize } from './canvasTextFit'
import { useCanvasCoordinateHelpers } from './useCanvasCoordinateHelpers'

// ── Props ─────────────────────────────────────────────────────────────────────

/** 라벨 인라인 편집 시 캔버스 내 버블 위치 정보 */
export interface BubbleLabelEditInfo {
  id: string
  label: string
  /** 캔버스 컨테이너 기준 left (px) */
  x: number
  /** 캔버스 컨테이너 기준 top (px) */
  y: number
  width: number
  height: number
}

/** 빈 캔버스 더블클릭 시 새 버블 생성 요청 정보 */
export interface EmptyCanvasDblClickInfo {
  /** Stage 좌표계 기준 포인터 위치 */
  x: number
  y: number
  /** 캔버스 컨테이너 기준 포인터 위치 (overlay 배치용) */
  screenX: number
  screenY: number
}

const MIN_BUBBLE_SIZE = 8
const SITE_GUIDE_STROKE = '#3B45B3'
const SITE_OUTSIDE_WARNING = '#DC2626'
const RESIZE_HANDLE_SIZE = 10
const RESIZE_HANDLE_HIT_SIZE = 22

type ResizeHandleName =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-right'
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'middle-left'

type BubbleResizeRect = {
  bubbleId: string
  x: number
  y: number
  width: number
  height: number
}

type BubbleResizeDragState = BubbleResizeRect & {
  handle: ResizeHandleName
  startPointerX: number
  startPointerY: number
}

interface BubbleCanvasProps {
  projectId?: string
  stageSize: { width: number; height: number }
  sitePoints: number[]
  viewTransform?: CanvasViewTransform | null
  bubbles: BubbleData[]
  overlayLayers?: FloorLayerOverlay[]
  connections: ConnectionData[]
  autoZones: ZoneData[]
  manualZones: ZoneData[]
  selectedId: string | null
  /** 다중 선택된 버블 id 목록 */
  selectedIds?: string[]
  selectedTool: string
  /** 연결 도구에서 첫 번째로 선택된 버블 id (두 번째 선택 대기 중 하이라이트) */
  connectingFromId?: string | null
  onEditZone: (zone: ZoneData) => void
  onBubbleDrag: (bubbleId: string, x: number, y: number) => void
  onBubbleDragStart?: () => void
  onBubbleDragEnd?: () => void
  onBubbleSelect: (bubbleId: string, isShift?: boolean) => void
  onDeleteBubble?: (bubbleId: string) => void
  onConnectionClick?: (conn: ConnectionData) => void
  /** 선택된 연결선 (시각 강조용) */
  selectedConnectionPair?: { from: string; to: string } | null
  /** 연결 포인트 드래그 완료 시 호출 (from -> to) */
  onConnectionCreate?: (fromId: string, toId: string) => void
  /** 버블 더블클릭 → 인라인 라벨 편집 요청 */
  onBubbleLabelEdit?: (info: BubbleLabelEditInfo) => void
  /** 스크롤 휠 줌 배율 (1.1 = 확대, 0.9 = 축소) */
  onWheelZoom?: (factor: number) => void
  /** 마퀴 선택 완료 시 선택된 id 목록 전달 (append=true면 기존 선택에 추가) */
  onMarqueeSelect?: (ids: string[], append?: boolean) => void
  /** 빈 캔버스 클릭 → 선택 해제 */
  onClearSelection?: () => void
  /** 빈 캔버스 더블클릭 → 새 버블 생성 요청 */
  onEmptyCanvasDblClick?: (info: EmptyCanvasDblClickInfo) => void
  /** 버블 resize 완료 후 버블 크기·위치 업데이트 */
  onBubbleResize?: (id: string, x: number, y: number, width: number, height: number) => void
  /** 버블 편집 잠금(보기 전용) */
  isReadOnly?: boolean
  scale?: number
}

const createSharedPanStorageKey = (projectId?: string) => (
  projectId ? `editor:workspace-viewport:pan:${projectId}` : null
)

const createLegacyBubblePanStorageKey = (projectId?: string) => (
  projectId ? `editor:bubble-viewport:pan:${projectId}` : null
)

const readStoredPanOffset = (projectId?: string): { x: number; y: number } => {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const sharedStorageKey = createSharedPanStorageKey(projectId)
  const legacyStorageKey = createLegacyBubblePanStorageKey(projectId)
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
 * 버블 다이어그램 모드 전용 Konva 캔버스
 * - 대지 외곽선, 조닝 영역(자동·수동), 연결선, 버블(공간)을 순서대로 렌더링
 * - 선택 도구: 버블 드래그 이동 / 삭제 도구: 클릭으로 버블 제거
 * - 손 도구(hand): Stage 전체 패닝
 */
export function BubbleCanvas({
  projectId,
  stageSize,
  sitePoints,
  viewTransform = null,
  bubbles,
  overlayLayers = [],
  connections,
  autoZones,
  manualZones,
  selectedId,
  selectedIds = [],
  selectedTool,
  connectingFromId,
  onEditZone,
  onBubbleDrag,
  onBubbleDragStart,
  onBubbleDragEnd,
  onBubbleSelect,
  onDeleteBubble,
  onConnectionClick,
  selectedConnectionPair,
  onConnectionCreate,
  onBubbleLabelEdit,
  onWheelZoom,
  onMarqueeSelect,
  onClearSelection,
  onEmptyCanvasDblClick,
  onBubbleResize,
  isReadOnly = false,
  scale = 1,
}: BubbleCanvasProps) {
  /** id → BubbleData 빠른 조회 맵 */
  const bubbleMap = useMemo(() => new Map(bubbles.map((b) => [b.id, b])), [bubbles])
  const bubbleDisplayPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const b of bubbles) {
      map.set(b.id, viewTransform
        ? rotatePointAround(
            { x: b.x, y: b.y },
            viewTransform.rotationRadians,
            viewTransform.centerX,
            viewTransform.centerY,
          )
        : { x: b.x, y: b.y })
    }
    return map
  }, [bubbles, viewTransform])
  const siteValidation = useMemo(
    () => validateBubblesInSiteBoundary(sitePoints, bubbles),
    [bubbles, sitePoints],
  )
  const outsideBubbleIdSet = siteValidation.outsideBubbleIds

  /** Resize interaction guard */
  const isTransformingRef = useRef(false)
  const wasResizingRef = useRef(false)
  /** Konva Stage ref — 커서 즉시 동기화용 */
  const stageRef = useRef<Konva.Stage | null>(null)

  /** 마퀴(드래그) 선택 상태 */
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const isDrawingMarquee = useRef(false)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<BubbleResizeRect | null>(null)
  const resizePreviewRef = useRef<BubbleResizeRect | null>(null)
  const bubbleResizeDragRef = useRef<BubbleResizeDragState | null>(null)
  const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null)
  const isSpacePressed = useSpacePanning()
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const [panOffsetByProjectId, setPanOffsetByProjectId] = useState<Record<string, { x: number; y: number }>>({})
  const [anonymousPanOffset, setAnonymousPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [connectionDrag, setConnectionDrag] = useState<{
    fromId: string
    startX: number
    startY: number
    endX: number
    endY: number
  } | null>(null)
  const bubblePointerDragRef = useRef<{
    bubbleId: string
    startPointerX: number
    startPointerY: number
    startBubbleX: number
    startBubbleY: number
  } | null>(null)
  const isPanMode = selectedTool === 'hand' || isSpacePressed || isMiddlePanning
  const isBubbleEditable = !isReadOnly
  const baseOffsetX = (stageSize.width * (1 - scale)) / 2
  const baseOffsetY = (stageSize.height * (1 - scale)) / 2
  const storedProjectPanOffset = useMemo(() => readStoredPanOffset(projectId), [projectId])
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

  // 스케일/패닝이 적용된 Stage에서도 항상 동일한 로컬 캔버스 좌표를 얻기 위한 변환 헬퍼.
  const { getCanvasPoint, getStagePoint, toScreenPoint } = useCanvasCoordinateHelpers({
    scale,
    baseOffsetX,
    baseOffsetY,
    panOffsetX: panOffset.x,
    panOffsetY: panOffset.y,
    isPanMode,
    viewTransform,
  })

  /** 버블 타원의 상·우·하·좌 4방향 앵커 포인트 반환 (연결 포인트 표시용) */
  const getAnchorPoints = (bubble: BubbleData) => [
    { x: bubble.x + bubble.width / 2, y: bubble.y },
    { x: bubble.x + bubble.width, y: bubble.y + bubble.height / 2 },
    { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height },
    { x: bubble.x, y: bubble.y + bubble.height / 2 },
  ]

  /** 주어진 좌표에서 가장 가까운 앵커 포인트 반환 (연결 드래그 시작점 결정) */
  const getNearestAnchorPoint = (bubble: BubbleData, x: number, y: number) => {
    const anchors = getAnchorPoints(bubble)
    return anchors.reduce((best, current) => {
      const bestDist = (best.x - x) ** 2 + (best.y - y) ** 2
      const currentDist = (current.x - x) ** 2 + (current.y - y) ** 2
      return currentDist < bestDist ? current : best
    })
  }

  /**
   * 주어진 좌표에 해당하는 버블을 반환 — 역순 탐색으로 위에 렌더된 버블 우선 선택
   * 타원 히트 테스트: (Δx/rx)² + (Δy/ry)² ≤ 1
   */
  const findBubbleByPoint = (x: number, y: number): BubbleData | null => {
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i]
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      const rx = b.width / 2
      const ry = b.height / 2
      if (rx > 0 && ry > 0) {
        const normalized = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2)
        if (normalized <= 1) return b
      }
    }
    return null
  }

  const findDisplayBubbleByPoint = (x: number, y: number): BubbleData | null => {
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i]
      const preview = resizePreview?.bubbleId === b.id ? resizePreview : null
      const displayPos = preview ?? bubbleDisplayPositions.get(b.id) ?? b
      const width = preview?.width ?? b.width
      const height = preview?.height ?? b.height
      const cx = displayPos.x + width / 2
      const cy = displayPos.y + height / 2
      const rx = width / 2
      const ry = height / 2
      if (rx > 0 && ry > 0) {
        const normalized = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2)
        if (normalized <= 1) return b
      }
    }
    return null
  }

  const beginBubblePointerDrag = (bubble: BubbleData, stage: Konva.Stage, event?: MouseEvent) => {
    event?.preventDefault()
    const pos = getCanvasPoint(stage)
    if (!pos) return false
    onBubbleDragStart?.()
    if (!selectedIds.includes(bubble.id)) {
      onBubbleSelect(bubble.id, false)
    }
    bubblePointerDragRef.current = {
      bubbleId: bubble.id,
      startPointerX: pos.x,
      startPointerY: pos.y,
      startBubbleX: bubble.x,
      startBubbleY: bubble.y,
    }
    return true
  }

  const getBubbleDisplayRect = (bubble: BubbleData): BubbleResizeRect => {
    if (resizePreview?.bubbleId === bubble.id) return resizePreview
    const displayPosition = bubbleDisplayPositions.get(bubble.id) ?? bubble
    return {
      bubbleId: bubble.id,
      x: displayPosition.x,
      y: displayPosition.y,
      width: bubble.width,
      height: bubble.height,
    }
  }

  const getResizeCursor = (handle: ResizeHandleName) => {
    if (handle === 'top-left' || handle === 'bottom-right') return 'nwse-resize'
    if (handle === 'top-right' || handle === 'bottom-left') return 'nesw-resize'
    if (handle === 'top-center' || handle === 'bottom-center') return 'ns-resize'
    return 'ew-resize'
  }

  const getResizeHandlePoints = (rect: BubbleResizeRect) => [
    { name: 'top-left' as const, x: rect.x, y: rect.y },
    { name: 'top-center' as const, x: rect.x + rect.width / 2, y: rect.y },
    { name: 'top-right' as const, x: rect.x + rect.width, y: rect.y },
    { name: 'middle-right' as const, x: rect.x + rect.width, y: rect.y + rect.height / 2 },
    { name: 'bottom-right' as const, x: rect.x + rect.width, y: rect.y + rect.height },
    { name: 'bottom-center' as const, x: rect.x + rect.width / 2, y: rect.y + rect.height },
    { name: 'bottom-left' as const, x: rect.x, y: rect.y + rect.height },
    { name: 'middle-left' as const, x: rect.x, y: rect.y + rect.height / 2 },
  ]

  const buildResizePreview = (drag: BubbleResizeDragState, pointer: { x: number; y: number }): BubbleResizeRect => {
    const dx = pointer.x - drag.startPointerX
    const dy = pointer.y - drag.startPointerY
    let x = drag.x
    let y = drag.y
    let width = drag.width
    let height = drag.height
    const right = drag.x + drag.width
    const bottom = drag.y + drag.height

    if (drag.handle.includes('left')) {
      width = drag.width - dx
      x = drag.x + dx
      if (width < MIN_BUBBLE_SIZE) {
        width = MIN_BUBBLE_SIZE
        x = right - MIN_BUBBLE_SIZE
      }
    } else if (drag.handle.includes('right')) {
      width = Math.max(MIN_BUBBLE_SIZE, drag.width + dx)
    }

    if (drag.handle.includes('top')) {
      height = drag.height - dy
      y = drag.y + dy
      if (height < MIN_BUBBLE_SIZE) {
        height = MIN_BUBBLE_SIZE
        y = bottom - MIN_BUBBLE_SIZE
      }
    } else if (drag.handle.includes('bottom')) {
      height = Math.max(MIN_BUBBLE_SIZE, drag.height + dy)
    }

    return { bubbleId: drag.bubbleId, x, y, width, height }
  }

  const finishBubbleResizeDrag = useCallback(() => {
    const drag = bubbleResizeDragRef.current
    if (!drag) return
    wasResizingRef.current = true
    const preview = resizePreviewRef.current ?? drag
    const canonicalPos = viewTransform
      ? rotatePointAround(
          { x: preview.x, y: preview.y },
          -viewTransform.rotationRadians,
          viewTransform.centerX,
          viewTransform.centerY,
        )
      : { x: preview.x, y: preview.y }

    bubbleResizeDragRef.current = null
    resizePreviewRef.current = null
    onBubbleResize?.(preview.bubbleId, canonicalPos.x, canonicalPos.y, preview.width, preview.height)
    setResizePreview(null)
    isTransformingRef.current = false
  }, [onBubbleResize, setResizePreview, viewTransform])

  /** 선택 도구 + 임시 패닝(스페이스/휠) 시 커서를 즉시 손모양으로 동기화 */
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    if (isPanMode) {
      container.style.cursor = isMiddlePanning ? 'grabbing' : 'grab'
      return
    }
    if (selectedTool === 'delete' || selectedTool === 'connect') {
      container.style.cursor = 'crosshair'
      return
    }
    container.style.cursor = 'default'
  }, [isPanMode, isMiddlePanning, selectedTool])

  /** 마우스가 버블 위에 올라갔을 때 도구에 맞는 커서로 변경 */
  const handleMouseEnter = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (!container) return
    if (isPanMode) {
      container.style.cursor = 'grab'
      return
    }
    if (selectedTool === 'selection') container.style.cursor = 'move'
    else if (selectedTool === 'delete') container.style.cursor = 'crosshair'
    else if (selectedTool === 'connect') container.style.cursor = 'crosshair'
    else if (selectedTool === 'hand') container.style.cursor = 'grab'
    else container.style.cursor = 'pointer'
  }

  /** 마우스가 버블 밖으로 나갔을 때 기본 커서로 복원 */
  const handleMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = 'default'
  }

  const finishBubblePointerDrag = useCallback(() => {
    if (!bubblePointerDragRef.current) return
    bubblePointerDragRef.current = null
    onBubbleDragEnd?.()
  }, [onBubbleDragEnd])

  useEffect(() => {
    const handleInteractionEnd = () => {
      finishBubblePointerDrag()
      finishBubbleResizeDrag()
    }
    window.addEventListener('mouseup', handleInteractionEnd)
    window.addEventListener('touchend', handleInteractionEnd)
    window.addEventListener('blur', handleInteractionEnd)
    return () => {
      window.removeEventListener('mouseup', handleInteractionEnd)
      window.removeEventListener('touchend', handleInteractionEnd)
      window.removeEventListener('blur', handleInteractionEnd)
    }
  }, [finishBubblePointerDrag, finishBubbleResizeDrag])

  const activeResizeId = selectedIds.length === 1 ? selectedIds[0] : selectedId
  const activeResizeBubble = activeResizeId && selectedIds.length <= 1 ? (bubbleMap.get(activeResizeId) ?? null) : null
  const activeResizeRect = activeResizeBubble ? getBubbleDisplayRect(activeResizeBubble) : null
  const activeResizeHandles = activeResizeRect ? getResizeHandlePoints(activeResizeRect) : []
  // Stage scale에 역보정하여 줌 배율과 무관하게 항상 일정한 화면 크기로 보이게 한다.
  const handleVisualHalf = (RESIZE_HANDLE_SIZE / 2) / scale
  const handleHitHalf = (RESIZE_HANDLE_HIT_SIZE / 2) / scale
  const handleStrokeWidth = 1.5 / scale
  const handleCornerRadius = 2 / scale
  const findActiveResizeHandleAtPoint = (point: { x: number; y: number }) => (
    activeResizeHandles.find(
      (h) => Math.abs(point.x - h.x) <= handleHitHalf && Math.abs(point.y - h.y) <= handleHitHalf,
    ) ?? null
  )

  return (
    <Stage
      ref={stageRef}
      width={stageSize.width}
      height={stageSize.height}
      className="absolute inset-0"
      scaleX={scale}
      scaleY={scale}
      x={baseOffsetX + panOffset.x}
      y={baseOffsetY + panOffset.y}
      draggable={isPanMode}
      onDragMove={(e) => {
        if (e.target.getType() !== 'Stage') return
        applyPanOffset({
          x: e.target.x() - baseOffsetX,
          y: e.target.y() - baseOffsetY,
        })
      }}
      onDragStart={(e) => {
        if (e.target.getType() !== 'Stage') return
        const container = e.target.getStage()?.container()
        if (container && isPanMode) container.style.cursor = 'grabbing'
      }}
      onDragEnd={(e) => {
        if (e.target.getType() !== 'Stage') return
        const nextPanOffset = {
          x: e.target.x() - baseOffsetX,
          y: e.target.y() - baseOffsetY,
        }
        applyPanOffset(nextPanOffset)
        const container = e.target.getStage()?.container()
        if (container && isPanMode) container.style.cursor = 'grab'
        if (typeof window !== 'undefined') {
          const storageKey = createSharedPanStorageKey(projectId)
          if (storageKey) {
            try {
              window.localStorage.setItem(storageKey, JSON.stringify(nextPanOffset))
            } catch {
              // localStorage 접근 실패는 치명적이지 않아 무시한다.
            }
          }
        }
      }}
      onWheel={(e) => {
        if (!e.evt.ctrlKey && !e.evt.metaKey) return
        e.evt.preventDefault()
        onWheelZoom?.(e.evt.deltaY < 0 ? 1.1 : 0.9)
      }}
      onMouseDown={(e) => {
        if (e.evt.button === 1) {
          e.evt.preventDefault()
          const stage = e.target.getStage()
          if (!stage) return
          setIsMiddlePanning(true)
          stage.draggable(true)
          stage.startDrag()
          const container = stage.container()
          container.style.cursor = 'grabbing'
          return
        }
        if (e.evt.button !== 0) return
        // 빈 캔버스(Stage/Layer)에서만 마퀴 시작
        if (isPanMode) return
        if (!isBubbleEditable) return
        if (selectedTool !== 'selection') return
        const stage = e.target.getStage()
        if (!stage) return
        const stagePos = getStagePoint(stage)
        // 활성 resize 핸들 hit 영역 내부면 marquee/bubble drag 대신 resize 시작 —
        // 코너 핸들처럼 ellipse 바깥에 위치한 핸들이 Stage로 라우팅되는 경우의 fallback.
        if (stagePos && activeResizeBubble && activeResizeHandles.length > 0) {
          const half = (RESIZE_HANDLE_HIT_SIZE / 2) / scale
          const handleHit = activeResizeHandles.find(
            (h) => Math.abs(stagePos.x - h.x) <= half && Math.abs(stagePos.y - h.y) <= half,
          )
          if (handleHit) {
            e.evt.preventDefault()
            const startRect = getBubbleDisplayRect(activeResizeBubble)
            isTransformingRef.current = true
            bubblePointerDragRef.current = null
            isDrawingMarquee.current = false
            marqueeStart.current = null
            bubbleResizeDragRef.current = {
              ...startRect,
              handle: handleHit.name,
              startPointerX: stagePos.x,
              startPointerY: stagePos.y,
            }
            resizePreviewRef.current = startRect
            setResizePreview(startRect)
            return
          }
        }
        const hitBubble = stagePos ? findDisplayBubbleByPoint(stagePos.x, stagePos.y) : null
        if (hitBubble) {
          beginBubblePointerDrag(hitBubble, stage, e.evt)
          return
        }
        const pos = stagePos
        if (!pos) return
        isDrawingMarquee.current = true
        marqueeStart.current = pos
        setMarquee({ x: pos.x, y: pos.y, width: 0, height: 0 })
      }}
      onMouseMove={(e) => {
        if (bubbleResizeDragRef.current) {
          const stage = e.target.getStage()
          if (!stage) return
          const pos = getStagePoint(stage)
          if (!pos) return
          const nextPreview = buildResizePreview(bubbleResizeDragRef.current, pos)
          resizePreviewRef.current = nextPreview
          setResizePreview(nextPreview)
          return
        }
        if (bubblePointerDragRef.current) {
          const stage = e.target.getStage()
          if (!stage) return
          const pos = getCanvasPoint(stage)
          if (!pos) return
          const drag = bubblePointerDragRef.current
          onBubbleDrag(
            drag.bubbleId,
            drag.startBubbleX + pos.x - drag.startPointerX,
            drag.startBubbleY + pos.y - drag.startPointerY,
          )
          return
        }
        if (connectionDrag) {
          const stage = e.target.getStage()
          if (!stage) return
          const pos = getCanvasPoint(stage)
          if (!pos) return
          setConnectionDrag((prev) => (prev ? { ...prev, endX: pos.x, endY: pos.y } : prev))
          return
        }
        if (!isDrawingMarquee.current && isBubbleEditable && selectedTool === 'selection' && !isPanMode) {
          const stage = e.target.getStage()
          if (stage && activeResizeBubble && activeResizeHandles.length > 0) {
            const pos = getStagePoint(stage)
            const handleHit = pos ? findActiveResizeHandleAtPoint(pos) : null
            const container = stage.container()
            if (container && handleHit) {
              container.style.cursor = getResizeCursor(handleHit.name)
              return
            }
            const targetType = e.target.getType()
            if (container && (targetType === 'Stage' || targetType === 'Layer')) {
              container.style.cursor = 'default'
            }
          }
        }
        if (!isDrawingMarquee.current || !marqueeStart.current) return
        const stage = e.target.getStage()
        if (!stage) return
        const pos = getStagePoint(stage)
        if (!pos) return
        const sx = marqueeStart.current.x
        const sy = marqueeStart.current.y
        setMarquee({
          x: Math.min(sx, pos.x),
          y: Math.min(sy, pos.y),
          width: Math.abs(pos.x - sx),
          height: Math.abs(pos.y - sy),
        })
      }}
      onMouseUp={(e) => {
        if (bubbleResizeDragRef.current) {
          finishBubbleResizeDrag()
          return
        }
        if (bubblePointerDragRef.current) {
          finishBubblePointerDrag()
          return
        }
        if (isMiddlePanning) {
          const stage = e.target.getStage()
          if (stage) {
            stage.stopDrag()
            const container = stage.container()
            container.style.cursor = isSpacePressed || selectedTool === 'hand' ? 'grab' : 'default'
          }
          setIsMiddlePanning(false)
          return
        }
        if (connectionDrag) {
          const stage = e.target.getStage()
          const pos = stage ? getCanvasPoint(stage) : null
          if (pos) {
            const target = findBubbleByPoint(pos.x, pos.y)
            if (target && target.id !== connectionDrag.fromId) {
              onConnectionCreate?.(connectionDrag.fromId, target.id)
            }
          }
          setConnectionDrag(null)
          return
        }
        if (!isDrawingMarquee.current || !marquee) {
          isDrawingMarquee.current = false
          return
        }
        isDrawingMarquee.current = false
        marqueeStart.current = null
        // 마퀴 영역과 겹치는 버블 선택
        if (marquee.width > 5 || marquee.height > 5) {
          const corners = [
            { x: marquee.x, y: marquee.y },
            { x: marquee.x + marquee.width, y: marquee.y },
            { x: marquee.x, y: marquee.y + marquee.height },
            { x: marquee.x + marquee.width, y: marquee.y + marquee.height },
          ]
          const cCorners = viewTransform
            ? corners.map((c) =>
                rotatePointAround(c, -viewTransform.rotationRadians, viewTransform.centerX, viewTransform.centerY),
              )
            : corners
          const cMinX = Math.min(...cCorners.map((c) => c.x))
          const cMaxX = Math.max(...cCorners.map((c) => c.x))
          const cMinY = Math.min(...cCorners.map((c) => c.y))
          const cMaxY = Math.max(...cCorners.map((c) => c.y))
          const selected = bubbles.filter((b) => {
            const bRight = b.x + b.width
            const bBottom = b.y + b.height
            return b.x < cMaxX && bRight > cMinX && b.y < cMaxY && bBottom > cMinY
          }).map((b) => b.id)
          onMarqueeSelect?.(selected, e.evt.shiftKey)
        }
        setMarquee(null)
      }}
      onClick={(e) => {
        if (selectedTool !== 'selection') return
        if (wasResizingRef.current) {
          wasResizingRef.current = false
          return
        }
        const stage = e.target.getStage()
        const stagePos = stage ? getStagePoint(stage) : null
        if (stagePos && findDisplayBubbleByPoint(stagePos.x, stagePos.y)) return
        if (stagePos && activeResizeBubble && findActiveResizeHandleAtPoint(stagePos)) return
        const targetType = e.target.getType()
        // listening=false인 도형 위 빈 배경 클릭은 Layer로 들어올 수 있다.
        const isEmptyCanvasTarget = targetType === 'Stage' || targetType === 'Layer'
        if (!isEmptyCanvasTarget) return

        // 빈 캔버스 단일 클릭: 선택 해제
        onClearSelection?.()
      }}
      onDblClick={(e) => {
        if (!isBubbleEditable) return
        if (isPanMode) return
        if (selectedTool !== 'selection') return

        const stage = e.target.getStage()
        if (!stage) return
        const containerPos = stage.getPointerPosition()
        if (!containerPos) return
        // getCanvasPoint를 사용해 현재 Stage transform을 역변환한 실제 캔버스 좌표를 얻는다.
        const localPos = getCanvasPoint(stage)
        if (!localPos) return
        if (!Number.isFinite(localPos.x) || !Number.isFinite(localPos.y)) return

        // 버블 위 클릭은 Stage로 올라오지 않지만, 안전하게 한 번 더 필터링한다.
        const hitBubble = findBubbleByPoint(localPos.x, localPos.y)
        if (hitBubble) return

        onEmptyCanvasDblClick?.({
          x: localPos.x,
          y: localPos.y,
          screenX: containerPos.x,
          screenY: containerPos.y,
        })
      }}
    >
      <Layer>
        {/* 정렬/북향 토글은 렌더 계층 회전으로만 반영한다. */}
        <CanvasViewTransformGroup viewTransform={viewTransform}>
          {/* 대지 외곽선 */}
          <Line
            points={sitePoints}
            closed
            fill="#3B45B319"
            stroke={SITE_GUIDE_STROKE}
            strokeWidth={1.8}
            // 대지 내부 빈 영역 클릭/더블클릭은 Stage로 전달해 버블 생성 로직을 타게 한다.
            listening={false}
          />
          <Line points={sitePoints} closed stroke="#2D359980" strokeWidth={1} dash={[8, 6]} listening={false} />

        {/* 층 겹쳐보기 오버레이 (버블 다이어그램 확인용) */}
        {overlayLayers.map((overlay) => (
          <Group key={`overlay-${overlay.layerId}`} listening={false}>
            {overlay.rooms.map((room) => (
              <Group key={`overlay-room-${overlay.layerId}-${room.id}`} listening={false}>
                <Rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  fill={hexToRgba(room.color, Math.min(Math.max(overlay.opacity * 0.45, 0.08), 0.45))}
                />
                <Rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  stroke="#3B45B3"
                  strokeWidth={1}
                  dash={[6, 4]}
                />
              </Group>
            ))}
          </Group>
        ))}

        {/* 자동 조닝 영역 */}
        <BubbleZoneLayer zones={autoZones} bubbles={bubbles} style={AUTO_ZONE_STYLE} onEditZone={onEditZone} />

        {/* 수동 조닝 영역 */}
        <BubbleZoneLayer zones={manualZones} bubbles={bubbles} style={MANUAL_ZONE_STYLE} onEditZone={onEditZone} />

        {/* 연결선 */}
        {connections.map((conn) => {
          const from = bubbleMap.get(conn.from)
          const to = bubbleMap.get(conn.to)
          if (!from || !to) return null

          const fromX = from.x + from.width / 2
          const fromY = from.y + from.height / 2
          const toX = to.x + to.width / 2
          const toY = to.y + to.height / 2

          const isBold = conn.type === 'bold'
          const isDashed = conn.type === 'dashed'
          const isSelectedConnection =
            !!selectedConnectionPair &&
            ((selectedConnectionPair.from === conn.from && selectedConnectionPair.to === conn.to) ||
              (selectedConnectionPair.from === conn.to && selectedConnectionPair.to === conn.from))
          const stroke = isSelectedConnection ? '#5F63F2' : isDashed ? '#8B95A7' : isBold ? '#2F3BAE' : '#3B45B3'
          const strokeWidth = isSelectedConnection ? 6 : isBold ? 5 : isDashed ? 2 : 2
          const dash = isDashed ? [10, 6] : undefined

          return (
            <Line
              key={`conn-${conn.from}-${conn.to}`}
              points={[fromX, fromY, toX, toY]}
              stroke={stroke}
              strokeWidth={strokeWidth}
              dash={dash}
              lineCap="round"
              lineJoin="round"
              hitStrokeWidth={16}
              onClick={(e) => {
                e.cancelBubble = true
                if (!isBubbleEditable) return
                onConnectionClick?.(conn)
              }}
            />
          )
        })}

        {/* 연결 포인트 (connect 도구 + 버블 호버 시 표시) */}
        {isBubbleEditable && selectedTool === 'connect' && hoveredBubbleId && !connectionDrag && (() => {
          const hovered = bubbleMap.get(hoveredBubbleId)
          if (!hovered) return null
          const anchors = getAnchorPoints(hovered)
          return anchors.map((anchor, index) => (
            <Circle
              key={`anchor-${hovered.id}-${index}`}
              x={anchor.x}
              y={anchor.y}
              radius={5}
              fill="#FFFFFF"
              stroke="#3B45B3"
              strokeWidth={2}
              shadowColor="#3B45B3"
              shadowBlur={4}
              shadowOpacity={0.2}
              onMouseDown={(e) => {
                e.cancelBubble = true
                setConnectionDrag({
                  fromId: hovered.id,
                  startX: anchor.x,
                  startY: anchor.y,
                  endX: anchor.x,
                  endY: anchor.y,
                })
              }}
            />
          ))
        })()}

        {/* 연결선 드래그 프리뷰 */}
        {connectionDrag && (
          <Line
            points={[connectionDrag.startX, connectionDrag.startY, connectionDrag.endX, connectionDrag.endY]}
            stroke="#3B45B3"
            strokeWidth={1.5}
            dash={[6, 4]}
            listening={false}
          />
        )}

        </CanvasViewTransformGroup>

        {/* 버블(공간) 목록 */}
        {bubbles.map((bubble) => {
          const isSelected = selectedIds.includes(bubble.id)
          const isSingleSelected = selectedId === bubble.id
          const isConnectingFrom = connectingFromId === bubble.id
          const isOutsideSite = outsideBubbleIdSet.has(bubble.id)
          const displayRect = getBubbleDisplayRect(bubble)
          // 리사이즈 기준 박스가 shadowBlur를 포함하면 리사이즈 체감과 실제 크기 반영이 어긋난다.
          const disableShadowForResize = selectedTool === 'selection' && isSingleSelected
          const textPaddingX = Math.min(14, Math.max(4, displayRect.width * 0.07))
          const textWidth = Math.max(8, displayRect.width - textPaddingX * 2)
          const textContentHeight = Math.max(1, displayRect.height * 0.62)
          const indexBoxHeight = textContentHeight * 0.2
          const nameBoxHeight = textContentHeight * 0.5
          const areaBoxHeight = textContentHeight * 0.2
          const textRowGap = textContentHeight * 0.05
          const indexFontSize = fitSingleLineFontSize(bubble.index, textWidth, indexBoxHeight / 1.15)
          const nameFontSize = fitSingleLineFontSize(bubble.label, textWidth, nameBoxHeight / 1.15)
          const areaFontSize = fitSingleLineFontSize(bubble.area, textWidth, areaBoxHeight / 1.15)
          const indexLineHeight = indexFontSize * 1.15
          const nameLineHeight = nameFontSize * 1.15
          const areaLineHeight = areaFontSize * 1.15
          const textGroupHeight = indexLineHeight + nameLineHeight + areaLineHeight + textRowGap * 2
          const textStartY = displayRect.height / 2 - textGroupHeight / 2
          return (
            <Group
              key={bubble.id}
              x={displayRect.x}
              y={displayRect.y}
              draggable={false}
              onDragStart={(e) => {
                if (!isBubbleEditable || selectedTool !== 'selection' || isPanMode) return
                e.cancelBubble = true
                onBubbleDragStart?.()
                // 다중 선택 이동 시점 일관성:
                // 선택되지 않은 버블을 바로 드래그하면 먼저 단일 선택으로 맞춘다.
                if (!selectedIds.includes(bubble.id)) {
                  onBubbleSelect(bubble.id, false)
                }
              }}
              onDragMove={(e) => {
                if (!isBubbleEditable) return
                onBubbleDrag(bubble.id, e.target.x(), e.target.y())
              }}
              onDragEnd={() => {
                if (!isBubbleEditable || selectedTool !== 'selection' || isPanMode) return
                onBubbleDragEnd?.()
              }}
              onMouseDown={(e) => {
                if (isPanMode) return
                if (!isBubbleEditable) return
                if (selectedTool === 'selection') {
                  const stage = e.target.getStage()
                  if (!stage) return
                  const stagePos = getStagePoint(stage)
                  // Konva hit이 핸들 대신 ellipse로 라우팅된 경우의 fallback —
                  // 활성 resize 핸들 hit 영역 내부면 bubble drag 대신 resize 시작.
                  if (stagePos && activeResizeBubble && activeResizeBubble.id === bubble.id) {
                    const half = (RESIZE_HANDLE_HIT_SIZE / 2) / scale
                    const handleHit = activeResizeHandles.find(
                      (h) => Math.abs(stagePos.x - h.x) <= half && Math.abs(stagePos.y - h.y) <= half,
                    )
                    if (handleHit) {
                      e.cancelBubble = true
                      e.evt.preventDefault()
                      const startRect = getBubbleDisplayRect(activeResizeBubble)
                      isTransformingRef.current = true
                      bubblePointerDragRef.current = null
                      isDrawingMarquee.current = false
                      marqueeStart.current = null
                      bubbleResizeDragRef.current = {
                        ...startRect,
                        handle: handleHit.name,
                        startPointerX: stagePos.x,
                        startPointerY: stagePos.y,
                      }
                      resizePreviewRef.current = startRect
                      setResizePreview(startRect)
                      return
                    }
                  }
                  const hitBubble = stagePos ? (findDisplayBubbleByPoint(stagePos.x, stagePos.y) ?? bubble) : bubble
                  e.cancelBubble = true
                  beginBubblePointerDrag(hitBubble, stage, e.evt)
                  return
                }
                if (selectedTool !== 'connect') return
                const stage = e.target.getStage()
                const pos = stage ? getCanvasPoint(stage) : null
                if (!pos) return
                const anchor = getNearestAnchorPoint(bubble, pos.x, pos.y)
                e.cancelBubble = true
                setConnectionDrag({
                  fromId: bubble.id,
                  startX: anchor.x,
                  startY: anchor.y,
                  endX: pos.x,
                  endY: pos.y,
                })
              }}
              onClick={(e) => {
                e.cancelBubble = true
                if (selectedTool === 'delete' && isBubbleEditable) onDeleteBubble?.(bubble.id)
                else onBubbleSelect(bubble.id, e.evt.shiftKey)
              }}
              onDblClick={(e) => {
                if (!isBubbleEditable) return
                e.cancelBubble = true
                const topLeft = toScreenPoint({ x: bubble.x, y: bubble.y })
                const bottomRight = toScreenPoint({ x: bubble.x + bubble.width, y: bubble.y + bubble.height })
                onBubbleLabelEdit?.({
                  id: bubble.id,
                  label: bubble.label,
                  x: Math.min(topLeft.x, bottomRight.x),
                  y: Math.min(topLeft.y, bottomRight.y),
                  width: Math.abs(bottomRight.x - topLeft.x),
                  height: Math.abs(bottomRight.y - topLeft.y),
                })
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={(e) => {
                handleMouseLeave(e)
                if (!connectionDrag && !isTransformingRef.current && !bubblePointerDragRef.current) {
                  setHoveredBubbleId((prev) => (prev === bubble.id ? null : prev))
                }
              }}
              onMouseOver={() => {
                if (isBubbleEditable && selectedTool === 'connect') setHoveredBubbleId(bubble.id)
              }}
            >
              {/* 버블 배경 (타원) */}
              <Ellipse
                x={displayRect.width / 2}
                y={displayRect.height / 2}
                radiusX={displayRect.width / 2}
                radiusY={displayRect.height / 2}
                fill={bubble.color}
                stroke={
                  isConnectingFrom
                    ? '#F59F00'
                    : isSelected
                      ? '#3B45B3'
                      : isOutsideSite
                        ? SITE_OUTSIDE_WARNING
                        : '#E2E6EF'
                }
                strokeWidth={isConnectingFrom ? 2.5 : isSelected ? 2 : 1}
                shadowColor={isConnectingFrom ? '#F59F00' : 'black'}
                shadowBlur={disableShadowForResize ? 0 : isConnectingFrom ? 12 : isSingleSelected ? 10 : 2}
                shadowOpacity={disableShadowForResize ? 0 : isConnectingFrom ? 0.25 : 0.05}
                shadowOffset={{ x: 0, y: 4 }}
              />
              {/* 인덱스 번호 */}
                <Text
                  text={bubble.index}
                  fontSize={indexFontSize}
                  fontStyle="bold"
                  fill="#3B45B3"
                  x={textPaddingX}
                  y={textStartY}
                  width={textWidth}
                  align="center"
                />
                {/* 공간 이름 */}
                <Text
                  text={bubble.label}
                  fontSize={nameFontSize}
                  fontStyle="bold"
                  fill="#1C1C1E"
                  x={textPaddingX}
                  y={textStartY + indexLineHeight + textRowGap}
                  width={textWidth}
                  height={nameLineHeight}
                  align="center"
                />
                {/* 면적 */}
                <Text
                  text={bubble.area}
                  fontSize={areaFontSize}
                  fontStyle="bold"
                  fill="#ADB5BD"
                  x={textPaddingX}
                  y={textStartY + indexLineHeight + textRowGap + nameLineHeight + textRowGap}
                  width={textWidth}
                  height={areaLineHeight}
                  align="center"
                />
            </Group>
          )
        })}

        {/* 리사이즈 핸들 — selection 도구 + 단일 선택일 때만 활성 */}
        {isBubbleEditable && selectedTool === 'selection' && activeResizeBubble && activeResizeRect && (
          <Group>
            <Rect
              x={activeResizeRect.x}
              y={activeResizeRect.y}
              width={activeResizeRect.width}
              height={activeResizeRect.height}
              stroke="#0EA5FF"
              strokeWidth={handleStrokeWidth}
              listening={false}
            />
            {activeResizeHandles.map((handle) => (
              <Group
                key={handle.name}
                x={handle.x}
                y={handle.y}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container()
                  if (container) container.style.cursor = getResizeCursor(handle.name)
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container()
                  if (container) container.style.cursor = 'default'
                }}
                onMouseDown={(e) => {
                  e.cancelBubble = true
                  const stage = e.target.getStage()
                  if (!stage) return
                  e.evt.preventDefault()
                  const pointer = getStagePoint(stage)
                  if (!pointer) return
                  const startRect = getBubbleDisplayRect(activeResizeBubble)
                  isTransformingRef.current = true
                  bubblePointerDragRef.current = null
                  isDrawingMarquee.current = false
                  marqueeStart.current = null
                  bubbleResizeDragRef.current = {
                    ...startRect,
                    handle: handle.name,
                    startPointerX: pointer.x,
                    startPointerY: pointer.y,
                  }
                  resizePreviewRef.current = startRect
                  setResizePreview(startRect)
                }}
                onClick={(e) => {
                  e.cancelBubble = true
                }}
              >
                <Rect
                  x={-handleHitHalf}
                  y={-handleHitHalf}
                  width={handleHitHalf * 2}
                  height={handleHitHalf * 2}
                  fill="rgba(0,0,0,0.01)"
                />
                <Rect
                  x={-handleVisualHalf}
                  y={-handleVisualHalf}
                  width={handleVisualHalf * 2}
                  height={handleVisualHalf * 2}
                  fill="#FFFFFF"
                  stroke="#0EA5FF"
                  strokeWidth={handleStrokeWidth}
                  cornerRadius={handleCornerRadius}
                  listening={false}
                />
              </Group>
            ))}
          </Group>
        )}

        {/* 마퀴 선택 사각형 */}
        {marquee && (
          <Rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill="rgba(59,69,179,0.07)"
            stroke="#3B45B3"
            strokeWidth={1}
            dash={[4, 3]}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  )
}
