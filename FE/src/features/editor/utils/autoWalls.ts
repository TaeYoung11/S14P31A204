import type { FloorRoom, FloorWall, Point2D } from '../types'
import { FLOOR_WALL_PRESETS } from '../constants'

interface RoomEdgeSeed {
  axis: 'horizontal' | 'vertical'
  fixed: number
  from: number
  to: number
  roomBubbleId: string
  side: 'top' | 'right' | 'bottom' | 'left'
}

interface DerivedSegment {
  axis: RoomEdgeSeed['axis']
  fixed: number
  from: number
  to: number
  roomIds: string[]
  owner?: { roomBubbleId: string; side: RoomEdgeSeed['side'] }
}

interface DeriveAutoWallsOptions {
  minSegmentPx?: number
}

function toWallPoints(segment: DerivedSegment): { start: Point2D; end: Point2D } {
  if (segment.axis === 'horizontal') {
    return {
      start: { x: segment.from, y: segment.fixed },
      end: { x: segment.to, y: segment.fixed },
    }
  }
  return {
    start: { x: segment.fixed, y: segment.from },
    end: { x: segment.fixed, y: segment.to },
  }
}

function sortSegments(a: DerivedSegment, b: DerivedSegment): number {
  if (a.fixed !== b.fixed) return a.fixed - b.fixed
  return a.from - b.from
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

  const EDGE_FIXED_ROUND = 1000
  const EDGE_EPSILON = 0.001
  const minSegment = Math.max(options.minSegmentPx ?? 4, 1)

  const normalizeRange = (a: number, b: number) => (a <= b ? { from: a, to: b } : { from: b, to: a })
  const toEdgeGroupKey = (axis: RoomEdgeSeed['axis'], fixed: number) =>
    `${axis}:${Math.round(fixed * EDGE_FIXED_ROUND) / EDGE_FIXED_ROUND}`

  const edgeGroups = new Map<string, RoomEdgeSeed[]>()
  const pushEdge = (
    axis: RoomEdgeSeed['axis'],
    fixed: number,
    start: number,
    end: number,
    roomBubbleId: string,
    side: RoomEdgeSeed['side'],
  ) => {
    const range = normalizeRange(start, end)
    if (range.to - range.from <= EDGE_EPSILON) return
    const key = toEdgeGroupKey(axis, fixed)
    const edge: RoomEdgeSeed = {
      axis,
      fixed: Math.round(fixed * EDGE_FIXED_ROUND) / EDGE_FIXED_ROUND,
      from: range.from,
      to: range.to,
      roomBubbleId,
      side,
    }
    const list = edgeGroups.get(key)
    if (list) list.push(edge)
    else edgeGroups.set(key, [edge])
  }

  rooms.forEach((room) => {
    pushEdge('horizontal', room.y, room.x, room.x + room.width, room.bubbleId, 'top')
    pushEdge('horizontal', room.y + room.height, room.x, room.x + room.width, room.bubbleId, 'bottom')
    pushEdge('vertical', room.x, room.y, room.y + room.height, room.bubbleId, 'left')
    pushEdge('vertical', room.x + room.width, room.y, room.y + room.height, room.bubbleId, 'right')
  })

  const sharedSegments: DerivedSegment[] = []
  const exteriorSegments: DerivedSegment[] = []

  edgeGroups.forEach((edges) => {
    if (edges.length === 0) return
    const breakpoints = Array.from(new Set(edges.flatMap((edge) => [edge.from, edge.to]))).sort((a, b) => a - b)
    if (breakpoints.length < 2) return

    for (let i = 0; i < breakpoints.length - 1; i += 1) {
      const from = breakpoints[i]
      const to = breakpoints[i + 1]
      if (to - from < minSegment) continue

      const covering = edges.filter((edge) => edge.from < to - EDGE_EPSILON && edge.to > from + EDGE_EPSILON)
      if (covering.length === 0) continue

      const roomIds = Array.from(new Set(covering.map((edge) => edge.roomBubbleId))).sort()
      const axis = edges[0].axis
      const fixed = edges[0].fixed

      if (roomIds.length >= 2) {
        sharedSegments.push({ axis, fixed, from, to, roomIds })
      } else {
        const owner = covering[0]
        exteriorSegments.push({
          axis,
          fixed,
          from,
          to,
          roomIds,
          owner: owner ? { roomBubbleId: owner.roomBubbleId, side: owner.side } : undefined,
        })
      }
    }
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
      const length = segment.to - segment.from
      if (length > primaryLength) {
        primaryLength = length
        primaryIndex = index
      }
    })

    let suffix = 1
    ordered.forEach((segment, index) => {
      const { start, end } = toWallPoints(segment)
      const id = index === primaryIndex ? `auto-shared-${pairKey}` : `auto-shared-${pairKey}-seg-${suffix++}`
      walls.push({
        id,
        start,
        end,
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
      const length = segment.to - segment.from
      if (length > primaryLength) {
        primaryLength = length
        primaryIndex = index
      }
    })

    let suffix = 1
    ordered.forEach((segment, index) => {
      const { start, end } = toWallPoints(segment)
      const id = index === primaryIndex
        ? `auto-room-${roomBubbleId}-${side}`
        : `auto-room-${roomBubbleId}-${side}-seg-${suffix++}`
      walls.push({
        id,
        start,
        end,
        type: 'exterior',
        thickness: FLOOR_WALL_PRESETS.exterior.thickness,
        heightMm: FLOOR_WALL_PRESETS.exterior.heightMm,
      })
    })
  })

  return walls
}
