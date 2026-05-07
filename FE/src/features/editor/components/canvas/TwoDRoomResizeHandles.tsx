import { Circle } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { FloorRoom } from '../../types'

const ROOM_MIN_SIZE_PX = 40

interface ResizeRectPayload {
  x: number
  y: number
  width: number
  height: number
  fallbackX: number
  fallbackY: number
}

interface TwoDRoomResizeHandlesProps {
  room: FloorRoom
  snapResizeHandle: (value: number) => number
  applyActiveRoomResize: (nextX: number, nextY: number, width: number, height: number) => boolean
  syncHandlePosition: (e: KonvaEventObject<DragEvent>, x: number, y: number) => void
  onRoomDragStateReset: () => void
  onResizingRoomBubbleIdChange: (bubbleId: string | null) => void
}

/**
 * 사각 Room 리사이즈 핸들(변/코너)을 렌더링한다.
 * - 드래그 계산은 기존 TwoDCanvas 로직과 동일하게 유지한다.
 */
export function TwoDRoomResizeHandles({
  room,
  snapResizeHandle,
  applyActiveRoomResize,
  syncHandlePosition,
  onRoomDragStateReset,
  onResizingRoomBubbleIdChange,
}: TwoDRoomResizeHandlesProps) {
  const startResize = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    onRoomDragStateReset()
    onResizingRoomBubbleIdChange(room.bubbleId)
  }

  const applyResize = (e: KonvaEventObject<DragEvent>, payload: ResizeRectPayload) => {
    e.cancelBubble = true
    const applied = applyActiveRoomResize(payload.x, payload.y, payload.width, payload.height)
    if (!applied) {
      syncHandlePosition(e, payload.fallbackX, payload.fallbackY)
    }
  }

  const endResize = (e: KonvaEventObject<DragEvent>, fallbackX: number, fallbackY: number) => {
    syncHandlePosition(e, fallbackX, fallbackY)
    onResizingRoomBubbleIdChange(null)
  }

  return (
    <>
      <Circle
        x={room.x + room.width / 2}
        y={room.y}
        radius={5.5}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const bottom = room.y + room.height
          const py = snapResizeHandle(e.target.y())
          const nextY = Math.min(py, bottom - ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: room.x,
            y: nextY,
            width: room.width,
            height: bottom - nextY,
            fallbackX: room.x + room.width / 2,
            fallbackY: room.y,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x + room.width / 2, room.y)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x + room.width / 2}
        y={room.y + room.height}
        radius={5.5}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const top = room.y
          const py = snapResizeHandle(e.target.y())
          const nextBottom = Math.max(py, top + ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: room.x,
            y: top,
            width: room.width,
            height: nextBottom - top,
            fallbackX: room.x + room.width / 2,
            fallbackY: room.y + room.height,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x + room.width / 2, room.y + room.height)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x}
        y={room.y + room.height / 2}
        radius={5.5}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const right = room.x + room.width
          const px = snapResizeHandle(e.target.x())
          const nextX = Math.min(px, right - ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: nextX,
            y: room.y,
            width: right - nextX,
            height: room.height,
            fallbackX: room.x,
            fallbackY: room.y + room.height / 2,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x, room.y + room.height / 2)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x + room.width}
        y={room.y + room.height / 2}
        radius={5.5}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const left = room.x
          const px = snapResizeHandle(e.target.x())
          const nextRight = Math.max(px, left + ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: left,
            y: room.y,
            width: nextRight - left,
            height: room.height,
            fallbackX: room.x + room.width,
            fallbackY: room.y + room.height / 2,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x + room.width, room.y + room.height / 2)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x}
        y={room.y}
        radius={6}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const right = room.x + room.width
          const bottom = room.y + room.height
          const px = snapResizeHandle(e.target.x())
          const py = snapResizeHandle(e.target.y())
          const nextX = Math.min(px, right - ROOM_MIN_SIZE_PX)
          const nextY = Math.min(py, bottom - ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: nextX,
            y: nextY,
            width: right - nextX,
            height: bottom - nextY,
            fallbackX: room.x,
            fallbackY: room.y,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x, room.y)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x + room.width}
        y={room.y}
        radius={6}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const left = room.x
          const bottom = room.y + room.height
          const px = snapResizeHandle(e.target.x())
          const py = snapResizeHandle(e.target.y())
          const nextRight = Math.max(px, left + ROOM_MIN_SIZE_PX)
          const nextY = Math.min(py, bottom - ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: left,
            y: nextY,
            width: nextRight - left,
            height: bottom - nextY,
            fallbackX: room.x + room.width,
            fallbackY: room.y,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x + room.width, room.y)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x}
        y={room.y + room.height}
        radius={6}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const right = room.x + room.width
          const top = room.y
          const px = snapResizeHandle(e.target.x())
          const py = snapResizeHandle(e.target.y())
          const nextX = Math.min(px, right - ROOM_MIN_SIZE_PX)
          const nextBottom = Math.max(py, top + ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: nextX,
            y: top,
            width: right - nextX,
            height: nextBottom - top,
            fallbackX: room.x,
            fallbackY: room.y + room.height,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x, room.y + room.height)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
      <Circle
        x={room.x + room.width}
        y={room.y + room.height}
        radius={6}
        fill="#FFFFFF"
        stroke="#3B45B3"
        strokeWidth={2}
        draggable
        onDragStart={startResize}
        onDragMove={(e) => {
          const left = room.x
          const top = room.y
          const px = snapResizeHandle(e.target.x())
          const py = snapResizeHandle(e.target.y())
          const nextRight = Math.max(px, left + ROOM_MIN_SIZE_PX)
          const nextBottom = Math.max(py, top + ROOM_MIN_SIZE_PX)
          applyResize(e, {
            x: left,
            y: top,
            width: nextRight - left,
            height: nextBottom - top,
            fallbackX: room.x + room.width,
            fallbackY: room.y + room.height,
          })
        }}
        onDragEnd={(e) => endResize(e, room.x + room.width, room.y + room.height)}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}
      />
    </>
  )
}
