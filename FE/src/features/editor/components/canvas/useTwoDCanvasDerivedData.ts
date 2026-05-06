import { useMemo } from 'react'
import type { ConnectionData, FloorOpening, FloorRoom, FloorWall } from '../../types'
import { deriveAutoWallsFromRooms } from '../../utils/autoWalls'
import { computeDimensionGuides } from '../../utils/dimensionGuides'
import { findSharedWall } from '../../utils/floorPlanLayout'
import { validateFloorPlanInSiteBoundary } from '../../utils/siteBoundaryValidation'
import { getWallGeometryKey, shouldRemoveAsContainedOverlap } from '../../utils/wallGeometry'

interface UseTwoDCanvasDerivedDataParams {
  isGenerated: boolean
  rooms: FloorRoom[]
  openings: FloorOpening[]
  walls: FloorWall[]
  connections: ConnectionData[]
  sitePoints: number[]
  selectedWallId: string | null
}

/**
 * 2D 캔버스 파생 데이터(문/벽/검증/치수)를 모아 계산한다.
 * - 렌더 컴포넌트에는 계산 결과만 전달하고, 상세 계산은 훅 내부로 캡슐화한다.
 */
export function useTwoDCanvasDerivedData({
  isGenerated,
  rooms,
  openings,
  walls,
  connections,
  sitePoints,
  selectedWallId,
}: UseTwoDCanvasDerivedDataParams) {
  const doorList = useMemo(() => {
    if (!isGenerated || !rooms.length || !connections.length) return []
    const roomMap = new Map(rooms.map((r) => [r.id, r]))
    const processed = new Set<string>()
    const doors: ReturnType<typeof findSharedWall>[] = []

    for (const conn of connections) {
      const key = [conn.from, conn.to].sort().join('--')
      if (processed.has(key)) continue
      processed.add(key)
      const a = roomMap.get(conn.from)
      const b = roomMap.get(conn.to)
      if (!a || !b) continue
      const door = findSharedWall(a, b, key)
      if (door) doors.push(door)
    }
    return doors
  }, [isGenerated, rooms, connections])

  const fallbackDoorList = useMemo(() => {
    if (!doorList.length) return []
    const visibleWallIdSet = new Set(walls.map((wall) => wall.id))
    return doorList.filter((door) => {
      if (!door) return false
      const pair = door.key.split('--').sort()
      const sharedWallId = `auto-shared-${pair.join('-')}`
      const autoOpeningId = `auto-door-${pair.join('-')}`
      if (!visibleWallIdSet.has(sharedWallId)) return false
      return !openings.some((opening) =>
        opening.type === 'door' &&
        (opening.wallId === sharedWallId || opening.id === autoOpeningId),
      )
    })
  }, [doorList, openings, walls])

  const autoRoomWalls = useMemo<FloorWall[]>(() => {
    if (!isGenerated || rooms.length === 0) return []
    return deriveAutoWallsFromRooms(rooms)
  }, [isGenerated, rooms])

  const openingTargetWalls = useMemo(() => {
    if (autoRoomWalls.length === 0) return walls
    const manualIds = new Set(walls.map((wall) => wall.id))
    const fallbackWalls = autoRoomWalls.filter((wall) => !manualIds.has(wall.id))
    return [...walls, ...fallbackWalls]
  }, [walls, autoRoomWalls])

  const wallById = useMemo(() => {
    const map = new Map<string, FloorWall>()
    for (const wall of openingTargetWalls) map.set(wall.id, wall)
    return map
  }, [openingTargetWalls])

  const openingById = useMemo(() => {
    const map = new Map<string, FloorOpening>()
    for (const opening of openings) map.set(opening.id, opening)
    return map
  }, [openings])

  const dedupedRenderWalls = useMemo(() => {
    const byGeometry = new Map<string, FloorWall>()
    const isAutoWall = (wallId: string) =>
      wallId.startsWith('auto-room-') || wallId.startsWith('auto-shared-')

    walls.forEach((wall) => {
      const key = getWallGeometryKey(wall)
      const existing = byGeometry.get(key)
      if (!existing) {
        byGeometry.set(key, wall)
        return
      }
      if (isAutoWall(existing.id) && !isAutoWall(wall.id)) {
        byGeometry.set(key, wall)
      }
    })

    const uniqueWalls = Array.from(byGeometry.values())
    const hiddenWallIds = new Set<string>()

    const chooseWallToHide = (a: FloorWall, b: FloorWall): string | null => {
      const aContainedByB = shouldRemoveAsContainedOverlap(a, b)
      const bContainedByA = shouldRemoveAsContainedOverlap(b, a)
      if (!aContainedByB && !bContainedByA) return null

      const aIsAuto = isAutoWall(a.id)
      const bIsAuto = isAutoWall(b.id)

      if (aContainedByB && !aIsAuto && bIsAuto) return b.id
      if (bContainedByA && !bIsAuto && aIsAuto) return a.id
      if (aContainedByB && aIsAuto && !bIsAuto) return a.id
      if (bContainedByA && bIsAuto && !aIsAuto) return b.id
      if (aContainedByB) return a.id
      if (bContainedByA) return b.id
      return null
    }

    for (let i = 0; i < uniqueWalls.length; i += 1) {
      const base = uniqueWalls[i]
      if (!base || hiddenWallIds.has(base.id)) continue
      for (let j = i + 1; j < uniqueWalls.length; j += 1) {
        const candidate = uniqueWalls[j]
        if (!candidate || hiddenWallIds.has(candidate.id)) continue
        const hideId = chooseWallToHide(base, candidate)
        if (!hideId) continue
        hiddenWallIds.add(hideId)
      }
    }

    return uniqueWalls.filter((wall) => !hiddenWallIds.has(wall.id))
  }, [walls])

  const siteValidation = useMemo(() => {
    return validateFloorPlanInSiteBoundary(sitePoints, rooms, dedupedRenderWalls, openings)
  }, [sitePoints, rooms, dedupedRenderWalls, openings])

  const dimensionGuides = useMemo(
    () => computeDimensionGuides({ isGenerated, rooms, walls: dedupedRenderWalls }),
    [isGenerated, rooms, dedupedRenderWalls],
  )

  const selectedWallGeometryKey = useMemo(() => {
    if (!selectedWallId) return null
    const selectedWall = walls.find((wall) => wall.id === selectedWallId)
    if (!selectedWall) return null
    return getWallGeometryKey(selectedWall)
  }, [selectedWallId, walls])

  return {
    fallbackDoorList,
    openingTargetWalls,
    wallById,
    openingById,
    dedupedRenderWalls,
    siteValidation,
    dimensionGuides,
    selectedWallGeometryKey,
  }
}
