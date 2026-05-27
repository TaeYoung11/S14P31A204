import { lazy, useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import { saveProjectWorkspaceThumbnail } from '@/features/project/services/projectWorkspaceThumbnail.service'
import { formatBubbleFloorLabel, normalizeBubbleFloor } from '@/features/editor/utils/bubbleFloorUtils'
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
  const handlePreviewCapture = useCallback((imageUrl: string) => {
    saveProjectWorkspaceThumbnail(editorProps.projectId, 'bubble', imageUrl)
  }, [editorProps.projectId])

  return (
    <div className="absolute inset-0 p-4">
      <div
        className="relative overflow-hidden rounded-2xl border border-[#D8E0F2] bg-white shadow-[0_8px_20px_rgba(45,53,153,0.08)]"
        style={{ width: sectionCanvasWidth, height: sectionCanvasHeight }}
      >
        <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[#D8E0F2] bg-white/95 px-1.5 py-1 shadow-sm backdrop-blur">
          {editorProps.bubbleFloors.map((floorMeta) => {
            const isActive = normalizeBubbleFloor(floorMeta.floor) === activeFloor
            return (
              <button
                key={`floor-tab-${floorMeta.floor}`}
                type="button"
                onClick={() => editorProps.setActiveBubbleFloor(floorMeta.floor)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors ${
                  isActive
                    ? 'bg-[#3B45B3] text-white shadow-sm'
                    : 'text-[#4F5B78] hover:bg-[#F0F2FF] hover:text-[#3B45B3]'
                }`}
              >
                {formatBubbleFloorLabel(floorMeta.name)}
              </button>
            )
          })}
          {!editorProps.isBubbleReadOnly && (
            <button
              type="button"
              onClick={editorProps.handleAddBubbleFloor}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#F0F2FF] hover:text-[#3B45B3] transition-colors"
              title="층 추가"
            >
              <Plus size={12} />
            </button>
          )}
          <span className="ml-1 border-l border-[#E2E8F0] pl-1.5 text-[9px] font-semibold text-[#94A3B8]">
            {`${activeFloorSection.bubbles.length}개 · ${activeFloorSection.floorAreaM2.toFixed(1)}m²`}
          </span>
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
          onPreviewCapture={handlePreviewCapture}
        />
      </div>
    </div>
  )
}
