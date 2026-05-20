import { describe, expect, it } from 'vitest'
import { isFloorProjectPayload } from '@/features/editor/utils/workspaceSyncMessage'

function validFloorProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    name: 'Latest IFC Floor Plan',
    created_at: '2026-05-20T00:00:00Z',
    updated_at: '2026-05-20T00:00:00Z',
    unit: 'mm',
    floors: [
      {
        id: 'floor-1',
        number: 1,
        name: '1F',
        elevation: 0,
        ceiling_height: 2700,
      },
    ],
    rooms: [
      {
        id: 'room-1',
        name: 'Room',
        type: 'bedroom',
        floor: 'floor-1',
        polygon: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
      },
    ],
    adjacency: [],
    walls: [
      {
        id: 'wall-1',
        floor: 'floor-1',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        thickness: 200,
      },
    ],
    openings: [
      {
        id: 'window-1',
        floor: 'floor-1',
        type: 'window',
        wall_id: 'wall-1',
        wall_position: 0.5,
        width: 1200,
      },
    ],
    ...overrides,
  }
}

describe('isFloorProjectPayload', () => {
  it('accepts floor projects with usable room geometry and mapped wall/opening fields', () => {
    expect(isFloorProjectPayload(validFloorProject())).toBe(true)
  })

  it('rejects projects with walls but no usable rooms so IFC import can fall back', () => {
    expect(isFloorProjectPayload(validFloorProject({ rooms: [] }))).toBe(false)
  })

  it('rejects wall geometry missing mapper-required start/end numbers', () => {
    expect(isFloorProjectPayload(validFloorProject({
      walls: [{ id: 'wall-1', floor: 'floor-1', start: { x: 0 }, end: { x: 1, y: 1 } }],
    }))).toBe(false)
  })

  it('rejects openings missing numeric width', () => {
    expect(isFloorProjectPayload(validFloorProject({
      openings: [{
        id: 'opening-1',
        floor: 'floor-1',
        type: 'window',
        wall_id: 'wall-1',
        wall_position: 0.5,
      }],
    }))).toBe(false)
  })
})
