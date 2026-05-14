import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'

/**
 * 라벨 오버레이 및 캔버스 컨트롤 관련 상태/동작을 매핑한다.
 */
export function buildCanvasControlProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'labelEditState'
  | 'confirmLabelEdit'
  | 'closeLabelEdit'
  | 'isGridSnapEnabled'
  | 'gridSnapIntervalMm'
  | 'isLibraryOpen'
  | 'setIsLibraryOpen'
  | 'handleOpenExportSelectionModal'
  | 'handleZoomIn'
  | 'handleZoomOut'
  | 'handleZoomChange'
  | 'handleSetSelectedTool'
  | 'toggleGrid'
  | 'toggleGridSnap'
  | 'handleSetGridSnapIntervalMm'
  | 'handleToggleCollaboration'
  | 'handleOpenGenerate3DModal'
> {
  return {
    labelEditState: vm.labelEditState,
    confirmLabelEdit: vm.confirmLabelEdit,
    closeLabelEdit: vm.closeLabelEdit,
    isGridSnapEnabled: vm.isGridSnapEnabled,
    gridSnapIntervalMm: vm.gridSnapIntervalMm,
    isLibraryOpen: vm.isLibraryOpen,
    setIsLibraryOpen: vm.setIsLibraryOpen,
    handleOpenExportSelectionModal: vm.handleOpenExportSelectionModal,
    handleZoomIn: vm.handleZoomIn,
    handleZoomOut: vm.handleZoomOut,
    handleZoomChange: vm.handleZoomChange,
    handleSetSelectedTool: vm.handleSetSelectedTool,
    toggleGrid: vm.toggleGrid,
    toggleGridSnap: vm.toggleGridSnap,
    handleSetGridSnapIntervalMm: vm.handleSetGridSnapIntervalMm,
    handleToggleCollaboration: vm.handleToggleCollaboration,
    handleOpenGenerate3DModal: vm.handleOpenGenerate3DModal,
  }
}
