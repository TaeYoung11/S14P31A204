import type {
  BubbleCanvasProps,
  CanvasContextProps,
  CanvasControlProps,
  FloorPlanCanvasProps,
  LabelEditProps,
  TwoDLayerPanelProps,
  TwoDStructureProps,
} from './editorCanvasSectionProps'

export type {
  BubbleCanvasProps,
  CanvasContextProps,
  CanvasControlProps,
  FloorPlanCanvasProps,
  LabelEditProps,
  TwoDLayerPanelProps,
  TwoDStructureProps,
} from './editorCanvasSectionProps'

/** EditorPage가 EditorCanvasContent에 전달하는 전체 props 계약 */
export type EditorCanvasContentProps =
  & CanvasContextProps
  & BubbleCanvasProps
  & FloorPlanCanvasProps
  & TwoDStructureProps
  & TwoDLayerPanelProps
  & LabelEditProps
  & CanvasControlProps

/** 컨테이너 ref를 제외하고 실제 캔버스에 전달되는 렌더 props */
export type EditorCanvasRenderProps = Omit<EditorCanvasContentProps, 'containerRef'>
