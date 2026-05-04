import type { FloorRoom, Point2D } from '../types'
import { insetRect, lineIntersectsRect } from './geometry2d'

interface CreateWallCollisionParams {
  floorRooms: FloorRoom[]
  prevStart: Point2D
  prevEnd: Point2D
  nextStart: Point2D
  nextEnd: Point2D
  insetPx: number
}

/** 벽 선분이 방 내부(inset 영역)와 교차하는 방 id 목록 */
export function getIntersectingFloorRoomIds(
  floorRooms: FloorRoom[],
  start: Point2D,
  end: Point2D,
  insetPx: number,
): Set<string> {
  const intersectingIds = new Set<string>()
  floorRooms.forEach((room) => {
    const innerRect = insetRect(
      {
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
      },
      insetPx,
    )
    if (!innerRect) return
    if (lineIntersectsRect(start, end, innerRect)) {
      intersectingIds.add(room.id)
    }
  })
  return intersectingIds
}

/** 벽 이동/끝점 편집이 방 내부 충돌을 새로 만들면 true */
export function createsNewWallRoomCollision({
  floorRooms,
  prevStart,
  prevEnd,
  nextStart,
  nextEnd,
  insetPx,
}: CreateWallCollisionParams): boolean {
  const prevCollisions = getIntersectingFloorRoomIds(floorRooms, prevStart, prevEnd, insetPx)
  const nextCollisions = getIntersectingFloorRoomIds(floorRooms, nextStart, nextEnd, insetPx)
  return Array.from(nextCollisions).some((roomId) => !prevCollisions.has(roomId))
}
