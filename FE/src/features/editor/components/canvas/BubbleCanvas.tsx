import { useMemo } from 'react'
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { BubbleData, ConnectionData, ZoneData } from '../../types'
import { getZoneOrganicShape } from '../../utils/zoneShape'
import { hexToRgba } from '../../utils/bubbleCalc'

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

interface BubbleCanvasProps {
  stageSize: { width: number; height: number }
  sitePoints: number[]
  bubbles: BubbleData[]
  connections: ConnectionData[]
  autoZones: ZoneData[]
  manualZones: ZoneData[]
  selectedId: string | null
  selectedTool: string
  onEditZone: (zone: ZoneData) => void
  onBubbleDrag: (bubbleId: string, x: number, y: number) => void
  onBubbleSelect: (bubbleId: string) => void
  onDeleteBubble?: (bubbleId: string) => void
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
  connections,
  autoZones,
  manualZones,
  selectedId,
  selectedTool,
  onEditZone,
  onBubbleDrag,
  onBubbleSelect,
  onDeleteBubble,
  scale = 1,
}: BubbleCanvasProps) {
  /** id → BubbleData 빠른 조회 맵 */
  const bubbleMap = useMemo(() => new Map(bubbles.map((b) => [b.id, b])), [bubbles])

  /** 마우스가 버블 위에 올라갔을 때 도구에 맞는 커서로 변경 */
  const handleMouseEnter = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (!container) return
    if (selectedTool === 'selection') container.style.cursor = 'move'
    else if (selectedTool === 'delete') container.style.cursor = 'crosshair'
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
      width={stageSize.width}
      height={stageSize.height}
      className="absolute inset-0"
      scaleX={scale}
      scaleY={scale}
      draggable={selectedTool === 'hand'}
      onDragStart={(e) => {
        if (selectedTool === 'hand') {
          const container = e.target.getStage()?.container()
          if (container) container.style.cursor = 'grabbing'
        }
      }}
      onDragEnd={(e) => {
        if (selectedTool === 'hand') {
          const container = e.target.getStage()?.container()
          if (container) container.style.cursor = 'grab'
        }
      }}
    >
      <Layer>
        {/* 대지 외곽선 */}
        <Line points={sitePoints} closed fill="#3B45B311" stroke="#3B45B333" strokeWidth={1} />

        {/* 자동 조닝 영역 */}
        <ZoneLayer zones={autoZones} bubbles={bubbles} style={AUTO_ZONE_STYLE} onEditZone={onEditZone} />

        {/* 수동 조닝 영역 */}
        <ZoneLayer zones={manualZones} bubbles={bubbles} style={MANUAL_ZONE_STYLE} onEditZone={onEditZone} />

        {/* 연결선 */}
        {connections.map((conn, index) => {
          const from = bubbleMap.get(conn.from)
          const to = bubbleMap.get(conn.to)
          if (!from || !to) return null

          const isBold = conn.type === 'bold'
          const isDashed = conn.type === 'dashed'
          return (
            <Line
              key={`${conn.from}-${conn.to}-${index}`}
              points={[
                from.x + from.width / 2,
                from.y + from.height / 2,
                to.x + to.width / 2,
                to.y + to.height / 2,
              ]}
              stroke={isDashed ? '#ADB5BD' : '#3B45B3'}
              strokeWidth={isBold ? 3.5 : isDashed ? 1 : 1.5}
              dash={isDashed ? [6, 4] : undefined}
            />
          )
        })}

        {/* 버블(공간) 목록 */}
        {bubbles.map((bubble) => {
          const isSelected = selectedId === bubble.id
          return (
            <Group
              key={bubble.id}
              x={bubble.x}
              y={bubble.y}
              draggable={selectedTool === 'selection'}
              onDragMove={(e) => onBubbleDrag(bubble.id, e.target.x(), e.target.y())}
              onClick={(e) => {
                e.cancelBubble = true
                if (selectedTool === 'delete') onDeleteBubble?.(bubble.id)
                else onBubbleSelect(bubble.id)
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* 버블 배경 */}
              <Rect
                width={bubble.width}
                height={bubble.height}
                fill={bubble.color}
                cornerRadius={15}
                stroke={isSelected ? '#3B45B3' : '#E2E6EF'}
                strokeWidth={isSelected ? 2 : 1}
                shadowColor="black"
                shadowBlur={isSelected ? 10 : 2}
                shadowOpacity={0.05}
                shadowOffset={{ x: 0, y: 4 }}
              />

              {/* 선택 핸들 (모서리 점) */}
              {isSelected && (
                <>
                  <Circle x={0} y={0} radius={3.5} fill="#3B45B3" />
                  <Circle x={bubble.width} y={0} radius={3.5} fill="#3B45B3" />
                  <Circle x={0} y={bubble.height} radius={3.5} fill="#3B45B3" />
                  <Circle x={bubble.width} y={bubble.height} radius={3.5} fill="#3B45B3" />
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
      </Layer>
    </Stage>
  )
}
