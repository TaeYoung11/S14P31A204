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

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, delayMs))

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

export async function requestFloorPlanIfcExport(projectId: string): Promise<FloorPlanIfcExportResponse> {
  const response = await api.get<ApiResponse<FloorPlanIfcExportResponse>>(
    `/projects/${projectId}/ifc/export`,
  )
  return response.data.data
}

export async function waitForFloorPlanIfcExport(
  projectId: string,
  targetRevisionId: string,
  timeoutMs = FLOOR_PLAN_EXPORT_POLL_TIMEOUT_MS,
): Promise<FloorPlanIfcExportResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const exported = await requestFloorPlanIfcExport(projectId)
      if (exported.revisionId === targetRevisionId && exported.presignedUrl.trim().length > 0) {
        return exported
      }
    } catch {
      // 작업 완료 전에는 IFC export 소스가 아직 없을 수 있으므로 제한 시간까지 재시도한다.
    }

    await sleep(FLOOR_PLAN_EXPORT_POLL_INTERVAL_MS)
  }

  throw new Error('Floor-plan IFC export timed out.')
}
