import type { FloorOpening, FloorRoom, FloorWall } from '../../types'
import { lineIntersectsRect, pointInRect, type AxisAlignedRect } from '../../utils/geometry2d'
import { getWallPointAtPosition } from './twoDCanvas.utils'

interface ComputeMarqueeSelectionParams {
  marquee: AxisAlignedRect
  rooms: FloorRoom[]
  walls: FloorWall[]
  openings: FloorOpening[]
  wallById: Map<string, FloorWall>
}

/**
 * 마퀴 사각형과 교차하는 Room/Wall/Opening ID를 계산한다.
 * - Room: AABB 교차
 * - Wall: 선분-사각형 교차
 * - Opening: 벽 기준 anchor point 포함 여부
 */
export function computeTwoDMarqueeSelection({
  marquee,
  rooms,
  walls,
  openings,
  wallById,
}: ComputeMarqueeSelectionParams): { roomIds: string[]; wallIds: string[]; openingIds: string[] } {
  const roomIds = rooms
    .filter((room) => {
      const roomRight = room.x + room.width
      const roomBottom = room.y + room.height
      const marqueeRight = marquee.x + marquee.width
      const marqueeBottom = marquee.y + marquee.height
      return room.x < marqueeRight && roomRight > marquee.x && room.y < marqueeBottom && roomBottom > marquee.y
    })
    .map((room) => room.bubbleId)

  const wallIds = walls
    .filter((wall) => lineIntersectsRect(wall.start, wall.end, marquee))
    .map((wall) => wall.id)

  const openingIds = openings
    .filter((opening) => {
      const wall = wallById.get(opening.wallId)
      if (!wall) return false
      const anchor = getWallPointAtPosition(wall, opening.wallPosition)
      return pointInRect(anchor, marquee)
    })
    .map((opening) => opening.id)

  return { roomIds, wallIds, openingIds }
}
