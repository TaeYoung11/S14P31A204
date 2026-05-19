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
  THREE,
  raycaster,
  hitPoint,
  toLocal,
}: DropResolveParams): Partial<ThreeDLibraryPreset> | undefined {
  void THREE
  void raycaster
  void hitPoint
  void toLocal
  return {}
}
