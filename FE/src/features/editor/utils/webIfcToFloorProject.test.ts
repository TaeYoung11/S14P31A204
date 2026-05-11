import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toRoomPolygonFromAabb, type Aabb3D } from './webIfcToFloorProject.ts'

describe('toRoomPolygonFromAabb', () => {
  it('uses X/Y as the floor-plane axes even when Z has the largest span', () => {
    const aabb: Aabb3D = {
      minX: 1,
      maxX: 3,
      minY: 10,
      maxY: 11,
      minZ: 0,
      maxZ: 5,
    }

    assert.deepEqual(toRoomPolygonFromAabb(aabb, 1000), [
      { x: 1000, y: 10000 },
      { x: 3000, y: 10000 },
      { x: 3000, y: 11000 },
      { x: 1000, y: 11000 },
    ])
  })
})
