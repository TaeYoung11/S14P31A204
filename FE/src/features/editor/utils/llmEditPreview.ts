import { FLOOR_OPENING_PRESETS, FLOOR_WALL_PRESETS } from '../constants'
import type { BubbleData, ConnectionData, FloorOpening, FloorWall } from '../types'
import type { LlmEditChangeItem, LlmEditOperation, LlmEditPreview } from '../types/llmEdit.types'
import {
  buildNewBubble,
  clampDimension,
  clampWallPosition,
  createOpeningId,
  createWallId,
  getNextBubbleIndex,
  toConnectionKey,
} from './llmEditPreviewHelpers'

const resolveBubbleLabel = (bubbles: BubbleData[], bubbleId: string) =>
  bubbles.find((bubble) => bubble.id === bubbleId)?.label ?? bubbleId

/** LLM operations를 적용해 미리보기 데이터와 변경 요약 목록을 계산한다. */
export function applyLlmOperationsPreview(
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
      const fromLabel = resolveBubbleLabel(nextBubbles, operation.fromId)
      const toLabel = resolveBubbleLabel(nextBubbles, operation.toId)
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
        const fromLabel = resolveBubbleLabel(nextBubbles, operation.fromId)
        const toLabel = resolveBubbleLabel(nextBubbles, operation.toId)
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
          thickness: clampDimension(operation.thickness ?? fallbackPreset.thickness, 50, 600),
          heightMm: clampDimension(operation.heightMm ?? fallbackPreset.heightMm, 1800, 5000),
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
                  : clampDimension(operation.thickness, 50, 600),
              heightMm:
                operation.heightMm === undefined
                  ? wall.heightMm
                  : clampDimension(operation.heightMm, 1800, 5000),
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
          widthMm: clampDimension(operation.widthMm ?? preset.widthMm, 300, 4000),
          heightMm: clampDimension(operation.heightMm ?? preset.heightMm, 300, 4000),
          sillHeightMm:
            operation.openingType === 'window'
              ? clampDimension(operation.sillHeightMm ?? preset.sillHeightMm ?? 900, 0, 2500)
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
                  : clampDimension(operation.widthMm, 300, 4000),
              heightMm:
                operation.heightMm === undefined
                  ? opening.heightMm
                  : clampDimension(operation.heightMm, 300, 4000),
              sillHeightMm:
                opening.type === 'window'
                  ? operation.sillHeightMm === undefined
                    ? opening.sillHeightMm
                    : clampDimension(operation.sillHeightMm, 0, 2500)
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
