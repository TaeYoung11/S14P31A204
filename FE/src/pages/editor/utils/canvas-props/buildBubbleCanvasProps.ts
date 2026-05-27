import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { pickCanvasProps } from './pickCanvasProps'

const BUBBLE_CANVAS_KEYS = [
  'sitePoints',
  'bubbleCanvasViewTransform',
  'siteAreaM2',
  'siteAreaPyeong',
  'bubbles',
  'bubbleFloors',
  'bubbleFloorNumbers',
  'activeBubbleFloor',
  'setActiveBubbleFloor',
  'handleAddBubbleFloor',
  'handleRenameBubbleFloor',
  'handleDeleteBubbleFloor',
  'connections',
  'autoZones',
  'manualZones',
  'selectedId',
  'selectedIds',
  'connectingFromId',
  'openEditModal',
  'handleBubbleDrag',
  'handleBubbleDragStart',
  'handleBubbleDragEnd',
  'handleBubbleSelectWithTool',
  'handleDeleteBubble',
  'handleConnectionClick',
  'selectedConnectionPair',
  'handleConnectionCreate',
  'handleBubbleLabelEdit',
  'handleEmptyCanvasDblClick',
  'handleMarqueeSelect',
  'clearSelection',
  'handleBubbleResize',
  'isBubbleReadOnly',
] as const

/**
 * 버블 모드 캔버스 데이터/상호작용을 매핑한다.
 */
export function buildBubbleCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'sitePoints'
  | 'bubbleCanvasViewTransform'
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
  return pickCanvasProps(vm, BUBBLE_CANVAS_KEYS)
}
