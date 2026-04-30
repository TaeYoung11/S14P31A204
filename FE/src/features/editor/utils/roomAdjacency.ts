import type { FloorRoom } from '../types'

interface RoomAdjacencyOptions {
  tolerancePx?: number
  minOverlapPx?: number
}

export function toConnectionKey(from: string, to: string): string {
  return [from, to].sort().join('::')
}

/** 두 Room이 변을 공유하는 인접 관계인지 검사한다. */
export function roomsTouchEachOther(a: FloorRoom, b: FloorRoom, options: RoomAdjacencyOptions = {}): boolean {
  const tolerancePx = options.tolerancePx ?? 2
  const minOverlapPx = options.minOverlapPx ?? 8

  const aLeft = a.x
  const aRight = a.x + a.width
  const aTop = a.y
  const aBottom = a.y + a.height
  const bLeft = b.x
  const bRight = b.x + b.width
  const bTop = b.y
  const bBottom = b.y + b.height

  const verticalOverlap = Math.min(aBottom, bBottom) - Math.max(aTop, bTop)
  if (
    verticalOverlap >= minOverlapPx &&
    (Math.abs(aRight - bLeft) <= tolerancePx || Math.abs(bRight - aLeft) <= tolerancePx)
  ) {
    return true
  }

  const horizontalOverlap = Math.min(aRight, bRight) - Math.max(aLeft, bLeft)
  if (
    horizontalOverlap >= minOverlapPx &&
    (Math.abs(aBottom - bTop) <= tolerancePx || Math.abs(bBottom - aTop) <= tolerancePx)
  ) {
    return true
  }

  return false
}

/** Room 배치로부터 버블 연결(인접 관계) 쌍을 파생한다. */
export function deriveConnectionsFromRooms(
  rooms: FloorRoom[],
  options: RoomAdjacencyOptions = {},
): Array<{ from: string; to: string }> {
  const pairs: Array<{ from: string; to: string }> = []
  const seen = new Set<string>()

  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const first = rooms[i]
      const second = rooms[j]
      if (!first || !second) continue
      if (!roomsTouchEachOther(first, second, options)) continue

      const from = first.bubbleId
      const to = second.bubbleId
      if (!from || !to || from === to) continue

      const key = toConnectionKey(from, to)
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ from, to })
    }
  }

  return pairs
}
