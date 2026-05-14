import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData, IfcElementChange, WorkspaceSnapshot } from '../types'
import type { BubbleSnapshotPayload } from '../utils/workspaceSyncMessage'
import {
  mapBubbleSnapshotToWorkspacePayload,
  mapFloorMetaFromWorkspaceSnapshot,
  type WorkspaceBubbleSnapshotPayload,
} from './workspaceBubblePayloadMapper'

export interface FloorPlanSnapshotPayload {
  bubbles?: BubbleData[]
  connections?: ConnectionData[]
  floorMeta?: BubbleSnapshotPayload['floorMeta']
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
    ifcElementChanges?: IfcElementChange[]
  }
}

interface WorkspaceSiteInfo {
  areaM2?: number | string | null
  area_m2?: number | string | null
  area?: number | string | null
  landAreaM2?: number | string | null
  land_area_m2?: number | string | null
  polygon?: {
    coordinates?: unknown
  } | null
}

interface SaveBubbleSnapshotApiResponse {
  projectId: string
  status?: WorkspaceSnapshot['phaseStatus']
  phaseStatus?: WorkspaceSnapshot['phaseStatus']
  savedAt: string
}

export interface SaveBubbleSnapshotResponse {
  projectId: string
  phaseStatus: WorkspaceSnapshot['phaseStatus']
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
  siteInfo?: WorkspaceSiteInfo | null
  bubble: WorkspaceHistoryEntry<BubbleSnapshotPayload>
  floorPlan: WorkspaceHistoryEntry<FloorPlanSnapshotPayload>
}

const toBubbleSavePayload = (snapshot: WorkspaceSnapshot): WorkspaceBubbleSnapshotPayload =>
  mapBubbleSnapshotToWorkspacePayload(
    snapshot.bubbles,
    snapshot.connections,
    mapFloorMetaFromWorkspaceSnapshot(snapshot),
  )

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
    const response = await api.post<ApiResponse<SaveBubbleSnapshotApiResponse>>(
      `/projects/${projectId}/workspace/bubble/save`,
      toBubbleSavePayload(snapshot),
    )
    const data = response.data.data
    return {
      projectId: data.projectId,
      phaseStatus: data.phaseStatus ?? data.status ?? snapshot.phaseStatus,
      savedAt: data.savedAt,
    }
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
