import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'

export const DEFAULT_MOCK_IFC_URL = '/mock/sample_final_semantic.ifc'

/** 선택 도구 문자열을 TransformControls 모드로 변환한다. */
export const resolveTransformMode = (selectedTool?: string): 'translate' | 'rotate' | 'scale' => {
  if (selectedTool === 'rotate') return 'rotate'
  if (selectedTool === 'scale') return 'scale'
  return 'translate'
}

/** IFC URL이 없고 로컬 3D 데이터가 있으면 로컬 씬 렌더링을 우선한다. */
export const shouldRenderLocalFloorPlan = (
  ifcUrl?: string | null,
  localFloorData?: FloorPlan3DData | null,
  hasAuthoritativeFloorLayers = false,
) => Boolean(localFloorData) && (!ifcUrl || hasAuthoritativeFloorLayers)
