// 프로젝트 렌더링 API 요청과 응답 DTO를 정의한다.
export interface ProjectRenderStyleRequest {
  timeOfDay?: string | null
  viewpoint?: string | null
  season?: string | null
  weather?: string | null
}

export interface CreateProjectRenderRequest {
  prompt: string
  negativePrompt?: string
  style?: ProjectRenderStyleRequest
  cameraState?: unknown
  sourceImageStorageUrl?: string | null
  width?: number
  height?: number
}

export interface CreateProjectRenderResponse {
  renderId: string
  jobStepId: string
  projectId: string
  sourceRevisionId: string
  expectedOutputArtifactId: string
  status: string
  progress: number
}

export interface ProjectRenderUrls {
  manifestUrl?: string | null
  frontDiagonalLeftUrl?: string | null
  frontDiagonalRightUrl?: string | null
}

export interface ProjectRenderResponse {
  renderId: string
  style: ProjectRenderStyleRequest | null
  imageUrl: string | null
  presignedUrl?: string | null
  renderUrls?: ProjectRenderUrls | null
  status: string
  progress?: number | null
  createdAt: string
  completedAt: string | null
}

export interface ProjectRenderSsePayload {
  action?: string
  projectId?: string
  renderId?: string
  jobId?: string
  jobStepId?: string
  status?: string
  progress?: number
  imageUrl?: string | null
  renderUrls?: ProjectRenderUrls | null
  message?: string | null
}

export interface ProjectRenderSseEvent {
  event: string
  payload: ProjectRenderSsePayload
}
