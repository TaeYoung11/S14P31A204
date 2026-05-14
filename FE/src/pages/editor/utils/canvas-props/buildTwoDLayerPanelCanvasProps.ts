import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'

/**
 * 2D 레이어 패널 상태/동작을 매핑한다.
 */
export function buildTwoDLayerPanelCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'floorLayers'
  | 'activeFloorLayerId'
  | 'isLayerOverlayMode'
  | 'overlayLayerIds'
  | 'overlayOpacityByLayerId'
  | 'addFloorLayer'
  | 'renameFloorLayer'
  | 'deleteFloorLayer'
  | 'setActiveFloorLayerId'
  | 'toggleLayerOverlayMode'
  | 'handleToggleOverlayLayer'
  | 'handleSelectSingleOverlayLayer'
  | 'handleSetOverlayLayerOpacity'
> {
  return {
    floorLayers: vm.floorLayers,
    activeFloorLayerId: vm.activeFloorLayerId,
    isLayerOverlayMode: vm.isLayerOverlayMode,
    overlayLayerIds: vm.overlayLayerIds,
    overlayOpacityByLayerId: vm.overlayOpacityByLayerId,
    addFloorLayer: vm.addFloorLayer,
    renameFloorLayer: vm.renameFloorLayer,
    deleteFloorLayer: vm.deleteFloorLayer,
    setActiveFloorLayerId: vm.setActiveFloorLayerId,
    toggleLayerOverlayMode: vm.toggleLayerOverlayMode,
    handleToggleOverlayLayer: vm.handleToggleOverlayLayer,
    handleSelectSingleOverlayLayer: vm.handleSelectSingleOverlayLayer,
    handleSetOverlayLayerOpacity: vm.handleSetOverlayLayerOpacity,
  }
}
