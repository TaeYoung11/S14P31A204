import { describe, expect, it } from 'vitest'
import { toRoomPolygonFromAabb, type Aabb3D } from '@/features/editor/utils/webIfcToFloorProject'

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

    expect(toRoomPolygonFromAabb(aabb, 1000)).toEqual([
      { x: 1000, y: 10000 },
      { x: 3000, y: 10000 },
      { x: 3000, y: 11000 },
      { x: 1000, y: 11000 },
    ])
  })
})


