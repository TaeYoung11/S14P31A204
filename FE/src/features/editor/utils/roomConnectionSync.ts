import type { ConnectionData, FloorRoom } from '../types'
import { deriveConnectionsFromRooms, toConnectionKey } from './roomAdjacency'

function hasSameConnections(prev: ConnectionData[], next: ConnectionData[]): boolean {
  if (prev.length !== next.length) return false
  const sortByKey = (list: ConnectionData[]) =>
    [...list].sort((a, b) => toConnectionKey(a.from, a.to).localeCompare(toConnectionKey(b.from, b.to)))
  const prevSorted = sortByKey(prev)
  const nextSorted = sortByKey(next)
  return !prevSorted.some((connection, index) => {
    const target = nextSorted[index]
    if (!target) return true
    return connection.from !== target.from || connection.to !== target.to || connection.type !== target.type
  })
}

/**
 * Room 배치 기준으로 연결선을 재계산한다.
 * - Room 외부 연결선은 보존
 * - Room 내부 연결선은 인접성으로 재생성
 * - 변경점이 없으면 null 반환
 */
export function buildSyncedConnectionsFromRooms(
  currentConnections: ConnectionData[],
  nextRooms: FloorRoom[],
): ConnectionData[] | null {
  const roomBubbleIds = new Set(nextRooms.map((room) => room.bubbleId))
  const derivedPairs = deriveConnectionsFromRooms(nextRooms)
  const connectionByKey = new Map(
    currentConnections.map((connection) => [toConnectionKey(connection.from, connection.to), connection] as const),
  )
  const derivedConnections: ConnectionData[] = derivedPairs.map(({ from, to }) => {
    const existing = connectionByKey.get(toConnectionKey(from, to))
    return existing ?? { from, to, type: 'thin' }
  })
  const preservedConnections = currentConnections.filter(
    (connection) => !roomBubbleIds.has(connection.from) || !roomBubbleIds.has(connection.to),
  )
  const nextConnections = [...preservedConnections, ...derivedConnections]
  if (hasSameConnections(currentConnections, nextConnections)) return null
  return nextConnections
}
