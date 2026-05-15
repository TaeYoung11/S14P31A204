import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData } from '../types'
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
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): WorkspaceBubbleSnapshotPayload {
  return mapBubbleSnapshotToWorkspacePayload(bubbles, connections, floorMeta)
}

const summarizePayload = (payload: WorkspaceBubbleSnapshotPayload) => {
  const floorCounts: Record<number, number> = {}
  payload.bubbles.forEach((bubble) => {
    const floor = resolveBubbleFloorFromUnknown(
      bubble as BubbleData & Record<string, unknown>,
    )
    floorCounts[floor] = (floorCounts[floor] ?? 0) + 1
  })

  const bubbleFloors = Object.keys(floorCounts)
    .map((floor) => Number(floor))
    .sort((left, right) => left - right)

  const floorMetaFloors = [
    ...Object.keys(payload.floorMeta?.namesByFloor ?? {}).map((floor) => Number(floor)),
    ...(payload.floorMeta?.extraFloors ?? []),
  ]
    .filter((floor) => Number.isFinite(floor))
    .filter((floor, index, arr) => arr.indexOf(floor) === index)
    .sort((left, right) => left - right)

  return {
    bubbleCount: payload.bubbles.length,
    connectionCount: payload.connections.length,
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
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): Promise<SaveBubbleSnapshotResponse> {
  const payload = toSaveBubbleRequest(bubbles, connections, floorMeta)
  const summary = summarizePayload(payload)
  console.info('[bubble-save][fe] request', {
    projectId,
    bubbleCount: summary.bubbleCount,
    connectionCount: summary.connectionCount,
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
