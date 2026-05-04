import { MOCK_MEMBERS } from '@/features/project/mocks/project.mock'
import { api } from '@/shared/lib/axios'

import type { Project, ProjectMember, CreateProjectDto, UpdateProjectDto } from '@/shared/types'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

const PROJECT_LIST_PAGE_SIZE = 6
const PROJECT_LIST_MAX_PAGES = 100
const IFC_ACCEPT_HEADER = 'application/octet-stream,text/plain'

interface ProjectSummaryResponse {
  projectId: string
  name: string
  description?: string
  cadastralAddress?: string
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

export interface ProjectSiteResponse {
  projectId: string
  cadastralInfo?: CadastralInfo
  createdAt: string
}

const mapProjectSummary = (project: ProjectSummaryResponse): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? '',
  owner_id: '',
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

/** API 에러가 404(Not Found)인지 판별한다. */
function isNotFoundError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status === 404
}

/** 프로젝트 목록 페이지 1회를 조회한다. */
async function fetchProjectListPage(page: number): Promise<ProjectListResponse> {
  const response = await api.get<ApiResponse<ProjectListResponse>>('/projects', {
    params: { page, size: PROJECT_LIST_PAGE_SIZE },
  })
  return response.data.data
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
    const response = await api.get<ApiResponse<ProjectSummaryResponse>>(`/projects/${id}`)
    return mapProjectSummary(response.data.data)
  },

  getIfcModelText: async (projectId: string): Promise<string | null> => {
    try {
      const response = await api.get<ArrayBuffer>(`/projects/${projectId}/model`, {
        responseType: 'arraybuffer',
        headers: {
          Accept: IFC_ACCEPT_HEADER,
        },
      })
      const ifcText = decodeUtf8ArrayBuffer(response.data)
      return ifcText.trim().length > 0 ? ifcText : null
    } catch (error: unknown) {
      if (isNotFoundError(error)) return null
      throw error
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

  invite: async (_projectId: string, email: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    console.log(`[mock] Invited ${email} to project ${_projectId}`)
  },

  getMembers: async (_projectId: string): Promise<ProjectMember[]> => {
    await new Promise((resolve) => setTimeout(resolve, 200))
    return [...MOCK_MEMBERS]
  },
}
