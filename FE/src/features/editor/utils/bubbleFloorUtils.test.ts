import { describe, expect, it } from 'vitest'
import type { BubbleFloorPolicy } from './floorPolicy'
import {
  compactBubbleFloorNumbers,
  formatBubbleFloorLabel,
  normalizeBubbleFloor,
  readNonZeroIntegerFromUnknown,
} from './bubbleFloorUtils'

const basementPolicy: BubbleFloorPolicy = {
  allowBasement: true,
  minAboveGroundFloor: 1,
  fallbackFloor: 1,
}

describe('bubbleFloorUtils', () => {
  it('normalizes invalid values to 1 in default policy', () => {
    expect(normalizeBubbleFloor(-1)).toBe(1)
    expect(normalizeBubbleFloor('-2')).toBe(1)
    expect(normalizeBubbleFloor(0)).toBe(1)
    expect(normalizeBubbleFloor('')).toBe(1)
  })

  it('returns null for negative string floor in default policy', () => {
    expect(readNonZeroIntegerFromUnknown('-2')).toBeNull()
  })

  it('normalizes basement string floor in basement policy', () => {
    expect(normalizeBubbleFloor('B2', basementPolicy)).toBe(-2)
    expect(normalizeBubbleFloor('지하 B3층', basementPolicy)).toBe(-3)
  })

  it('reads basement floor when basement policy is enabled', () => {
    expect(readNonZeroIntegerFromUnknown('-2', basementPolicy)).toBe(-2)
    expect(readNonZeroIntegerFromUnknown('B2', basementPolicy)).toBe(-2)
    expect(readNonZeroIntegerFromUnknown('B2(-2)', basementPolicy)).toBe(-2)
    expect(readNonZeroIntegerFromUnknown('지하 b 3층', basementPolicy)).toBe(-3)
  })

  it('compacts basement and above-ground floors by policy', () => {
    const mapped = compactBubbleFloorNumbers([-3, -1, 2, 4], basementPolicy)
    expect(mapped.get(-3)).toBe(-2)
    expect(mapped.get(-1)).toBe(-1)
    expect(mapped.get(2)).toBe(1)
    expect(mapped.get(4)).toBe(2)
  })

  it('formats basement label when basement policy is enabled', () => {
    expect(formatBubbleFloorLabel('-2', basementPolicy)).toBe('B2층')
    expect(formatBubbleFloorLabel('3', basementPolicy)).toBe('3층')
  })
})
