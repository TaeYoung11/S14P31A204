import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { pickCanvasProps } from './pickCanvasProps'

const TWO_D_LAYER_PANEL_KEYS = [
  'floorLayers',
  'activeFloorLayerId',
  'isLayerOverlayMode',
  'overlayLayerIds',
  'overlayOpacityByLayerId',
  'addFloorLayer',
  'renameFloorLayer',
  'deleteFloorLayer',
  'setActiveFloorLayerId',
  'toggleLayerOverlayMode',
  'handleToggleOverlayLayer',
  'handleSelectSingleOverlayLayer',
  'handleSetOverlayLayerOpacity',
] as const

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
  return pickCanvasProps(vm, TWO_D_LAYER_PANEL_KEYS)
}
