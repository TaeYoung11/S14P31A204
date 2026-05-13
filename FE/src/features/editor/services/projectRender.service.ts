// 프로젝트 렌더링 API 호출과 결과 이미지 URL 변환을 담당한다.
import { api } from '@/shared/lib/axios'
import type {
  CreateProjectRenderRequest,
  CreateProjectRenderResponse,
  ProjectRenderResponse,
  ProjectRenderUrls,
} from '../types/projectRender.dto'

export type {
  CreateProjectRenderRequest,
  CreateProjectRenderResponse,
  ProjectRenderResponse,
  ProjectRenderStyleRequest,
  ProjectRenderUrls,
} from '../types/projectRender.dto'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface WaitForProjectRenderImageOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const PROJECT_RENDER_POLL_INTERVAL_MS = 1500
const PROJECT_RENDER_POLL_MAX_INTERVAL_MS = 8000
const PROJECT_RENDER_POLL_TIMEOUT_MS = 180_000
const TERMINAL_FAILURE_STATUSES = new Set(['FAILED', 'CANCELLED'])

export const DEFAULT_VIEW_RENDER_REQUEST: CreateProjectRenderRequest = {
  prompt: [
    'Photorealistic architectural rendering of the current IFC building model',
    'clean modern residential exterior',
    'realistic materials',
    'natural light',
    'high quality visualization',
  ].join(', '),
  negativePrompt: 'low quality, blurry, distorted geometry, text, watermark',
  style: {
    timeOfDay: 'DAYLIGHT',
    viewpoint: 'EXTERIOR',
    season: 'SPRING',
    weather: 'CLEAR',
  },
  sourceImageStorageUrl: null,
  width: 1024,
  height: 1024,
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return
  throw new DOMException('Project render polling aborted.', 'AbortError')
}

const sleep = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal)

    let timeoutId = 0

    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      reject(new DOMException('Project render polling aborted.', 'AbortError'))
    }

    timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)

    signal?.addEventListener('abort', handleAbort, { once: true })
  })

const getPollDelayMs = (attempt: number): number => {
  const multiplier = 2 ** Math.max(0, attempt)
  return Math.min(PROJECT_RENDER_POLL_INTERVAL_MS * multiplier, PROJECT_RENDER_POLL_MAX_INTERVAL_MS)
}

export async function createProjectRender(
  projectId: string,
  request: CreateProjectRenderRequest = DEFAULT_VIEW_RENDER_REQUEST,
  signal?: AbortSignal,
): Promise<CreateProjectRenderResponse> {
  const response = await api.post<ApiResponse<CreateProjectRenderResponse>>(
    `/projects/${projectId}/renders`,
    request,
    { signal },
  )
  return response.data.data
}

export async function fetchProjectRenders(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectRenderResponse[]> {
  const response = await api.get<ApiResponse<ProjectRenderResponse[]>>(
    `/projects/${projectId}/renders`,
    { signal },
  )
  return response.data.data
}

export async function fetchProjectRender(
  projectId: string,
  renderId: string,
  signal?: AbortSignal,
): Promise<ProjectRenderResponse> {
  const response = await api.get<ApiResponse<ProjectRenderResponse>>(
    `/projects/${projectId}/renders/${renderId}`,
    { signal },
  )
  return response.data.data
}

export function resolveProjectRenderImageUrl(render: ProjectRenderResponse): string {
  const normalized = (
    render.renderUrls?.frontDiagonalLeftUrl
    ?? render.presignedUrl
    ?? render.imageUrl
    ?? ''
  ).trim()
  if (!normalized) return normalized
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/')) {
    return normalized
  }
  if (normalized.startsWith('s3://')) {
    throw new Error('Render image requires a presignedUrl from the backend.')
  }
  return normalized
}

export function resolveProjectRenderUrls(render: ProjectRenderResponse): ProjectRenderUrls {
  const leftUrl = resolveProjectRenderImageUrl(render)
  return {
    manifestUrl: render.renderUrls?.manifestUrl ?? null,
    frontDiagonalLeftUrl: leftUrl || null,
    frontDiagonalRightUrl: render.renderUrls?.frontDiagonalRightUrl ?? null,
  }
}

export async function waitForProjectRenderImage(
  projectId: string,
  renderId: string,
  options: WaitForProjectRenderImageOptions = {},
): Promise<ProjectRenderResponse> {
  const timeoutMs = options.timeoutMs ?? PROJECT_RENDER_POLL_TIMEOUT_MS
  const signal = options.signal
  const startedAt = Date.now()
  let attempt = 0

  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal)

    const renders = await fetchProjectRenders(projectId, signal)
    const target = renders.find((render) => render.renderId === renderId)

    if (
      target?.status === 'SUCCEEDED'
      && (
        target.renderUrls?.frontDiagonalLeftUrl
        ?? target.renderUrls?.frontDiagonalRightUrl
        ?? target.imageUrl
      )?.trim()
    ) {
      return target
    }

    if (target && TERMINAL_FAILURE_STATUSES.has(target.status)) {
      throw new Error(`Project render failed with status ${target.status}.`)
    }

    await sleep(getPollDelayMs(attempt), signal)
    attempt += 1
  }

  throw new Error('Project render polling timed out.')
}
