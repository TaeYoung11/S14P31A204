import type { ThreeDLibraryPreset } from './threeDLibrary.types'

interface DropResolveParams {
  THREE: typeof import('three')
  raycaster: import('three').Raycaster
  hitPoint?: import('three').Vector3
  toLocal: (worldPoint: import('three').Vector3) => import('three').Vector3
}

/**
 * 라이브러리 드롭은 추가 동작만 수행한다.
 * 실제 배치는 캔버스 동기화 단계에서 모델 바깥 기본 위치로 보정한다.
 */
export function resolveLibraryDropPositionPatch({
  THREE: _THREE,
  raycaster: _raycaster,
  hitPoint: _hitPoint,
  toLocal: _toLocal,
}: DropResolveParams): Partial<ThreeDLibraryPreset> | undefined {
  // 현재 3D 라이브러리 추가는 드롭 지점이 아니라 IFC 모델 바깥 자동 배치 규칙을 따른다.
  // 인자는 향후 표면 스냅 배치 확장을 위해 함수 계약에 남겨 둔다.
  return {}
}
