import { isAxiosError } from 'axios'
import { api } from '@/shared/lib/axios'
import { assertLayoutImportV2, type LayoutImportV2 } from './floorPlanGenerate.contract'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface CreateFloorPlanGenerateRequest {
  layoutImport?: LayoutImportV2
}

export interface CreateFloorPlanGenerateResponse {
  projectId: string
  jobId: string
  jobStepId: string
  targetRevisionId: string
  expectedOutputArtifactId: string
  inputSource: string
  status: string
  progress: number
}

export interface FloorPlanIfcExportResponse {
  projectId: string
  revisionId: string
  ifcStorageUrl: string
  presignedUrl: string
  expiresAt: string
}

export interface GenerateFloorPlanApiInput {
  projectId: string
  layoutImport?: LayoutImportV2
}

const FLOOR_PLAN_EXPORT_POLL_INTERVAL_MS = 1000
const FLOOR_PLAN_EXPORT_POLL_TIMEOUT_MS = 120_000
const FLOOR_PLAN_EXPORT_POLL_MAX_INTERVAL_MS = 8000

interface WaitForFloorPlanIfcExportOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return
  throw new DOMException('Floor-plan IFC export polling aborted.', 'AbortError')
}

const sleep = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal)

    let timeoutId = 0

    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      reject(new DOMException('Floor-plan IFC export polling aborted.', 'AbortError'))
    }

    timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)

    signal?.addEventListener('abort', handleAbort, { once: true })
  })

export const getFloorPlanExportPollDelayMs = (attempt: number): number => {
  const multiplier = 2 ** Math.max(0, attempt)
  return Math.min(
    FLOOR_PLAN_EXPORT_POLL_INTERVAL_MS * multiplier,
    FLOOR_PLAN_EXPORT_POLL_MAX_INTERVAL_MS,
  )
}

export async function requestFloorPlanGenerate(input: GenerateFloorPlanApiInput): Promise<CreateFloorPlanGenerateResponse> {
  if (input.layoutImport !== undefined) {
    assertLayoutImportV2(input.layoutImport)
  }

  const body: CreateFloorPlanGenerateRequest = {
    ...(input.layoutImport !== undefined ? { layoutImport: input.layoutImport } : {}),
  }

  const response = await api.post<ApiResponse<CreateFloorPlanGenerateResponse>>(
    `/projects/${input.projectId}/floor-plans/generate`,
    body,
  )
  return response.data.data
}

export async function requestFloorPlanIfcExport(projectId: string, signal?: AbortSignal): Promise<FloorPlanIfcExportResponse> {
  const response = await api.get<ApiResponse<FloorPlanIfcExportResponse>>(
    `/projects/${projectId}/ifc/export`,
    { signal },
  )
  return response.data.data
}

export async function waitForFloorPlanIfcExport(
  projectId: string,
  targetRevisionId: string,
  options: WaitForFloorPlanIfcExportOptions = {},
): Promise<FloorPlanIfcExportResponse> {
  const timeoutMs = options.timeoutMs ?? FLOOR_PLAN_EXPORT_POLL_TIMEOUT_MS
  const signal = options.signal
  const startedAt = Date.now()
  let attempt = 0

  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal)

    try {
      const exported = await requestFloorPlanIfcExport(projectId, signal)
      if (exported.revisionId === targetRevisionId && exported.presignedUrl.trim().length > 0) {
        return exported
      }
    } catch (error: unknown) {
      // 작업 완료 전에는 IFC export 소스가 아직 없을 수 있으므로 제한 시간까지 재시도한다.
      if (signal?.aborted) throw error
      if (!isAxiosError(error) || error.response?.status !== 404) {
        throw error
      }
    }

    await sleep(getFloorPlanExportPollDelayMs(attempt), signal)
    attempt += 1
  }

  throw new Error('Floor-plan IFC export timed out.')
}
