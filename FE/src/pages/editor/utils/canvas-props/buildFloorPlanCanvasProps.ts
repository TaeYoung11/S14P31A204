import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'

/**
 * 2D/3D 공통 평면 데이터와 자동 생성 상태를 매핑한다.
 */
export function buildFloorPlanCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'sitePlanPoints'
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
  | 'libraryElements'
  | 'handleAddLibraryPreset'
  | 'handleChangeLibraryElement'
  | 'handleDeleteLibraryElement'
  | 'localFloorData'
  | 'activeIfcStoreyExpressId'
  | 'overlayIfcStoreyExpressIds'
  | 'requestedIfcElementLocalId'
  | 'ifcElementSelectionRequestToken'
  | 'requestedLibraryElementId'
  | 'libraryElementSelectionRequestToken'
  | 'handleIfcStoreysLoad'
> {
  return {
    sitePlanPoints: vm.sitePlanPoints,
    floorRooms: vm.floorRooms,
    floorLayerOverlayItems: vm.floorLayerOverlayItems,
    floorPlanConnections: vm.floorPlanConnections,
    isFloorPlanGenerated: vm.isFloorPlanGenerated,
    isFloorPlanGenerating: vm.isFloorPlanGenerating,
    handleGenerateFloorPlan: vm.handleGenerateFloorPlan,
    canGenerateFloorPlanFromBubble: vm.canGenerateFloorPlanFromBubble,
    handleBubbleSelect: vm.handleBubbleSelect,
    handleSelectIfcElement: vm.handleSelectIfcElement,
    handleDeleteIfcElement: vm.handleDeleteIfcElement,
    selectedIfcElement: vm.selectedIfcElement,
    threeDDeleteRequestToken: vm.threeDDeleteRequestToken,
    ifcElementChanges: vm.ifcElementChanges,
    isThreeDEditingLocked: vm.isThreeDEditingLocked,
    currentIfcUrl: vm.currentIfcUrl,
    currentIfcAssetId: vm.currentIfcAssetId,
    libraryElements: vm.libraryElements,
    handleAddLibraryPreset: vm.handleAddLibraryPreset,
    handleChangeLibraryElement: vm.handleChangeLibraryElement,
    handleDeleteLibraryElement: vm.handleDeleteLibraryElement,
    localFloorData: vm.localFloorData,
    activeIfcStoreyExpressId: vm.activeIfcStoreyExpressId,
    overlayIfcStoreyExpressIds: vm.overlayIfcStoreyExpressIds,
    requestedIfcElementLocalId: vm.requestedIfcElementLocalId,
    ifcElementSelectionRequestToken: vm.ifcElementSelectionRequestToken,
    requestedLibraryElementId: vm.requestedLibraryElementId,
    libraryElementSelectionRequestToken: vm.libraryElementSelectionRequestToken,
    handleIfcStoreysLoad: vm.handleIfcStoreysLoad,
  }
}
