// 버블 다이어그램 캔버스
// react-konva로 대지 폴리곤·연결선·버블을 렌더링하고 드래그·연결 상호작용을 처리한다.
// 연결 방식: ① 버블 호버 → 핸들 드래그 → 대상 버블 위 마우스업 → 선 스타일 선택
//            ② 버블 선택 후 사이드바 "선 스타일" 클릭 → 대상 버블 클릭

import { useState } from 'react'
import { Stage, Layer, Rect, Text, Line, Group, Circle } from 'react-konva'
import { BubbleData, ConnectionData, DrawingConnection, ConnectingFrom } from '../types'

interface BubbleCanvasProps {
  stageSize: { width: number; height: number }
  bubbles: BubbleData[]
  onBubblesChange: (bubbles: BubbleData[]) => void
  connections: ConnectionData[]
  selectedId: string | null
  drawingConnection: DrawingConnection | null
  onBubbleClick: (id: string) => void
  onStageClick: () => void
  connectingFrom: ConnectingFrom | null
  onConnectStart: (bubbleId: string, x: number, y: number) => void
  onConnectEnd: (toBubbleId: string) => void
  onConnectCancel: () => void
}

/** 임시 대지 경계 폴리곤 좌표 (API 연동 전 목업) */
const SITE_POINTS = [420, 310, 560, 310, 560, 550, 330, 720, 300, 480]

/** 선 종류에 따른 Konva Line 스타일 반환 */
function resolveLineStyle(type: string) {
  const isBold   = type === 'bold'
  const isDashed = type === 'dashed'
  return {
    stroke:      isDashed ? '#ADB5BD' : '#3B45B3',
    strokeWidth: isBold ? 3.5 : isDashed ? 1 : 1.5,
    dash:        isDashed ? ([6, 4] as number[]) : undefined,
  }
}

/** 버블 사각형 4방향 중앙의 연결 핸들 위치 (그룹 로컬 좌표) */
function getHandlePositions(width: number, height: number) {
  return [
    { key: 'top',    x: width / 2, y: 0          },
    { key: 'bottom', x: width / 2, y: height      },
    { key: 'left',   x: 0,         y: height / 2  },
    { key: 'right',  x: width,     y: height / 2  },
  ]
}

export default function BubbleCanvas({
  stageSize,
  bubbles,
  onBubblesChange,
  connections,
  selectedId,
  drawingConnection,
  onBubbleClick,
  onStageClick,
  connectingFrom,
  onConnectStart,
  onConnectEnd,
  onConnectCancel,
}: BubbleCanvasProps) {
  const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const isConnecting = !!connectingFrom

  return (
    <Stage
      width={stageSize.width}
      height={stageSize.height}
      className="absolute inset-0"
      onClick={onStageClick}
      onMouseMove={e => {
        if (!isConnecting) return
        const pos = e.target.getStage()?.getPointerPosition()
        if (pos) setMousePos(pos)
      }}
      onMouseUp={() => {
        // 버블 Group에서 cancelBubble 처리된 경우 여기 도달하지 않음 → 빈 영역 마우스업
        if (isConnecting) onConnectCancel()
      }}
    >
      <Layer>
        {/* 대지 경계 폴리곤 */}
        <Line points={SITE_POINTS} closed fill="#3B45B311" stroke="#3B45B333" strokeWidth={1} />

        {/* 버블 간 연결선 — 버블 이동 시 자동으로 위치 추적 */}
        {connections.map((conn, i) => {
          const from = bubbles.find(b => b.id === conn.from)
          const to   = bubbles.find(b => b.id === conn.to)
          if (!from || !to) return null
          return (
            <Line
              key={`conn-${conn.from}-${conn.to}-${i}`}
              points={[
                from.x + from.width  / 2, from.y + from.height / 2,
                to.x   + to.width    / 2, to.y   + to.height   / 2,
              ]}
              {...resolveLineStyle(conn.type)}
            />
          )
        })}

        {/* 드래그 연결 중 미리보기 선 */}
        {connectingFrom && (
          <Line
            points={[connectingFrom.x, connectingFrom.y, mousePos.x, mousePos.y]}
            stroke="#3B45B3"
            strokeWidth={1.5}
            dash={[6, 4]}
            opacity={0.6}
            listening={false}
          />
        )}

        {/* 공간 버블 목록 */}
        {bubbles.map(b => {
          const isSelected      = selectedId === b.id
          const isSource        = drawingConnection?.from === b.id
          const isConnectSource = connectingFrom?.bubbleId === b.id
          const isValidTarget   = isConnecting && !isConnectSource

          // 버블 테두리 강조 색상
          const strokeColor =
            isConnectSource           ? '#3B45B3'
            : isValidTarget           ? '#22C55E'
            : isSource || isSelected  ? '#3B45B3'
            : '#E2E6EF'
          const strokeW = (isConnectSource || isValidTarget || isSource || isSelected) ? 2.5 : 1

          // 호버 핸들 표시 조건: 해당 버블 호버 + 연결 모드 비활성
          const showHandles = hoveredBubbleId === b.id && !isConnecting && !drawingConnection

          return (
            <Group
              key={b.id}
              x={b.x}
              y={b.y}
              draggable={!drawingConnection && !isConnecting}
              onMouseEnter={() => setHoveredBubbleId(b.id)}
              onMouseLeave={() => setHoveredBubbleId(null)}
              onDragMove={e =>
                onBubblesChange(
                  bubbles.map(bubble =>
                    bubble.id === b.id
                      ? { ...bubble, x: e.target.x(), y: e.target.y() }
                      : bubble,
                  ),
                )
              }
              onClick={e => { e.cancelBubble = true; onBubbleClick(b.id) }}
              onMouseUp={e => {
                if (isConnecting && !isConnectSource) {
                  e.cancelBubble = true
                  onConnectEnd(b.id)
                }
              }}
            >
              <Rect
                width={b.width}
                height={b.height}
                fill="white"
                cornerRadius={15}
                stroke={strokeColor}
                strokeWidth={strokeW}
                shadowColor="black"
                shadowBlur={(isSource || isSelected || isConnectSource) ? 10 : 2}
                shadowOpacity={0.05}
                shadowOffset={{ x: 0, y: 4 }}
              />

              {/* 선택 모서리 핸들 — 연결 모드 비활성 시에만 표시 */}
              {isSelected && !drawingConnection && !isConnecting && (
                <>
                  <Circle x={0}        y={0}        radius={3.5} fill="#3B45B3" />
                  <Circle x={b.width}  y={0}        radius={3.5} fill="#3B45B3" />
                  <Circle x={0}        y={b.height} radius={3.5} fill="#3B45B3" />
                  <Circle x={b.width}  y={b.height} radius={3.5} fill="#3B45B3" />
                </>
              )}

              {/* 호버 시 4방향 연결 핸들 — 마우스다운으로 드래그 연결 시작 */}
              {showHandles && getHandlePositions(b.width, b.height).map(({ key, x, y }) => (
                <Circle
                  key={key}
                  x={x} y={y}
                  radius={6}
                  fill="#3B45B3"
                  stroke="white"
                  strokeWidth={2}
                  onMouseDown={e => {
                    e.cancelBubble = true
                    setMousePos({ x: b.x + x, y: b.y + y })
                    onConnectStart(b.id, b.x + x, b.y + y)
                  }}
                />
              ))}

              <Text
                text={b.index}
                fontSize={11} fontStyle="bold" fill="#3B45B3"
                x={b.width / 2 - 5} y={b.height / 2 - 30}
              />
              <Text
                text={b.label}
                fontSize={14} fontStyle="bold" fill="#1C1C1E"
                width={b.width} align="center" y={b.height / 2 - 10}
              />
              <Text
                text={b.area}
                fontSize={10} fontStyle="bold" fill="#ADB5BD"
                width={b.width} align="center" y={b.height / 2 + 10}
              />
            </Group>
          )
        })}
      </Layer>
    </Stage>
  )
}
