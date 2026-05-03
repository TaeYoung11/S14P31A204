import { useMemo, useRef, useState } from 'react'
import type { BubbleData, ConnectionData, FloorOpening, FloorWall } from '../types'
import { FLOOR_OPENING_PRESETS, FLOOR_WALL_PRESETS, INITIAL_ADD_SPACE_FORM } from '../constants'
import { calcMmDimensionsByAreaAndAspect, calcPxDimensionsFromMm } from '../utils/bubbleCalc'
import { getLlmEditProvider, requestLlmEdit } from '../services/llmEdit.service'
import type { LlmEditChangeItem, LlmEditOperation, LlmEditPreview, LlmEditStatus } from '../types/llmEdit.types'

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

const DEFAULT_AREA_M2 = 10

const toConnectionKey = (from: string, to: string) => [from, to].sort().join('::')

const createBubbleId = () => `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const createWallId = () => `llm-wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const createOpeningId = () => `llm-opening-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(Math.round(value), min), max)
const clampWallPosition = (value: number) => Math.min(Math.max(value, 0), 1)

const getNextBubbleIndex = (bubbles: BubbleData[]) => {
  const max = bubbles.reduce((acc, bubble) => {
    const parsed = Number.parseInt(bubble.index, 10)
    return Number.isNaN(parsed) ? acc : Math.max(acc, parsed)
  }, 0)
  return String(max + 1).padStart(2, '0')
}

function buildNewBubble(label: string, type: string, near: BubbleData | undefined): BubbleData {
  const mm = calcMmDimensionsByAreaAndAspect(DEFAULT_AREA_M2, 1)
  const px = calcPxDimensionsFromMm(mm.widthMm, mm.heightMm)
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
    material: near?.material ?? '콘크리트',
    index: '00',
  }
}

function applyOperations(
  baseBubbles: BubbleData[],
  baseConnections: ConnectionData[],
  baseFloorWalls: FloorWall[],
  baseFloorOpenings: FloorOpening[],
  operations: LlmEditOperation[],
): LlmEditPreview {
  let nextBubbles = [...baseBubbles]
  let nextConnections = [...baseConnections]
  let nextFloorWalls = [...baseFloorWalls]
  let nextFloorOpenings = [...baseFloorOpenings]
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
      return
    }

    if (operation.kind === 'add_wall') {
      const fallbackPreset = FLOOR_WALL_PRESETS[operation.type ?? 'general']
      nextFloorWalls = [
        ...nextFloorWalls,
        {
          id: createWallId(),
          start: operation.start,
          end: operation.end,
          type: operation.type ?? 'general',
          thickness: clamp(operation.thickness ?? fallbackPreset.thickness, 50, 600),
          heightMm: clamp(operation.heightMm ?? fallbackPreset.heightMm, 1800, 5000),
        },
      ]
      changes.push({ id: `change-${idx}`, text: '벽체 추가' })
      return
    }

    if (operation.kind === 'update_wall') {
      const target = nextFloorWalls.find((wall) => wall.id === operation.wallId)
      if (!target) return
      nextFloorWalls = nextFloorWalls.map((wall) =>
        wall.id === operation.wallId
          ? {
              ...wall,
              start: operation.start ?? wall.start,
              end: operation.end ?? wall.end,
              type: operation.type ?? wall.type,
              thickness:
                operation.thickness === undefined
                  ? wall.thickness
                  : clamp(operation.thickness, 50, 600),
              heightMm:
                operation.heightMm === undefined
                  ? wall.heightMm
                  : clamp(operation.heightMm, 1800, 5000),
            }
          : wall,
      )
      changes.push({ id: `change-${idx}`, text: '벽체 수정' })
      return
    }

    if (operation.kind === 'delete_wall') {
      const prevLength = nextFloorWalls.length
      nextFloorWalls = nextFloorWalls.filter((wall) => wall.id !== operation.wallId)
      if (nextFloorWalls.length !== prevLength) {
        nextFloorOpenings = nextFloorOpenings.filter((opening) => opening.wallId !== operation.wallId)
        changes.push({ id: `change-${idx}`, text: '벽체 삭제' })
      }
      return
    }

    if (operation.kind === 'add_opening') {
      const targetWall = nextFloorWalls.find((wall) => wall.id === operation.wallId)
      if (!targetWall) return
      const preset = FLOOR_OPENING_PRESETS[operation.openingType]
      nextFloorOpenings = [
        ...nextFloorOpenings,
        {
          id: createOpeningId(),
          type: operation.openingType,
          wallId: operation.wallId,
          wallPosition: clampWallPosition(operation.wallPosition),
          widthMm: clamp(operation.widthMm ?? preset.widthMm, 300, 4000),
          heightMm: clamp(operation.heightMm ?? preset.heightMm, 300, 4000),
          sillHeightMm:
            operation.openingType === 'window'
              ? clamp(operation.sillHeightMm ?? preset.sillHeightMm ?? 900, 0, 2500)
              : undefined,
          doorHingeSide:
            operation.openingType === 'door'
              ? operation.doorHingeSide ?? 'left'
              : undefined,
          doorSwingDirection:
            operation.openingType === 'door'
              ? operation.doorSwingDirection ?? 'inward'
              : undefined,
        },
      ]
      changes.push({
        id: `change-${idx}`,
        text: operation.openingType === 'door' ? '문 추가' : '창문 추가',
      })
      return
    }

    if (operation.kind === 'update_opening') {
      const target = nextFloorOpenings.find((opening) => opening.id === operation.openingId)
      if (!target) return
      const nextWallId = operation.wallId ?? target.wallId
      const hasWall = nextFloorWalls.some((wall) => wall.id === nextWallId)
      if (!hasWall) return
      nextFloorOpenings = nextFloorOpenings.map((opening) =>
        opening.id === operation.openingId
          ? {
              ...opening,
              wallId: nextWallId,
              wallPosition:
                operation.wallPosition === undefined
                  ? opening.wallPosition
                  : clampWallPosition(operation.wallPosition),
              widthMm:
                operation.widthMm === undefined
                  ? opening.widthMm
                  : clamp(operation.widthMm, 300, 4000),
              heightMm:
                operation.heightMm === undefined
                  ? opening.heightMm
                  : clamp(operation.heightMm, 300, 4000),
              sillHeightMm:
                opening.type === 'window'
                  ? operation.sillHeightMm === undefined
                    ? opening.sillHeightMm
                    : clamp(operation.sillHeightMm, 0, 2500)
                  : undefined,
              doorHingeSide:
                opening.type === 'door'
                  ? operation.doorHingeSide ?? opening.doorHingeSide ?? 'left'
                  : undefined,
              doorSwingDirection:
                opening.type === 'door'
                  ? operation.doorSwingDirection ?? opening.doorSwingDirection ?? 'inward'
                  : undefined,
            }
          : opening,
      )
      changes.push({
        id: `change-${idx}`,
        text: target.type === 'door' ? '문 수정' : '창문 수정',
      })
      return
    }

    if (operation.kind === 'delete_opening') {
      const prevLength = nextFloorOpenings.length
      const target = nextFloorOpenings.find((opening) => opening.id === operation.openingId)
      nextFloorOpenings = nextFloorOpenings.filter((opening) => opening.id !== operation.openingId)
      if (nextFloorOpenings.length !== prevLength) {
        changes.push({
          id: `change-${idx}`,
          text: target?.type === 'window' ? '창문 삭제' : '문 삭제',
        })
      }
    }
  })

  return {
    summary: changes.length > 0 ? `${changes.length}건의 변경을 미리보기로 생성했습니다.` : '적용 가능한 변경이 없습니다.',
    changes,
    bubbles: nextBubbles,
    connections: nextConnections,
    floorWalls: nextFloorWalls,
    floorOpenings: nextFloorOpenings,
  }
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

  const run = async () => {
    if (!canRun) return
    const currentSeq = requestSeq.current + 1
    requestSeq.current = currentSeq
    setStatus('loading')
    setMessage('')
    setSuggestions([])
    setPreview(null)

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

      const previewResult = applyOperations(
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

  const apply = () => {
    if (!preview) return
    requestSeq.current += 1
    onApply(preview.bubbles, preview.connections, preview.floorWalls, preview.floorOpenings)
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
