import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * 조닝 패널의 목록/액션을 매핑한다.
 */
export function buildZoningRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<'zoningListItems' | 'onOpenZoningModal' | 'onOpenEditZoningModal' | 'onDeleteZoning'> {
  return {
    zoningListItems: vm.zoningListItems,
    onOpenZoningModal: vm.openZoningModal,
    onOpenEditZoningModal: vm.openEditModal,
    onDeleteZoning: vm.deleteZone,
  }
}
