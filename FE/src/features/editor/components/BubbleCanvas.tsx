import { useMemo } from 'react'
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { BubbleData, ConnectionData, ZoneData } from '../types'
import { getZoneOrganicShape } from '../utils/zoneShape'
import { hexToRgba } from '../utils/bubbleCalc'

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

/** 버블 모드 전용 Konva 캔버스 */
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
  const bubbleMap = useMemo(() => new Map(bubbles.map((bubble) => [bubble.id, bubble])), [bubbles])

  const handleMouseEnter = (e: any) => {
    const container = e.target.getStage().container()
    if (selectedTool === 'selection') container.style.cursor = 'move'
    else if (selectedTool === 'delete') container.style.cursor = 'crosshair'
    else if (selectedTool === 'hand') container.style.cursor = 'grab'
    else container.style.cursor = 'pointer'
  }

  const handleMouseLeave = (e: any) => {
    e.target.getStage().container().style.cursor = 'default'
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
        if (selectedTool === 'hand') e.target.getStage().container().style.cursor = 'grabbing'
      }}
      onDragEnd={(e) => {
        if (selectedTool === 'hand') e.target.getStage().container().style.cursor = 'grab'
      }}
    >
      <Layer>
        <Line
          points={sitePoints}
          closed
          fill="#3B45B311"
          stroke="#3B45B333"
          strokeWidth={1}
        />

        {autoZones.map((zone) => {
          const shape = getZoneOrganicShape(zone, bubbles, 22)
          if (!shape) return null

          return (
            <Group
              key={zone.id}
              onClick={(event) => {
                event.cancelBubble = true
                onEditZone(zone)
              }}
              onTap={(event) => {
                event.cancelBubble = true
                onEditZone(zone)
              }}
            >
              <Line
                points={shape.points}
                closed
                fill={hexToRgba(zone.color, 0.08)}
                stroke={zone.color}
                strokeWidth={1.5}
                dash={[6, 6]}
                tension={0.45}
                lineJoin="round"
                lineCap="round"
              />
              <Text
                text={zone.name}
                x={shape.labelX}
                y={shape.labelY}
                fontSize={10}
                fontStyle="bold"
                fill={zone.color}
              />
            </Group>
          )
        })}

        {manualZones.map((zone) => {
          const shape = getZoneOrganicShape(zone, bubbles, 28)
          if (!shape) return null

          return (
            <Group
              key={zone.id}
              onClick={(event) => {
                event.cancelBubble = true
                onEditZone(zone)
              }}
              onTap={(event) => {
                event.cancelBubble = true
                onEditZone(zone)
              }}
            >
              <Line
                points={shape.points}
                closed
                fill={hexToRgba(zone.color, 0.12)}
                stroke={zone.color}
                strokeWidth={2}
                dash={[10, 6]}
                tension={0.5}
                lineJoin="round"
                lineCap="round"
              />
              <Text
                text={zone.name}
                x={shape.labelX}
                y={shape.labelY}
                fontSize={11}
                fontStyle="bold"
                fill={zone.color}
              />
            </Group>
          )
        })}

        {connections.map((connection, index) => {
          const fromBubble = bubbleMap.get(connection.from)
          const toBubble = bubbleMap.get(connection.to)
          if (!fromBubble || !toBubble) return null

          const isBold = connection.type === 'bold'
          const isDashed = connection.type === 'dashed'
          return (
            <Line
              key={`${connection.from}-${connection.to}-${index}`}
              points={[
                fromBubble.x + fromBubble.width / 2,
                fromBubble.y + fromBubble.height / 2,
                toBubble.x + toBubble.width / 2,
                toBubble.y + toBubble.height / 2,
              ]}
              stroke={isDashed ? '#ADB5BD' : '#3B45B3'}
              strokeWidth={isBold ? 3.5 : isDashed ? 1 : 1.5}
              dash={isDashed ? [6, 4] : undefined}
            />
          )
        })}

        {bubbles.map((bubble) => (
          <Group
            key={bubble.id}
            x={bubble.x}
            y={bubble.y}
            draggable={selectedTool === 'selection'}
            onDragMove={(event) => {
              onBubbleDrag(bubble.id, event.target.x(), event.target.y())
            }}
            onClick={(event) => {
              event.cancelBubble = true
              if (selectedTool === 'delete') {
                onDeleteBubble?.(bubble.id)
              } else {
                onBubbleSelect(bubble.id)
              }
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              width={bubble.width}
              height={bubble.height}
              fill={bubble.color}
              cornerRadius={15}
              stroke={selectedId === bubble.id ? '#3B45B3' : '#E2E6EF'}
              strokeWidth={selectedId === bubble.id ? 2 : 1}
              shadowColor="black"
              shadowBlur={selectedId === bubble.id ? 10 : 2}
              shadowOpacity={0.05}
              shadowOffset={{ x: 0, y: 4 }}
            />

            {selectedId === bubble.id && (
              <>
                <Circle x={0} y={0} radius={3.5} fill="#3B45B3" />
                <Circle x={bubble.width} y={0} radius={3.5} fill="#3B45B3" />
                <Circle x={0} y={bubble.height} radius={3.5} fill="#3B45B3" />
                <Circle x={bubble.width} y={bubble.height} radius={3.5} fill="#3B45B3" />
              </>
            )}

            <Text
              text={bubble.index}
              fontSize={11}
              fontStyle="bold"
              fill="#3B45B3"
              x={bubble.width / 2 - 5}
              y={bubble.height / 2 - 30}
            />
            <Text
              text={bubble.label}
              fontSize={14}
              fontStyle="bold"
              fill="#1C1C1E"
              width={bubble.width}
              align="center"
              y={bubble.height / 2 - 10}
            />
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
        ))}
      </Layer>
    </Stage>
  )
}
