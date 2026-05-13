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

export interface GenerateFloorPlanApiInput {
  projectId: string
  layoutImport?: LayoutImportV2
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
