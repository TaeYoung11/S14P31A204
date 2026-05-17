import { lazy, useMemo } from 'react'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import { normalizeBubbleFloor } from '@/features/editor/utils/bubbleFloorUtils'
import { buildActiveFloorBubbleSection } from '../../utils/bubbleModeSection'

const BubbleCanvas = lazy(() =>
  import('@/features/editor/components/canvas/BubbleCanvas').then((module) => ({ default: module.BubbleCanvas })),
)

interface BubbleModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
}

/** 버블 모드 캔버스 렌더링 전용 컴포넌트 */
export default function BubbleModeCanvas({ editorProps, scale }: BubbleModeCanvasProps) {
  const sectionCanvasWidth = Math.max(320, editorProps.stageSize.width - 32)
  const sectionCanvasHeight = Math.max(280, editorProps.stageSize.height - 32)
  const activeFloor = normalizeBubbleFloor(editorProps.activeBubbleFloor)
  const {
    bubbles,
    connections,
    selectedIds,
    selectedId,
    connectingFromId,
    selectedConnectionPair,
    autoZones,
    manualZones,
    bubbleFloors,
  } = editorProps
  const activeFloorSection = useMemo(
    () => buildActiveFloorBubbleSection({
      bubbles,
      connections,
      selectedIds,
      selectedId,
      connectingFromId,
      selectedConnectionPair,
      autoZones,
      manualZones,
      bubbleFloors,
    }, activeFloor),
    [
      activeFloor,
      bubbles,
      connections,
      selectedIds,
      selectedId,
      connectingFromId,
      selectedConnectionPair,
      autoZones,
      manualZones,
      bubbleFloors,
    ],
  )

  return (
    <div className="absolute inset-0 p-4">
      <div
        className="relative overflow-hidden rounded-2xl border border-[#D8E0F2] bg-white shadow-[0_8px_20px_rgba(45,53,153,0.08)]"
        style={{ width: sectionCanvasWidth, height: sectionCanvasHeight }}
      >
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-xl border border-[#D8E0F2] bg-white/90 px-2 py-1 text-[10px] font-semibold text-[#4F5B78] shadow-sm backdrop-blur">
          <span className="rounded-md bg-[#F3F6FF] px-1.5 py-0.5 font-black text-[#2B2F38]">{activeFloorSection.floorName}</span>
          <span className="rounded-md bg-[#F8FAFF] px-1.5 py-0.5">{`버블 ${activeFloorSection.bubbles.length}`}</span>
          <span className="rounded-md bg-[#F8FAFF] px-1.5 py-0.5">{`면적 ${activeFloorSection.floorAreaM2.toFixed(1)}m²`}</span>
        </div>
        <BubbleCanvas
          key={`bubble-canvas-${editorProps.projectId ?? 'no-project'}`}
          projectId={editorProps.projectId}
          stageSize={{ width: sectionCanvasWidth, height: sectionCanvasHeight }}
          sitePoints={editorProps.sitePoints}
          viewTransform={editorProps.bubbleCanvasViewTransform}
          bubbles={activeFloorSection.bubbles}
          connections={activeFloorSection.connections}
          autoZones={activeFloorSection.autoZones}
          manualZones={activeFloorSection.manualZones}
          selectedId={activeFloorSection.selectedId}
          selectedIds={activeFloorSection.selectedIds}
          selectedTool={editorProps.selectedTool}
          connectingFromId={activeFloorSection.connectingFromId}
          onEditZone={editorProps.openEditModal}
          onBubbleDrag={editorProps.handleBubbleDrag}
          onBubbleDragStart={editorProps.handleBubbleDragStart}
          onBubbleDragEnd={editorProps.handleBubbleDragEnd}
          onBubbleSelect={editorProps.handleBubbleSelectWithTool}
          onDeleteBubble={editorProps.handleDeleteBubble}
          onConnectionClick={editorProps.handleConnectionClick}
          selectedConnectionPair={activeFloorSection.selectedConnectionPair}
          onConnectionCreate={editorProps.handleConnectionCreate}
          onBubbleLabelEdit={editorProps.handleBubbleLabelEdit}
          onEmptyCanvasDblClick={(info) => editorProps.handleEmptyCanvasDblClick(info, activeFloor)}
          onWheelZoom={editorProps.handleWheelZoom}
          onMarqueeSelect={editorProps.handleMarqueeSelect}
          onClearSelection={editorProps.clearSelection}
          onBubbleResize={editorProps.handleBubbleResize}
          isReadOnly={editorProps.isBubbleReadOnly}
          scale={scale}
        />
      </div>
    </div>
  )
}
