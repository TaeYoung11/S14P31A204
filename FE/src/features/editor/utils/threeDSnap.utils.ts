/**
 * 3D 스냅 간격(mm) 정규화.
 * 0 이하/소수 입력을 방어해 최소 1mm 이상의 정수로 고정한다.
 */
export const normalizeSnapIntervalMm = (intervalMm: number) => (
  Math.max(Math.round(intervalMm), 1)
)

/**
 * 3D 스냅 간격(mm)을 회전 스냅 각도(도)로 매핑한다.
 * - 100mm 이하: 5°
 * - 250mm 이하: 15°
 * - 500mm 이상: 30°
 */
export const toRotationSnapDegrees = (intervalMm: number) => {
  const normalizedIntervalMm = normalizeSnapIntervalMm(intervalMm)
  if (normalizedIntervalMm <= 100) return 5
  if (normalizedIntervalMm <= 250) return 15
  return 30
}

/** 회전 스냅 각도(도)를 라디안으로 변환한다. */
export const toRotationSnapRadians = (intervalMm: number) => (
  (toRotationSnapDegrees(intervalMm) * Math.PI) / 180
)
