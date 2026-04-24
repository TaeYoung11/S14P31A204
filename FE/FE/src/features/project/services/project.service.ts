import { MOCK_PROJECTS, MOCK_MEMBERS } from '@/features/project/mocks/project.mock'
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
  createdAt: string
  updatedAt: string
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
}

interface UpdateProjectResponse {
  projectId: string
  name: string
  description?: string
  updatedAt: string
}

interface RegisterProjectSiteDto {
  latitude: number
  longitude: number
}

export interface ProjectSiteResponse {
  projectId: string
  createdAt: string
}

let projects = [...MOCK_PROJECTS]

const mapProjectSummary = (project: ProjectSummaryResponse): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? '',
  owner_id: '',
  created_at: project.createdAt,
  updated_at: project.updatedAt,
  thumbnail_url: undefined,
  member_count: 0,
  ifc_uploaded: false,
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
})

const mapUpdatedProject = (project: UpdateProjectResponse, fallback?: Project): Project => ({
  id: project.projectId,
  name: project.name,
  description: project.description ?? '',
  owner_id: fallback?.owner_id ?? '',
  created_at: fallback?.created_at ?? project.updatedAt,
  updated_at: project.updatedAt,
  thumbnail_url: fallback?.thumbnail_url,
  member_count: fallback?.member_count ?? 0,
  ifc_uploaded: fallback?.ifc_uploaded ?? false,
})

const createMockProject = (data: CreateProjectDto): Project => ({
  id: `mock-project-${Date.now()}`,
  name: data.name,
  description: data.description,
  owner_id: 'mock-user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  thumbnail_url: undefined,
  member_count: 1,
  ifc_uploaded: false,
})

export const projectService = {
  getList: async (): Promise<Project[]> => {
    try {
      const response = await api.get<ApiResponse<ProjectListResponse>>('/projects')
      const mappedProjects = response.data.data.projects.map(mapProjectSummary)
      projects = mappedProjects
      return mappedProjects
    } catch {
      return projects
    }
  },

  getById: async (id: string): Promise<Project> => {
    if (projects.length === 0) {
      await projectService.getList()
    }

    const project = projects.find((item) => item.id === id)
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.')
    return project
  },

  create: async (data: CreateProjectDto): Promise<Project> => {
    let newProject: Project

    try {
      const response = await api.post<ApiResponse<CreateProjectResponse>>('/projects', data)
      newProject = mapCreatedProject(response.data.data)
    } catch {
      newProject = createMockProject(data)
    }

    projects = [newProject, ...projects]
    return newProject
  },

  update: async (id: string, data: UpdateProjectDto): Promise<Project> => {
    const response = await api.patch<ApiResponse<UpdateProjectResponse>>(`/projects/${id}`, data)
    const existingProject = projects.find((item) => item.id === id)
    const updatedProject = mapUpdatedProject(response.data.data, existingProject)

    if (existingProject) {
      projects = projects.map((item) => (item.id === id ? updatedProject : item))
    } else {
      projects = [updatedProject, ...projects]
    }

    return updatedProject
  },

  delete: async (id: string): Promise<void> => {
    await api.delete('/projects', {
      data: {
        projectIds: [id],
      },
    })

    projects = projects.filter((item) => item.id !== id)
  },

  registerSite: async (projectId: string, data: RegisterProjectSiteDto): Promise<ProjectSiteResponse> => {
    try {
      const response = await api.post<ApiResponse<ProjectSiteResponse>>(`/projects/${projectId}/site`, data)
      return response.data.data
    } catch {
      return {
        projectId,
        createdAt: new Date().toISOString(),
      }
    }
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
