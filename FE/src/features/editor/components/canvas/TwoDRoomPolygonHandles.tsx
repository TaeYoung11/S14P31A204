import { Circle, Group, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Point2D } from '../../types'
import { ROOM_POLYGON_MIN_VERTEX_COUNT, snapCoordinate } from './twoDCanvas.utils'

interface TwoDRoomPolygonHandlesProps {
  roomId: string
  editableRoomPolygonPoints: Point2D[]
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  applyPolygonChange: (nextPolygon: Point2D[]) => boolean
  syncHandlePosition: (e: KonvaEventObject<DragEvent>, x: number, y: number) => void
}

/**
 * 다각형 Room 편집 핸들(꼭짓점 이동/삭제, 변 중간점 추가)을 렌더링한다.
 */
export function TwoDRoomPolygonHandles({
  roomId,
  editableRoomPolygonPoints,
  isGridSnapEnabled,
  gridSnapStepPx,
  applyPolygonChange,
  syncHandlePosition,
}: TwoDRoomPolygonHandlesProps) {
  return (
    <>
      {editableRoomPolygonPoints.map((vertex, index) => (
        <Circle
          key={`room-vertex-${roomId}-${index}`}
          x={vertex.x}
          y={vertex.y}
          radius={6}
          fill="#FFFFFF"
          stroke="#3B45B3"
          strokeWidth={2}
          draggable
          onMouseDown={(e) => {
            e.cancelBubble = true
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
            const nextX = snapCoordinate(e.target.x(), isGridSnapEnabled, gridSnapStepPx)
            const nextY = snapCoordinate(e.target.y(), isGridSnapEnabled, gridSnapStepPx)
            const nextPolygon = editableRoomPolygonPoints.map((point, pointIndex) =>
              pointIndex === index ? { x: nextX, y: nextY } : point,
            )
            const applied = applyPolygonChange(nextPolygon)
            if (!applied) syncHandlePosition(e, vertex.x, vertex.y)
          }}
          onDragEnd={(e) => {
            syncHandlePosition(e, vertex.x, vertex.y)
          }}
          onDblClick={(e) => {
            e.cancelBubble = true
            if (editableRoomPolygonPoints.length <= ROOM_POLYGON_MIN_VERTEX_COUNT) return
            const nextPolygon = editableRoomPolygonPoints.filter((_, pointIndex) => pointIndex !== index)
            applyPolygonChange(nextPolygon)
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault()
            e.cancelBubble = true
            if (editableRoomPolygonPoints.length <= ROOM_POLYGON_MIN_VERTEX_COUNT) return
            const nextPolygon = editableRoomPolygonPoints.filter((_, pointIndex) => pointIndex !== index)
            applyPolygonChange(nextPolygon)
          }}
        />
      ))}

      {editableRoomPolygonPoints.map((point, index) => {
        const next = editableRoomPolygonPoints[(index + 1) % editableRoomPolygonPoints.length]
        const midX = (point.x + next.x) / 2
        const midY = (point.y + next.y) / 2
        return (
          <Group
            key={`room-edge-add-${roomId}-${index}`}
            x={midX}
            y={midY}
            onClick={(e) => {
              e.cancelBubble = true
              const snappedPoint = {
                x: snapCoordinate(midX, isGridSnapEnabled, gridSnapStepPx),
                y: snapCoordinate(midY, isGridSnapEnabled, gridSnapStepPx),
              }
              const nextPolygon = [...editableRoomPolygonPoints]
              nextPolygon.splice(index + 1, 0, snappedPoint)
              applyPolygonChange(nextPolygon)
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true
            }}
          >
            <Circle radius={4.5} fill="#FFFFFF" stroke="#3B45B3" strokeWidth={1.5} />
            <Line points={[-2.5, 0, 2.5, 0]} stroke="#3B45B3" strokeWidth={1.2} listening={false} />
            <Line points={[0, -2.5, 0, 2.5]} stroke="#3B45B3" strokeWidth={1.2} listening={false} />
          </Group>
        )
      })}
    </>
  )
}
