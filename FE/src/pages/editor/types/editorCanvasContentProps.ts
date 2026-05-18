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

/** Full props contract passed from EditorPage to EditorCanvasContent. */
export type EditorCanvasContentProps =
  & CanvasContextProps
  & BubbleCanvasProps
  & FloorPlanCanvasProps
  & TwoDStructureProps
  & TwoDLayerPanelProps
  & LabelEditProps
  & CanvasControlProps

/** Canvas render props without the container ref. */
export type EditorCanvasRenderProps = Omit<EditorCanvasContentProps, 'containerRef'>
