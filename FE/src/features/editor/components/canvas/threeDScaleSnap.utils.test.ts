import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyScaleSnapByMm } from './threeDScaleSnap.utils'

describe('threeDScaleSnap.utils', () => {
  it('scale을 mm 기준 간격으로 스냅한다', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    object.scale.set(1.12, 0.94, 1.41)
    object.userData.libraryBaseWorldSize = { x: 1, y: 1, z: 1 }

    const changed = applyScaleSnapByMm(THREE, object, 250, 0.001)

    expect(changed).toBe(true)
    expect(object.scale.x).toBeCloseTo(1.0, 8)
    expect(object.scale.y).toBeCloseTo(1.0, 8)
    expect(object.scale.z).toBeCloseTo(1.5, 8)
  })

  it('활성 축만 스냅한다', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    object.scale.set(1.12, 1.12, 1.12)
    object.userData.libraryBaseWorldSize = { x: 1, y: 1, z: 1 }

    applyScaleSnapByMm(THREE, object, 500, 0.001, 'X')

    expect(object.scale.x).toBeCloseTo(1.0, 8)
    expect(object.scale.y).toBeCloseTo(1.12, 8)
    expect(object.scale.z).toBeCloseTo(1.12, 8)
  })
})
