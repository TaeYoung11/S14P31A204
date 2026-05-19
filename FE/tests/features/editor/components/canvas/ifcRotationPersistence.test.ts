import { describe, expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import {
  getTransformAxisVisibility,
  threeWorldAxisToIfcWorldAxis,
  toIfcRotationAxisAngle,
  toIfcYawRotationDegrees,
} from '@/features/editor/components/canvas/thatopen/ifcSceneHelpers'

const expectAxis = (
  actual: { x: number; y: number; z: number } | null,
  expected: { x: number; y: number; z: number },
) => {
  expect(actual).not.toBeNull()
  expect(actual?.x).toBeCloseTo(expected.x, 6)
  expect(actual?.y).toBeCloseTo(expected.y, 6)
  expect(actual?.z).toBeCloseTo(expected.z, 6)
}

const quaternionFromAxis = (axis: Vector3, degrees: number) => (
  new Quaternion().setFromAxisAngle(axis, (degrees * Math.PI) / 180)
)

const expectQuaternionRoundTrip = (quaternion: Quaternion) => {
  const payload = toIfcRotationAxisAngle(quaternion)
  expect(payload).not.toBeNull()
  const threeAxis = new Vector3(
    payload?.axis.x ?? 0,
    payload?.axis.z ?? 0,
    payload?.axis.y ?? 0,
  )
  const roundTripped = new Quaternion().setFromAxisAngle(
    threeAxis,
    ((payload?.angle_degrees ?? 0) * Math.PI) / 180,
  )
  expect(Math.abs(roundTripped.dot(quaternion.clone().normalize()))).toBeCloseTo(1, 6)
}

describe('ifc rotation persistence helpers', () => {
  it('shows all axes for IFC rotate controls', () => {
    expect(getTransformAxisVisibility('ifc', 'rotate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  it('keeps all axes visible for library rotate controls', () => {
    expect(getTransformAxisVisibility('library', 'rotate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  it('keeps all axes visible for non-rotate IFC controls', () => {
    expect(getTransformAxisVisibility('ifc', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  it('maps Three.js world axes to IFC world axes', () => {
    expectAxis(threeWorldAxisToIfcWorldAxis({ x: 1, y: 0, z: 0 }), { x: 1, y: 0, z: 0 })
    expectAxis(threeWorldAxisToIfcWorldAxis({ x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 })
    expectAxis(threeWorldAxisToIfcWorldAxis({ x: 0, y: 0, z: 1 }), { x: 0, y: 1, z: 0 })
  })

  it('converts single-axis rotations to IFC axis-angle payloads', () => {
    const threeY = toIfcRotationAxisAngle(quaternionFromAxis(new Vector3(0, 1, 0), 90))
    expectAxis(threeY?.axis ?? null, { x: 0, y: 0, z: 1 })
    expect(threeY?.angle_degrees).toBeCloseTo(90, 6)
    expect(threeY?.frame).toBe('IFC_WORLD')
    expect(threeY?.pivot).toBe('BBOX_CENTER')

    const threeX = toIfcRotationAxisAngle(quaternionFromAxis(new Vector3(1, 0, 0), 90))
    expectAxis(threeX?.axis ?? null, { x: 1, y: 0, z: 0 })
    expect(threeX?.angle_degrees).toBeCloseTo(90, 6)

    const threeZ = toIfcRotationAxisAngle(quaternionFromAxis(new Vector3(0, 0, 1), 90))
    expectAxis(threeZ?.axis ?? null, { x: 0, y: 1, z: 0 })
    expect(threeZ?.angle_degrees).toBeCloseTo(90, 6)
  })

  it('round-trips compound rotations through axis-angle', () => {
    expectQuaternionRoundTrip(new Quaternion().setFromEuler(new Euler(Math.PI / 4, Math.PI / 4, 0, 'XYZ')))
    expectQuaternionRoundTrip(new Quaternion().setFromEuler(new Euler(Math.PI / 4, 0, Math.PI / 4, 'XYZ')))
    expectQuaternionRoundTrip(new Quaternion().setFromEuler(new Euler(0, Math.PI / 4, Math.PI / 4, 'XYZ')))
    expectQuaternionRoundTrip(new Quaternion().setFromEuler(new Euler(Math.PI / 5, Math.PI / 6, Math.PI / 7, 'XYZ')))
  })

  it('handles negative, 180-degree, and near-zero rotations', () => {
    const negative = toIfcRotationAxisAngle(quaternionFromAxis(new Vector3(0, 1, 0), -45))
    expect(negative?.axis.z).toBeCloseTo(-1, 6)
    expect(negative?.angle_degrees).toBeCloseTo(45, 6)

    const halfTurn = toIfcRotationAxisAngle(quaternionFromAxis(new Vector3(1, 0, 0), 180))
    expect(halfTurn?.axis.x).toBeCloseTo(1, 6)
    expect(halfTurn?.angle_degrees).toBeCloseTo(180, 6)

    expect(toIfcRotationAxisAngle(quaternionFromAxis(new Vector3(1, 0, 0), 0.0000001))).toBeNull()
  })

  it('keeps legacy yaw helper behavior for backward compatibility', () => {
    expect(toIfcYawRotationDegrees({ y: 90 })).toEqual({ y: 90 })
    expect(toIfcYawRotationDegrees({ x: 90 })).toEqual({})
    expect(toIfcYawRotationDegrees({ z: 90 })).toEqual({})
  })
})
