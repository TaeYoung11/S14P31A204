import { api } from '@/shared/lib/axios'
import type { BubbleData, ConnectionData, FloorOpening, FloorWall } from '../types'
import type { LlmEditResponse } from '../types/llmEdit.types'
import { extractLlmEditApiErrorMessage, normalizeLlmEditApiResponse } from '../utils/llmEditApiResponse'
import { interpretLlmEditPromptMock } from '../utils/llmEditMockInterpreter'
import { createErrorResponse } from '../utils/llmEditResponseFactory'
import type { LlmEditApiRequestBody, LlmEditApiResponse } from './llmEdit.contract'

export interface LlmEditRequest {
  projectId: string | null
  prompt: string
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
}

export type LlmEditProvider = 'mock' | 'api'

interface LlmEditGateway {
  requestEdit: (request: LlmEditRequest) => Promise<LlmEditResponse>
}

const SIMULATED_DELAY_MS = 850
const LLM_EDIT_PROVIDER: LlmEditProvider = 'api'

/** 프론트 단독 개발 및 API 실패 폴백용 mock 서비스 */
async function requestLlmEditMock({
  prompt,
  bubbles,
  connections,
  floorWalls,
  floorOpenings,
}: LlmEditRequest): Promise<LlmEditResponse> {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS))
  return interpretLlmEditPromptMock({ prompt, bubbles, connections, floorWalls, floorOpenings })
}

const resolveLlmEndpoint = (projectId: string) => `/projects/${projectId}/floor/command`

/** 실제 LLM API 호출 */
async function requestLlmEditApi(request: LlmEditRequest): Promise<LlmEditResponse> {
  if (!request.projectId) {
    return createErrorResponse('프로젝트 ID가 없어 AI 수정 요청을 실행할 수 없습니다.')
  }

  try {
    const endpoint = resolveLlmEndpoint(request.projectId)
    const payload: LlmEditApiRequestBody = {
      text: request.prompt,
      context: {
        bubbles: request.bubbles,
        connections: request.connections,
        floorWalls: request.floorWalls,
        floorOpenings: request.floorOpenings,
      },
    }
    const response = await api.post<LlmEditApiResponse>(endpoint, payload)
    return normalizeLlmEditApiResponse(response.data)
  } catch (error: unknown) {
    const message = extractLlmEditApiErrorMessage(error)
    if (message) {
      return createErrorResponse(message)
    }
    return createErrorResponse('AI 수정 API 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
}

/** API 호출 실패 시 mock 결과로 자동 폴백한다. */
async function requestLlmEditApiWithMockFallback(request: LlmEditRequest): Promise<LlmEditResponse> {
  const apiResult = await requestLlmEditApi(request)
  if (apiResult.kind !== 'error') {
    return apiResult
  }
  // 프론트 개발/로컬 테스트에서 백엔드 미연결 상태를 흡수하기 위한 안전 폴백이다.
  return requestLlmEditMock(request)
}

const mockGateway: LlmEditGateway = {
  requestEdit: requestLlmEditMock,
}

const apiGateway: LlmEditGateway = {
  requestEdit: requestLlmEditApiWithMockFallback,
}

const resolveProvider = (): LlmEditProvider => LLM_EDIT_PROVIDER

/** 현재 빌드에서 노출되는 LLM provider를 반환한다. */
export const getLlmEditProvider = (): LlmEditProvider => resolveProvider()

const resolveGateway = (): LlmEditGateway => (resolveProvider() === 'api' ? apiGateway : mockGateway)

/** LLM 편집 요청 진입점 */
export async function requestLlmEdit(request: LlmEditRequest): Promise<LlmEditResponse> {
  return resolveGateway().requestEdit(request)
}
