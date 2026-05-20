import axios from 'axios'
import { MOCK_MEMBERS } from '@/features/project/mocks/project.mock'
import {
  getProjectSitePolygonEntry,
  PROJECT_SITE_CACHE_TTL_MS,
  removeProjectSitePolygon,
  saveProjectSitePolygon,
} from '@/features/project/utils/projectSiteCache'
import {
  resolveProjectSiteFallback,
  type ProjectSitePolygonResult,
} from '@/features/project/utils/projectSiteFallback'
import { extractOuterRingFromCoordinates } from '@/features/project/utils/sitePolygon'
import { api } from '@/shared/lib/axios'

import type { Project, ProjectMember, CreateProjectDto, UpdateProjectDto } from '@/shared/types'
import type { EditorMode } from '@/features/editor/types'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

const PROJECT_LIST_PAGE_SIZE = 6
const PROJECT_LIST_MAX_PAGES = 100

interface ProjectSummaryResponse {
  projectId: string
  ownerUserId?: string
  name: string
  description?: string
  cadastralAddress?: string
  cadastralInfo?: CadastralInfo
  currentIfcUrl?: string
  currentIfcStorageUrl?: string
  /** private S3 버킷 접근용 에셋 UUID (BE가 제공하는 경우) */
  currentIfcAssetId?: string
  thumbnailUrl?: string
  thumbnail_url?: string
  thumbnailMode?: EditorMode
  thumbnail_mode?: EditorMode
  createdAt: string
  updatedAt: string
  unreadCommentCount?: number
}

interface ProjectDetailResponse {
  projectId: string
  name: string
  description?: string
  phaseStatus?: string
  bubbleSnapshotJson?: unknown
  ifcStorageUrl?: string
  currentRevision?: string
  thumbnailUrl?: string
  thumbnail_url?: string
  thumbnailMode?: EditorMode
  thumbnail_mode?: EditorMode
  siteInfo?: {
    pnu?: string | null
    address?: string | null
    areaM2?: number | string | null
    area_m2?: number | string | null
    area?: number | string | null
    landAreaM2?: number | string | null
    land_area_m2?: number | string | null
    polygon?: CadastralPolygon | null
  } | null
  createdAt?: string
  updatedAt?: string
  unreadCommentCount?: number
  creator?: {
    userId: string
    name?: string | null
  } | null
  invitedUsers?: {
    userId: string
    name?: string | null
  }[]
}

interface ProjectIfcExportResponse {
  projectId: string
  revisionId: string
  ifcStorageUrl: string
  presignedUrl: string
  expiresAt: string
}

interface ProjectListResponse {
  projects: ProjectSummaryResponse[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

interface CreateProjectResponse {
  projectId: string
  name: string
  description?: string
  currentVersionNo?: number
  currentIfcUrl?: string
  createdAt: string
  unreadCommentCount?: number
}

interface UpdateProjectResponse {
  projectId: string
  name: string
  description?: string
  updatedAt: string
  unreadCommentCount?: number
}

interface UpdateProjectThumbnailResponse {
  projectId: string
  thumbnailUrl?: string
  thumbnail_url?: string
  thumbnailMode?: EditorMode
  thumbnail_mode?: EditorMode
  updatedAt: string
}

interface RegisterProjectSiteDto {
  latitude: number
  longitude: number
}

interface CadastralPolygon {
  type: string
  coordinates: number[][][][]
}

interface CadastralInfo {
  polygon: CadastralPolygon
}

const readPositiveNumber = (value: unknown): number | null => {
  const numericValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

const MOCK_SITE_POLYGON_RING: number[][] = [
  [127.0281304, 37.4981036],
  [127.0283847, 37.4981036],
  [127.0283847, 37.4983271],
  [127.0281304, 37.4983271],
]

const shouldUseSiteMock = import.meta.env.VITE_USE_SITE_MOCK === 'true'
const shouldFetchSiteFromProjectDetailApi = import.meta.env.VITE_USE_PROJECT_DETAIL_SITE_API !== 'false'
const SITE_CACHE_TTL_MS = PROJECT_SITE_CACHE_TTL_MS
const PROJECT_DETAIL_FETCH_FAILED_MESSAGE = '프로젝트 상세 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
const projectSummaryCache = new Map<string, ProjectSummaryResponse>()
type ProjectServiceErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_LIST_FETCH_FAILED'
  | 'PROJECT_DETAIL_FETCH_FAILED'

type ProjectServiceError = Error & {
  status?: number
  code?: ProjectServiceErrorCode
}

export interface ProjectSiteResponse {
  projectId: string
  cadastralInfo?: CadastralInfo
  createdAt: string
}

export interface ProjectIfcSource {
  projectId: string
  currentIfcUrl?: string
  currentIfcStorageUrl?: string
  /** private S3 버킷 접근용 에셋 UUID */
  currentIfcAssetId?: string
  currentRevision?: string
}

const mapProjectSummary = (project: ProjectSummaryResponse): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? '',
  owner_id: project.ownerUserId ?? '',
  created_at: project.createdAt,
  updated_at: project.updatedAt,
  thumbnail_url: project.thumbnailUrl ?? project.thumbnail_url,
  thumbnail_mode: project.thumbnailMode ?? project.thumbnail_mode,
  member_count: 0,
  ifc_uploaded: !!project.currentIfcUrl,
  unread_comment_count: project.unreadCommentCount ?? 0,
})

const mapCreatedProject = (project: CreateProjectResponse): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? '',
  owner_id: '',
  created_at: project.createdAt,
  updated_at: project.createdAt,
  thumbnail_url: undefined,
  member_count: 1,
  ifc_uploaded: !!project.currentIfcUrl,
  unread_comment_count: project.unreadCommentCount ?? 0,
})

const mapUpdatedProject = (project: UpdateProjectResponse, fallback?: Project): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? fallback?.description ?? '',
  owner_id: fallback?.owner_id ?? '',
  created_at: fallback?.created_at ?? project.updatedAt,
  updated_at: project.updatedAt,
  thumbnail_url: fallback?.thumbnail_url,
  thumbnail_mode: fallback?.thumbnail_mode,
  member_count: fallback?.member_count ?? 0,
  ifc_uploaded: fallback?.ifc_uploaded ?? false,
  unread_comment_count: project.unreadCommentCount ?? fallback?.unread_comment_count ?? 0,
})

function readErrorStatus(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined
  return error.response?.status
}

function toProjectServiceError(
  error: unknown,
  fallbackMessage: string,
  code: ProjectServiceErrorCode,
): ProjectServiceError {
  const resolvedFallbackMessage = code === 'PROJECT_DETAIL_FETCH_FAILED'
    ? PROJECT_DETAIL_FETCH_FAILED_MESSAGE
    : fallbackMessage
  const nextError = new Error(resolvedFallbackMessage) as ProjectServiceError
  nextError.code = code
  nextError.status = readErrorStatus(error)

  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.message
    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      nextError.message = apiMessage
    }
  } else if (error instanceof Error && error.message.trim().length > 0) {
    nextError.message = error.message
  }

  return nextError
}

function cacheProjectSummaries(projects: ProjectSummaryResponse[]): void {
  projects.forEach((project) => {
    projectSummaryCache.set(project.projectId, project)
  })
}

/** 프로젝트 목록 페이지 1회를 조회한다. */
async function fetchProjectListPage(page: number): Promise<ProjectListResponse> {
  try {
    const response = await api.get<ApiResponse<ProjectListResponse>>('/projects', {
      params: { page, size: PROJECT_LIST_PAGE_SIZE },
    })
    const data = response.data.data
    cacheProjectSummaries(data.projects)
    return data
  } catch (error) {
    throw toProjectServiceError(
      error,
      '프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      'PROJECT_LIST_FETCH_FAILED',
    )
  }
}

async function findProjectSummaryFromList(projectId: string): Promise<ProjectSummaryResponse> {
  const cached = projectSummaryCache.get(projectId)
  if (cached) return cached

  let page = 1
  while (page <= PROJECT_LIST_MAX_PAGES) {
    const data = await fetchProjectListPage(page)
    const project = data.projects.find((item) => item.projectId === projectId)
    if (project) return project
    if (!data.hasNext) break
    page = data.page + 1
  }

  const notFoundError = new Error('요청한 프로젝트를 찾을 수 없습니다.') as ProjectServiceError
  notFoundError.status = 404
  notFoundError.code = 'PROJECT_NOT_FOUND'
  throw notFoundError
}

async function fetchProjectSummary(projectId: string): Promise<ProjectSummaryResponse> {
  try {
    const detail = await _fetchProjectDetail(projectId)
    const project: ProjectSummaryResponse = {
      projectId: detail.projectId,
      name: detail.name,
      description: detail.description,
      cadastralInfo: detail.siteInfo?.polygon ? { polygon: detail.siteInfo.polygon } : undefined,
      currentIfcUrl: detail.ifcStorageUrl,
      createdAt: detail.createdAt ?? new Date().toISOString(),
      updatedAt: detail.updatedAt ?? detail.createdAt ?? new Date().toISOString(),
      unreadCommentCount: detail.unreadCommentCount,
    }
    projectSummaryCache.set(project.projectId, project)
    return project
  } catch (error) {
    const status = readErrorStatus(error)
    const canFallbackToList = status === 404 || status === 405 || status === 501
    if (!canFallbackToList) {
        throw toProjectServiceError(
          error,
          '프로젝트 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
          'PROJECT_DETAIL_FETCH_FAILED',
        )
    }
  }

  return findProjectSummaryFromList(projectId)
}

async function _fetchProjectDetail(projectId: string): Promise<ProjectDetailResponse> {
  try {
    const response = await api.get<ApiResponse<ProjectDetailResponse>>(`/projects/${projectId}`)
    return response.data.data
  } catch (error) {
    throw toProjectServiceError(
      error,
 '프로젝트 정보를 불러오지 못했습니다. 다시 시도해주세요',
      'PROJECT_DETAIL_FETCH_FAILED',
    )
  }
}

async function fetchProjectIfcExport(projectId: string): Promise<ProjectIfcExportResponse> {
  const response = await api.get<ApiResponse<ProjectIfcExportResponse>>(`/projects/${projectId}/ifc/export`)
  return response.data.data
}

/**
 * 프로젝트 상세 응답에서 대지 폴리곤을 읽어온다.
 * - 응답에 대지 정보가 없거나 형식이 맞지 않으면 null
 * - 네트워크/서버 오류는 상위 fallback 체인에서 처리
 */
async function fetchSiteInfoFromProjectDetail(projectId: string): Promise<{ polygonRing: number[][] | null; areaM2: number | null }> {
  const detail = await _fetchProjectDetail(projectId)
  return {
    polygonRing: extractOuterRingFromCoordinates(detail.siteInfo?.polygon?.coordinates),
    areaM2:
      readPositiveNumber(detail.siteInfo?.areaM2)
      ?? readPositiveNumber(detail.siteInfo?.area_m2)
      ?? readPositiveNumber(detail.siteInfo?.landAreaM2)
      ?? readPositiveNumber(detail.siteInfo?.land_area_m2)
      ?? readPositiveNumber(detail.siteInfo?.area),
  }
}

export interface ProjectListPageResult {
  projects: Project[]
  hasNext: boolean
  page: number
}

export const projectService = {
  getAll: async (): Promise<Project[]> => {
    const all: Project[] = []
    let page = 1

    while (page <= PROJECT_LIST_MAX_PAGES) {
      const data = await fetchProjectListPage(page)
      all.push(...data.projects.map(mapProjectSummary))
      if (!data.hasNext) break
      page = data.page + 1
    }

    return all
  },

  getList: async (page: number = 1): Promise<ProjectListPageResult> => {
    const data = await fetchProjectListPage(page)
    return { projects: data.projects.map(mapProjectSummary), hasNext: data.hasNext, page: data.page }
  },

  getById: async (id: string): Promise<Project> => {
    const project = await fetchProjectSummary(id)
    return mapProjectSummary(project)
  },

  getWorkspaceDetail: async (id: string): Promise<{
    project: Project
    phaseStatus?: string
    bubbleSnapshotJson?: unknown
    ifcStorageUrl?: string
    currentRevision?: string
    creator?: {
      userId: string
      name: string
    } | null
    invitedUsers?: {
      userId: string
      name: string
    }[]
  }> => {
    const detail = await _fetchProjectDetail(id)
    return {
      project: mapProjectSummary({
        projectId: detail.projectId,
        name: detail.name,
        description: detail.description,
        currentIfcUrl: detail.ifcStorageUrl,
        createdAt: detail.createdAt ?? new Date().toISOString(),
        updatedAt: detail.updatedAt ?? detail.createdAt ?? new Date().toISOString(),
        unreadCommentCount: detail.unreadCommentCount,
        thumbnailUrl: detail.thumbnailUrl ?? detail.thumbnail_url,
        thumbnailMode: detail.thumbnailMode ?? detail.thumbnail_mode,
      }),
      phaseStatus: detail.phaseStatus,
      bubbleSnapshotJson: detail.bubbleSnapshotJson,
      ifcStorageUrl: detail.ifcStorageUrl,
      currentRevision: detail.currentRevision,
      creator: detail.creator
        ? {
          userId: detail.creator.userId,
          name: (detail.creator.name ?? '').trim() || '알 수 없음',
        }
        : null,
      invitedUsers: (detail.invitedUsers ?? [])
        .map((user) => ({
          userId: user.userId,
          name: (user.name ?? '').trim() || '알 수 없음',
        })),
    }
  },

  getSitePolygon: async (projectId: string): Promise<ProjectSitePolygonResult> => {
    if (!projectId) return { polygonRing: null, source: 'none' }

    let apiPolygonRing: number[][] | null = null
    let apiAreaM2: number | null = null

    // 신선한 실제 대지 캐시가 있으면 project detail API를 호출하지 않는다.
    // 호출하면 다른 polygon이 반환돼 캐시를 덮어쓰고 잘못된 대지가 잠깐 표시된다.
    const existingCache = getProjectSitePolygonEntry(projectId, { ttlMs: SITE_CACHE_TTL_MS })
    const hasFreshRealCache = Boolean(existingCache && !existingCache.isStale && existingCache.source !== 'mock')

    if (shouldFetchSiteFromProjectDetailApi && !hasFreshRealCache) {
      try {
        const apiSiteInfo = await fetchSiteInfoFromProjectDetail(projectId)
        apiPolygonRing = apiSiteInfo.polygonRing
        apiAreaM2 = apiSiteInfo.areaM2
        if (apiPolygonRing) {
          saveProjectSitePolygon(projectId, apiPolygonRing, { source: 'api' })
        }
      } catch {
        // API가 미구현이거나 일시 실패해도 fallback 체인으로 진행한다.
      }
    }

    let cacheCandidate = getProjectSitePolygonEntry(projectId, { ttlMs: SITE_CACHE_TTL_MS })
    if (cacheCandidate?.source === 'mock' && !shouldUseSiteMock) {
      removeProjectSitePolygon(projectId)
      cacheCandidate = null
    }

    const resolved = resolveProjectSiteFallback({
      apiPolygonRing,
      apiAreaM2,
      cacheCandidate,
      mockPolygonRing: MOCK_SITE_POLYGON_RING,
      useMock: shouldUseSiteMock,
      allowStaleCache: true,
    })

    if (resolved.source === 'mock' && resolved.polygonRing) {
      saveProjectSitePolygon(projectId, resolved.polygonRing, { source: 'mock' })
    }

    return resolved
  },

  getIfcSource: async (projectId: string): Promise<ProjectIfcSource> => {
    const project = await fetchProjectSummary(projectId)
    if (!project.currentIfcUrl) {
      return { projectId: project.projectId }
    }

    try {
      const exported = await fetchProjectIfcExport(projectId)
      return {
        projectId: exported.projectId,
        currentIfcUrl: exported.presignedUrl,
        currentIfcStorageUrl: exported.ifcStorageUrl,
        currentRevision: exported.revisionId,
      }
    } catch (error) {
      if (readErrorStatus(error) === 404) {
        return { projectId }
      }
      // 아직 IFC가 없거나 export 권한이 없으면 기존 프로젝트 상세 기반 조회로 fallback한다.
    }

    return {
      projectId: project.projectId,
      currentIfcUrl: project.currentIfcUrl,
      currentIfcStorageUrl: project.currentIfcUrl,
      currentIfcAssetId: project.currentIfcAssetId,
    }
  },

  create: async (data: CreateProjectDto): Promise<Project> => {
    const response = await api.post<ApiResponse<CreateProjectResponse>>('/projects', data)
    return mapCreatedProject(response.data.data)
  },

  update: async (id: string, data: UpdateProjectDto): Promise<Project> => {
    const response = await api.patch<ApiResponse<UpdateProjectResponse>>(`/projects/${id}`, data)
    return mapUpdatedProject(response.data.data)
  },

  updateThumbnail: async (
    id: string,
    data: { thumbnailUrl: string; thumbnailMode: Exclude<EditorMode, 'view'> },
  ): Promise<UpdateProjectThumbnailResponse> => {
    const response = await api.patch<ApiResponse<UpdateProjectThumbnailResponse>>(`/projects/${id}/thumbnail`, data)
    return response.data.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete('/projects', {
      data: {
        projectIds: [id],
      },
    })
  },

  registerSite: async (projectId: string, data: RegisterProjectSiteDto): Promise<ProjectSiteResponse> => {
    const response = await api.post<ApiResponse<ProjectSiteResponse>>(`/projects/${projectId}/site`, data)
    return response.data.data
  },

  getMembers: async (_projectId: string): Promise<ProjectMember[]> => {
    await new Promise((resolve) => setTimeout(resolve, 200))
    return [...MOCK_MEMBERS]
  },
}
