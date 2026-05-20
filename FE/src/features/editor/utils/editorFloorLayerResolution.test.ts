import { describe, expect, it } from 'vitest'
import type { IfcStoreyInfo } from '../components/canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'
import type { FloorLayer } from '../types'
import {
  applyIfcStoreyNameOverrides,
  normalizeIfcStoreyNameOverrides,
  resolveLibraryElementFloorLayerId,
} from './editorFloorLayerResolution'

describe('editorFloorLayerResolution', () => {
  it('normalizes saved IFC storey name overrides', () => {
    expect(normalizeIfcStoreyNameOverrides({
      '101': '  1층  ',
      abc: '잘못된 층',
      '202': '   ',
    })).toEqual({ 101: '1층' })
  })

  it('applies IFC storey display name overrides without changing express ids', () => {
    const storeys = [
      { expressId: 101, name: 'Level 1' },
      { expressId: 202, name: 'Level 2' },
    ] as IfcStoreyInfo[]

    expect(applyIfcStoreyNameOverrides(storeys, { 202: '2층' })).toEqual([
      { expressId: 101, name: 'Level 1' },
      { expressId: 202, name: '2층' },
    ])
  })

  it('resolves legacy roof library elements to rooftop-like floor layers', () => {
    const floorLayers = [
      { id: 'floor-1', name: '1층', rooms: [] },
      { id: 'floor-2', name: '2층', rooms: [] },
      { id: 'roof', name: '옥상', rooms: [] },
    ] as FloorLayer[]
    const roofElement = {
      id: 'roof-1',
      type: 'roof',
      name: '자동 생성 지붕',
    } as ThreeDLibraryPreset

    expect(resolveLibraryElementFloorLayerId(roofElement, floorLayers, 'floor-1')).toBe('roof')
  })

  it('keeps an existing valid floorLayerId before applying fallback rules', () => {
    const floorLayers = [
      { id: 'floor-1', name: '1층', rooms: [] },
      { id: 'roof', name: '옥상', rooms: [] },
    ] as FloorLayer[]
    const roofElement = {
      id: 'roof-1',
      type: 'roof',
      name: '직접 배치 지붕',
      floorLayerId: 'floor-1',
    } as ThreeDLibraryPreset

    expect(resolveLibraryElementFloorLayerId(roofElement, floorLayers, 'roof')).toBe('floor-1')
  })
})
