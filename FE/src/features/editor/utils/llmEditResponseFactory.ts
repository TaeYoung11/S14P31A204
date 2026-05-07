import type { LlmEditOperation, LlmEditResponse } from '../types/llmEdit.types'

/** 모호한 요청 응답 객체를 생성한다. */
export const createAmbiguousResponse = (message: string, suggestions: string[]): LlmEditResponse => ({
  kind: 'ambiguous',
  message,
  suggestions,
})

/** 오류 응답 객체를 생성한다. */
export const createErrorResponse = (message: string): LlmEditResponse => ({
  kind: 'error',
  message,
})

/** 성공 응답 객체를 생성한다. */
export const createOkResponse = (summary: string, operations: LlmEditOperation[]): LlmEditResponse => ({
  kind: 'ok',
  summary,
  operations,
})
