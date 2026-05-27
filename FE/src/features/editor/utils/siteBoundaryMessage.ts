import type { BubbleData, FloorOpening, FloorRoom, FloorWall } from '../types'
import {
  validateBubblesInSiteBoundary,
  validateFloorPlanInSiteBoundary,
} from './siteBoundaryValidation'

interface BuildSiteBoundaryBlockReasonParams {
  sitePlanPoints: number[]
  floorRooms: FloorRoom[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
  bubbles: BubbleData[]
}

/**
 * 저장 차단 메시지를 구성한다.
 * - 실측(2D/3D) 데이터가 있으면 룸/벽/개구부 기준 우선
 * - 평면 데이터가 아직 없으면 버블 기준으로 임시 검증
 */
export function buildSiteBoundaryBlockReason({
  sitePlanPoints,
  floorRooms,
  floorWalls,
  floorOpenings,
  bubbles,
}: BuildSiteBoundaryBlockReasonParams): string | null {
  const floorPlanResult = validateFloorPlanInSiteBoundary(
    sitePlanPoints,
    floorRooms,
    floorWalls,
    floorOpenings,
  )
  if (floorPlanResult.hasSite && floorPlanResult.outsideCount > 0) {
    return `공간 ${floorPlanResult.outsideRoomIds.size}개 · 벽 ${floorPlanResult.outsideWallIds.size}개 · 개구부 ${floorPlanResult.outsideOpeningIds.size}개`
  }

  if (floorRooms.length === 0) {
    const bubbleResult = validateBubblesInSiteBoundary(sitePlanPoints, bubbles)
    if (bubbleResult.hasSite && bubbleResult.outsideCount > 0) {
      return `버블 ${bubbleResult.outsideBubbleIds.size}개`
    }
  }

  return null
}
