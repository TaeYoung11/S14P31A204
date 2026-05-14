import type { ThreeDLibraryPreset } from './threeDLibrary.types'

interface DropResolveParams {
  THREE: typeof import('three')
  raycaster: import('three').Raycaster
  hitPoint?: import('three').Vector3
  toLocal: (worldPoint: import('three').Vector3) => import('three').Vector3
}

/**
 * 라이브러리 드롭 시 월드 히트포인트(또는 지면 교차점)를 로컬 좌표로 변환해
 * 프리셋 위치 patch를 생성한다.
 */
export function resolveLibraryDropPositionPatch({
  THREE,
  raycaster,
  hitPoint,
  toLocal,
}: DropResolveParams): Partial<ThreeDLibraryPreset> | undefined {
  if (hitPoint) {
    const localPoint = toLocal(hitPoint)
    return {
      position: {
        x: localPoint.x,
        y: localPoint.y,
        z: localPoint.z,
      },
    }
  }

  const groundPoint = new THREE.Vector3()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  if (!raycaster.ray.intersectPlane(groundPlane, groundPoint)) return undefined

  const localPoint = toLocal(groundPoint)
  return {
    position: {
      x: localPoint.x,
      y: localPoint.y,
      z: localPoint.z,
    },
  }
}
