import type { BubbleData, BubbleFloorSummary } from '../types'
import { BUBBLE_FLOOR_POLICY, type BubbleFloorPolicy } from './floorPolicy'
import {
  compactBubbleFloorNumbers,
  normalizeBubbleFloor,
  normalizeBubbleFloorSet,
} from './bubbleFloorUtils'

export interface BubbleFloorDeleteComputationInput {
  floorToDelete: number
  bubbles: BubbleData[]
  extraBubbleFloors: number[]
}

export interface BubbleFloorDeleteComputationResult {
  floorBubbleIds: Set<string>
  nextBubbles: BubbleData[]
  remapFloor: (value: number | undefined) => number
}

/**
 * 층 번호 재정렬 시 사용할 floor remap map을 만든다.
 * - 기본 정책에서는 1층 이상만 사용한다.
 * - 지하층 허용 정책에서는 지상/지하 그룹을 분리해 순서를 재배치한다.
 * - 목표값은 같은 그룹 내 목표 층 번호(지하층은 절대값 기준 순서)로 해석한다.
 */
export function buildFloorRemapMapForRename(
  floorNumbers: number[],
  currentFloor: number,
  targetFloor: number,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): Map<number, number> | null {
  const floors = [...new Set(
    floorNumbers
      .map((value) => normalizeBubbleFloor(value, policy))
      .sort((left, right) => left - right),
  )]
  const normalizedCurrentFloor = normalizeBubbleFloor(currentFloor, policy)
  const normalizedTargetFloor = normalizeBubbleFloor(targetFloor, policy)
  const currentGroupSign = normalizedCurrentFloor < 0 ? -1 : 1
  const targetGroupSign = normalizedTargetFloor < 0 ? -1 : 1

  if (policy.allowBasement && currentGroupSign !== targetGroupSign) return null

  const groupFloors = floors
    .filter((value) => (value < 0 ? -1 : 1) === currentGroupSign)
    .sort((left, right) => (
      currentGroupSign < 0 ? right - left : left - right
    ))
  if (groupFloors.length === 0) return null

  const fromIndex = groupFloors.indexOf(normalizedCurrentFloor)
  if (fromIndex < 0) return null

  const targetRank = currentGroupSign < 0
    ? Math.abs(normalizedTargetFloor)
    : normalizedTargetFloor
  const clampedTargetRank = Math.max(1, Math.min(targetRank, groupFloors.length))
  const toIndex = clampedTargetRank - 1
  if (toIndex === fromIndex) return null

  const reorderedGroup = [...groupFloors]
  const [moved] = reorderedGroup.splice(fromIndex, 1)
  if (moved === undefined) return null
  reorderedGroup.splice(toIndex, 0, moved)

  const floorMap = new Map<number, number>()
  if (policy.allowBasement) {
    const positiveFloors = floors.filter((floor) => floor > 0).sort((left, right) => left - right)
    const negativeFloors = floors.filter((floor) => floor < 0).sort((left, right) => right - left)
    const nextPositiveOrder = currentGroupSign > 0 ? reorderedGroup : positiveFloors
    const nextNegativeOrder = currentGroupSign < 0 ? reorderedGroup : negativeFloors

    nextPositiveOrder.forEach((value, index) => {
      floorMap.set(value, index + 1)
    })
    nextNegativeOrder.forEach((value, index) => {
      floorMap.set(value, -(index + 1))
    })
  } else {
    const positiveOrder = reorderedGroup
    positiveOrder.forEach((value, index) => {
      floorMap.set(value, index + 1)
    })
  }

  return floorMap
}

/**
 * 층 삭제 후 버블 floor 번호를 연속 구간으로 압축하고, 삭제 대상 버블 ID를 함께 반환한다.
 */
export function computeBubbleStateAfterFloorDelete(
  input: BubbleFloorDeleteComputationInput,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): BubbleFloorDeleteComputationResult {
  const normalizedFloor = normalizeBubbleFloor(input.floorToDelete, policy)
  const floorBubbleIds = new Set(
    input.bubbles
      .filter((bubble) => normalizeBubbleFloor(bubble.floor, policy) === normalizedFloor)
      .map((bubble) => bubble.id),
  )

  const remainingBubbles = input.bubbles.filter((bubble) => !floorBubbleIds.has(bubble.id))
  const remainingFloorNumbers = [
    ...remainingBubbles.map((bubble) => normalizeBubbleFloor(bubble.floor, policy)),
    ...input.extraBubbleFloors
      .filter((value) => normalizeBubbleFloor(value, policy) !== normalizedFloor)
      .map((value) => normalizeBubbleFloor(value, policy)),
  ]
  if (remainingFloorNumbers.length === 0) remainingFloorNumbers.push(policy.fallbackFloor)

  const compactedFloorMap = compactBubbleFloorNumbers(remainingFloorNumbers, policy)
  const remapFloor = (value: number | undefined): number => {
    const normalizedValue = normalizeBubbleFloor(value, policy)
    return compactedFloorMap.get(normalizedValue) ?? normalizedValue
  }

  return {
    floorBubbleIds,
    nextBubbles: remainingBubbles.map((bubble) => ({
      ...bubble,
      floor: remapFloor(bubble.floor),
    })),
    remapFloor,
  }
}

/**
 * 현재 층 목록/활성층을 기준으로 새 층 번호를 계산한다.
 * - 기본 정책: 1층부터 시작하는 최소 미사용 양수 번호를 사용한다.
 * - 지하층 허용 정책: 활성층이 지하층이면 다음 지하층(Bn+1)을 우선 배정한다.
 */
export function getNextBubbleFloorToAdd(
  floorNumbers: number[],
  activeFloor: number,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): number {
  const normalizedFloors = normalizeBubbleFloorSet(floorNumbers, policy)
  const normalizedActiveFloor = normalizeBubbleFloor(activeFloor, policy)
  const positiveFloors = normalizedFloors.filter((floor) => floor >= policy.minAboveGroundFloor)
  const used = new Set(positiveFloors)

  if (policy.allowBasement && normalizedActiveFloor < 0) {
    let candidate = normalizedActiveFloor - 1
    const allUsed = new Set(normalizedFloors)
    while (allUsed.has(candidate)) candidate -= 1
    return candidate
  }

  let candidate = policy.minAboveGroundFloor
  while (used.has(candidate)) candidate += 1
  return candidate
}

/**
 * 층별 요약 조회를 위한 맵을 생성한다.
 */
export function buildSummaryByFloorMap(summaries: BubbleFloorSummary[]): Map<number, BubbleFloorSummary> {
  return new Map(summaries.map((summary) => [summary.floor, summary]))
}
