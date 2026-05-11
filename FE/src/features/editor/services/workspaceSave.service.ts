import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData, WorkspaceSnapshot } from '../types'
import type { BubbleSnapshotPayload } from '../utils/workspaceSyncMessage'

export interface FloorPlanSnapshotPayload {
  bubbles?: BubbleData[]
  connections?: ConnectionData[]
  revisionId?: string | null
  layout?: {
    phaseStatus?: WorkspaceSnapshot['phaseStatus']
    floorLayers?: WorkspaceSnapshot['floorLayers']
    activeFloorLayerId?: WorkspaceSnapshot['activeFloorLayerId']
    isFloorPlanGenerated?: WorkspaceSnapshot['isFloorPlanGenerated']
    floorPlanLayoutSource?: WorkspaceSnapshot['floorPlanLayoutSource']
    floorWalls?: WorkspaceSnapshot['floorWalls']
    floorOpenings?: WorkspaceSnapshot['floorOpenings']
    hiddenAutoWallIds?: WorkspaceSnapshot['hiddenAutoWallIds']
    hiddenAutoOpeningIds?: WorkspaceSnapshot['hiddenAutoOpeningIds']
    isProjectStructurePreferred?: WorkspaceSnapshot['isProjectStructurePreferred']
    ifcElementChanges?: Array<{ expressId: number }>
  }
}

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
  status: WorkspaceSnapshot['phaseStatus']
  savedAt: string
}

interface SaveFloorPlanSnapshotResponse {
  projectId: string
  status: WorkspaceSnapshot['phaseStatus']
  revisionId: string
  s3Url: string
  savedAt: string
}

interface WorkspaceHistoryEntry<TSnapshot> {
  baseIndex: number
  redoDepth: number
  snapshot: TSnapshot | null
  s3Url: string | null
}

export interface WorkspaceHistorySnapshotResponse {
  phaseStatus: WorkspaceSnapshot['phaseStatus']
  bubble: WorkspaceHistoryEntry<BubbleSnapshotPayload>
  floorPlan: WorkspaceHistoryEntry<FloorPlanSnapshotPayload>
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

const toBubbleSavePayload = (snapshot: WorkspaceSnapshot): WorkspaceBubbleSavePayload => ({
  bubbles: snapshot.bubbles.map(toWorkspaceBubble),
  connections: snapshot.connections,
})

export const workspaceSaveService = {
  loadHistorySnapshot: async (projectId: string): Promise<WorkspaceHistorySnapshotResponse> => {
    const response = await api.get<ApiResponse<WorkspaceHistorySnapshotResponse>>(
      `/projects/${projectId}/workspace/history`,
    )
    return response.data.data
  },

  saveBubbleSnapshot: async (
    projectId: string,
    snapshot: WorkspaceSnapshot,
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
