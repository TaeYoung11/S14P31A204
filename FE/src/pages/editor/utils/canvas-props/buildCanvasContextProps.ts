import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'

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
  | 'selectedTool'
  | 'handleWheelZoom'
  | 'canvasZoom'
> {
  return {
    projectId: vm.projectId,
    mode: vm.mode,
    containerRef: vm.containerRef,
    stageSize: vm.stageSize,
    zoom: vm.zoom,
    isCollaborationMode: vm.isCollaborationMode,
    selectedPinId: vm.selectedPinId,
    commentPins: vm.commentPins,
    currentCollaborationUserId: vm.currentCollaborationUserId,
    handlePinClick: vm.handlePinClick,
    handleCreateCommentPin: vm.handleCreateCommentPin,
    handleDeletePin: vm.handleDeletePin,
    deletingPinId: vm.deletingPinId,
    isGridVisible: vm.isGridVisible,
    selectedTool: vm.selectedTool,
    handleWheelZoom: vm.handleWheelZoom,
    canvasZoom: vm.canvasZoom,
  }
}
