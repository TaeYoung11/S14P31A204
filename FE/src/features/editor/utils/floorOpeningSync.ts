import { FLOOR_MM_PER_PX, FLOOR_OPENING_PRESETS } from '../constants'
import type { ConnectionData, FloorOpening, FloorWall } from '../types'

function getWallLengthMm(wall: FloorWall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) * FLOOR_MM_PER_PX
}

/**
 * 개구부가 벽 밖으로 삐져나오지 않도록 자동 보정한다.
 * - 벽 길이보다 큰 폭은 벽 길이로 축소
 * - 중심 위치(wallPosition)는 폭의 절반을 고려해 벽 구간 안으로 클램프
 */
export function normalizeOpeningWithinWall(
  opening: FloorOpening,
  wall: FloorWall,
  options: { minWidthMm?: number; maxWidthMm?: number } = {},
): FloorOpening {
  const minWidthMm = options.minWidthMm ?? 1
  const maxWidthMm = options.maxWidthMm ?? 4000
  const wallLengthMm = getWallLengthMm(wall)
  if (!Number.isFinite(wallLengthMm) || wallLengthMm <= 0) {
    return {
      ...opening,
      wallPosition: Math.min(Math.max(opening.wallPosition, 0), 1),
    }
  }

  const maxWidthByWall = Math.max(Math.floor(wallLengthMm), minWidthMm)
  const nextWidth = Math.min(
    Math.max(Math.round(opening.widthMm), minWidthMm),
    Math.min(maxWidthMm, maxWidthByWall),
  )

  const halfRatio = Math.min((nextWidth / wallLengthMm) / 2, 0.5)
  const minPosition = halfRatio
  const maxPosition = 1 - halfRatio
  const nextPosition = Math.min(Math.max(opening.wallPosition, minPosition), maxPosition)

  return {
    ...opening,
    widthMm: nextWidth,
    wallPosition: nextPosition,
  }
}

/**
 * 연결선 정보를 기준으로 자동 문(개구부)을 파생한다.
 * 동일한 방 쌍은 한 번만 처리하며, shared auto-wall 기준으로 문을 생성한다.
 */
export function deriveAutoOpeningsFromConnections(
  connections: ConnectionData[],
  autoWalls: FloorWall[],
  options: { minWidthMm?: number; maxWidthMm?: number } = {},
): FloorOpening[] {
  if (connections.length === 0 || autoWalls.length === 0) return []
  const autoWallById = new Map(autoWalls.map((wall) => [wall.id, wall] as const))
  const openings: FloorOpening[] = []
  const visited = new Set<string>()

  connections.forEach((connection) => {
    const pair = [connection.from, connection.to].sort()
    const pairKey = pair.join('::')
    if (visited.has(pairKey)) return
    visited.add(pairKey)
    const wallId = `auto-shared-${pair.join('-')}`
    const wall = autoWallById.get(wallId)
    if (!wall) return

    const opening = normalizeOpeningWithinWall(
      {
        id: `auto-door-${pair.join('-')}`,
        type: 'door',
        wallId,
        wallPosition: 0.5,
        widthMm: FLOOR_OPENING_PRESETS.door.widthMm,
        heightMm: FLOOR_OPENING_PRESETS.door.heightMm,
        doorHingeSide: 'left',
        doorSwingDirection: 'inward',
      },
      wall,
      options,
    )
    openings.push(opening)
  })

  return openings
}
