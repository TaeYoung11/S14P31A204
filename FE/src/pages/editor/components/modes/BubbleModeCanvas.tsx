import { lazy } from 'react'
import type { EditorCanvasContentProps } from '../../types/editorCanvasContentProps'

const BubbleCanvas = lazy(() =>
  import('@/features/editor/components/canvas/BubbleCanvas').then((module) => ({ default: module.BubbleCanvas })),
)

interface BubbleModeCanvasProps {
  editorProps: EditorCanvasContentProps
  scale: number
}

/** 버블 모드 캔버스 렌더링 전용 컴포넌트 */
export default function BubbleModeCanvas({ editorProps, scale }: BubbleModeCanvasProps) {
  return (
    <BubbleCanvas
      stageSize={editorProps.stageSize}
      sitePoints={editorProps.sitePlanPoints}
      bubbles={editorProps.bubbles}
      connections={editorProps.connections}
      autoZones={editorProps.autoZones}
      manualZones={editorProps.manualZones}
      selectedId={editorProps.selectedId}
      selectedIds={editorProps.selectedIds}
      selectedTool={editorProps.selectedTool}
      connectingFromId={editorProps.connectingFromId}
      onEditZone={editorProps.openEditModal}
      onBubbleDrag={editorProps.handleBubbleDrag}
      onBubbleSelect={editorProps.handleBubbleSelectWithTool}
      onDeleteBubble={editorProps.handleDeleteBubble}
      onConnectionClick={editorProps.handleConnectionClick}
      selectedConnectionPair={editorProps.selectedConnectionPair}
      onConnectionCreate={editorProps.handleConnectionCreate}
      onBubbleLabelEdit={editorProps.handleBubbleLabelEdit}
      onEmptyCanvasDblClick={editorProps.handleEmptyCanvasDblClick}
      onWheelZoom={editorProps.handleWheelZoom}
      onMarqueeSelect={editorProps.handleMarqueeSelect}
      onClearSelection={editorProps.clearSelection}
      onBubbleResize={editorProps.handleBubbleResize}
      isReadOnly={editorProps.isBubbleReadOnly}
      scale={scale}
    />
  )
}
