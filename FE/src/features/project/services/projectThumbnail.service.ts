import { api } from '@/shared/lib/axios'
import { readCachedProjectRenderThumbnailUrl, saveProjectRenderThumbnailUrl } from '@/features/project/utils/projectRenderThumbnailCache'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface ProjectRenderUrls {
  manifestUrl?: string | null
  manifest_url?: string | null
  frontDiagonalLeftUrl?: string | null
  front_diagonal_left_url?: string | null
  frontDiagonalRightUrl?: string | null
  front_diagonal_right_url?: string | null
}

interface ProjectRenderResponse {
  renderId?: string | null
  imageUrl?: string | null
  image_url?: string | null
  presignedUrl?: string | null
  presigned_url?: string | null
  primaryResultUrl?: string | null
  primary_result_url?: string | null
  url?: string | null
  renderUrls?: ProjectRenderUrls | null
  render_urls?: ProjectRenderUrls | null
  outputs?: {
    primaryResultUrl?: string | null
    primary_result_url?: string | null
    renderUrls?: ProjectRenderUrls | null
    render_urls?: ProjectRenderUrls | null
  } | null
  status?: string | null
  createdAt?: string | null
  created_at?: string | null
  completedAt?: string | null
  completed_at?: string | null
}

interface ProjectRenderListEnvelope {
  renders?: ProjectRenderResponse[]
  items?: ProjectRenderResponse[]
  content?: ProjectRenderResponse[]
}

const SUCCESS_STATUSES = new Set(['SUCCEEDED', 'COMPLETED', 'SUCCESS', 'DONE'])

const isDisplayableUrl = (value: string | null | undefined): value is string => {
  const normalized = value?.trim()
  return Boolean(normalized) && !normalized?.startsWith('s3://')
}

const firstDisplayableUrl = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    const normalized = value?.trim()
    if (isDisplayableUrl(normalized)) return normalized
  }

  return null
}

const readRenderableImageUrl = (render: ProjectRenderResponse): string | null => {
  const renderUrls = render.renderUrls ?? render.render_urls ?? render.outputs?.renderUrls ?? render.outputs?.render_urls

  return firstDisplayableUrl(
    renderUrls?.frontDiagonalLeftUrl,
    renderUrls?.front_diagonal_left_url,
    renderUrls?.frontDiagonalRightUrl,
    renderUrls?.front_diagonal_right_url,
    render.presignedUrl,
    render.presigned_url,
    render.imageUrl,
    render.image_url,
    render.outputs?.primaryResultUrl,
    render.outputs?.primary_result_url,
    render.primaryResultUrl,
    render.primary_result_url,
    render.url,
  )
}

const readRenderTime = (render: ProjectRenderResponse): number => {
  const value = render.completedAt ?? render.completed_at ?? render.createdAt ?? render.created_at
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const readRenderList = (data: ProjectRenderResponse[] | ProjectRenderListEnvelope): ProjectRenderResponse[] => {
  if (Array.isArray(data)) return data
  return data.renders ?? data.items ?? data.content ?? []
}

const isSuccessfulRender = (render: ProjectRenderResponse): boolean => {
  const status = render.status?.trim().toUpperCase()
  return !status || SUCCESS_STATUSES.has(status)
}

export const projectThumbnailService = {
  getLatestRenderedImageUrl: async (projectId: string): Promise<string | null> => {
    try {
      const response = await api.get<ApiResponse<ProjectRenderResponse[] | ProjectRenderListEnvelope>>(`/projects/${projectId}/renders`)
      const renders = readRenderList(response.data.data)
      const candidates = [...renders]
        .sort((a, b) => readRenderTime(b) - readRenderTime(a))

      const imageUrl = candidates
        .filter(isSuccessfulRender)
        .map(readRenderableImageUrl)
        .find((imageUrl): imageUrl is string => Boolean(imageUrl))
        ?? candidates
          .map(readRenderableImageUrl)
          .find((imageUrl): imageUrl is string => Boolean(imageUrl))
        ?? null

      saveProjectRenderThumbnailUrl(projectId, imageUrl)
      return imageUrl ?? readCachedProjectRenderThumbnailUrl(projectId)
    } catch {
      return readCachedProjectRenderThumbnailUrl(projectId)
    }
  },
}
