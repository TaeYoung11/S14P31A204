import type { LlmEditApiResponse } from '../services/llmEdit.contract'
import type { LlmEditOperation, LlmEditResponse } from '../types/llmEdit.types'

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

  if (value.kind === 'add_wall') {
    return (
      isRecord(value.start) &&
      typeof value.start.x === 'number' &&
      typeof value.start.y === 'number' &&
      isRecord(value.end) &&
      typeof value.end.x === 'number' &&
      typeof value.end.y === 'number' &&
      (value.type === undefined ||
        value.type === 'general' ||
        value.type === 'exterior' ||
        value.type === 'loadBearing' ||
        value.type === 'partition') &&
      (value.thickness === undefined || typeof value.thickness === 'number') &&
      (value.heightMm === undefined || typeof value.heightMm === 'number')
    )
  }

  if (value.kind === 'update_wall') {
    return (
      typeof value.wallId === 'string' &&
      (value.start === undefined ||
        (isRecord(value.start) && typeof value.start.x === 'number' && typeof value.start.y === 'number')) &&
      (value.end === undefined ||
        (isRecord(value.end) && typeof value.end.x === 'number' && typeof value.end.y === 'number')) &&
      (value.type === undefined ||
        value.type === 'general' ||
        value.type === 'exterior' ||
        value.type === 'loadBearing' ||
        value.type === 'partition') &&
      (value.thickness === undefined || typeof value.thickness === 'number') &&
      (value.heightMm === undefined || typeof value.heightMm === 'number')
    )
  }

  if (value.kind === 'delete_wall') {
    return typeof value.wallId === 'string'
  }

  if (value.kind === 'add_opening') {
    return (
      (value.openingType === 'door' || value.openingType === 'window') &&
      typeof value.wallId === 'string' &&
      typeof value.wallPosition === 'number' &&
      (value.widthMm === undefined || typeof value.widthMm === 'number') &&
      (value.heightMm === undefined || typeof value.heightMm === 'number') &&
      (value.sillHeightMm === undefined || typeof value.sillHeightMm === 'number') &&
      (value.doorHingeSide === undefined || value.doorHingeSide === 'left' || value.doorHingeSide === 'right') &&
      (value.doorSwingDirection === undefined ||
        value.doorSwingDirection === 'inward' ||
        value.doorSwingDirection === 'outward' ||
        value.doorSwingDirection === 'sliding')
    )
  }

  if (value.kind === 'update_opening') {
    return (
      typeof value.openingId === 'string' &&
      (value.wallId === undefined || typeof value.wallId === 'string') &&
      (value.wallPosition === undefined || typeof value.wallPosition === 'number') &&
      (value.widthMm === undefined || typeof value.widthMm === 'number') &&
      (value.heightMm === undefined || typeof value.heightMm === 'number') &&
      (value.sillHeightMm === undefined || typeof value.sillHeightMm === 'number') &&
      (value.doorHingeSide === undefined || value.doorHingeSide === 'left' || value.doorHingeSide === 'right') &&
      (value.doorSwingDirection === undefined ||
        value.doorSwingDirection === 'inward' ||
        value.doorSwingDirection === 'outward' ||
        value.doorSwingDirection === 'sliding')
    )
  }

  if (value.kind === 'delete_opening') {
    return typeof value.openingId === 'string'
  }

  return false
}

const isOperationArray = (value: unknown): value is LlmEditOperation[] =>
  Array.isArray(value) && value.every(isOperation)

/** 백엔드 응답을 프론트 공통 LlmEditResponse 형태로 정규화한다. */
export function normalizeLlmEditApiResponse(raw: LlmEditApiResponse | unknown): LlmEditResponse {
  if (!isRecord(raw)) {
    return {
      kind: 'error',
      message: 'LLM 응답 형식을 해석하지 못했습니다.',
    }
  }

  if (typeof raw.image_b64 === 'string' || typeof raw.image === 'string') {
    return {
      kind: 'error',
      message: '이미지 렌더 응답은 지원하지 않습니다. JSON 명령(operations) 응답이 필요합니다.',
    }
  }

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

/** Axios 에러 객체에서 사용자 노출용 메시지를 추출한다. */
export function extractLlmEditApiErrorMessage(error: unknown): string | null {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) {
    return null
  }

  const message = error.response.data.message
  if (typeof message !== 'string' || message.trim().length === 0) {
    return null
  }
  return message
}
