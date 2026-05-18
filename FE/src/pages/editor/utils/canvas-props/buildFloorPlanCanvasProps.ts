import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { pickCanvasProps } from './pickCanvasProps'

const FLOOR_PLAN_CANVAS_KEYS = [
  'sitePlanPoints',
  'floorCanvasViewTransform',
  'floorRooms',
  'floorLayerOverlayItems',
  'floorPlanConnections',
  'isFloorPlanGenerated',
  'isFloorPlanGenerating',
  'handleGenerateFloorPlan',
  'canGenerateFloorPlanFromBubble',
  'handleBubbleSelect',
  'handleSelectIfcElement',
  'handleDeleteIfcElement',
  'selectedIfcElement',
  'threeDDeleteRequestToken',
  'ifcElementChanges',
  'isThreeDEditingLocked',
  'currentIfcUrl',
  'currentIfcAssetId',
  'localFloorData',
] as const

/**
 * 2D/3D 공통 평면 데이터와 자동 생성 상태를 매핑한다.
 */
export function buildFloorPlanCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'sitePlanPoints'
  | 'floorCanvasViewTransform'
  | 'floorRooms'
  | 'floorLayerOverlayItems'
  | 'floorPlanConnections'
  | 'isFloorPlanGenerated'
  | 'isFloorPlanGenerating'
  | 'handleGenerateFloorPlan'
  | 'canGenerateFloorPlanFromBubble'
  | 'handleBubbleSelect'
  | 'handleSelectIfcElement'
  | 'handleDeleteIfcElement'
  | 'selectedIfcElement'
  | 'threeDDeleteRequestToken'
  | 'ifcElementChanges'
  | 'isThreeDEditingLocked'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
  | 'localFloorData'
> {
  return pickCanvasProps(vm, FLOOR_PLAN_CANVAS_KEYS)
}
