import { FLOOR_MM_PER_PX } from '../../constants'
import type { FloorOpening, FloorRoom, FloorWall, Point2D } from '../../types'
import { hexToRgba } from '../../utils/bubbleCalc'
import type { AxisAlignedRect } from '../../utils/geometry2d'

const OPENING_MIN_PX = 16
const ROOM_ADJACENT_SNAP_DISTANCE = 14
const ROOM_EDGE_ALIGN_SNAP_DISTANCE = 14

export const ROOM_POLYGON_MIN_VERTEX_COUNT = 3

/** 단일 좌표값을 그리드에 스냅한다. */
export function snapCoordinate(value: number, enabled: boolean, gridSizePx: number): number {
  if (!enabled) return value
  const step = Math.max(gridSizePx, 0.1)
  return Math.round(value / step) * step
}

/** 2D 포인트를 그리드에 스냅한다. */
export function snapToGrid(point: Point2D, gridSizePx: number): Point2D {
  return {
    x: snapCoordinate(point.x, true, gridSizePx),
    y: snapCoordinate(point.y, true, gridSizePx),
  }
}

/** 실제 두께(mm)를 캔버스 선 두께(px)로 변환한다. */
export function wallThicknessMmToPx(thicknessMm: number): number {
  return Math.min(Math.max(Math.round(thicknessMm / (FLOOR_MM_PER_PX * 1.4)), 2), 90)
}

/** 개구부 폭(mm)을 화면 표시용 폭(px)로 변환한다. */
export function openingWidthMmToPx(widthMm: number): number {
  return Math.max(Math.round(widthMm / FLOOR_MM_PER_PX), OPENING_MIN_PX)
}

/** 벽 선분의 t(0~1) 위치 좌표를 반환한다. */
export function getWallPointAtPosition(wall: FloorWall, t: number): Point2D {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  }
}

/** 점을 벽 선분에 투영한 정규화 위치 t(0~1)를 계산한다. */
export function getProjectedWallPosition(point: Point2D, wall: FloorWall): number {
  const vx = wall.end.x - wall.start.x
  const vy = wall.end.y - wall.start.y
  const lenSq = vx * vx + vy * vy
  if (lenSq <= 0) return 0
  const wx = point.x - wall.start.x
  const wy = point.y - wall.start.y
  return Math.min(Math.max((wx * vx + wy * vy) / lenSq, 0), 1)
}

/** 점과 선분 사이 최단 거리를 계산한다. */
export function distancePointToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const vx = end.x - start.x
  const vy = end.y - start.y
  const lenSq = vx * vx + vy * vy
  if (lenSq <= 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const wx = point.x - start.x
  const wy = point.y - start.y
  const t = Math.min(Math.max((wx * vx + wy * vy) / lenSq, 0), 1)
  const px = start.x + vx * t
  const py = start.y + vy * t
  return Math.hypot(point.x - px, point.y - py)
}

export interface OpeningSnapResult {
  wallPosition: number
  guidePosition: number | null
}

interface GetSnappedOpeningWallPositionParams {
  rawWallPosition: number
  wall: FloorWall
  movingOpeningId: string | null
  movingWidthMm: number
  openings: FloorOpening[]
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  snapThreshold: number
  openingMinClearanceMm: number
}

/**
 * 개구부 벽 위치 스냅을 계산한다.
 * 우선순위: 벽 끝점 -> 중앙 -> 동일 벽 개구부 중심 -> 최소 간격 후보
 */
export function getSnappedOpeningWallPosition({
  rawWallPosition,
  wall,
  movingOpeningId,
  movingWidthMm,
  openings,
  isGridSnapEnabled,
  gridSnapStepPx,
  snapThreshold,
  openingMinClearanceMm,
}: GetSnappedOpeningWallPositionParams): OpeningSnapResult {
  const wallLengthPx = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
  const wallLengthMm = Math.max(wallLengthPx * FLOOR_MM_PER_PX, 1)
  let value = Math.min(Math.max(rawWallPosition, 0), 1)
  if (isGridSnapEnabled) {
    const ratioStep = Math.min(Math.max(gridSnapStepPx / Math.max(wallLengthPx, 1), 0.005), 0.25)
    value = Math.round(value / ratioStep) * ratioStep
  }

  const endpointCandidates = [0, 1]
  const centerCandidates = [0.5]
  const siblingCenterCandidates: number[] = []
  const spacingCandidates: number[] = []

  const siblings = openings.filter((opening) => opening.wallId === wall.id && opening.id !== movingOpeningId)
  for (const sibling of siblings) {
    siblingCenterCandidates.push(sibling.wallPosition)
    const minCenterGapMm = (movingWidthMm + sibling.widthMm) / 2 + openingMinClearanceMm
    const gapRatio = minCenterGapMm / wallLengthMm
    spacingCandidates.push(Math.min(Math.max(sibling.wallPosition - gapRatio, 0), 1))
    spacingCandidates.push(Math.min(Math.max(sibling.wallPosition + gapRatio, 0), 1))
  }

  const findBestCandidate = (candidates: number[]): { candidate: number; diff: number } | null => {
    const unique = Array.from(new Set(candidates))
    let bestCandidate: number | null = null
    let bestDiff = Number.POSITIVE_INFINITY
    unique.forEach((candidate) => {
      const diff = Math.abs(candidate - value)
      if (diff < bestDiff) {
        bestDiff = diff
        bestCandidate = candidate
      }
    })
    if (bestCandidate === null) return null
    return { candidate: bestCandidate, diff: bestDiff }
  }

  const candidateGroups = [endpointCandidates, centerCandidates, siblingCenterCandidates, spacingCandidates]
  for (const group of candidateGroups) {
    const best = findBestCandidate(group)
    if (!best) continue
    if (best.diff <= snapThreshold) {
      value = best.candidate
      return { wallPosition: value, guidePosition: best.candidate }
    }
  }

  return { wallPosition: value, guidePosition: null }
}

/**
 * 개구부 드래그 시 포인터와 가장 가까운 벽을 찾는다.
 * 히트 임계값 안에서 가장 가까운 벽을 우선하고, 없으면 기존 벽 ID로 폴백한다.
 */
export function findNearestWallForOpeningDrag(
  point: Point2D,
  fallbackWallId: string,
  walls: FloorWall[],
  wallById: Map<string, FloorWall>,
): FloorWall | null {
  let nearest: FloorWall | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  walls.forEach((wall) => {
    const distance = distancePointToSegment(point, wall.start, wall.end)
    const hitThreshold = Math.max(14, wallThicknessMmToPx(wall.thickness) + 6)
    if (distance <= hitThreshold && distance < nearestDistance) {
      nearest = wall
      nearestDistance = distance
    }
  })

  if (nearest) return nearest
  return wallById.get(fallbackWallId) ?? null
}

/** 두 사각형의 겹침 여부를 검사한다. */
export function rectsOverlap(a: AxisAlignedRect, b: AxisAlignedRect, padding = 0): boolean {
  return (
    a.x + padding < b.x + b.width &&
    a.x + a.width > b.x + padding &&
    a.y + padding < b.y + b.height &&
    a.y + a.height > b.y + padding
  )
}

/** 1차원 구간 겹침 여부를 검사한다. */
export function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return minA < maxB && maxA > minB
}

/**
 * 방 이동 시 인접 방과의 가장자리 정렬/접합 스냅을 계산한다.
 * 수평/수직 인접 상태를 우선으로 하여 x/y 후보를 보정한다.
 */
export function getSnappedRoomPosition(
  roomBubbleId: string,
  rawX: number,
  rawY: number,
  width: number,
  height: number,
  rooms: FloorRoom[],
): Point2D {
  let snappedX = rawX
  let snappedY = rawY
  let bestXDistance = ROOM_ADJACENT_SNAP_DISTANCE + 1
  let bestYDistance = ROOM_ADJACENT_SNAP_DISTANCE + 1

  const rawLeft = rawX
  const rawRight = rawX + width
  const rawTop = rawY
  const rawBottom = rawY + height

  for (const room of rooms) {
    if (room.bubbleId === roomBubbleId) continue
    const otherLeft = room.x
    const otherRight = room.x + room.width
    const otherTop = room.y
    const otherBottom = room.y + room.height

    if (rangesOverlap(rawTop, rawBottom, otherTop, otherBottom)) {
      const diffToOtherLeft = Math.abs(rawRight - otherLeft)
      if (diffToOtherLeft <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherLeft < bestXDistance) {
        bestXDistance = diffToOtherLeft
        snappedX = otherLeft - width
        const topDiff = Math.abs(rawTop - otherTop)
        const bottomDiff = Math.abs(rawBottom - otherBottom)
        if (topDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && topDiff <= bottomDiff) {
          snappedY = otherTop
        } else if (bottomDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedY = otherBottom - height
        }
      }

      const diffToOtherRight = Math.abs(rawLeft - otherRight)
      if (diffToOtherRight <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherRight < bestXDistance) {
        bestXDistance = diffToOtherRight
        snappedX = otherRight
        const topDiff = Math.abs(rawTop - otherTop)
        const bottomDiff = Math.abs(rawBottom - otherBottom)
        if (topDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && topDiff <= bottomDiff) {
          snappedY = otherTop
        } else if (bottomDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedY = otherBottom - height
        }
      }
    }

    if (rangesOverlap(rawLeft, rawRight, otherLeft, otherRight)) {
      const diffToOtherTop = Math.abs(rawBottom - otherTop)
      if (diffToOtherTop <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherTop < bestYDistance) {
        bestYDistance = diffToOtherTop
        snappedY = otherTop - height
        const leftDiff = Math.abs(rawLeft - otherLeft)
        const rightDiff = Math.abs(rawRight - otherRight)
        if (leftDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && leftDiff <= rightDiff) {
          snappedX = otherLeft
        } else if (rightDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedX = otherRight - width
        }
      }

      const diffToOtherBottom = Math.abs(rawTop - otherBottom)
      if (diffToOtherBottom <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherBottom < bestYDistance) {
        bestYDistance = diffToOtherBottom
        snappedY = otherBottom
        const leftDiff = Math.abs(rawLeft - otherLeft)
        const rightDiff = Math.abs(rawRight - otherRight)
        if (leftDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && leftDiff <= rightDiff) {
          snappedX = otherLeft
        } else if (rightDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedX = otherRight - width
        }
      }
    }
  }

  return { x: snappedX, y: snappedY }
}

/** 흰색 계열 방은 연한 파란 계열로, 나머지는 원색 투명도로 채운다. */
export function getRoomFill(color: string): string {
  const normalized = color.trim().toUpperCase()
  if (normalized === '#FFFFFF' || normalized === '#FFF') return '#F0F4FF'
  return hexToRgba(color, 0.14)
}

export function toRectPolygonPoints(room: Pick<FloorRoom, 'x' | 'y' | 'width' | 'height'>): number[] {
  return [
    room.x, room.y,
    room.x + room.width, room.y,
    room.x + room.width, room.y + room.height,
    room.x, room.y + room.height,
  ]
}

export function toRectPolygon(room: Pick<FloorRoom, 'x' | 'y' | 'width' | 'height'>): Point2D[] {
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.width, y: room.y },
    { x: room.x + room.width, y: room.y + room.height },
    { x: room.x, y: room.y + room.height },
  ]
}

export function toPolygonPoints(
  points?: Array<{ x: number; y: number } | [number, number]>,
): number[] | null {
  if (!points || points.length < 3) return null
  const flattened: number[] = []
  for (const point of points) {
    if (Array.isArray(point)) {
      const [x, y] = point
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      flattened.push(x, y)
      continue
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    flattened.push(point.x, point.y)
  }
  return flattened.length >= 6 ? flattened : null
}

export function toEditablePolygonPoints(
  points?: Array<{ x: number; y: number } | [number, number]>,
): Point2D[] | null {
  if (!points || points.length < ROOM_POLYGON_MIN_VERTEX_COUNT) return null
  const normalized: Point2D[] = []
  for (const point of points) {
    if (Array.isArray(point)) {
      const [x, y] = point
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      normalized.push({ x, y })
      continue
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    normalized.push({ x: point.x, y: point.y })
  }
  return normalized.length >= ROOM_POLYGON_MIN_VERTEX_COUNT ? normalized : null
}

type RoomContourDrawContext = {
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  arc: (
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    anticlockwise?: boolean,
  ) => void
  closePath: () => void
}

/** FloorRoom contour(선분/호)을 Konva Shape path로 렌더링한다. */
export function renderRoomContourPath(
  context: RoomContourDrawContext,
  contour: NonNullable<FloorRoom['contour']>,
) {
  if (contour.length === 0) return
  let hasStarted = false
  let currentX = 0
  let currentY = 0
  const epsilon = 0.001
  const degToRad = Math.PI / 180

  contour.forEach((segment) => {
    if (segment.type === 'line') {
      if (!hasStarted) {
        context.moveTo(segment.from.x, segment.from.y)
        hasStarted = true
      } else if (
        Math.abs(currentX - segment.from.x) > epsilon ||
        Math.abs(currentY - segment.from.y) > epsilon
      ) {
        context.lineTo(segment.from.x, segment.from.y)
      }
      context.lineTo(segment.to.x, segment.to.y)
      currentX = segment.to.x
      currentY = segment.to.y
      return
    }

    const startRad = segment.startAngleDeg * degToRad
    const endRad = segment.endAngleDeg * degToRad
    const arcStartX = segment.center.x + Math.cos(startRad) * segment.radius
    const arcStartY = segment.center.y + Math.sin(startRad) * segment.radius
    const arcEndX = segment.center.x + Math.cos(endRad) * segment.radius
    const arcEndY = segment.center.y + Math.sin(endRad) * segment.radius

    if (!hasStarted) {
      context.moveTo(arcStartX, arcStartY)
      hasStarted = true
    } else if (Math.abs(currentX - arcStartX) > epsilon || Math.abs(currentY - arcStartY) > epsilon) {
      context.lineTo(arcStartX, arcStartY)
    }

    context.arc(
      segment.center.x,
      segment.center.y,
      segment.radius,
      startRad,
      endRad,
      !(segment.clockwise ?? false),
    )
    currentX = arcEndX
    currentY = arcEndY
  })
}

/** FloorRoom transform 정보를 Konva Group transform props로 변환한다. */
export function getRoomTransformProps(room: FloorRoom) {
  if (!room.transform) {
    return {
      x: 0,
      y: 0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    }
  }

  const originX = room.transform.origin?.x ?? room.x + room.width / 2
  const originY = room.transform.origin?.y ?? room.y + room.height / 2
  const tx = room.transform.translationX ?? 0
  const ty = room.transform.translationY ?? 0
  return {
    x: originX + tx,
    y: originY + ty,
    offsetX: originX,
    offsetY: originY,
    rotation: room.transform.rotationDeg ?? 0,
    scaleX: room.transform.scaleX ?? 1,
    scaleY: room.transform.scaleY ?? 1,
  }
}
