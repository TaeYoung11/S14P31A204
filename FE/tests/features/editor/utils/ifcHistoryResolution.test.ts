import { describe, expect, it } from 'vitest'
import { shouldTrustFloorPlanHistoryForIfcSource } from '@/features/editor/utils/ifcHistoryResolution'

describe('shouldTrustFloorPlanHistoryForIfcSource', () => {
  it('trusts floor-plan history when it matches the latest IFC source revision', () => {
    expect(shouldTrustFloorPlanHistoryForIfcSource({
      historyRevision: 'R2',
      sourceRevision: 'R2',
      hasSourceIfcUrl: true,
    })).toBe(true)
  })

  it('does not trust stale floor-plan history when latest IFC source has a newer revision', () => {
    expect(shouldTrustFloorPlanHistoryForIfcSource({
      historyRevision: 'R1',
      sourceRevision: 'R2',
      hasSourceIfcUrl: true,
    })).toBe(false)
  })

  it('trusts history when no latest IFC source URL is available', () => {
    expect(shouldTrustFloorPlanHistoryForIfcSource({
      historyRevision: 'R1',
      sourceRevision: null,
      hasSourceIfcUrl: false,
    })).toBe(true)
  })

  it('does not trust revisionless history when latest IFC source has a revision', () => {
    expect(shouldTrustFloorPlanHistoryForIfcSource({
      historyRevision: null,
      sourceRevision: 'R2',
      hasSourceIfcUrl: true,
    })).toBe(false)
  })
})
