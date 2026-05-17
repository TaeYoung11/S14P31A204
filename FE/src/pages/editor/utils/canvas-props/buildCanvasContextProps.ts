import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { pickCanvasProps } from './pickCanvasProps'

const CANVAS_CONTEXT_KEYS = [
  'projectId',
  'mode',
  'containerRef',
  'stageSize',
  'isWorkspaceBootstrapping',
  'zoom',
  'isCollaborationMode',
  'selectedPinId',
  'commentPins',
  'currentCollaborationUserId',
  'handlePinClick',
  'handleCreateCommentPin',
  'handleDeletePin',
  'deletingPinId',
  'isGridVisible',
  'isTrueNorthView',
  'selectedTool',
  'handleWheelZoom',
  'canvasZoom',
] as const

/**
 * 공통 캔버스 컨텍스트(모드/뷰포트/협업 기본 상태)를 매핑한다.
 */
export function buildCanvasContextProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'projectId'
  | 'mode'
  | 'containerRef'
  | 'stageSize'
  | 'isWorkspaceBootstrapping'
  | 'zoom'
  | 'isCollaborationMode'
  | 'selectedPinId'
  | 'commentPins'
  | 'currentCollaborationUserId'
  | 'handlePinClick'
  | 'handleCreateCommentPin'
  | 'handleDeletePin'
  | 'deletingPinId'
  | 'isGridVisible'
  | 'isTrueNorthView'
  | 'selectedTool'
  | 'handleWheelZoom'
  | 'canvasZoom'
> {
  return pickCanvasProps(vm, CANVAS_CONTEXT_KEYS)
}
