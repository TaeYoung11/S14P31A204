import type { BubbleData, ConnectionData, FloorOpening, FloorWall } from '../types'
import type { LlmEditOperation } from '../types/llmEdit.types'

/** LLM 수정 API 요청 본문 (프론트 -> 백엔드) */
export interface LlmEditApiRequestBody {
  text: string
  context: {
    bubbles: BubbleData[]
    connections: ConnectionData[]
    floorWalls?: FloorWall[]
    floorOpenings?: FloorOpening[]
  }
}

/** LLM 수정 API 성공 응답 (권장 포맷) */
export interface LlmEditApiOkResponse {
  kind: 'ok'
  summary: string
  operations: LlmEditOperation[]
}

/** LLM 수정 API 모호 응답 (권장 포맷) */
export interface LlmEditApiAmbiguousResponse {
  kind: 'ambiguous'
  message: string
  suggestions?: string[]
}

/** LLM 수정 API 에러 응답 (권장 포맷) */
export interface LlmEditApiErrorResponse {
  kind: 'error'
  message: string
}

/** 백엔드 상태 문자열(status) 호환 포맷 */
export interface LlmEditApiStatusCompatibleResponse {
  status: 'ok' | 'ambiguous' | 'error'
  summary?: string
  operations?: unknown[]
  message?: string
  suggestions?: unknown[]
}

/** 백엔드 응답 허용 유니온 */
export type LlmEditApiResponse =
  | LlmEditApiOkResponse
  | LlmEditApiAmbiguousResponse
  | LlmEditApiErrorResponse
  | LlmEditApiStatusCompatibleResponse
