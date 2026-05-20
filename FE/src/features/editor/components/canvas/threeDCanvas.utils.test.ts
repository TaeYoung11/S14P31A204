import { describe, expect, it } from 'vitest'
import { shouldRenderLocalFloorPlan } from './threeDCanvas.utils'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'

const localFloorData: FloorPlan3DData = {
  rooms: [],
  walls: [],
  storyHeightMm: 3000,
  activeFloorLayerId: 'floor-2',
}

describe('shouldRenderLocalFloorPlan', () => {
  it('uses local floor data when there is no IFC URL', () => {
    expect(shouldRenderLocalFloorPlan(null, localFloorData)).toBe(true)
  })

  it('keeps IFC rendering when there is no authoritative saved floor layer data', () => {
    expect(shouldRenderLocalFloorPlan('/model.ifc', localFloorData)).toBe(false)
  })

  it('uses saved floor layer data as the 3D source even when an IFC URL exists', () => {
    expect(shouldRenderLocalFloorPlan('/model.ifc', localFloorData, true)).toBe(true)
  })
})
