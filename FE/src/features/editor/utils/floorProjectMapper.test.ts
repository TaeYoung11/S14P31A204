import { describe, expect, it } from 'vitest'
import { mapFloorProjectToLayers, mapFloorProjectToWalls } from './floorProjectMapper'
import type { FloorProject } from '../types/floorProject.types'

const project: FloorProject = {
  id: 'project-1',
  name: 'Project',
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
  unit: 'mm',
  floors: [
    { id: '1FStoreyGlobalId00001', number: 1, name: '1F', elevation: 0, ceiling_height: 3000 },
    { id: '2FStoreyGlobalId00002', number: 2, name: '2F', elevation: 3000, ceiling_height: 3000 },
  ],
  rooms: [
    {
      id: 'room-2f',
      name: 'Room 2F',
      type: 'office',
      floor: '2FStoreyGlobalId00002',
      polygon: [
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
        { x: 3000, y: 3000 },
        { x: 0, y: 3000 },
      ],
    },
  ],
  adjacency: [],
  walls: [
    {
      id: 'wall-2f',
      floor: '2FStoreyGlobalId00002',
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
    },
  ],
}

describe('floorProjectMapper storey metadata', () => {
  it('preserves IFC storey id separately from the UI floor layer id', () => {
    const [layer] = mapFloorProjectToLayers(project, { width: 1000, height: 1000 })

    expect(layer.id).toBe('floor-2')
    expect(layer.storeyGlobalId).toBe('2FStoreyGlobalId00002')
    expect(layer.storeyName).toBe('2F')
  })

  it('preserves wall storey name and global id', () => {
    const [wall] = mapFloorProjectToWalls(project, { width: 1000, height: 1000 })

    expect(wall.storeyGlobalId).toBe('2FStoreyGlobalId00002')
    expect(wall.storeyName).toBe('2F')
  })
})
