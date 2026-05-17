// 자연어 BIM 편집 API와 작업 상태 조회를 담당합니다.
import axios, { isAxiosError } from 'axios'
import { api } from '@/shared/lib/axios'
import type { ClarificationArtifact, LlmChatLogItem } from '../types/llmEdit.types'
import type {
  ChatCommandRequestDto,
  IfcEditJobResponseDto,
  JobStatusResponseDto,
  ProjectChatLogsResponseDto,
} from '../types/llmEdit.dto'

interface ApiResponse<T> {
  status?: number
  success?: boolean
  message: string
  data: T
  timestamp?: string
}

export interface SubmitLlmChatCommandInput extends ChatCommandRequestDto {
  projectId: string
}

export interface FetchLlmChatLogsInput {
  projectId: string
  page?: number
  size?: number
}

export const llmEditQueryKeys = {
  chatLogs: (projectId: string | null | undefined) => ['editor', 'llm-chat-logs', projectId] as const,
  job: (jobId: string | null | undefined) => ['editor', 'llm-job', jobId] as const,
}

export function extractLlmEditErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return 'AI 편집 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

export function isJobConflictError(error: unknown): boolean {
  if (!isAxiosError(error)) return false
  if (error.response?.status === 409) return true
  const code = error.response?.data?.code
  return typeof code === 'string' && code === 'IFC_EDIT_JOB_CONFLICT'
}

export async function submitLlmChatCommand({
  projectId,
  ...body
}: SubmitLlmChatCommandInput): Promise<IfcEditJobResponseDto> {
  const response = await api.post<ApiResponse<IfcEditJobResponseDto>>(
    `/projects/${projectId}/chat-commands`,
    body,
  )
  return response.data.data
}

export async function fetchLlmJobStatus(jobId: string): Promise<JobStatusResponseDto> {
  const response = await api.get<ApiResponse<JobStatusResponseDto>>(`/jobs/${jobId}`)
  return response.data.data
}

export async function fetchClarificationArtifact(url: string): Promise<ClarificationArtifact> {
  const response = await axios.get<ClarificationArtifact>(url)
  return response.data
}

export async function fetchLlmChatLogs({
  projectId,
  page = 0,
  size = 50,
}: FetchLlmChatLogsInput): Promise<LlmChatLogItem[]> {
  const response = await api.get<ApiResponse<ProjectChatLogsResponseDto>>(
    `/projects/${projectId}/chat-logs`,
    { params: { page, size } },
  )

  return response.data.data.messages.map((message, index) => ({
    id: message.referenceId ?? message.jobId ?? `${message.timestamp}:${index}`,
    type: message.type,
    subType: message.subType,
    content: message.content,
    senderName: message.senderName,
    timestamp: message.timestamp,
    jobId: message.jobId,
    jobType: message.jobType,
    jobStatus: message.jobStatus,
  }))
}
