import type { BubbleData, ConnectionData } from '../types'
import type { LlmEditOperation, LlmEditResponse } from '../types/llmEdit.types'
import { api } from '@/shared/lib/axios'
import type {
  LlmEditApiRequestBody,
  LlmEditApiResponse,
} from './llmEdit.contract'

export interface LlmEditRequest {
  projectId: string | null
  prompt: string
  bubbles: BubbleData[]
  connections: ConnectionData[]
}

export type LlmEditProvider = 'mock' | 'api'

interface LlmEditGateway {
  requestEdit: (request: LlmEditRequest) => Promise<LlmEditResponse>
}

const SIMULATED_DELAY_MS = 850

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

/** 프론트 단독 개발용 LLM 편집 mock 서비스 */
async function requestLlmEditMock({
  prompt,
  bubbles,
  connections,
}: LlmEditRequest): Promise<LlmEditResponse> {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS))

  const raw = prompt.trim()
  if (!raw) {
    return {
      kind: 'ambiguous',
      message: '요청 문장이 비어 있습니다. 수정할 내용을 구체적으로 입력해 주세요.',
      suggestions: ['거실과 주방 사이에 연결 추가해줘', '현관/로비를 현관으로 이름 변경해줘'],
    }
  }

  const normalizedPrompt = normalize(raw)
  const referenced = bubbles.filter((bubble) => normalizedPrompt.includes(normalize(bubble.label)))

  const includesConnect = normalizedPrompt.includes('연결')
  const includesAdd = normalizedPrompt.includes('추가')
  const includesRemove = normalizedPrompt.includes('삭제') || normalizedPrompt.includes('제거')

  if (includesConnect && includesAdd) {
    if (referenced.length < 2) {
      return {
        kind: 'ambiguous',
        message: '연결할 두 공간을 정확히 찾지 못했습니다. 공간 이름을 두 개 이상 포함해 주세요.',
        suggestions: ['거실과 주방 사이에 연결 추가해줘', '현관/로비와 거실 연결 추가해줘'],
      }
    }
    return {
      kind: 'ok',
      summary: '요청한 두 공간 사이에 연결을 추가합니다.',
      operations: [
        {
          kind: 'add_connection',
          fromId: referenced[0].id,
          toId: referenced[1].id,
          style: 'thin',
        },
      ],
    }
  }

  if (includesConnect && includesRemove) {
    if (referenced.length < 2) {
      return {
        kind: 'ambiguous',
        message: '삭제할 연결선을 특정하지 못했습니다. 연결된 두 공간 이름을 함께 입력해 주세요.',
        suggestions: ['거실과 주방 연결 삭제해줘', '현관/로비와 거실 연결 제거해줘'],
      }
    }
    const hasConnection = connections.some(
      (connection) =>
        (connection.from === referenced[0].id && connection.to === referenced[1].id) ||
        (connection.from === referenced[1].id && connection.to === referenced[0].id),
    )
    if (!hasConnection) {
      return {
        kind: 'ambiguous',
        message: '지정한 두 공간 사이에 기존 연결이 없어 삭제할 수 없습니다.',
        suggestions: ['연결할 공간 이름을 다시 확인해 주세요.'],
      }
    }
    return {
      kind: 'ok',
      summary: '요청한 두 공간 사이의 연결을 삭제합니다.',
      operations: [
        {
          kind: 'remove_connection',
          fromId: referenced[0].id,
          toId: referenced[1].id,
        },
      ],
    }
  }

  const renameToMatch = raw.match(/['"]?([^'"]+)['"]?\s*(?:으로|로)\s*(?:이름\s*)?(?:변경|수정|바꿔)/)
  if (renameToMatch && referenced.length >= 1) {
    const nextLabel = renameToMatch[1].trim()
    if (!nextLabel) {
      return {
        kind: 'ambiguous',
        message: '변경할 이름을 확인하지 못했습니다. 새 이름을 함께 입력해 주세요.',
        suggestions: ['현관/로비를 현관으로 이름 변경해줘'],
      }
    }
    return {
      kind: 'ok',
      summary: '요청한 공간 이름을 변경합니다.',
      operations: [
        {
          kind: 'rename_bubble',
          bubbleId: referenced[0].id,
          nextLabel,
        },
      ],
    }
  }

  const addBubbleMatch = raw.match(/([가-힣A-Za-z0-9/ ]+?)\s*(?:공간|방|버블)\s*(?:을|를)?\s*추가/)
  if (addBubbleMatch) {
    const label = addBubbleMatch[1].trim()
    if (!label) {
      return {
        kind: 'ambiguous',
        message: '추가할 공간 이름을 확인하지 못했습니다.',
        suggestions: ['서재 공간 추가해줘', '드레스룸 방 추가해줘'],
      }
    }
    return {
      kind: 'ok',
      summary: '새 공간 버블을 추가합니다.',
      operations: [
        {
          kind: 'add_bubble',
          label,
          type: '미선택',
          nearBubbleId: referenced[0]?.id,
        },
      ],
    }
  }

  return {
    kind: 'ambiguous',
    message: '요청을 명확하게 해석하지 못했습니다. 공간 이름과 동작을 구체적으로 입력해 주세요.',
    suggestions: [
      '거실과 주방 사이에 연결 추가해줘',
      '거실과 주방 연결 삭제해줘',
      '현관/로비를 현관으로 이름 변경해줘',
      '서재 공간 추가해줘',
    ],
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isOperation = (value: unknown): value is LlmEditOperation => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'add_connection') {
    return (
      typeof value.fromId === 'string' &&
      typeof value.toId === 'string' &&
      (value.style === undefined || value.style === 'thin' || value.style === 'bold' || value.style === 'dashed')
    )
  }
  if (value.kind === 'remove_connection') {
    return typeof value.fromId === 'string' && typeof value.toId === 'string'
  }
  if (value.kind === 'rename_bubble') {
    return typeof value.bubbleId === 'string' && typeof value.nextLabel === 'string'
  }
  if (value.kind === 'add_bubble') {
    return (
      typeof value.label === 'string' &&
      (value.type === undefined || typeof value.type === 'string') &&
      (value.nearBubbleId === undefined || typeof value.nearBubbleId === 'string')
    )
  }
  return false
}

const isOperationArray = (value: unknown): value is LlmEditOperation[] =>
  Array.isArray(value) && value.every(isOperation)

/** 백엔드 응답을 프론트 공통 LlmEditResponse 형태로 정규화 */
function normalizeApiResponse(raw: LlmEditApiResponse | unknown): LlmEditResponse {
  if (!isRecord(raw)) {
    return {
      kind: 'error',
      message: 'LLM 응답 형식을 해석하지 못했습니다.',
    }
  }

  // 프론트 직접 렌더링 원칙: 이미지 기반 응답은 허용하지 않음
  if (typeof raw.image_b64 === 'string' || typeof raw.image === 'string') {
    return {
      kind: 'error',
      message: '이미지 렌더 응답은 지원하지 않습니다. JSON 명령(operations) 응답이 필요합니다.',
    }
  }

  // 표준 형식: { kind: 'ok' | 'ambiguous' | 'error', ... }
  if (raw.kind === 'ok' && typeof raw.summary === 'string' && isOperationArray(raw.operations)) {
    return {
      kind: 'ok',
      summary: raw.summary,
      operations: raw.operations,
    }
  }
  if (raw.kind === 'ambiguous' && typeof raw.message === 'string') {
    return {
      kind: 'ambiguous',
      message: raw.message,
      suggestions: isStringArray(raw.suggestions) ? raw.suggestions : [],
    }
  }
  if (raw.kind === 'error' && typeof raw.message === 'string') {
    return {
      kind: 'error',
      message: raw.message,
    }
  }

  // 호환 형식: { status: 'ok' | 'ambiguous' | 'error', ... }
  if (raw.status === 'ok' && typeof raw.summary === 'string' && isOperationArray(raw.operations)) {
    return {
      kind: 'ok',
      summary: raw.summary,
      operations: raw.operations,
    }
  }
  if (raw.status === 'ambiguous' && typeof raw.message === 'string') {
    return {
      kind: 'ambiguous',
      message: raw.message,
      suggestions: isStringArray(raw.suggestions) ? raw.suggestions : [],
    }
  }
  if (raw.status === 'error' && typeof raw.message === 'string') {
    return {
      kind: 'error',
      message: raw.message,
    }
  }

  return {
    kind: 'error',
    message: 'LLM 응답 스키마가 프론트 계약과 일치하지 않습니다.',
  }
}

const resolveLlmEndpoint = (projectId: string) => {
  const template = import.meta.env.VITE_LLM_EDIT_ENDPOINT_TEMPLATE as string | undefined
  if (template && template.includes('{projectId}')) {
    return template.replace('{projectId}', projectId)
  }
  return `/projects/${projectId}/floor/command`
}

/** 실제 LLM API 호출 */
async function requestLlmEditApi(request: LlmEditRequest): Promise<LlmEditResponse> {
  if (!request.projectId) {
    return {
      kind: 'error',
      message: '프로젝트 ID가 없어 AI 수정 요청을 실행할 수 없습니다.',
    }
  }

  try {
    const endpoint = resolveLlmEndpoint(request.projectId)
    const payload: LlmEditApiRequestBody = {
      text: request.prompt,
      context: {
        bubbles: request.bubbles,
        connections: request.connections,
      },
    }
    const response = await api.post<LlmEditApiResponse>(endpoint, payload)
    return normalizeApiResponse(response.data)
  } catch (error: unknown) {
    if (isRecord(error) && isRecord(error.response) && isRecord(error.response.data)) {
      const message = error.response.data.message
      if (typeof message === 'string' && message.trim().length > 0) {
        return {
          kind: 'error',
          message,
        }
      }
    }
    return {
      kind: 'error',
      message: 'AI 수정 API 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    }
  }
}

const mockGateway: LlmEditGateway = {
  requestEdit: requestLlmEditMock,
}

const apiGateway: LlmEditGateway = {
  requestEdit: requestLlmEditApi,
}

const resolveProvider = (): LlmEditProvider => {
  const envProvider = import.meta.env.VITE_LLM_EDIT_PROVIDER as LlmEditProvider | undefined
  if (envProvider === 'api') return 'api'
  return 'mock'
}

/** 현재 빌드에서 동작 중인 LLM provider 조회 */
export const getLlmEditProvider = (): LlmEditProvider => resolveProvider()

const resolveGateway = (): LlmEditGateway => {
  const provider = resolveProvider()
  return provider === 'api' ? apiGateway : mockGateway
}

/** LLM 편집 요청 진입점 (mock ↔ api 교체 포인트) */
export async function requestLlmEdit(request: LlmEditRequest): Promise<LlmEditResponse> {
  return resolveGateway().requestEdit(request)
}
