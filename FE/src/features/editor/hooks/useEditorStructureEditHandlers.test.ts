import { describe, expect, it } from 'vitest'
import {
  resolveActiveFloorLayerStorey,
  resolveFloorWallCreateStorey,
} from './useEditorStructureEditHandlers'
import type { FloorLayer } from '../types'

const floorLayers: FloorLayer[] = [
  { id: 'floor-1', name: '1F', storeyGlobalId: '1FStoreyGlobalId00001', storeyName: '1F', rooms: [] },
  { id: 'floor-2', name: '2F', storeyGlobalId: '2FStoreyGlobalId00002', storeyName: '2F', rooms: [] },
]

describe('useEditorStructureEditHandlers storey resolution', () => {
  it('uses active layer IFC storey id instead of the UI layer id', () => {
    const activeStorey = resolveActiveFloorLayerStorey(floorLayers, 'floor-2')

    expect(activeStorey.storeyGlobalId).toBe('2FStoreyGlobalId00002')
    expect(activeStorey.storeyGlobalId).not.toBe('floor-2')
    expect(activeStorey.storeyName).toBe('2F')
  })

  it('prioritizes active layer storey over reference wall fallback', () => {
    const resolved = resolveFloorWallCreateStorey(
      { storeyGlobalId: '2FStoreyGlobalId00002', storeyName: '2F' },
      { storeyGlobalId: '1FStoreyGlobalId00001', storeyName: '1F' },
    )

    expect(resolved.storeyGlobalId).toBe('2FStoreyGlobalId00002')
  })

  it('falls back to reference wall storey when active layer has no storey metadata', () => {
    const resolved = resolveFloorWallCreateStorey(
      {},
      { storeyGlobalId: '1FStoreyGlobalId00001', storeyName: '1F' },
    )

    expect(resolved.storeyGlobalId).toBe('1FStoreyGlobalId00001')
  })
})
