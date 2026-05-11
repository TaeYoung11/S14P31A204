// 자연어 BIM 편집 API의 서버 DTO를 정의합니다.
import type { LlmEditOperation, LlmEditSceneType } from './llmEdit.types'

export interface ChatCommandRequestDto {
  sceneType: LlmEditSceneType
  baseRevisionId: string
  sourceSceneType: string
  message: string
  sourceSceneStateId?: string
  sourceSceneStorageUrl?: string
  sourceScene?: unknown
  conversationHistory?: unknown
  plannerOptions?: unknown
}

export interface IfcEditJobResponseDto {
  projectId: string
  jobId: string
  jobStepId: string
  targetRevisionId: string | null
  expectedOutputArtifactId: string | null
  jobType: string
  status: string
  progress: number | null
}

export interface JobErrorResponseDto {
  errorCode?: string | null
  errorMessage?: string | null
  message?: string | null
  retryable?: boolean | null
  clarificationPossible?: boolean | null
  detailStorageUrl?: string | null
}

export interface JobOutputsResponseDto {
  targetRevisionId: string | null
  primaryArtifactId: string | null
  primaryResultUrl: string | null
  artifacts: Array<{
    artifactId: string
    artifactType: string
    revisionId?: string | null
    fileName?: string | null
    mimeType?: string | null
    storageUrl: string | null
    createdAt?: string | null
  }>
}

export interface JobStatusResponseDto {
  jobId: string
  projectId: string
  jobDomain: string
  jobType: string
  status: string
  progress: number | null
  terminal: boolean
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  error: JobErrorResponseDto | null
  outputs: JobOutputsResponseDto | null
}

export interface ProjectChatLogItemResponseDto {
  type: string
  subType: string | null
  content: string
  senderUserId: string | null
  senderName: string | null
  timestamp: string
  referenceId: string | null
  jobId: string | null
  jobType: string | null
  jobStatus: string | null
}

export interface ProjectChatLogsResponseDto {
  projectId: string
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
  messages: ProjectChatLogItemResponseDto[]
}

export interface LlmEditApiOkResponseDto {
  kind: 'ok'
  summary: string
  operations: LlmEditOperation[]
}

export interface LlmEditApiAmbiguousResponseDto {
  kind: 'ambiguous'
  message: string
  suggestions?: string[]
}

export interface LlmEditApiErrorResponseDto {
  kind: 'error'
  message: string
}

export interface LlmEditApiStatusCompatibleResponseDto {
  status: 'ok' | 'ambiguous' | 'error'
  summary?: string
  operations?: unknown[]
  message?: string
  suggestions?: unknown[]
}

export type LlmEditApiResponseDto =
  | LlmEditApiOkResponseDto
  | LlmEditApiAmbiguousResponseDto
  | LlmEditApiErrorResponseDto
  | LlmEditApiStatusCompatibleResponseDto
