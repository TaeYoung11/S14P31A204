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

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

const PROJECT_LIST_PAGE_SIZE = 6
const PROJECT_LIST_MAX_PAGES = 100
const IFC_ACCEPT_HEADER = 'application/octet-stream,text/plain,application/json'

interface ProjectSummaryResponse {
  projectId: string
  ownerUserId?: string
  name: string
  description?: string
  cadastralAddress?: string
  cadastralInfo?: CadastralInfo
  currentIfcUrl?: string
  createdAt: string
  updatedAt: string
  unreadCommentCount?: number
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

const MOCK_SITE_POLYGON_RING: number[][] = [
  [127.0281304, 37.4981036],
  [127.0283847, 37.4981036],
  [127.0283847, 37.4983271],
  [127.0281304, 37.4983271],
]

const shouldUseSiteMock = import.meta.env.VITE_USE_SITE_MOCK === 'true'
const shouldUseProjectDetailApi = import.meta.env.VITE_USE_PROJECT_DETAIL_API === 'true'
const shouldFetchSiteFromProjectDetailApi = import.meta.env.VITE_USE_PROJECT_DETAIL_SITE_API === 'true'
const SITE_CACHE_TTL_MS = PROJECT_SITE_CACHE_TTL_MS
const projectSummaryCache = new Map<string, ProjectSummaryResponse>()

export interface ProjectSiteResponse {
  projectId: string
  cadastralInfo?: CadastralInfo
  createdAt: string
}

export interface ProjectIfcSource {
  projectId: string
  currentIfcUrl?: string
}

const mapProjectSummary = (project: ProjectSummaryResponse): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? '',
  owner_id: project.ownerUserId ?? '',
  created_at: project.createdAt,
  updated_at: project.updatedAt,
  thumbnail_url: undefined,
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
  member_count: fallback?.member_count ?? 0,
  ifc_uploaded: fallback?.ifc_uploaded ?? false,
  unread_comment_count: project.unreadCommentCount ?? fallback?.unread_comment_count ?? 0,
})

function decodeUtf8ArrayBuffer(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(buffer)
}

function createEmptyProjectListPage(page: number): ProjectListResponse {
  return {
    projects: [],
    page,
    size: PROJECT_LIST_PAGE_SIZE,
    totalElements: 0,
    totalPages: 0,
    hasNext: false,
  }
}

function createFallbackProjectSummary(projectId: string): ProjectSummaryResponse {
  const now = new Date().toISOString()
  return {
    projectId,
    name: '프로젝트',
    description: '',
    createdAt: now,
    updatedAt: now,
  }
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
  } catch {
    return createEmptyProjectListPage(page)
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

  return createFallbackProjectSummary(projectId)
}

async function fetchProjectSummary(projectId: string): Promise<ProjectSummaryResponse> {
  if (shouldUseProjectDetailApi) {
    try {
      const response = await api.get<ApiResponse<ProjectSummaryResponse>>(`/projects/${projectId}`)
      const project = response.data.data
      projectSummaryCache.set(project.projectId, project)
      return project
    } catch {
      // 상세 API가 미구현/오류인 환경에서는 목록 기반 조회로 fallback 한다.
    }
  }

  return findProjectSummaryFromList(projectId)
}

/**
 * 프로젝트 상세 응답에서 대지 폴리곤을 읽어온다.
 * - 응답에 대지 정보가 없거나 형식이 맞지 않으면 null
 * - 네트워크/서버 오류는 상위 fallback 체인에서 처리
 */
async function fetchSitePolygonFromProjectDetail(projectId: string): Promise<number[][] | null> {
  const project = await fetchProjectSummary(projectId)
  return extractOuterRingFromCoordinates(project?.cadastralInfo?.polygon?.coordinates)
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

  getSitePolygon: async (projectId: string): Promise<ProjectSitePolygonResult> => {
    if (!projectId) return { polygonRing: null, source: 'none' }

    let apiPolygonRing: number[][] | null = null

    if (shouldFetchSiteFromProjectDetailApi) {
      try {
        apiPolygonRing = await fetchSitePolygonFromProjectDetail(projectId)
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

  getIfcModelText: async (projectId: string): Promise<string | null> => {
    const response = await api.get<ArrayBuffer>(`/projects/${projectId}/model`, {
      responseType: 'arraybuffer',
      headers: {
        Accept: IFC_ACCEPT_HEADER,
      },
      validateStatus: (status) => status === 200 || status === 401 || status === 403 || status === 404 || status === 500,
    })
    if (response.status !== 200) return null
    const ifcText = decodeUtf8ArrayBuffer(response.data)
    return ifcText.trim().length > 0 ? ifcText : null
  },

  getIfcSource: async (projectId: string): Promise<ProjectIfcSource> => {
    const project = await fetchProjectSummary(projectId)
    return {
      projectId: project.projectId,
      currentIfcUrl: project.currentIfcUrl,
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
