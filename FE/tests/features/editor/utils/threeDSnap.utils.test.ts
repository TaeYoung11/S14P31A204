import { describe, expect, it } from 'vitest'
import { normalizeSnapIntervalMm, toRotationSnapDegrees, toRotationSnapRadians } from '@/features/editor/utils/threeDSnap.utils'

describe('threeDSnap.utils', () => {
  it('snap 간격을 최소 1mm 정수로 정규화한다', () => {
    expect(normalizeSnapIntervalMm(0)).toBe(1)
    expect(normalizeSnapIntervalMm(-15)).toBe(1)
    expect(normalizeSnapIntervalMm(249.6)).toBe(250)
  })

  it('회전 스냅 각도를 간격별 정책에 맞게 반환한다', () => {
    expect(toRotationSnapDegrees(100)).toBe(5)
    expect(toRotationSnapDegrees(250)).toBe(15)
    expect(toRotationSnapDegrees(500)).toBe(30)
  })

  it('회전 스냅 라디안 값을 계산한다', () => {
    expect(toRotationSnapRadians(100)).toBeCloseTo(Math.PI / 36, 8)
    expect(toRotationSnapRadians(250)).toBeCloseTo(Math.PI / 12, 8)
    expect(toRotationSnapRadians(500)).toBeCloseTo(Math.PI / 6, 8)
  })
})


