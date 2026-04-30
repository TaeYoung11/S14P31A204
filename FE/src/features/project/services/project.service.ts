import { MOCK_MEMBERS } from '@/features/project/mocks/project.mock'
import { api } from '@/shared/lib/axios'

import type { Project, ProjectMember, CreateProjectDto, UpdateProjectDto } from '@/shared/types'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

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

export interface ProjectListPageResult {
  projects: Project[]
  hasNext: boolean
  page: number
}

export const projectService = {
  getAll: async (): Promise<Project[]> => {
    const all: Project[] = []
    let page = 0
    const maxPages = 100

    while (page <= maxPages) {
      const response = await api.get<ApiResponse<ProjectListResponse>>('/projects', {
        params: { page, size: 6 },
      })
      const data = response.data.data
      all.push(...data.projects.map(mapProjectSummary))
      if (!data.hasNext) break
      page++
    }

    return all
  },

  getList: async (page: number = 0): Promise<ProjectListPageResult> => {
    const response = await api.get<ApiResponse<ProjectListResponse>>('/projects', {
      params: { page, size: 6 },
    })
    const data = response.data.data
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
          Accept: 'application/octet-stream,text/plain',
        },
      })
      const ifcText = new TextDecoder('utf-8').decode(response.data)
      return ifcText.trim().length > 0 ? ifcText : null
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 404) return null
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
    return MOCK_MEMBERS.filter(() => true)
  },
}
