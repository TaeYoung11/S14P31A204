import { useCallback } from 'react'
import { FLOOR_OPENING_PRESETS } from '../../constants'
import type { FloorOpening, FloorWall, Point2D } from '../../types'
import type { DoorInfo } from '../../utils/floorPlanLayout'
import {
  distancePointToSegment,
  getProjectedWallPosition,
  getSnappedOpeningWallPosition,
} from './twoDCanvas.utils'
import type { OpeningSnapGuide } from './useOpeningSnapGuide'

interface UseOpeningActionsParams {
  isOpeningTool: boolean
  isDoorTool: boolean
  openings: FloorOpening[]
  openingTargetWalls: FloorWall[]
  wallById: Map<string, FloorWall>
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  openingCreateSnapThreshold: number
  openingMinClearanceMm: number
  onOpeningCreate?: (
    wallId: string,
    type: FloorOpening['type'],
    wallPosition: number,
    preferredId?: string,
  ) => void
  setOpeningSnapGuide: (value: OpeningSnapGuide | null) => void
  showTemporaryOpeningSnapGuide: (guide: OpeningSnapGuide, durationMs?: number) => void
}

/**
 * 개구부 생성/승격 액션을 캡슐화한다.
 * - 캔버스는 액션 호출만 수행하고, 계산/검증은 훅 내부에 위임한다.
 */
export function useOpeningActions({
  isOpeningTool,
  isDoorTool,
  openings,
  openingTargetWalls,
  wallById,
  isGridSnapEnabled,
  gridSnapStepPx,
  openingCreateSnapThreshold,
  openingMinClearanceMm,
  onOpeningCreate,
  setOpeningSnapGuide,
  showTemporaryOpeningSnapGuide,
}: UseOpeningActionsParams) {
  const createOpeningOnWall = useCallback((wall: FloorWall, point: Point2D) => {
    if (!isOpeningTool) return
    const openingType: FloorOpening['type'] = isDoorTool ? 'door' : 'window'
    const wallPosition = getProjectedWallPosition(point, wall)
    const presetWidthMm = FLOOR_OPENING_PRESETS[openingType].widthMm
    const snapped = getSnappedOpeningWallPosition({
      rawWallPosition: wallPosition,
      wall,
      movingOpeningId: null,
      movingWidthMm: presetWidthMm,
      openings,
      isGridSnapEnabled,
      gridSnapStepPx,
      snapThreshold: openingCreateSnapThreshold,
      openingMinClearanceMm,
    })
    onOpeningCreate?.(wall.id, openingType, snapped.wallPosition)
    if (snapped.guidePosition !== null) {
      showTemporaryOpeningSnapGuide({ wallId: wall.id, wallPosition: snapped.guidePosition })
      return
    }
    setOpeningSnapGuide(null)
  }, [
    isOpeningTool,
    isDoorTool,
    openings,
    isGridSnapEnabled,
    gridSnapStepPx,
    openingCreateSnapThreshold,
    openingMinClearanceMm,
    onOpeningCreate,
    setOpeningSnapGuide,
    showTemporaryOpeningSnapGuide,
  ])

  /**
   * 연결 기반 보조 문을 실제 개구부 데이터로 승격한다.
   * Select에서 문 조작을 시작할 수 있도록 최소 보강한다.
   */
  const promoteFallbackDoorToOpening = useCallback((door: DoorInfo): string | null => {
    const pair = door.key.split('--').sort()
    const wallId = `auto-shared-${pair.join('-')}`
    const openingId = `auto-door-${pair.join('-')}`

    const anchor: Point2D | null =
      door.direction === 'vertical' && door.wallX !== undefined && door.doorCenterY !== undefined
        ? { x: door.wallX, y: door.doorCenterY }
        : door.direction === 'horizontal' && door.wallY !== undefined && door.doorCenterX !== undefined
          ? { x: door.doorCenterX, y: door.wallY }
          : null
    if (!anchor) return null

    let wall = wallById.get(wallId) ?? null
    if (!wall) {
      let nearest: FloorWall | null = null
      let nearestDistance = Number.POSITIVE_INFINITY
      openingTargetWalls.forEach((candidate) => {
        const distance = distancePointToSegment(anchor, candidate.start, candidate.end)
        if (distance < nearestDistance) {
          nearest = candidate
          nearestDistance = distance
        }
      })
      wall = nearestDistance <= 24 ? nearest : null
    }
    if (!wall) return null

    const wallPosition = getProjectedWallPosition(anchor, wall)
    onOpeningCreate?.(wall.id, 'door', wallPosition, openingId)
    return openingId
  }, [wallById, openingTargetWalls, onOpeningCreate])

  return {
    createOpeningOnWall,
    promoteFallbackDoorToOpening,
  }
}
