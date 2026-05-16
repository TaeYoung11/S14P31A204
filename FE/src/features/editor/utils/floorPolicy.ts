import { getRuntimeEnvBoolean } from '@/shared/lib/runtimeEnv'

/**
 * 버블 층 처리 정책.
 * - allowBasement: true면 음수층(B층) 허용, false면 양수층만 허용
 * - minAboveGroundFloor: 지상층 최소값(기본 1)
 * - fallbackFloor: 정규화 실패 시 대체할 기본층
 */
export interface BubbleFloorPolicy {
  allowBasement: boolean
  minAboveGroundFloor: number
  fallbackFloor: number
}

/**
 * 런타임 층 정책.
 * - 기본값은 기존 동작과 동일하게 지하층 비허용(1층 시작)
 * - 추후 지하층이 필요하면 VITE_ENABLE_BUBBLE_BASEMENT_FLOOR=true 로 전환 가능
 */
export const BUBBLE_FLOOR_POLICY: BubbleFloorPolicy = Object.freeze({
  allowBasement: getRuntimeEnvBoolean('VITE_ENABLE_BUBBLE_BASEMENT_FLOOR', false),
  minAboveGroundFloor: 1,
  fallbackFloor: 1,
})

/** 정책 기준으로 유효한 층 번호인지 확인한다. */
export const isAllowedBubbleFloorNumber = (
  floor: number,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): boolean => {
  if (!Number.isInteger(floor)) return false
  if (policy.allowBasement) return floor !== 0
  return floor >= policy.minAboveGroundFloor
}

/** 층 입력 박스 HTML pattern 값을 반환한다. */
export const getBubbleFloorInputPattern = (
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): string => (policy.allowBasement ? '-?[0-9]*' : '[0-9]*')

/** 층 입력 중간 상태(빈 값, "-" 포함)를 포함해 허용 텍스트인지 검사한다. */
export const isBubbleFloorInputText = (
  value: string,
  policy: BubbleFloorPolicy = BUBBLE_FLOOR_POLICY,
): boolean => {
  const floorInputPattern = policy.allowBasement ? /^-?\d*$/ : /^\d*$/
  return floorInputPattern.test(value)
}

