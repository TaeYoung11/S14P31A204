import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * 2D 층/레이어 패널 상태 및 핸들러를 매핑한다.
 */
export function buildFloorLayerRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'floorLayers'
  | 'activeFloorLayerId'
  | 'isFloorPlanGenerated'
  | 'isLayerOverlayMode'
  | 'selectedOverlayLayerIds'
  | 'overlayOpacityByLayerId'
  | 'onAddFloorLayer'
  | 'onRenameFloorLayer'
  | 'onDeleteFloorLayer'
  | 'onSelectFloorLayer'
  | 'onToggleLayerOverlayMode'
  | 'onToggleOverlayLayer'
  | 'onSelectSingleOverlayLayer'
  | 'onChangeOverlayLayerOpacity'
  | 'ifcStoreys'
  | 'activeIfcStoreyId'
  | 'overlayIfcStoreyExpressIds'
  | 'onSelectIfcStorey'
  | 'onToggleIfcStoreyOverlay'
  | 'libraryElements'
> {
  return {
    floorLayers: vm.floorLayers,
    activeFloorLayerId: vm.activeFloorLayerId,
    isFloorPlanGenerated: vm.isFloorPlanGenerated,
    isLayerOverlayMode: vm.isLayerOverlayMode,
    selectedOverlayLayerIds: vm.overlayLayerIds,
    overlayOpacityByLayerId: vm.overlayOpacityByLayerId,
    onAddFloorLayer: vm.addFloorLayer,
    onRenameFloorLayer: vm.renameFloorLayer,
    onDeleteFloorLayer: vm.deleteFloorLayer,
    onSelectFloorLayer: vm.setActiveFloorLayerId,
    onToggleLayerOverlayMode: vm.toggleLayerOverlayMode,
    onToggleOverlayLayer: vm.handleToggleOverlayLayer,
    onSelectSingleOverlayLayer: vm.handleSelectSingleOverlayLayer,
    onChangeOverlayLayerOpacity: vm.handleSetOverlayLayerOpacity,
    ifcStoreys: vm.ifcStoreys,
    activeIfcStoreyId: vm.activeIfcStoreyExpressId != null
      ? String(vm.activeIfcStoreyExpressId)
      : null,
    overlayIfcStoreyExpressIds: vm.overlayIfcStoreyExpressIds,
    onSelectIfcStorey: vm.handleSelectIfcStorey,
    onToggleIfcStoreyOverlay: vm.handleToggleIfcStoreyOverlay,
    libraryElements: vm.libraryElements,
  }
}
