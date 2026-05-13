/**
 * 3D 캔버스 오브젝트 처리 공통 유틸.
 * - 리소스 해제
 * - Raycast hit 에서 그룹 루트 탐색
 */

/**
 * 오브젝트 하위 메시의 geometry/material을 재귀적으로 해제한다.
 * 씬 재구성/언마운트 시 WebGL 메모리 누수를 줄이기 위해 사용한다.
 */
export function disposeObject3DResources(object: import('three').Object3D) {
  object.traverse((child) => {
    const drawable = child as import('three').Object3D & {
      geometry?: { dispose?: () => void }
      material?: unknown
    }
    drawable.geometry?.dispose?.()

    const material = drawable.material
    if (Array.isArray(material)) {
      material.forEach((entry) => (entry as { dispose?: () => void })?.dispose?.())
      return
    }
    ;(material as { dispose?: () => void } | undefined)?.dispose?.()
  })
}

/**
 * 클릭된 child 오브젝트에서 target group의 "직접 자식" 루트를 찾아 반환한다.
 */
export function findGroupRootFromObject(
  object: import('three').Object3D,
  group: import('three').Group,
) {
  let cursor: import('three').Object3D | null = object
  while (cursor) {
    if (cursor.parent === group) return cursor
    cursor = cursor.parent ?? null
  }
  return null
}
