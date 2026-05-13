import { describe, expect, it } from 'vitest'
import { isToolAllowedDuringConverting, isTwoDOrThreeDConverting } from './editorModeLocks'

describe('isTwoDOrThreeDConverting', () => {
  it('CONVERTING + 2d/3d 모드에서 true를 반환한다', () => {
    expect(isTwoDOrThreeDConverting('CONVERTING', '2d')).toBe(true)
    expect(isTwoDOrThreeDConverting('CONVERTING', '3d')).toBe(true)
  })

  it('CONVERTING이 아니거나 bubble 모드면 false를 반환한다', () => {
    expect(isTwoDOrThreeDConverting('BUBBLE_DRAFT', '2d')).toBe(false)
    expect(isTwoDOrThreeDConverting('IFC_EDIT', '3d')).toBe(false)
    expect(isTwoDOrThreeDConverting('CONVERTING', 'bubble')).toBe(false)
  })
})

describe('isToolAllowedDuringConverting', () => {
  it('selection/hand만 허용한다', () => {
    expect(isToolAllowedDuringConverting('selection')).toBe(true)
    expect(isToolAllowedDuringConverting('hand')).toBe(true)
  })

  it('편집성 도구는 차단한다', () => {
    expect(isToolAllowedDuringConverting('delete')).toBe(false)
    expect(isToolAllowedDuringConverting('rotate')).toBe(false)
    expect(isToolAllowedDuringConverting('scale')).toBe(false)
    expect(isToolAllowedDuringConverting('wall')).toBe(false)
  })
})
