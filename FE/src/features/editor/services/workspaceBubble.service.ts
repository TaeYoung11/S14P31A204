import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData, ZoneData } from '../types'
import { resolveBubbleFloorFromUnknown } from '../utils/bubbleSnapshotSyncUtils'
import {
  mapBubbleSnapshotToWorkspacePayload,
  type WorkspaceBubbleSnapshotPayload,
  type WorkspaceBubbleFloorMetaPayload,
} from './workspaceBubblePayloadMapper'

export interface SaveBubbleSnapshotResponse {
  projectId: string
  phaseStatus: string
  savedAt: string
}

function toSaveBubbleRequest(
  bubbles: BubbleData[],
  connections: ConnectionData[],
  zones: ZoneData[],
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): WorkspaceBubbleSnapshotPayload {
  return mapBubbleSnapshotToWorkspacePayload(bubbles, connections, zones, floorMeta)
}

function buildBubbleFloorCountMap(payload: WorkspaceBubbleSnapshotPayload): Record<number, number> {
  const floorCounts: Record<number, number> = {}
  payload.bubbles.forEach((bubble) => {
    const floor = resolveBubbleFloorFromUnknown(
      bubble as BubbleData & Record<string, unknown>,
    )
    floorCounts[floor] = (floorCounts[floor] ?? 0) + 1
  })
  return floorCounts
}

function toSortedUniqueFloors(values: number[]): number[] {
  return values
    .filter((floor) => Number.isFinite(floor))
    .filter((floor, index, arr) => arr.indexOf(floor) === index)
    .sort((left, right) => left - right)
}

const summarizePayload = (payload: WorkspaceBubbleSnapshotPayload) => {
  const floorCounts = buildBubbleFloorCountMap(payload)

  const bubbleFloors = toSortedUniqueFloors(
    Object.keys(floorCounts).map((floor) => Number(floor)),
  )

  const floorMetaFloors = toSortedUniqueFloors([
    ...Object.keys(payload.floorMeta?.namesByFloor ?? {}).map((floor) => Number(floor)),
    ...(payload.floorMeta?.extraFloors ?? []),
  ])

  return {
    bubbleCount: payload.bubbles.length,
    connectionCount: payload.connections.length,
    zoneCount: payload.zones?.length ?? 0,
    bubbleFloors,
    floorMetaFloors,
    floorCounts,
    sampleBubbleFloors: payload.bubbles.slice(0, 10).map((bubble) =>
      `${bubble.id}:f=${String(bubble.floor ?? 'null')},fn=${String(bubble.floorNumber ?? 'null')},ly=${String(bubble.layer ?? 'null')},lv=${String(bubble.level ?? 'null')}`,
    ),
  }
}

export async function saveBubbleSnapshotToDb(
  projectId: string,
  bubbles: BubbleData[],
  connections: ConnectionData[],
  zones: ZoneData[],
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): Promise<SaveBubbleSnapshotResponse> {
  const payload = toSaveBubbleRequest(bubbles, connections, zones, floorMeta)
  const summary = summarizePayload(payload)
  console.info('[bubble-save][fe] request', {
    projectId,
    bubbleCount: summary.bubbleCount,
    connectionCount: summary.connectionCount,
    zoneCount: summary.zoneCount,
    bubbleFloors: summary.bubbleFloors,
    floorMetaFloors: summary.floorMetaFloors,
    floorCounts: summary.floorCounts,
    sampleBubbleFloors: summary.sampleBubbleFloors,
  })

  const response = await api.post<ApiResponse<SaveBubbleSnapshotResponse>>(
    `/projects/${projectId}/workspace/bubble/save`,
    payload,
  )
  console.info('[bubble-save][fe] response', {
    projectId,
    success: response.data.success,
    timestamp: response.data.timestamp,
    savedAt: response.data.data.savedAt,
    phaseStatus: response.data.data.phaseStatus,
  })
  return response.data.data
}
