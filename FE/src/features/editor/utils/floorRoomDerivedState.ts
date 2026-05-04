import type { FloorRoom } from '../types'
import { calcAreaM2FromMm } from './bubbleCalc'
import type { AxisAlignedRect } from './geometry2d'
import { toRectFloorRoom, translateFloorRoom } from './floorRoomTransform'

interface BuildResizedFloorRoomsParams {
  floorRooms: FloorRoom[]
  bubbleId: string
  x: number
  y: number
  widthPx: number
  heightPx: number
  mmPerPx: number
  minSizePx?: number
  minSizeMm?: number
}

export interface ResizedFloorRoomsState {
  nextRooms: FloorRoom[]
  prevRect: AxisAlignedRect
  nextRect: AxisAlignedRect
  nextWidthPx: number
  nextHeightPx: number
  nextWidthMm: number
  nextHeightMm: number
  nextAreaM2: number
}

export function buildResizedFloorRoomsState({
  floorRooms,
  bubbleId,
  x,
  y,
  widthPx,
  heightPx,
  mmPerPx,
  minSizePx = 40,
  minSizeMm = 100,
}: BuildResizedFloorRoomsParams): ResizedFloorRoomsState | null {
  const targetRoom = floorRooms.find((room) => room.bubbleId === bubbleId)
  if (!targetRoom) return null

  const nextWidthPx = Math.max(widthPx, minSizePx)
  const nextHeightPx = Math.max(heightPx, minSizePx)
  const nextWidthMm = Math.max(Math.round(nextWidthPx * mmPerPx), minSizeMm)
  const nextHeightMm = Math.max(Math.round(nextHeightPx * mmPerPx), minSizeMm)
  const nextAreaM2 = calcAreaM2FromMm(nextWidthMm, nextHeightMm)

  const prevRect: AxisAlignedRect = {
    x: targetRoom.x,
    y: targetRoom.y,
    width: targetRoom.width,
    height: targetRoom.height,
  }
  const nextRect: AxisAlignedRect = { x, y, width: nextWidthPx, height: nextHeightPx }

  const nextRooms = floorRooms.map((room) =>
    room.bubbleId === bubbleId
      ? toRectFloorRoom(room, {
          x,
          y,
          width: nextWidthPx,
          height: nextHeightPx,
          widthMm: nextWidthMm,
          heightMm: nextHeightMm,
          area: nextAreaM2,
        })
      : room,
  )

  return {
    nextRooms,
    prevRect,
    nextRect,
    nextWidthPx,
    nextHeightPx,
    nextWidthMm,
    nextHeightMm,
    nextAreaM2,
  }
}

interface BuildMovedFloorRoomsParams {
  floorRooms: FloorRoom[]
  bubbleId: string
  nextX: number
  nextY: number
  selectedBubbleIds: string[]
}

export interface MovedFloorRoomsState {
  nextRooms: FloorRoom[]
  shouldMoveMulti: boolean
}

export function buildMovedFloorRoomsState({
  floorRooms,
  bubbleId,
  nextX,
  nextY,
  selectedBubbleIds,
}: BuildMovedFloorRoomsParams): MovedFloorRoomsState | null {
  const targetRoom = floorRooms.find((room) => room.bubbleId === bubbleId)
  if (!targetRoom) return null

  const selectedSet = new Set(selectedBubbleIds)
  const shouldMoveMulti = selectedSet.size > 1 && selectedSet.has(bubbleId)
  const dx = nextX - targetRoom.x
  const dy = nextY - targetRoom.y

  const nextRooms = floorRooms.map((room) => {
    if (shouldMoveMulti && selectedSet.has(room.bubbleId)) {
      return translateFloorRoom(room, dx, dy)
    }
    if (!shouldMoveMulti && room.bubbleId === bubbleId) {
      return translateFloorRoom(room, dx, dy, { x: nextX, y: nextY })
    }
    return room
  })

  return { nextRooms, shouldMoveMulti }
}
