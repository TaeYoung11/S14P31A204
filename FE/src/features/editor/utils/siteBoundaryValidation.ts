import type { BubbleData, FloorOpening, FloorRoom, FloorWall, Point2D } from '../types'

interface Rect2D {
  x: number
  y: number
  width: number
  height: number
}

export interface BubbleSiteBoundaryValidation {
  hasSite: boolean
  outsideBubbleIds: Set<string>
  outsideCount: number
}

export interface FloorPlanSiteBoundaryValidation {
  hasSite: boolean
  outsideRoomIds: Set<string>
  outsideWallIds: Set<string>
  outsideOpeningIds: Set<string>
  outsideCount: number
}

export function toCanvasPolygon(points: number[]): Point2D[] {
  if (!Array.isArray(points) || points.length < 6) return []
  const polygon: Point2D[] = []
  for (let i = 0; i < points.length - 1; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    polygon.push({ x, y })
  }
  return polygon
}

export function isPointInsidePolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return true
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

export function isRectInsidePolygon(rect: Rect2D, polygon: Point2D[]): boolean {
  const corners: Point2D[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
  return corners.every((point) => isPointInsidePolygon(point, polygon))
}

function getWallPointAtPosition(wall: FloorWall, wallPosition: number): Point2D {
  const t = Math.min(Math.max(wallPosition, 0), 1)
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  }
}

export function validateBubblesInSiteBoundary(
  sitePoints: number[],
  bubbles: BubbleData[],
): BubbleSiteBoundaryValidation {
  const sitePolygon = toCanvasPolygon(sitePoints)
  const hasSite = sitePolygon.length >= 3
  const outsideBubbleIds = new Set<string>()

  if (hasSite) {
    bubbles.forEach((bubble) => {
      const samplePoints: Point2D[] = [
        { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 },
        { x: bubble.x + bubble.width / 2, y: bubble.y },
        { x: bubble.x + bubble.width, y: bubble.y + bubble.height / 2 },
        { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height },
        { x: bubble.x, y: bubble.y + bubble.height / 2 },
      ]
      if (samplePoints.some((point) => !isPointInsidePolygon(point, sitePolygon))) {
        outsideBubbleIds.add(bubble.id)
      }
    })
  }

  return {
    hasSite,
    outsideBubbleIds,
    outsideCount: outsideBubbleIds.size,
  }
}

export function validateFloorPlanInSiteBoundary(
  sitePoints: number[],
  rooms: FloorRoom[],
  walls: FloorWall[],
  openings: FloorOpening[],
): FloorPlanSiteBoundaryValidation {
  const sitePolygon = toCanvasPolygon(sitePoints)
  const hasSite = sitePolygon.length >= 3
  const outsideRoomIds = new Set<string>()
  const outsideWallIds = new Set<string>()
  const outsideOpeningIds = new Set<string>()

  if (hasSite) {
    rooms.forEach((room) => {
      const rect: Rect2D = {
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
      }

      let isInside = isRectInsidePolygon(rect, sitePolygon)
      if (isInside && room.polygon && room.polygon.length >= 3) {
        isInside = room.polygon.every((point) => isPointInsidePolygon(point, sitePolygon))
      }
      if (!isInside) outsideRoomIds.add(room.bubbleId)
    })

    walls.forEach((wall) => {
      if (!isPointInsidePolygon(wall.start, sitePolygon) || !isPointInsidePolygon(wall.end, sitePolygon)) {
        outsideWallIds.add(wall.id)
      }
    })

    const wallById = new Map(walls.map((wall) => [wall.id, wall] as const))
    openings.forEach((opening) => {
      const wall = wallById.get(opening.wallId)
      if (!wall) return
      const anchor = getWallPointAtPosition(wall, opening.wallPosition)
      if (!isPointInsidePolygon(anchor, sitePolygon)) {
        outsideOpeningIds.add(opening.id)
      }
    })
  }

  return {
    hasSite,
    outsideRoomIds,
    outsideWallIds,
    outsideOpeningIds,
    outsideCount: outsideRoomIds.size + outsideWallIds.size + outsideOpeningIds.size,
  }
}
