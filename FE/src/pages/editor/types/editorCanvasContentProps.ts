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

/** 렌더 단계에서 ref를 제외한 캔버스 전달 전용 타입 */
export type EditorCanvasRenderProps = Omit<EditorCanvasContentProps, 'containerRef'>
