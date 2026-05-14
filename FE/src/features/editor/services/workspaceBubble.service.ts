import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData } from '../types'
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

export async function saveBubbleSnapshotToDb(
  projectId: string,
  bubbles: BubbleData[],
  connections: ConnectionData[],
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): Promise<SaveBubbleSnapshotResponse> {
  const response = await api.post<ApiResponse<SaveBubbleSnapshotResponse>>(
    `/projects/${projectId}/workspace/bubble/save`,
    toSaveBubbleRequest(bubbles, connections, floorMeta),
  )
  return response.data.data
}
