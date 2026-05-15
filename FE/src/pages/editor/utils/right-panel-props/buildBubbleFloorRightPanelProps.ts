import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * 버블 모드 층 보기 데이터/핸들러를 매핑한다.
 */
export function buildBubbleFloorRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'bubbleFloors'
  | 'bubbleFloorSummaries'
  | 'activeBubbleFloor'
  | 'onSelectBubbleFloor'
  | 'onAddBubbleFloor'
  | 'onRenameBubbleFloor'
  | 'onDeleteBubbleFloor'
  | 'isBubbleReadOnly'
> {
  return {
    bubbleFloors: vm.bubbleFloors,
    bubbleFloorSummaries: vm.bubbleFloorSummaries,
    activeBubbleFloor: vm.activeBubbleFloor,
    onSelectBubbleFloor: vm.setActiveBubbleFloor,
    onAddBubbleFloor: vm.handleAddBubbleFloor,
    onRenameBubbleFloor: vm.handleRenameBubbleFloor,
    onDeleteBubbleFloor: vm.handleDeleteBubbleFloor,
    isBubbleReadOnly: vm.isBubbleReadOnly,
  }
}
