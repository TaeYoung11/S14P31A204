import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { pickCanvasProps } from './pickCanvasProps'

const CANVAS_CONTROL_KEYS = [
  'labelEditState',
  'confirmLabelEdit',
  'closeLabelEdit',
  'isGridSnapEnabled',
  'gridSnapIntervalMm',
  'isLibraryOpen',
  'setIsLibraryOpen',
  'handleOpenExportSelectionModal',
  'handleZoomIn',
  'handleZoomOut',
  'handleZoomChange',
  'handleSetSelectedTool',
  'toggleGrid',
  'toggleGridSnap',
  'handleSetGridSnapIntervalMm',
  'handleToggleCollaboration',
  'handleOpenGenerate3DModal',
] as const

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
  return pickCanvasProps(vm, CANVAS_CONTROL_KEYS)
}
