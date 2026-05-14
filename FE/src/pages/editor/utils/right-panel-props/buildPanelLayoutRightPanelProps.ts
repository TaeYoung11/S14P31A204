import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * 우측 패널 공통 레이아웃 상태/핸들러를 매핑한다.
 */
export function buildPanelLayoutRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'mode'
  | 'panelOffsets'
  | 'panelOpenState'
  | 'panelHeights'
  | 'panelWidths'
  | 'panelZIndexes'
  | 'onPanelDragStart'
  | 'onPanelResizeStart'
  | 'onTogglePanel'
  | 'onResetPanelPositions'
> {
  return {
    mode: vm.mode,
    panelOffsets: vm.panelOffsets,
    panelOpenState: vm.panelOpenState,
    panelHeights: vm.panelHeights,
    panelWidths: vm.panelWidths,
    panelZIndexes: vm.panelZIndexes,
    onPanelDragStart: vm.startDrag,
    onPanelResizeStart: vm.startResize,
    onTogglePanel: vm.togglePanel,
    onResetPanelPositions: vm.resetPanelPositions,
  }
}
