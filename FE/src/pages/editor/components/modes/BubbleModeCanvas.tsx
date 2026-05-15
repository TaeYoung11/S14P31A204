import { lazy, useMemo } from 'react'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import { formatBubbleFloorLabel, normalizeBubbleFloor } from '@/features/editor/utils/bubbleFloorUtils'

const BubbleCanvas = lazy(() =>
  import('@/features/editor/components/canvas/BubbleCanvas').then((module) => ({ default: module.BubbleCanvas })),
)

interface BubbleModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
}

/**
 * 현재 층에 포함된 버블 ID 집합 기준으로 조닝 데이터를 필터링한다.
 * 빈 조닝(버블 미포함)은 렌더링에서 제외한다.
 */
function filterZonesByBubbleIdSet(
  zones: EditorCanvasRenderProps['autoZones'],
  bubbleIdSet: Set<string>,
) {
  return zones
    .map((zone) => ({
      ...zone,
      bubbleIds: zone.bubbleIds.filter((bubbleId) => bubbleIdSet.has(bubbleId)),
    }))
    .filter((zone) => zone.bubbleIds.length > 0)
}

/** 버블 모드 캔버스 렌더링 전용 컴포넌트 */
export default function BubbleModeCanvas({ editorProps, scale }: BubbleModeCanvasProps) {
  const sectionCanvasWidth = Math.max(320, editorProps.stageSize.width - 32)
  const sectionCanvasHeight = Math.max(280, editorProps.stageSize.height - 32)
  const activeFloor = normalizeBubbleFloor(editorProps.activeBubbleFloor)
  const activeFloorSection = useMemo(() => {
    const floorBubbles = editorProps.bubbles.filter((bubble) => normalizeBubbleFloor(bubble.floor) === activeFloor)
    const bubbleIdSet = new Set(floorBubbles.map((bubble) => bubble.id))
    const floorConnections = editorProps.connections.filter((connection) =>
      bubbleIdSet.has(connection.from) && bubbleIdSet.has(connection.to))
    const floorSelectedIds = editorProps.selectedIds.filter((id) => bubbleIdSet.has(id))
    const floorSelectedId = editorProps.selectedId && bubbleIdSet.has(editorProps.selectedId)
      ? editorProps.selectedId
      : null
    const floorConnectingFromId = editorProps.connectingFromId && bubbleIdSet.has(editorProps.connectingFromId)
      ? editorProps.connectingFromId
      : null
    const floorSelectedConnectionPair = editorProps.selectedConnectionPair
      && bubbleIdSet.has(editorProps.selectedConnectionPair.from)
      && bubbleIdSet.has(editorProps.selectedConnectionPair.to)
      ? editorProps.selectedConnectionPair
      : null
    const floorAutoZones = filterZonesByBubbleIdSet(editorProps.autoZones, bubbleIdSet)
    const floorManualZones = filterZonesByBubbleIdSet(editorProps.manualZones, bubbleIdSet)
    const floorAreaM2 = floorBubbles.reduce((sum, bubble) =>
      sum + (Number.isFinite(bubble.ratio) ? bubble.ratio : 0), 0)
    const floorNumberLabel = editorProps.bubbleFloors.find((value) => value.floor === activeFloor)?.name ?? String(activeFloor)
    const floorName = formatBubbleFloorLabel(floorNumberLabel)

    return {
      floorName,
      bubbles: floorBubbles,
      connections: floorConnections,
      selectedIds: floorSelectedIds,
      selectedId: floorSelectedId,
      connectingFromId: floorConnectingFromId,
      selectedConnectionPair: floorSelectedConnectionPair,
      autoZones: floorAutoZones,
      manualZones: floorManualZones,
      floorAreaM2,
    }
  }, [
    editorProps.bubbles,
    editorProps.connections,
    editorProps.selectedIds,
    editorProps.selectedId,
    editorProps.connectingFromId,
    editorProps.selectedConnectionPair,
    editorProps.autoZones,
    editorProps.manualZones,
    editorProps.bubbleFloors,
    activeFloor,
  ])

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
