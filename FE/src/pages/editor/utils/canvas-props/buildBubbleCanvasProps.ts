import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'

/**
 * 버블 모드 캔버스 데이터/상호작용을 매핑한다.
 */
export function buildBubbleCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'sitePoints'
  | 'siteAreaM2'
  | 'siteAreaPyeong'
  | 'bubbles'
  | 'bubbleFloors'
  | 'bubbleFloorNumbers'
  | 'activeBubbleFloor'
  | 'setActiveBubbleFloor'
  | 'handleAddBubbleFloor'
  | 'handleRenameBubbleFloor'
  | 'handleDeleteBubbleFloor'
  | 'connections'
  | 'autoZones'
  | 'manualZones'
  | 'selectedId'
  | 'selectedIds'
  | 'connectingFromId'
  | 'openEditModal'
  | 'handleBubbleDrag'
  | 'handleBubbleDragStart'
  | 'handleBubbleDragEnd'
  | 'handleBubbleSelectWithTool'
  | 'handleDeleteBubble'
  | 'handleConnectionClick'
  | 'selectedConnectionPair'
  | 'handleConnectionCreate'
  | 'handleBubbleLabelEdit'
  | 'handleEmptyCanvasDblClick'
  | 'handleMarqueeSelect'
  | 'clearSelection'
  | 'handleBubbleResize'
  | 'isBubbleReadOnly'
> {
  return {
    // 버블/2D/3D 대지 일관성을 위해 단일 소스(sitePlanPoints)만 사용한다.
    sitePoints: vm.sitePoints,
    siteAreaM2: vm.siteAreaM2,
    siteAreaPyeong: vm.siteAreaPyeong,
    bubbles: vm.bubbles,
    bubbleFloors: vm.bubbleFloors,
    bubbleFloorNumbers: vm.bubbleFloorNumbers,
    activeBubbleFloor: vm.activeBubbleFloor,
    setActiveBubbleFloor: vm.setActiveBubbleFloor,
    handleAddBubbleFloor: vm.handleAddBubbleFloor,
    handleRenameBubbleFloor: vm.handleRenameBubbleFloor,
    handleDeleteBubbleFloor: vm.handleDeleteBubbleFloor,
    connections: vm.connections,
    autoZones: vm.autoZones,
    manualZones: vm.manualZones,
    selectedId: vm.selectedId,
    selectedIds: vm.selectedIds,
    connectingFromId: vm.connectingFromId,
    openEditModal: vm.openEditModal,
    handleBubbleDrag: vm.handleBubbleDrag,
    handleBubbleDragStart: vm.handleBubbleDragStart,
    handleBubbleDragEnd: vm.handleBubbleDragEnd,
    handleBubbleSelectWithTool: vm.handleBubbleSelectWithTool,
    handleDeleteBubble: vm.handleDeleteBubble,
    handleConnectionClick: vm.handleConnectionClick,
    selectedConnectionPair: vm.selectedConnectionPair,
    handleConnectionCreate: vm.handleConnectionCreate,
    handleBubbleLabelEdit: vm.handleBubbleLabelEdit,
    handleEmptyCanvasDblClick: vm.handleEmptyCanvasDblClick,
    handleMarqueeSelect: vm.handleMarqueeSelect,
    clearSelection: vm.clearSelection,
    handleBubbleResize: vm.handleBubbleResize,
    isBubbleReadOnly: vm.isBubbleReadOnly,
  }
}
