import { api } from '@/shared/lib/axios'
import { isAxiosError } from 'axios'
import type { ApiResponse } from '@/shared/types'
import type { BubbleData, ConnectionData, IfcElementChange, WorkspaceSnapshot } from '../types'
import type { FloorProject } from '../types/floorProject.types'
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
  floorProject?: FloorProject | null
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
    activeIfcStoreyExpressId?: WorkspaceSnapshot['activeIfcStoreyExpressId']
    overlayIfcStoreyExpressIds?: WorkspaceSnapshot['overlayIfcStoreyExpressIds']
    overlayFloorLayerIds?: WorkspaceSnapshot['overlayFloorLayerIds']
    hiddenElementIds?: WorkspaceSnapshot['hiddenElementIds']
    ifcStoreyNameOverrides?: WorkspaceSnapshot['ifcStoreyNameOverrides']
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
  status?: WorkspaceSnapshot['phaseStatus']
  phaseStatus?: WorkspaceSnapshot['phaseStatus']
  revisionId?: string | null
  s3Url?: string | null
  savedAt: string
}

interface SaveFloorPlanSnapshotInput {
  revisionId?: string | null
  baseIndex?: number
  s3Url?: string | null
}

const IFC_STORAGE_KEY_PATH_PATTERN = /(projects\/[^/?#]+\/revisions\/[^/?#]+\/ifc\/[^?#]+)/i

const tryExtractIfcStorageKey = (value: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const fromRawMatch = trimmed.match(IFC_STORAGE_KEY_PATH_PATTERN)
  if (fromRawMatch?.[1]) return fromRawMatch[1]

  try {
    const url = new URL(trimmed)
    const decodedPath = decodeURIComponent(url.pathname)
    const pathMatch = decodedPath.match(IFC_STORAGE_KEY_PATH_PATTERN)
    if (pathMatch?.[1]) return pathMatch[1]
  } catch {
    // URL 파싱 실패 시 raw 문자열 매칭 결과만 사용한다.
  }

  return null
}

const toUrlWithoutQuery = (value: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
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
    snapshot.zones,
    mapFloorMetaFromWorkspaceSnapshot(snapshot),
  )

export const workspaceSaveService = {
  /** 워크스페이스 히스토리(버블/평면도 커서 포함) 초기 부트스트랩 데이터 조회 */
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

  /** floor-plan 저장 메타(revision/S3 URL)를 서버에 확정 저장 */
  saveFloorPlanSnapshot: async (
    projectId: string,
    input: SaveFloorPlanSnapshotInput,
  ): Promise<SaveFloorPlanSnapshotResponse> => {
    const revisionId = input.revisionId?.trim() ? input.revisionId.trim() : null
    const hasValidBaseIndex = Number.isInteger(input.baseIndex) && (input.baseIndex ?? -1) >= 0
    const rawS3Url = input.s3Url?.trim() ? input.s3Url.trim() : null
    const extractedStorageKey = tryExtractIfcStorageKey(rawS3Url)
    const urlWithoutQuery = toUrlWithoutQuery(rawS3Url)
    const normalizedS3Url = extractedStorageKey ?? urlWithoutQuery ?? rawS3Url
    const endpoint = `/projects/${projectId}/workspace/floor-plan/save`

    const post = async (payload: Record<string, unknown>) => {
      const response = await api.post<ApiResponse<SaveFloorPlanSnapshotResponse>>(endpoint, payload)
      return response.data.data
    }

    const canTryLegacy = Boolean(normalizedS3Url)
    const canTryBaseIndex = hasValidBaseIndex

    if (!canTryLegacy && !canTryBaseIndex) {
      throw new Error('Either a valid baseIndex or s3Url is required to save floor-plan snapshot.')
    }

    // 현재 로컬 BE는 s3Url 기반 계약을 사용하므로 legacy를 우선 시도한다.
    if (canTryLegacy) {
      try {
        return await post({
          revisionId,
          s3Url: normalizedS3Url,
        })
      } catch (error: unknown) {
        if (
          extractedStorageKey &&
          extractedStorageKey !== rawS3Url &&
          isAxiosError(error) &&
          error.response?.status === 400
        ) {
          return post({
            revisionId,
            s3Url: extractedStorageKey,
          })
        }
        if (!(canTryBaseIndex && isAxiosError(error) && error.response?.status === 400)) throw error
      }
    }

    // 신 계약(baseIndex) 서버 또는 legacy 400 폴백 경로.
    if (canTryBaseIndex) {
      return post({
        revisionId,
        baseIndex: input.baseIndex,
      })
    }

    throw new Error('Failed to save floor-plan snapshot with available payloads.')
  },
}
