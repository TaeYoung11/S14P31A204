import { describe, expect, it } from 'vitest'
import type { BubbleData } from '../types'
import type { BubbleFloorPolicy } from './floorPolicy'
import {
  buildFloorRemapMapForRename,
  buildSummaryByFloorMap,
  computeBubbleStateAfterFloorDelete,
  getNextBubbleFloorToAdd,
} from './bubbleFloorMutations'

const basementPolicy: BubbleFloorPolicy = {
  allowBasement: true,
  minAboveGroundFloor: 1,
  fallbackFloor: 1,
}

const createBubble = (id: string, floor: number): BubbleData => ({
  id,
  floor,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  widthMm: 2500,
  heightMm: 2500,
  label: `room-${id}`,
  type: '거실',
  ratio: 6.25,
  area: '6.3 m²',
  color: '#ffffff',
  index: id,
})

describe('bubbleFloorMutations', () => {
  it('reorders positive floors within same sign group', () => {
    const map = buildFloorRemapMapForRename([1, 2, 3], 2, 1)
    expect(map).not.toBeNull()
    expect(map?.get(2)).toBe(1)
    expect(map?.get(1)).toBe(2)
    expect(map?.get(3)).toBe(3)
  })

  it('returns null when target position does not change', () => {
    const map = buildFloorRemapMapForRename([1, 2, 3], 2, 2)
    expect(map).toBeNull()
  })

  it('deletes floor and compacts remaining floor numbers', () => {
    const bubbles = [
      createBubble('A', 1),
      createBubble('B', 2),
      createBubble('C', 2),
    ]
    const result = computeBubbleStateAfterFloorDelete({
      floorToDelete: 2,
      bubbles,
      extraBubbleFloors: [3],
    })

    expect(result.floorBubbleIds).toEqual(new Set(['B', 'C']))
    expect(result.nextBubbles).toHaveLength(1)
    expect(result.nextBubbles[0]?.id).toBe('A')
    expect(result.nextBubbles[0]?.floor).toBe(1)
    expect(result.remapFloor(3)).toBe(2)
  })

  it('picks first available positive floor when active floor is above ground', () => {
    expect(getNextBubbleFloorToAdd([1, 3], 1)).toBe(2)
  })

  it('ignores invalid floor candidates and keeps positive sequence', () => {
    expect(getNextBubbleFloorToAdd([-2, 0, 1], 1)).toBe(2)
  })

  it('adds deeper basement floor when active floor is basement in basement policy', () => {
    expect(getNextBubbleFloorToAdd([-1, 1], -1, basementPolicy)).toBe(-2)
  })

  it('does not allow cross-sign remap target in basement policy', () => {
    const map = buildFloorRemapMapForRename([-2, -1, 1, 2], -1, 1, basementPolicy)
    expect(map).toBeNull()
  })

  it('builds summary map keyed by floor', () => {
    const map = buildSummaryByFloorMap([
      { floor: 1, bubbleCount: 2, totalAreaM2: 12.5 },
      { floor: 2, bubbleCount: 1, totalAreaM2: 4.2 },
    ])
    expect(map.get(1)?.bubbleCount).toBe(2)
    expect(map.get(2)?.totalAreaM2).toBe(4.2)
  })
})
