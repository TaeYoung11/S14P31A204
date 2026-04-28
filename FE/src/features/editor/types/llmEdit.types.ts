import type { BubbleData, ConnectionData, ConnectionStyle } from '../types'

/** LLM 편집 요청 진행 상태 */
export type LlmEditStatus = 'idle' | 'loading' | 'preview' | 'ambiguous' | 'error' | 'applied'

/** LLM이 반환하는 버블 다이어그램 수정 명령 */
export type LlmEditOperation =
  | {
      kind: 'add_connection'
      fromId: string
      toId: string
      style?: ConnectionStyle
    }
  | {
      kind: 'remove_connection'
      fromId: string
      toId: string
    }
  | {
      kind: 'rename_bubble'
      bubbleId: string
      nextLabel: string
    }
  | {
      kind: 'add_bubble'
      label: string
      type?: string
      nearBubbleId?: string
    }

/** LLM 편집 결과 요약 항목 (UI 표시용) */
export interface LlmEditChangeItem {
  id: string
  text: string
}

/** LLM 편집 미리보기 데이터 */
export interface LlmEditPreview {
  summary: string
  changes: LlmEditChangeItem[]
  bubbles: BubbleData[]
  connections: ConnectionData[]
}

/** LLM 서비스 성공 응답 */
export interface LlmEditOkResponse {
  kind: 'ok'
  summary: string
  operations: LlmEditOperation[]
}

/** LLM 서비스 모호 응답 */
export interface LlmEditAmbiguousResponse {
  kind: 'ambiguous'
  message: string
  suggestions: string[]
}

/** LLM 서비스 실패 응답 */
export interface LlmEditErrorResponse {
  kind: 'error'
  message: string
}

/** LLM 서비스 응답 유니온 타입 */
export type LlmEditResponse = LlmEditOkResponse | LlmEditAmbiguousResponse | LlmEditErrorResponse
