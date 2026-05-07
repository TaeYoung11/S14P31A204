import { useMemo, useRef, useState } from 'react'
import type { BubbleData, ConnectionData, FloorOpening, FloorWall } from '../types'
import { getLlmEditProvider, requestLlmEdit } from '../services/llmEdit.service'
import type { LlmEditPreview, LlmEditStatus } from '../types/llmEdit.types'
import { applyLlmOperationsPreview } from '../utils/llmEditPreview'

interface UseLlmEditParams {
  projectId: string | null
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
  onApply: (
    nextBubbles: BubbleData[],
    nextConnections: ConnectionData[],
    nextFloorWalls: FloorWall[],
    nextFloorOpenings: FloorOpening[],
  ) => void
}

/** AI 어시스턴트 기반 다이어그램 수정 상태 관리 훅 */
export function useLlmEdit({
  projectId,
  bubbles,
  connections,
  floorWalls,
  floorOpenings,
  onApply,
}: UseLlmEditParams) {
  const provider = getLlmEditProvider()
  const requestSeq = useRef(0)
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<LlmEditStatus>('idle')
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [preview, setPreview] = useState<LlmEditPreview | null>(null)

  const isLoading = status === 'loading'

  const canRun = useMemo(() => prompt.trim().length > 0 && !isLoading, [prompt, isLoading])

  /** 이전 요청 결과 메시지/추천/미리보기를 초기화한다. */
  const resetResultState = () => {
    setMessage('')
    setSuggestions([])
    setPreview(null)
  }

  /** 현재 프롬프트로 LLM 수정을 요청하고, 성공 시 미리보기를 생성한다. */
  const run = async () => {
    if (!canRun) return
    const currentSeq = requestSeq.current + 1
    requestSeq.current = currentSeq
    setStatus('loading')
    resetResultState()

    try {
      const response = await requestLlmEdit({
        projectId,
        prompt,
        bubbles,
        connections,
        floorWalls,
        floorOpenings,
      })
      if (currentSeq !== requestSeq.current) return
      if (response.kind === 'ambiguous') {
        setStatus('ambiguous')
        setMessage(response.message)
        setSuggestions(response.suggestions)
        return
      }
      if (response.kind === 'error') {
        setStatus('error')
        setMessage(response.message)
        return
      }

      const previewResult = applyLlmOperationsPreview(
        bubbles,
        connections,
        floorWalls,
        floorOpenings,
        response.operations,
      )
      if (previewResult.changes.length === 0) {
        setStatus('ambiguous')
        setMessage('요청은 이해했지만 실제 변경 사항이 없습니다. 다른 지시를 입력해 주세요.')
        setSuggestions(['연결할 공간 이름을 바꿔 입력해 주세요.', '추가/삭제/이름변경 동작을 명시해 주세요.'])
        return
      }

      setPreview({ ...previewResult, summary: response.summary })
      setStatus('preview')
    } catch {
      if (currentSeq !== requestSeq.current) return
      setStatus('error')
      setMessage('AI 수정 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  /** 현재 미리보기 변경사항을 실제 편집 데이터에 반영한다. */
  const apply = () => {
    if (!preview) return
    requestSeq.current += 1
    onApply(preview.bubbles, preview.connections, preview.floorWalls, preview.floorOpenings)
    setStatus('applied')
    setMessage('미리보기 변경사항이 적용되었습니다.')
    setSuggestions([])
  }

  /** 미리보기/메시지를 버리고 초기 상태로 되돌린다. */
  const discard = () => {
    requestSeq.current += 1
    setStatus('idle')
    resetResultState()
  }

  return {
    provider,
    prompt,
    setPrompt,
    status,
    isLoading,
    message,
    suggestions,
    preview,
    canRun,
    run,
    apply,
    discard,
  }
}
