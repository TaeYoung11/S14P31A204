import { useMemo, useRef, useEffect, useState } from 'react'
import { Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import type { BubbleData, ConnectionData, FloorLayerOverlay, ZoneData } from '../../types'
import { getZoneOrganicShape } from '../../utils/zoneShape'
import { hexToRgba } from '../../utils/bubbleCalc'
import { useSpacePanning } from '../../hooks/useSpacePanning'

// ── 조닝 영역 시각화 설정 ─────────────────────────────────────────────────────

interface ZoneStyle {
  /** 영역 바깥쪽 여백 (px) */
  padding: number
  /** 채우기 투명도 */
  fillOpacity: number
  /** 외곽선 두께 */
  strokeWidth: number
  /** 점선 패턴 [선 길이, 간격] */
  dash: [number, number]
  /** 경계선 텐션 (0=직선, 1=최대 곡률) */
  tension: number
  /** 이름 레이블 폰트 크기 */
  fontSize: number
}

/** 자동 조닝: 넓은 여백, 얇은 선, 작은 레이블 */
const AUTO_ZONE_STYLE: ZoneStyle = {
  padding: 22,
  fillOpacity: 0.08,
  strokeWidth: 1.5,
  dash: [6, 6],
  tension: 0.45,
  fontSize: 10,
}

/** 수동 조닝: 좁은 여백, 굵은 선, 큰 레이블 */
const MANUAL_ZONE_STYLE: ZoneStyle = {
  padding: 28,
  fillOpacity: 0.12,
  strokeWidth: 2,
  dash: [10, 6],
  tension: 0.5,
  fontSize: 11,
}

// ── 서브컴포넌트 ──────────────────────────────────────────────────────────────

interface ZoneLayerProps {
  zones: ZoneData[]
  bubbles: BubbleData[]
  style: ZoneStyle
  onEditZone: (zone: ZoneData) => void
}

/**
 * 조닝 영역 목록을 유기적 도형으로 렌더링하는 서브 레이어
 * 자동/수동 조닝 모두 동일 로직을 사용하며, 시각적 스타일만 다르다.
 */
function ZoneLayer({ zones, bubbles, style, onEditZone }: ZoneLayerProps) {
  return (
    <>
      {zones.map((zone) => {
        const shape = getZoneOrganicShape(zone, bubbles, style.padding)
        if (!shape) return null

        return (
          <Group
            key={zone.id}
            onClick={(e) => {
              e.cancelBubble = true
              onEditZone(zone)
            }}
            onTap={(e) => {
              e.cancelBubble = true
              onEditZone(zone)
            }}
          >
            <Line
              points={shape.points}
              closed
              fill={hexToRgba(zone.color, style.fillOpacity)}
              stroke={zone.color}
              strokeWidth={style.strokeWidth}
              dash={style.dash}
              tension={style.tension}
              lineJoin="round"
              lineCap="round"
            />
            <Text
              text={zone.name}
              x={shape.labelX}
              y={shape.labelY}
              fontSize={style.fontSize}
              fontStyle="bold"
              fill={zone.color}
            />
          </Group>
        )
      })}
    </>
  )
}

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

const MIN_BUBBLE_SIZE = 40
const EMPTY_CANVAS_DBLCLICK_MS = 320
const EMPTY_CANVAS_DBLCLICK_DIST = 8

interface BubbleCanvasProps {
  stageSize: { width: number; height: number }
  sitePoints: number[]
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
  /** Transformer resize 완료 후 버블 크기·위치 업데이트 */
  onBubbleResize?: (id: string, x: number, y: number, width: number, height: number) => void
  /** 버블 편집 잠금(보기 전용) */
  isReadOnly?: boolean
  scale?: number
}

/**
 * 버블 다이어그램 모드 전용 Konva 캔버스
 * - 대지 외곽선, 조닝 영역(자동·수동), 연결선, 버블(공간)을 순서대로 렌더링
 * - 선택 도구: 버블 드래그 이동 / 삭제 도구: 클릭으로 버블 제거
 * - 손 도구(hand): Stage 전체 패닝
 */
export function BubbleCanvas({
  stageSize,
  sitePoints,
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

  /** 각 버블 Group ref — Transformer 연결용 */
  const groupRefs = useRef<Map<string, Konva.Group>>(new Map())
  /** Konva Transformer ref */
  const trRef = useRef<Konva.Transformer | null>(null)
  /** Konva Stage ref — 커서 즉시 동기화용 */
  const stageRef = useRef<Konva.Stage | null>(null)

  /** 마퀴(드래그) 선택 상태 */
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const isDrawingMarquee = useRef(false)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const lastEmptyCanvasClickRef = useRef<{ at: number; x: number; y: number } | null>(null)
  const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null)
  const isSpacePressed = useSpacePanning()
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [connectionDrag, setConnectionDrag] = useState<{
    fromId: string
    startX: number
    startY: number
    endX: number
    endY: number
  } | null>(null)
  const isPanMode = selectedTool === 'hand' || isSpacePressed || isMiddlePanning
  const isBubbleEditable = !isReadOnly
  const baseOffsetX = (stageSize.width * (1 - scale)) / 2
  const baseOffsetY = (stageSize.height * (1 - scale)) / 2

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

  /** 단일 선택 시 Transformer를 해당 Group에 연결 */
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    if (selectedIds.length === 1) {
      const node = groupRefs.current.get(selectedIds[0])
      if (node) {
        tr.nodes([node])
        tr.getLayer()?.batchDraw()
        return
      }
    }
    tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [selectedIds])

  /** 선택된 버블 크기/위치가 바뀌면 Transformer bbox를 즉시 재계산 */
  useEffect(() => {
    if (selectedTool !== 'selection' || selectedIds.length !== 1) return
    const tr = trRef.current
    const node = groupRefs.current.get(selectedIds[0])
    if (!tr || !node) return
    tr.nodes([node])
    tr.forceUpdate()
    tr.getLayer()?.batchDraw()
  }, [selectedTool, selectedIds, bubbles])

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
        setPanOffset({
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
        const container = e.target.getStage()?.container()
        if (container && isPanMode) container.style.cursor = 'grab'
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
        const targetType = e.target.getType()
        if (targetType !== 'Stage' && e.target.getParent()?.getType() !== 'Stage') {
          const isOnBubble = bubbles.some((b) => {
            const g = groupRefs.current.get(b.id)
            return g && (e.target === g || g.isAncestorOf(e.target as Konva.Node))
          })
          if (isOnBubble) return
        }
        const stage = e.target.getStage()
        if (!stage) return
        const pos = stage.getRelativePointerPosition()
        if (!pos) return
        isDrawingMarquee.current = true
        marqueeStart.current = pos
        setMarquee({ x: pos.x, y: pos.y, width: 0, height: 0 })
      }}
      onMouseMove={(e) => {
        if (connectionDrag) {
          const stage = e.target.getStage()
          if (!stage) return
          const pos = stage.getRelativePointerPosition()
          if (!pos) return
          setConnectionDrag((prev) => (prev ? { ...prev, endX: pos.x, endY: pos.y } : prev))
          return
        }
        if (!isDrawingMarquee.current || !marqueeStart.current) return
        const stage = e.target.getStage()
        if (!stage) return
        const pos = stage.getRelativePointerPosition()
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
          const pos = stage?.getRelativePointerPosition()
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
          const selected = bubbles
            .filter((b) => {
              const bRight = b.x + b.width
              const bBottom = b.y + b.height
              const mRight = marquee.x + marquee.width
              const mBottom = marquee.y + marquee.height
              return b.x < mRight && bRight > marquee.x && b.y < mBottom && bBottom > marquee.y
            })
            .map((b) => b.id)
          onMarqueeSelect?.(selected, e.evt.shiftKey)
        }
        setMarquee(null)
      }}
      onClick={(e) => {
        if (selectedTool !== 'selection') {
          lastEmptyCanvasClickRef.current = null
          return
        }
        const targetType = e.target.getType()
        if (targetType !== 'Stage') {
          lastEmptyCanvasClickRef.current = null
          return
        }
        const stage = e.target.getStage()
        if (!stage) return
        const pos = stage.getRelativePointerPosition()
        const containerPos = stage.getPointerPosition()

        // 빈 캔버스 단일 클릭: 선택 해제
        onClearSelection?.()
        if (!isBubbleEditable) {
          lastEmptyCanvasClickRef.current = null
          return
        }
        if (!pos || !containerPos) return

        // 빈 캔버스 더블클릭에서만 새 버블 생성
        const now = Date.now()
        const last = lastEmptyCanvasClickRef.current
        if (last) {
          const dt = now - last.at
          const dx = pos.x - last.x
          const dy = pos.y - last.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dt <= EMPTY_CANVAS_DBLCLICK_MS && dist <= EMPTY_CANVAS_DBLCLICK_DIST) {
            onEmptyCanvasDblClick?.({
              x: pos.x,
              y: pos.y,
              screenX: containerPos.x,
              screenY: containerPos.y,
            })
            lastEmptyCanvasClickRef.current = null
            return
          }
        }
        lastEmptyCanvasClickRef.current = { at: now, x: pos.x, y: pos.y }
      }}
    >
      <Layer>
        {/* 대지 외곽선 */}
        <Line points={sitePoints} closed fill="#3B45B311" stroke="#3B45B333" strokeWidth={1} />

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
        <ZoneLayer zones={autoZones} bubbles={bubbles} style={AUTO_ZONE_STYLE} onEditZone={onEditZone} />

        {/* 수동 조닝 영역 */}
        <ZoneLayer zones={manualZones} bubbles={bubbles} style={MANUAL_ZONE_STYLE} onEditZone={onEditZone} />

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

        {/* 버블(공간) 목록 */}
        {bubbles.map((bubble) => {
          const isSelected = selectedIds.includes(bubble.id)
          const isSingleSelected = selectedId === bubble.id
          const isConnectingFrom = connectingFromId === bubble.id
          // Transformer 기준 박스가 shadowBlur를 포함하면 리사이즈 체감과 실제 크기 반영이 어긋난다.
          const disableShadowForResize = selectedTool === 'selection' && isSingleSelected
          return (
            <Group
              key={bubble.id}
              ref={(node) => {
                if (node) groupRefs.current.set(bubble.id, node)
                else groupRefs.current.delete(bubble.id)
              }}
              x={bubble.x}
              y={bubble.y}
              draggable={isBubbleEditable && selectedTool === 'selection' && !isPanMode}
              onDragStart={(e) => {
                if (!isBubbleEditable || selectedTool !== 'selection' || isPanMode) return
                e.cancelBubble = true
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
              onMouseDown={(e) => {
                if (isPanMode) return
                if (!isBubbleEditable) return
                if (selectedTool !== 'connect') return
                const stage = e.target.getStage()
                const pos = stage?.getRelativePointerPosition()
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
                const stage = e.target.getStage()
                if (!stage) return
                const s = stage.scaleX()
                onBubbleLabelEdit?.({
                  id: bubble.id,
                  label: bubble.label,
                  x: stage.x() + bubble.x * s,
                  y: stage.y() + bubble.y * s,
                  width: bubble.width * s,
                  height: bubble.height * s,
                })
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={(e) => {
                handleMouseLeave(e)
                if (!connectionDrag) setHoveredBubbleId((prev) => (prev === bubble.id ? null : prev))
              }}
              onMouseOver={() => {
                if (isBubbleEditable && selectedTool === 'connect') setHoveredBubbleId(bubble.id)
              }}
            >
              {/* 버블 배경 (타원) */}
              <Ellipse
                x={bubble.width / 2}
                y={bubble.height / 2}
                radiusX={bubble.width / 2}
                radiusY={bubble.height / 2}
                fill={bubble.color}
                stroke={isConnectingFrom ? '#F59F00' : isSelected ? '#3B45B3' : '#E2E6EF'}
                strokeWidth={isConnectingFrom ? 2.5 : isSelected ? 2 : 1}
                shadowColor={isConnectingFrom ? '#F59F00' : 'black'}
                shadowBlur={disableShadowForResize ? 0 : isConnectingFrom ? 12 : isSingleSelected ? 10 : 2}
                shadowOpacity={disableShadowForResize ? 0 : isConnectingFrom ? 0.25 : 0.05}
                shadowOffset={{ x: 0, y: 4 }}
              />

              {/* 선택 핸들 (타원 4방향 극점) — Transformer 없을 때만 표시 */}
              {isSingleSelected && selectedIds.length !== 1 && (
                <>
                  <Circle x={bubble.width / 2} y={0} radius={3.5} fill="#3B45B3" />
                  <Circle x={bubble.width / 2} y={bubble.height} radius={3.5} fill="#3B45B3" />
                  <Circle x={0} y={bubble.height / 2} radius={3.5} fill="#3B45B3" />
                  <Circle x={bubble.width} y={bubble.height / 2} radius={3.5} fill="#3B45B3" />
                </>
              )}

              {/* 인덱스 번호 */}
              <Text
                text={bubble.index}
                fontSize={11}
                fontStyle="bold"
                fill="#3B45B3"
                x={bubble.width / 2 - 5}
                y={bubble.height / 2 - 30}
              />
              {/* 공간 이름 */}
              <Text
                text={bubble.label}
                fontSize={14}
                fontStyle="bold"
                fill="#1C1C1E"
                width={bubble.width}
                align="center"
                y={bubble.height / 2 - 10}
              />
              {/* 면적 */}
              <Text
                text={bubble.area}
                fontSize={10}
                fontStyle="bold"
                fill="#ADB5BD"
                width={bubble.width}
                align="center"
                y={bubble.height / 2 + 10}
              />
            </Group>
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

        {/* Transformer — selection 도구 + 단일 선택일 때만 활성 */}
        {isBubbleEditable && selectedTool === 'selection' && (
          <Transformer
            ref={trRef}
            rotateEnabled={false}
            keepRatio={false}
            enabledAnchors={[
              'top-left',
              'top-center',
              'top-right',
              'middle-right',
              'bottom-right',
              'bottom-center',
              'bottom-left',
              'middle-left',
            ]}
            anchorSize={10}
            anchorCornerRadius={2}
            anchorStroke="#0EA5FF"
            anchorStrokeWidth={1.5}
            anchorFill="#FFFFFF"
            borderStroke="#0EA5FF"
            borderStrokeWidth={2}
            boundBoxFunc={(_oldBox, newBox) => ({
              ...newBox,
              width: Math.max(newBox.width, MIN_BUBBLE_SIZE),
              height: Math.max(newBox.height, MIN_BUBBLE_SIZE),
            })}
            onTransformEnd={() => {
              const activeId = selectedIds.length === 1 ? selectedIds[0] : selectedId
              if (!activeId) return
              const group = groupRefs.current.get(activeId)
              if (!group) return
              const bubble = bubbles.find((b) => b.id === activeId)
              if (!bubble) return
              const newW = Math.max(bubble.width * group.scaleX(), MIN_BUBBLE_SIZE)
              const newH = Math.max(bubble.height * group.scaleY(), MIN_BUBBLE_SIZE)
              const newX = group.x()
              const newY = group.y()
              group.scaleX(1)
              group.scaleY(1)
              onBubbleResize?.(activeId, newX, newY, newW, newH)
            }}
          />
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
