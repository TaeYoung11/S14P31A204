// 에디터 자연어 BIM 편집 요청과 작업 추적 상태를 관리합니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BubbleData,
  ConnectionData,
  EditorMode,
  FloorLayer,
  FloorOpening,
  FloorWall,
} from '../types'
import type { ClarificationAlternative, ClarificationArtifact, LlmEditSceneType, LlmEditStatus } from '../types/llmEdit.types'
import {
  extractLlmEditErrorMessage,
  fetchClarificationArtifact,
  fetchLlmChatLogs,
  fetchLlmJobStatus,
  llmEditQueryKeys,
  submitLlmChatCommand,
} from '../services/llmEdit.service'
import type { JobStatusResponseDto } from '../types/llmEdit.dto'

interface UseLlmEditParams {
  projectId: string | null
  mode: EditorMode
  currentIfcRevisionId: string | null
  currentIfcUrl: string | null
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorLayers: FloorLayer[]
  activeFloorLayerId: string | null
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
  onIfcResult: (ifcStorageUrl: string, assetId: string | null, revisionId: string | null) => void
  onToggleAssistantPanel?: () => void
}

const JOB_POLL_INTERVAL_MS = 1500
const JOB_POLL_TIMEOUT_MS = 180_000

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })

const isSuccessfulJobStatus = (status: string): boolean => {
  const normalized = status.toUpperCase()
  return normalized === 'SUCCESS' || normalized === 'SUCCEEDED' || normalized === 'COMPLETED'
}

const isClarificationJobStatus = (status: string, clarificationPossible: boolean | null | undefined): boolean =>
  !isSuccessfulJobStatus(status) && clarificationPossible === true

const resolveJobErrorMessage = (job: JobStatusResponseDto): string => (
  job.error?.errorMessage
  ?? job.error?.message
  ?? 'AI 편집 작업이 실패했습니다.'
)

const resolveSceneType = (mode: EditorMode): LlmEditSceneType =>
  mode === '3d' ? 'THREE_D' : 'TWO_D'

/**
 * BE chat-command payload에 넣을 현재 2D/버블 문맥을 만든다.
 * 3D 경로에서도 worker가 참고할 수 있도록 간단한 현재 에디터 상태만 포함한다.
 */
const buildSourceScene = (
  mode: EditorMode,
  bubbles: BubbleData[],
  connections: ConnectionData[],
  floorLayers: FloorLayer[],
  activeFloorLayerId: string | null,
  floorWalls: FloorWall[],
  floorOpenings: FloorOpening[],
) => ({
  mode,
  bubbles,
  connections,
  floorPlan: {
    activeFloorLayerId,
    layers: floorLayers,
    walls: floorWalls,
    openings: floorOpenings,
  },
})

export function useLlmEdit({
  projectId,
  mode,
  currentIfcRevisionId,
  currentIfcUrl,
  bubbles,
  connections,
  floorLayers,
  activeFloorLayerId,
  floorWalls,
  floorOpenings,
  onIfcResult,
  onToggleAssistantPanel,
}: UseLlmEditParams) {
  const queryClient = useQueryClient()
  const requestSeq = useRef(0)
  const latestIfcRevisionIdRef = useRef(currentIfcRevisionId)
  const clarificationHistoryRef = useRef<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<LlmEditStatus>('idle')
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<number | null>(null)
  const [clarificationArtifact, setClarificationArtifact] = useState<ClarificationArtifact | null>(null)
  const [selectedWallForChat, setSelectedWallForChat] = useState<{ wallId: string } | null>(null)

  useEffect(() => {
    latestIfcRevisionIdRef.current = currentIfcRevisionId
  }, [currentIfcRevisionId])

  const chatLogsQuery = useQuery({
    queryKey: llmEditQueryKeys.chatLogs(projectId),
    queryFn: () => fetchLlmChatLogs({ projectId: projectId ?? '' }),
    enabled: !!projectId,
    staleTime: 10_000,
    retry: false,
  })

  const isLoading = status === 'loading' || status === 'running'
  const canRun = useMemo(
    () => prompt.trim().length > 0 && !!projectId && !!currentIfcRevisionId && !isLoading,
    [currentIfcRevisionId, isLoading, projectId, prompt],
  )

  const resetResultState = useCallback(() => {
    setMessage('')
    setSuggestions([])
    setActiveJobId(null)
    setJobProgress(null)
    setClarificationArtifact(null)
  }, [])

  const selectWallForChat = useCallback((wallId: string) => {
    setSelectedWallForChat({ wallId })
    onToggleAssistantPanel?.()
  }, [onToggleAssistantPanel])

  const clearSelectedWallForChat = useCallback(() => {
    setSelectedWallForChat(null)
  }, [])

  const waitForTerminalJob = useCallback(async (
    jobId: string,
    currentSeq: number,
  ): Promise<JobStatusResponseDto | null> => {
    const startedAt = Date.now()

    while (Date.now() - startedAt < JOB_POLL_TIMEOUT_MS) {
      if (currentSeq !== requestSeq.current) return null
      const job = await fetchLlmJobStatus(jobId)
      if (currentSeq !== requestSeq.current) return null

      setJobProgress(job.progress)
      if (job.terminal) return job
      await sleep(JOB_POLL_INTERVAL_MS)
    }

    throw new Error('AI 편집 작업 상태 조회 시간이 초과되었습니다.')
  }, [])

  const run = useCallback(async (promptOverride?: string, extras?: {
    plannerOptions?: Record<string, unknown>
  }) => {
    if (!projectId) {
      setStatus('error')
      setMessage('프로젝트 ID가 없어 AI 편집 요청을 보낼 수 없습니다.')
      return
    }
    if (!currentIfcRevisionId) {
      setStatus('error')
      setMessage('IFC 기준 revision이 없어 AI 편집 요청을 보낼 수 없습니다. 먼저 3D IFC를 생성하거나 불러와 주세요.')
      return
    }
    const effectivePrompt = (promptOverride ?? prompt).trim()
    if (!effectivePrompt || isLoading) return

    const currentSeq = requestSeq.current + 1
    const requestBaseRevisionId = currentIfcRevisionId
    requestSeq.current = currentSeq
    setStatus('loading')
    resetResultState()

    try {
      const sceneType = resolveSceneType(mode)
      const sourceScenePayload = {
        ...(currentIfcUrl ? { sourceSceneStorageUrl: currentIfcUrl } : {}),
        sourceScene: buildSourceScene(mode, bubbles, connections, floorLayers, activeFloorLayerId, floorWalls, floorOpenings),
      }
      const history = clarificationHistoryRef.current
      const wallPlannerOptions = selectedWallForChat
        ? { selectedWallId: selectedWallForChat.wallId }
        : undefined
      const mergedPlannerOptions = {
        ...(extras?.plannerOptions ?? {}),
        ...(wallPlannerOptions ?? {}),
      }
      const job = await submitLlmChatCommand({
        projectId,
        sceneType,
        baseRevisionId: requestBaseRevisionId,
        sourceSceneType: 'IFC_MODEL',
        message: effectivePrompt,
        ...(history.length > 0 ? { conversationHistory: history } : {}),
        ...(Object.keys(mergedPlannerOptions).length > 0 ? { plannerOptions: mergedPlannerOptions } : {}),
        ...sourceScenePayload,
      })
      clarificationHistoryRef.current = []
      setSelectedWallForChat(null)

      if (currentSeq !== requestSeq.current) return
      setActiveJobId(job.jobId)
      setJobProgress(job.progress)
      setStatus('running')
      setMessage(`${sceneType === 'THREE_D' ? '3D' : '2D'} AI 편집 작업이 접수되었습니다.`)
      void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })

      const completedJob = await waitForTerminalJob(job.jobId, currentSeq)
      if (!completedJob || currentSeq !== requestSeq.current) return

      if (isClarificationJobStatus(completedJob.status, completedJob.error?.clarificationPossible)) {
        const detailUrl = completedJob.error?.detailStorageUrl
        if (detailUrl) {
          try {
            const artifact = await fetchClarificationArtifact(detailUrl)
            setClarificationArtifact(artifact)
            setMessage(artifact.question)
            clarificationHistoryRef.current = [
              { role: 'user', content: effectivePrompt },
              { role: 'assistant', content: artifact.question },
            ]
          } catch {
            setMessage('추가 정보가 필요합니다.')
          }
        } else {
          setMessage('추가 정보가 필요합니다.')
        }
        setActiveJobId(null)
        setJobProgress(null)
        setStatus('clarification_required')
        void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })
        return
      }

      if (!isSuccessfulJobStatus(completedJob.status)) {
        setStatus('error')
        setMessage(resolveJobErrorMessage(completedJob))
        void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })
        return
      }

      const outputUrl = completedJob.outputs?.primaryResultUrl
      const outputArtifactId = completedJob.outputs?.primaryArtifactId
      const targetRevisionId = completedJob.outputs?.targetRevisionId
      if (!outputUrl) {
        setStatus('error')
        setMessage('AI 편집 작업은 완료되었지만 IFC 결과 URL이 없습니다.')
        void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })
        return
      }

      const latestRevisionId = latestIfcRevisionIdRef.current
      const alreadyAdvancedToJobRevision = Boolean(
        targetRevisionId && latestRevisionId === targetRevisionId,
      )
      if (latestRevisionId !== requestBaseRevisionId && !alreadyAdvancedToJobRevision) {
        setStatus('error')
        setMessage('LLM 요청 중 IFC revision이 변경되어 결과를 적용하지 않았습니다.')
        void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })
        return
      }

      onIfcResult(outputUrl, outputArtifactId ?? null, targetRevisionId ?? null)
      setStatus('idle')
      setMessage('')
      setPrompt('')
      void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })
    } catch (error: unknown) {
      clarificationHistoryRef.current = []
      if (currentSeq !== requestSeq.current) return
      setStatus('error')
      setMessage(extractLlmEditErrorMessage(error))
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: llmEditQueryKeys.chatLogs(projectId) })
      }
    }
  }, [
    activeFloorLayerId,
    bubbles,
    connections,
    currentIfcRevisionId,
    currentIfcUrl,
    floorLayers,
    floorOpenings,
    floorWalls,
    isLoading,
    mode,
    onIfcResult,
    selectedWallForChat,
    projectId,
    prompt,
    queryClient,
    resetResultState,
    waitForTerminalJob,
  ])

  const selectAlternative = useCallback((alternative: ClarificationAlternative) => {
    const hasFill = alternative.fill && Object.keys(alternative.fill).length > 0
    const plannerOptions = hasFill ? (alternative.fill as Record<string, unknown>) : undefined
    setPrompt(alternative.title)
    setClarificationArtifact(null)
    setMessage('')
    void run(alternative.title, plannerOptions ? { plannerOptions } : undefined)
  }, [run])

  const discard = useCallback(() => {
    clarificationHistoryRef.current = []
    requestSeq.current += 1
    setSelectedWallForChat(null)
    setStatus('idle')
    resetResultState()
  }, [resetResultState])

  return {
    provider: 'api' as const,
    prompt,
    setPrompt,
    status,
    isLoading,
    message,
    suggestions,
    preview: null,
    canRun,
    activeJobId,
    jobProgress,
    clarificationArtifact,
    selectedWallForChat,
    chatLogs: chatLogsQuery.data ?? [],
    isChatLogsLoading: chatLogsQuery.isLoading,
    run,
    apply: () => {},
    discard,
    selectAlternative,
    selectWallForChat,
    clearSelectedWallForChat,
  }
}
