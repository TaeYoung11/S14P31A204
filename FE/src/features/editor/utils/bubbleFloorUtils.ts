import type { BubbleData } from '../types'
import {
  BUBBLE_FLOOR_POLICY,
  type BubbleFloorPolicy,
  isAllowedBubbleFloorNumber,
} from './floorPolicy'

/**
 * 층 표기 텍스트에서 숫자 토큰을 추출한다.
 * - 지하층 허용 정책이면 아래 우선순위로 해석한다.
 *   1) 명시적 음수 표기(`-2`)를 우선 사용
 *   2) 지하층 표기(`B2`, `b 2층`)를 `-2`로 변환
 *   3) 그 외 첫 번째 정수 토큰 사용
 */
const findFloorToken = (value: string, policy: BubbleFloorPolicy): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (policy.allowBasement) {
    const explicitNegativeMatch = trimmed.match(/-\d+/)
    if (explicitNegativeMatch?.[0]) return explicitNegativeMatch[0]

    const basementMatch = trimmed.match(/\bb\s*(\d+)(?:\s*층)?\b/i)
    if (basementMatch?.[1]) return `-${basementMatch[1]}`
  }

  // 지하층 비허용 정책에서도 부호를 보존해 파싱한 뒤 정책 검증에서 걸러야
  // "-2"가 "2"로 승격되는 회귀를 막을 수 있다.
  return trimmed.match(/-?\d+/)?.[0] ?? null
}

/**
 * 층 번호를 정규화한다.
 * - 기본 정책: 1 이상의 정수만 유효하다.
 * - 지하층 허용 정책일 때는 0을 제외한 정수를 허용한다.
 * - 유효하지 않은 값은 정책 기본층으로 보정한다.
 */
export const normalizeBubbleFloor = (
  floor: unknown,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): number => {
  if (typeof floor === 'number') {
    return isAllowedBubbleFloorNumber(floor, policy) ? floor : policy.fallbackFloor
  }
  if (typeof floor === 'string') {
    const trimmed = floor.trim()
    if (!trimmed) return policy.fallbackFloor
    const numericText = findFloorToken(trimmed, policy)
    if (!numericText) return policy.fallbackFloor
    const parsed = Number.parseInt(numericText, 10)
    return isAllowedBubbleFloorNumber(parsed, policy) ? parsed : policy.fallbackFloor
  }
  return policy.fallbackFloor
}

/**
 * 문자열/숫자 입력에서 정책 기준 유효한 층 정수를 추출한다.
 * - 기본 정책 예: "2층" -> 2
 * - 지하층 허용 정책 예: "B2(-2)" 텍스트에서 -2 추출 가능
 */
export const readNonZeroIntegerFromUnknown = (
  value: unknown,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): number | null => {
  if (typeof value === 'number') {
    return isAllowedBubbleFloorNumber(value, policy) ? value : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const numericText = findFloorToken(trimmed, policy)
  if (!numericText) return null
  const parsed = Number.parseInt(numericText, 10)
  return isAllowedBubbleFloorNumber(parsed, policy) ? parsed : null
}

/**
 * 층 이름 입력값을 숫자 문자열로 보정한다.
 */
export const normalizeBubbleFloorName = (
  value: unknown,
  fallbackFloor: number,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): string => String(readNonZeroIntegerFromUnknown(value, policy) ?? normalizeBubbleFloor(fallbackFloor, policy))

/**
 * 중복 없는 층 번호 목록을 오름차순으로 정리한다.
 */
export const normalizeBubbleFloorSet = (
  floors: Iterable<number>,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): number[] =>
  [...new Set([...floors].map((floor) => normalizeBubbleFloor(floor, policy)))].sort((left, right) => left - right)

/**
 * 층 번호를 정책 기준 연속 구간으로 재매핑한다.
 * - 지상층은 1부터 연속 번호로 압축한다.
 * - 지하층 허용 시 지하층은 B1(-1)부터 연속 번호로 압축한다.
 */
export const compactBubbleFloorNumbers = (
  floors: number[],
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): Map<number, number> => {
  const normalizedFloors = [...new Set(floors.map((floor) => normalizeBubbleFloor(floor, policy)))]
  const positives = normalizedFloors
    .filter((floor) => floor >= policy.minAboveGroundFloor)
    .sort((left, right) => left - right)
  const mapping = new Map<number, number>()

  if (policy.allowBasement) {
    const basements = normalizedFloors
      .filter((floor) => floor < 0)
      .sort((left, right) => left - right)

    basements.forEach((floor, index) => {
      mapping.set(floor, index - basements.length)
    })
  }

  positives.forEach((floor, index) => {
    mapping.set(floor, index + policy.minAboveGroundFloor)
  })

  return mapping
}

/**
 * UI 표시용 층 라벨을 생성한다.
 * - 지하층 허용 정책에서 음수 입력이면 B층 표기를 사용한다.
 */
export const formatBubbleFloorLabel = (
  floorName: string,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): string => {
  const parsedFloor = readNonZeroIntegerFromUnknown(floorName, policy)
  if (policy.allowBasement && typeof parsedFloor === 'number' && parsedFloor < 0) {
    return `B${Math.abs(parsedFloor)}층`
  }
  return `${floorName}층`
}

/**
 * 층 이름 편집 입력창에서 사용할 숫자 문자열을 계산한다.
 */
export const toEditableBubbleFloorName = (
  name: string,
  fallbackFloor: number,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): string => {
  const numericText = findFloorToken(name, policy)
  const parsed = numericText ? Number.parseInt(numericText, 10) : Number.NaN
  return isAllowedBubbleFloorNumber(parsed, policy)
    ? String(parsed)
    : String(normalizeBubbleFloor(fallbackFloor, policy))
}

/**
 * 버블 목록에서 층 번호 집합을 추출한다.
 */
export const collectBubbleFloors = (
  bubbles: BubbleData[],
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): number[] => bubbles.map((bubble) => normalizeBubbleFloor(bubble.floor, policy))

export interface BubbleFloorMetaDerivedState {
  sortedFloors: number[]
  floorWithBubbleSet: Set<number>
  extraFloors: number[]
  namesByFloor: Record<number, string>
}

/**
 * 버블 목록 + 추가 층 목록으로 층 메타 상태를 재구성한다.
 * - 모든 층 번호를 정규화/중복 제거/정렬한다.
 * - 버블이 없는 층은 extraFloors로 분리한다.
 * - namesByFloor는 숫자 문자열 기본값으로 채운다.
 */
export const buildBubbleFloorMetaDerivedState = (
  bubbles: BubbleData[],
  extraFloors: Iterable<number>,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): BubbleFloorMetaDerivedState => {
  const floorSet = new Set<number>()
  bubbles.forEach((bubble) => floorSet.add(normalizeBubbleFloor(bubble.floor, policy)))
  for (const floor of extraFloors) {
    floorSet.add(normalizeBubbleFloor(floor, policy))
  }
  if (floorSet.size === 0) floorSet.add(policy.fallbackFloor)

  const sortedFloors = normalizeBubbleFloorSet(floorSet, policy)
  const floorWithBubbleSet = new Set<number>(
    bubbles.map((bubble) => normalizeBubbleFloor(bubble.floor, policy)),
  )

  return {
    sortedFloors,
    floorWithBubbleSet,
    extraFloors: sortedFloors.filter((floor) => !floorWithBubbleSet.has(floor)),
    namesByFloor: Object.fromEntries(sortedFloors.map((floor) => [floor, String(floor)])),
  }
}
