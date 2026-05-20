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
  'isIfcSourceHydrationPending',
  'handleBubbleSelect',
  'handleSelectIfcElement',
  'handleDeleteIfcElement',
  'handleCommitIfcElementTransform',
  'selectedIfcElement',
  'threeDDeleteRequestToken',
  'ifcElementChanges',
  'isThreeDEditingLocked',
  'currentIfcUrl',
  'currentIfcAssetId',
  'libraryElements',
  'handleAddLibraryPreset',
  'handleChangeLibraryElement',
  'handleDeleteLibraryElement',
  'localFloorData',
  'activeIfcStoreyExpressId',
  'overlayIfcStoreyExpressIds',
  'hiddenIfcElementLocalIds',
  'requestedIfcElementLocalId',
  'ifcElementSelectionRequestToken',
  'requestedLibraryElementId',
  'libraryElementSelectionRequestToken',
  'handleIfcStoreysLoad',
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
  | 'isIfcSourceHydrationPending'
  | 'handleBubbleSelect'
  | 'handleSelectIfcElement'
  | 'handleDeleteIfcElement'
  | 'handleCommitIfcElementTransform'
  | 'selectedIfcElement'
  | 'threeDDeleteRequestToken'
  | 'ifcElementChanges'
  | 'isThreeDEditingLocked'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
  | 'libraryElements'
  | 'handleAddLibraryPreset'
  | 'handleChangeLibraryElement'
  | 'handleDeleteLibraryElement'
  | 'localFloorData'
  | 'activeIfcStoreyExpressId'
  | 'overlayIfcStoreyExpressIds'
  | 'hiddenIfcElementLocalIds'
  | 'requestedIfcElementLocalId'
  | 'ifcElementSelectionRequestToken'
  | 'requestedLibraryElementId'
  | 'libraryElementSelectionRequestToken'
  | 'handleIfcStoreysLoad'
> {
  return pickCanvasProps(vm, FLOOR_PLAN_CANVAS_KEYS)
}
