import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData, EditorDraftSnapshot } from '../types'

interface WorkspaceBubbleSavePayload {
  bubbles: Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    widthMm: number
    heightMm: number
    label: string
    type: string
    ratio: number
    color?: string
  }>
  connections: ConnectionData[]
}

interface SaveBubbleSnapshotResponse {
  projectId: string
  status: EditorDraftSnapshot['phaseStatus']
  savedAt: string
}

interface SaveFloorPlanSnapshotResponse {
  projectId: string
  status: EditorDraftSnapshot['phaseStatus']
  revisionId: string
  s3Url: string
  savedAt: string
}

const toWorkspaceBubble = (bubble: BubbleData): WorkspaceBubbleSavePayload['bubbles'][number] => ({
  id: bubble.id,
  x: bubble.x,
  y: bubble.y,
  width: bubble.width,
  height: bubble.height,
  widthMm: bubble.widthMm,
  heightMm: bubble.heightMm,
  label: bubble.label,
  type: bubble.type,
  ratio: bubble.ratio,
  color: bubble.color,
})

const toBubbleSavePayload = (snapshot: EditorDraftSnapshot): WorkspaceBubbleSavePayload => ({
  bubbles: snapshot.bubbles.map(toWorkspaceBubble),
  connections: snapshot.connections,
})

export const workspaceSaveService = {
  saveBubbleSnapshot: async (
    projectId: string,
    snapshot: EditorDraftSnapshot,
  ): Promise<SaveBubbleSnapshotResponse> => {
    const response = await api.post<ApiResponse<SaveBubbleSnapshotResponse>>(
      `/projects/${projectId}/workspace/bubble/save`,
      toBubbleSavePayload(snapshot),
    )
    return response.data.data
  },

  saveFloorPlanSnapshot: async (
    projectId: string,
    input: { revisionId?: string | null; s3Url: string },
  ): Promise<SaveFloorPlanSnapshotResponse> => {
    const response = await api.post<ApiResponse<SaveFloorPlanSnapshotResponse>>(
      `/projects/${projectId}/workspace/floor-plan/save`,
      {
        revisionId: input.revisionId ?? null,
        s3Url: input.s3Url,
      },
    )
    return response.data.data
  },
}
