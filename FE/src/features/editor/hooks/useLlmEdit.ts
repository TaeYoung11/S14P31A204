import { useMemo, useRef, useState } from 'react'
import type { BubbleData, ConnectionData } from '../types'
import { INITIAL_ADD_SPACE_FORM } from '../constants'
import { calcMmDimensionsByAreaAndAspect, calcPxDimensionsByAreaAndAspect } from '../utils/bubbleCalc'
import { getLlmEditProvider, requestLlmEdit } from '../services/llmEdit.service'
import type { LlmEditChangeItem, LlmEditOperation, LlmEditPreview, LlmEditStatus } from '../types/llmEdit.types'

interface UseLlmEditParams {
  projectId: string | null
  bubbles: BubbleData[]
  connections: ConnectionData[]
  onApply: (nextBubbles: BubbleData[], nextConnections: ConnectionData[]) => void
}

const DEFAULT_AREA_M2 = 10

const toConnectionKey = (from: string, to: string) => [from, to].sort().join('::')

const createBubbleId = () => `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

const getNextBubbleIndex = (bubbles: BubbleData[]) => {
  const max = bubbles.reduce((acc, bubble) => {
    const parsed = Number.parseInt(bubble.index, 10)
    return Number.isNaN(parsed) ? acc : Math.max(acc, parsed)
  }, 0)
  return String(max + 1).padStart(2, '0')
}

function buildNewBubble(label: string, type: string, near: BubbleData | undefined): BubbleData {
  const mm = calcMmDimensionsByAreaAndAspect(DEFAULT_AREA_M2, 1)
  const px = calcPxDimensionsByAreaAndAspect(DEFAULT_AREA_M2, 1)
  const x = near ? near.x + near.width + 30 : 220
  const y = near ? near.y + 20 : 220

  return {
    id: createBubbleId(),
    x,
    y,
    width: px.width,
    height: px.height,
    widthMm: mm.widthMm,
    heightMm: mm.heightMm,
    label,
    type,
    ratio: DEFAULT_AREA_M2,
    area: `${DEFAULT_AREA_M2.toFixed(1)} m²`,
    color: INITIAL_ADD_SPACE_FORM.color,
    index: '00',
  }
}

function applyOperations(
  baseBubbles: BubbleData[],
  baseConnections: ConnectionData[],
  operations: LlmEditOperation[],
): LlmEditPreview {
  let nextBubbles = [...baseBubbles]
  let nextConnections = [...baseConnections]
  const changes: LlmEditChangeItem[] = []

  operations.forEach((operation, idx) => {
    if (operation.kind === 'add_connection') {
      if (operation.fromId === operation.toId) return
      const key = toConnectionKey(operation.fromId, operation.toId)
      const exists = nextConnections.some((connection) => toConnectionKey(connection.from, connection.to) === key)
      if (exists) return
      nextConnections = [
        ...nextConnections,
        { from: operation.fromId, to: operation.toId, type: operation.style ?? 'thin' },
      ]
      const fromLabel = nextBubbles.find((bubble) => bubble.id === operation.fromId)?.label ?? operation.fromId
      const toLabel = nextBubbles.find((bubble) => bubble.id === operation.toId)?.label ?? operation.toId
      changes.push({ id: `change-${idx}`, text: `연결 추가: ${fromLabel} ↔ ${toLabel}` })
      return
    }

    if (operation.kind === 'remove_connection') {
      const prevLength = nextConnections.length
      nextConnections = nextConnections.filter(
        (connection) =>
          !(
            toConnectionKey(connection.from, connection.to) ===
            toConnectionKey(operation.fromId, operation.toId)
          ),
      )
      if (nextConnections.length !== prevLength) {
        const fromLabel = nextBubbles.find((bubble) => bubble.id === operation.fromId)?.label ?? operation.fromId
        const toLabel = nextBubbles.find((bubble) => bubble.id === operation.toId)?.label ?? operation.toId
        changes.push({ id: `change-${idx}`, text: `연결 삭제: ${fromLabel} ↔ ${toLabel}` })
      }
      return
    }

    if (operation.kind === 'rename_bubble') {
      const target = nextBubbles.find((bubble) => bubble.id === operation.bubbleId)
      if (!target || !operation.nextLabel.trim()) return
      const prevLabel = target.label
      nextBubbles = nextBubbles.map((bubble) =>
        bubble.id === operation.bubbleId ? { ...bubble, label: operation.nextLabel.trim() } : bubble,
      )
      changes.push({ id: `change-${idx}`, text: `이름 변경: ${prevLabel} → ${operation.nextLabel.trim()}` })
      return
    }

    if (operation.kind === 'add_bubble') {
      const label = operation.label.trim()
      if (!label) return
      const near = nextBubbles.find((bubble) => bubble.id === operation.nearBubbleId)
      const newBubble = buildNewBubble(label, operation.type ?? '미선택', near)
      newBubble.index = getNextBubbleIndex(nextBubbles)
      nextBubbles = [...nextBubbles, newBubble]
      changes.push({ id: `change-${idx}`, text: `공간 추가: ${newBubble.label}` })
    }
  })

  return {
    summary: changes.length > 0 ? `${changes.length}건의 변경을 미리보기로 생성했습니다.` : '적용 가능한 변경이 없습니다.',
    changes,
    bubbles: nextBubbles,
    connections: nextConnections,
  }
}

/** AI 어시스턴트 기반 다이어그램 수정 상태 관리 훅 */
export function useLlmEdit({ projectId, bubbles, connections, onApply }: UseLlmEditParams) {
  const provider = getLlmEditProvider()
  const requestSeq = useRef(0)
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<LlmEditStatus>('idle')
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [preview, setPreview] = useState<LlmEditPreview | null>(null)

  const isLoading = status === 'loading'

  const canRun = useMemo(() => prompt.trim().length > 0 && !isLoading, [prompt, isLoading])

  const run = async () => {
    if (!canRun) return
    const currentSeq = requestSeq.current + 1
    requestSeq.current = currentSeq
    setStatus('loading')
    setMessage('')
    setSuggestions([])
    setPreview(null)

    try {
      const response = await requestLlmEdit({ projectId, prompt, bubbles, connections })
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

      const previewResult = applyOperations(bubbles, connections, response.operations)
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

  const apply = () => {
    if (!preview) return
    requestSeq.current += 1
    onApply(preview.bubbles, preview.connections)
    setStatus('applied')
    setMessage('미리보기 변경사항이 적용되었습니다.')
    setSuggestions([])
  }

  const discard = () => {
    requestSeq.current += 1
    setPreview(null)
    setStatus('idle')
    setMessage('')
    setSuggestions([])
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
