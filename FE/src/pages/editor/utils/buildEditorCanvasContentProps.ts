import type { EditorPageViewModel } from '../types/editorPageViewModel'
import type { EditorCanvasContentProps } from '../types/editorCanvasContentProps'
import { buildBubbleCanvasProps } from './canvas-props/buildBubbleCanvasProps'
import { buildCanvasContextProps } from './canvas-props/buildCanvasContextProps'
import { buildFloorPlanCanvasProps } from './canvas-props/buildFloorPlanCanvasProps'
import { buildTwoDStructureCanvasProps } from './canvas-props/buildTwoDStructureCanvasProps'
import { buildTwoDLayerPanelCanvasProps } from './canvas-props/buildTwoDLayerPanelCanvasProps'
import { buildCanvasControlProps } from './canvas-props/buildCanvasControlProps'

/**
 * EditorPage ViewModel에서 캔버스 영역 전용 props를 구성한다.
 * 캔버스 렌더링에 필요한 필드만 명시적으로 전달해 조합부 의도를 분리한다.
 */
export function buildEditorCanvasContentProps(
  vm: EditorPageViewModel,
): EditorCanvasContentProps {
  return {
    ...buildCanvasContextProps(vm),
    ...buildBubbleCanvasProps(vm),
    ...buildFloorPlanCanvasProps(vm),
    ...buildTwoDStructureCanvasProps(vm),
    ...buildTwoDLayerPanelCanvasProps(vm),
    ...buildCanvasControlProps(vm),
  }
}
