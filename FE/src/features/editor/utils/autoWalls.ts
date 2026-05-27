import type { FloorRoom, FloorWall, Point2D } from '../types'
import { FLOOR_WALL_PRESETS } from '../constants'

interface RoomEdgeSeed {
  roomBubbleId: string
  side: string
}

interface AxisEdgeSeed extends RoomEdgeSeed {
  axis: 'horizontal' | 'vertical'
  fixed: number
  from: number
  to: number
}

interface FreeEdgeSeed extends RoomEdgeSeed {
  axis: 'free'
  start: Point2D
  end: Point2D
}

interface DerivedSegment {
  start: Point2D
  end: Point2D
  roomIds: string[]
  owner?: { roomBubbleId: string; side: string }
}

interface DeriveAutoWallsOptions {
  minSegmentPx?: number
}

function roundCoord(value: number, precision = 1000): number {
  return Math.round(value * precision) / precision
}

function sortSegments(a: DerivedSegment, b: DerivedSegment): number {
  const aMinX = Math.min(a.start.x, a.end.x)
  const bMinX = Math.min(b.start.x, b.end.x)
  if (aMinX !== bMinX) return aMinX - bMinX
  const aMinY = Math.min(a.start.y, a.end.y)
  const bMinY = Math.min(b.start.y, b.end.y)
  if (aMinY !== bMinY) return aMinY - bMinY
  const aMaxX = Math.max(a.start.x, a.end.x)
  const bMaxX = Math.max(b.start.x, b.end.x)
  if (aMaxX !== bMaxX) return aMaxX - bMaxX
  const aMaxY = Math.max(a.start.y, a.end.y)
  const bMaxY = Math.max(b.start.y, b.end.y)
  return aMaxY - bMaxY
}

function getSegmentLength(segment: DerivedSegment): number {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
}

function toRectVertices(room: FloorRoom): Point2D[] {
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.width, y: room.y },
    { x: room.x + room.width, y: room.y + room.height },
    { x: room.x, y: room.y + room.height },
  ]
}

function getRoomVertices(room: FloorRoom): { vertices: Point2D[]; isRectFallback: boolean } {
  if (!room.polygon || room.polygon.length < 3) {
    return { vertices: toRectVertices(room), isRectFallback: true }
  }
  const vertices = room.polygon
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }))
  if (vertices.length < 3) {
    return { vertices: toRectVertices(room), isRectFallback: true }
  }
  return { vertices, isRectFallback: false }
}

function getRectSideLabel(index: number): 'top' | 'right' | 'bottom' | 'left' {
  if (index === 0) return 'top'
  if (index === 1) return 'right'
  if (index === 2) return 'bottom'
  return 'left'
}

/**
 * Room 외곽/공유 경계를 자동 벽 목록으로 변환한다.
 * - 공유 경계는 partition
 * - 단일 소유 경계는 exterior
 * - 부분 겹침 구간은 분할 후 중복 없이 생성한다.
 */
export function deriveAutoWallsFromRooms(
  rooms: FloorRoom[],
  options: DeriveAutoWallsOptions = {},
): FloorWall[] {
  if (rooms.length === 0) return []

  const ORTHOGONAL_EPSILON = 0.001
  const EDGE_EPSILON = 0.5
  const minSegment = Math.max(options.minSegmentPx ?? 4, 1)

  const normalizeRange = (a: number, b: number) => (a <= b ? { from: a, to: b } : { from: b, to: a })
  const toEdgeGroupKey = (axis: AxisEdgeSeed['axis'], fixed: number) =>
    `${axis}:${roundCoord(fixed)}`

  const axisEdgeGroups = new Map<string, AxisEdgeSeed[]>()
  const freeEdgeGroups = new Map<string, FreeEdgeSeed[]>()
  const pushEdge = (
    roomBubbleId: string,
    side: string,
    start: Point2D,
    end: Point2D,
  ) => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    if (Math.hypot(dx, dy) < EDGE_EPSILON) return

    if (Math.abs(dy) <= ORTHOGONAL_EPSILON) {
      const fixed = roundCoord((start.y + end.y) / 2)
      const range = normalizeRange(start.x, end.x)
      if (range.to - range.from <= EDGE_EPSILON) return
      const key = toEdgeGroupKey('horizontal', fixed)
      const edge: AxisEdgeSeed = {
        axis: 'horizontal',
        fixed,
        from: range.from,
        to: range.to,
        roomBubbleId,
        side,
      }
      const list = axisEdgeGroups.get(key)
      if (list) list.push(edge)
      else axisEdgeGroups.set(key, [edge])
      return
    }

    if (Math.abs(dx) <= ORTHOGONAL_EPSILON) {
      const fixed = roundCoord((start.x + end.x) / 2)
      const range = normalizeRange(start.y, end.y)
      if (range.to - range.from <= EDGE_EPSILON) return
      const key = toEdgeGroupKey('vertical', fixed)
      const edge: AxisEdgeSeed = {
        axis: 'vertical',
        fixed,
        from: range.from,
        to: range.to,
        roomBubbleId,
        side,
      }
      const list = axisEdgeGroups.get(key)
      if (list) list.push(edge)
      else axisEdgeGroups.set(key, [edge])
      return
    }

    const rs = { x: roundCoord(start.x), y: roundCoord(start.y) }
    const re = { x: roundCoord(end.x), y: roundCoord(end.y) }
    const forward = `${rs.x},${rs.y}`
    const backward = `${re.x},${re.y}`
    const key = forward <= backward ? `${forward}|${backward}` : `${backward}|${forward}`
    const edge: FreeEdgeSeed = {
      axis: 'free',
      roomBubbleId,
      side,
      start: rs,
      end: re,
    }
    const list = freeEdgeGroups.get(key)
    if (list) list.push(edge)
    else freeEdgeGroups.set(key, [edge])
  }

  rooms.forEach((room) => {
    const { vertices, isRectFallback } = getRoomVertices(room)
    for (let index = 0; index < vertices.length; index += 1) {
      const start = vertices[index]
      const end = vertices[(index + 1) % vertices.length]
      const side = isRectFallback
        ? getRectSideLabel(index)
        : `edge-${index + 1}`
      pushEdge(room.bubbleId, side, start, end)
    }
  })

  const sharedSegments: DerivedSegment[] = []
  const exteriorSegments: DerivedSegment[] = []

  axisEdgeGroups.forEach((edges) => {
    if (edges.length === 0) return
    const breakpoints = Array.from(new Set(edges.flatMap((edge) => [edge.from, edge.to]))).sort((a, b) => a - b)
    if (breakpoints.length < 2) return

    for (let i = 0; i < breakpoints.length - 1; i += 1) {
      const from = breakpoints[i]
      const to = breakpoints[i + 1]
      if (to - from < minSegment) continue

      const covering = edges.filter((edge) => edge.from < to - ORTHOGONAL_EPSILON && edge.to > from + ORTHOGONAL_EPSILON)
      if (covering.length === 0) continue

      const roomIds = Array.from(new Set(covering.map((edge) => edge.roomBubbleId))).sort()
      const axis = edges[0].axis
      const fixed = edges[0].fixed
      const start = axis === 'horizontal'
        ? { x: from, y: fixed }
        : { x: fixed, y: from }
      const end = axis === 'horizontal'
        ? { x: to, y: fixed }
        : { x: fixed, y: to }

      if (roomIds.length >= 2) {
        sharedSegments.push({ start, end, roomIds })
      } else {
        const owner = covering[0]
        exteriorSegments.push({
          start,
          end,
          roomIds,
          owner: owner ? { roomBubbleId: owner.roomBubbleId, side: owner.side } : undefined,
        })
      }
    }
  })

  freeEdgeGroups.forEach((edges) => {
    if (edges.length === 0) return
    const roomIds = Array.from(new Set(edges.map((edge) => edge.roomBubbleId))).sort()
    const base = edges[0]
    if (!base) return
    if (roomIds.length >= 2) {
      sharedSegments.push({
        start: base.start,
        end: base.end,
        roomIds,
      })
      return
    }
    exteriorSegments.push({
      start: base.start,
      end: base.end,
      roomIds,
      owner: { roomBubbleId: base.roomBubbleId, side: base.side },
    })
  })

  const walls: FloorWall[] = []
  const sharedByPair = new Map<string, DerivedSegment[]>()
  sharedSegments.forEach((segment) => {
    const pairKey = segment.roomIds.join('-')
    const list = sharedByPair.get(pairKey)
    if (list) list.push(segment)
    else sharedByPair.set(pairKey, [segment])
  })

  sharedByPair.forEach((segments, pairKey) => {
    const ordered = [...segments].sort(sortSegments)
    let primaryIndex = 0
    let primaryLength = -1
    ordered.forEach((segment, index) => {
      const length = getSegmentLength(segment)
      if (length > primaryLength) {
        primaryLength = length
        primaryIndex = index
      }
    })

    let suffix = 1
    ordered.forEach((segment, index) => {
      const id = index === primaryIndex ? `auto-shared-${pairKey}` : `auto-shared-${pairKey}-seg-${suffix++}`
      walls.push({
        id,
        start: segment.start,
        end: segment.end,
        type: 'partition',
        thickness: FLOOR_WALL_PRESETS.partition.thickness,
        heightMm: FLOOR_WALL_PRESETS.partition.heightMm,
      })
    })
  })

  const exteriorByOwner = new Map<string, DerivedSegment[]>()
  exteriorSegments.forEach((segment) => {
    const owner = segment.owner
    if (!owner) return
    const key = `${owner.roomBubbleId}::${owner.side}`
    const list = exteriorByOwner.get(key)
    if (list) list.push(segment)
    else exteriorByOwner.set(key, [segment])
  })

  exteriorByOwner.forEach((segments, ownerKey) => {
    const [roomBubbleId, side] = ownerKey.split('::')
    const ordered = [...segments].sort(sortSegments)
    let primaryIndex = 0
    let primaryLength = -1
    ordered.forEach((segment, index) => {
      const length = getSegmentLength(segment)
      if (length > primaryLength) {
        primaryLength = length
        primaryIndex = index
      }
    })

    let suffix = 1
    ordered.forEach((segment, index) => {
      const id = index === primaryIndex
        ? `auto-room-${roomBubbleId}-${side}`
        : `auto-room-${roomBubbleId}-${side}-seg-${suffix++}`
      walls.push({
        id,
        start: segment.start,
        end: segment.end,
        type: 'exterior',
        thickness: FLOOR_WALL_PRESETS.exterior.thickness,
        heightMm: FLOOR_WALL_PRESETS.exterior.heightMm,
      })
    })
  })

  return walls
}
