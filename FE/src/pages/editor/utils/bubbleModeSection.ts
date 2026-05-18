import { formatBubbleFloorLabel, normalizeBubbleFloor } from '@/features/editor/utils/bubbleFloorUtils'
import type { EditorCanvasRenderProps } from '../types/editorCanvasContentProps'

export interface BubbleModeSectionSource {
  bubbles: EditorCanvasRenderProps['bubbles']
  connections: EditorCanvasRenderProps['connections']
  selectedIds: EditorCanvasRenderProps['selectedIds']
  selectedId: EditorCanvasRenderProps['selectedId']
  connectingFromId: EditorCanvasRenderProps['connectingFromId']
  selectedConnectionPair: EditorCanvasRenderProps['selectedConnectionPair']
  autoZones: EditorCanvasRenderProps['autoZones']
  manualZones: EditorCanvasRenderProps['manualZones']
  bubbleFloors: EditorCanvasRenderProps['bubbleFloors']
}

interface ActiveFloorBubbleSection {
  floorName: string
  bubbles: EditorCanvasRenderProps['bubbles']
  connections: EditorCanvasRenderProps['connections']
  selectedIds: EditorCanvasRenderProps['selectedIds']
  selectedId: EditorCanvasRenderProps['selectedId']
  connectingFromId: EditorCanvasRenderProps['connectingFromId']
  selectedConnectionPair: EditorCanvasRenderProps['selectedConnectionPair']
  autoZones: EditorCanvasRenderProps['autoZones']
  manualZones: EditorCanvasRenderProps['manualZones']
  floorAreaM2: number
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

/**
 * 버블 모드에서 활성 층 렌더링에 필요한 파생 데이터 묶음을 생성한다.
 */
export function buildActiveFloorBubbleSection(
  source: BubbleModeSectionSource,
  activeFloor: number,
): ActiveFloorBubbleSection {
  const floorBubbles = source.bubbles.filter((bubble) => normalizeBubbleFloor(bubble.floor) === activeFloor)
  const bubbleIdSet = new Set(floorBubbles.map((bubble) => bubble.id))
  const floorConnections = source.connections.filter((connection) =>
    bubbleIdSet.has(connection.from) && bubbleIdSet.has(connection.to))
  const floorSelectedIds = source.selectedIds.filter((id) => bubbleIdSet.has(id))
  const floorSelectedId = source.selectedId && bubbleIdSet.has(source.selectedId)
    ? source.selectedId
    : null
  const floorConnectingFromId = source.connectingFromId && bubbleIdSet.has(source.connectingFromId)
    ? source.connectingFromId
    : null
  const floorSelectedConnectionPair = source.selectedConnectionPair
    && bubbleIdSet.has(source.selectedConnectionPair.from)
    && bubbleIdSet.has(source.selectedConnectionPair.to)
    ? source.selectedConnectionPair
    : null
  const floorAutoZones = filterZonesByBubbleIdSet(source.autoZones, bubbleIdSet)
  const floorManualZones = filterZonesByBubbleIdSet(source.manualZones, bubbleIdSet)
  const floorAreaM2 = floorBubbles.reduce((sum, bubble) =>
    sum + (Number.isFinite(bubble.ratio) ? bubble.ratio : 0), 0)
  const floorNumberLabel = source.bubbleFloors.find((value) => value.floor === activeFloor)?.name ?? String(activeFloor)
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
}
