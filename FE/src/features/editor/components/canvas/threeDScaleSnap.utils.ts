import type { Object3D } from 'three'
import { normalizeSnapIntervalMm } from '../../utils/threeDSnap.utils'

type ThreeModule = typeof import('three')

interface BaseWorldSize {
  x: number
  y: number
  z: number
}

/**
 * 오브젝트 userData 또는 현재 크기/스케일에서 스냅 계산의 기준 크기(월드 단위)를 구한다.
 * - libraryBaseWorldSize / floorPlanBaseWorldSize / ifcEditBaseWorldSize 순으로 우선 사용
 * - 없으면 현재 bbox와 scale로 역산해 축별 base 크기를 추정한다.
 */
const resolveBaseWorldSize = (
  THREE: ThreeModule,
  object: Object3D,
): BaseWorldSize | null => {
  const userData = object.userData as {
    libraryBaseWorldSize?: BaseWorldSize
    floorPlanBaseWorldSize?: BaseWorldSize
    ifcEditBaseWorldSize?: BaseWorldSize
  }
  const explicitBase =
    userData.libraryBaseWorldSize ??
    userData.floorPlanBaseWorldSize ??
    userData.ifcEditBaseWorldSize
  if (explicitBase) return explicitBase

  const size = new THREE.Vector3()
  new THREE.Box3().setFromObject(object).getSize(size)
  const safeScaleX = Math.abs(object.scale.x) > 1e-6 ? Math.abs(object.scale.x) : 1
  const safeScaleY = Math.abs(object.scale.y) > 1e-6 ? Math.abs(object.scale.y) : 1
  const safeScaleZ = Math.abs(object.scale.z) > 1e-6 ? Math.abs(object.scale.z) : 1
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)) return null
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null

  return {
    x: size.x / safeScaleX,
    y: size.y / safeScaleY,
    z: size.z / safeScaleZ,
  }
}

const shouldSnapAxis = (axis: string | null | undefined, token: 'X' | 'Y' | 'Z') => {
  if (!axis) return true
  return axis.includes(token)
}

/**
 * Scale 기즈모 결과를 "치수(mm) 스텝" 기준으로 축별 보정한다.
 * 예) interval=250mm면 각 축의 (base * scale)를 250mm 배수에 맞춰 반올림한다.
 */
export const applyScaleSnapByMm = (
  THREE: ThreeModule,
  object: Object3D,
  snapIntervalMm: number,
  worldUnitsPerMm: number,
  axis?: string | null,
) => {
  if (!(worldUnitsPerMm > 0)) return false
  const base = resolveBaseWorldSize(THREE, object)
  if (!base) return false

  const intervalWorld = normalizeSnapIntervalMm(snapIntervalMm) * worldUnitsPerMm
  if (!(intervalWorld > 0)) return false

  const snapScale = (currentScale: number, baseWorld: number) => {
    if (!(baseWorld > 0)) return currentScale
    const currentWorld = Math.abs(currentScale) * baseWorld
    const snappedWorld = Math.max(intervalWorld, Math.round(currentWorld / intervalWorld) * intervalWorld)
    const snappedScaleAbs = snappedWorld / baseWorld
    return currentScale < 0 ? -snappedScaleAbs : snappedScaleAbs
  }

  const nextScaleX = shouldSnapAxis(axis, 'X') ? snapScale(object.scale.x, base.x) : object.scale.x
  const nextScaleY = shouldSnapAxis(axis, 'Y') ? snapScale(object.scale.y, base.y) : object.scale.y
  const nextScaleZ = shouldSnapAxis(axis, 'Z') ? snapScale(object.scale.z, base.z) : object.scale.z

  const isChanged =
    Math.abs(object.scale.x - nextScaleX) > 1e-6 ||
    Math.abs(object.scale.y - nextScaleY) > 1e-6 ||
    Math.abs(object.scale.z - nextScaleZ) > 1e-6
  if (!isChanged) return false

  object.scale.set(nextScaleX, nextScaleY, nextScaleZ)
  return true
}
