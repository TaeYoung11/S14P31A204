import type { BubbleData, ConnectionData, FloorOpening, FloorWall } from '../types'
import type { LlmEditResponse } from '../types/llmEdit.types'
import { createAmbiguousResponse, createOkResponse } from './llmEditResponseFactory'

interface LlmEditMockInput {
  prompt: string
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
}

const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()

/** 문/창문 삭제 mock 응답을 생성한다. */
function buildDeleteOpeningResponse(
  openingType: 'door' | 'window',
  floorOpenings: FloorOpening[],
): LlmEditResponse {
  const label = openingType === 'door' ? '문' : '창문'
  const suggestions = [`${label} 추가해줘`]

  const sameTypeOpenings = floorOpenings.filter((opening) => opening.type === openingType)
  if (sameTypeOpenings.length === 0) {
    return createAmbiguousResponse(`삭제할 ${label}이 없습니다.`, suggestions)
  }

  const target = floorOpenings.find((opening) => opening.type === openingType)
  if (!target) {
    return createAmbiguousResponse(`삭제할 ${label}을 찾지 못했습니다.`, suggestions)
  }

  return createOkResponse(`${label}을 삭제합니다.`, [{ kind: 'delete_opening', openingId: target.id }])
}

/** 사용자 자연어 프롬프트를 규칙 기반으로 해석해 mock LLM 응답을 생성한다. */
export function interpretLlmEditPromptMock({
  prompt,
  bubbles,
  connections,
  floorWalls,
  floorOpenings,
}: LlmEditMockInput): LlmEditResponse {
  const raw = prompt.trim()
  if (!raw) {
    return createAmbiguousResponse('요청 문장이 비어 있습니다. 수정할 내용을 구체적으로 입력해 주세요.', [
      '거실과 주방 사이에 연결 추가해줘',
      '현관/로비를 현관으로 이름 변경해줘',
    ])
  }

  const normalizedPrompt = normalize(raw)
  const referenced = bubbles.filter((bubble) => normalizedPrompt.includes(normalize(bubble.label)))

  const includesConnect = normalizedPrompt.includes('연결')
  const includesAdd = normalizedPrompt.includes('추가')
  const includesRemove = normalizedPrompt.includes('삭제') || normalizedPrompt.includes('제거')
  const includesWall = normalizedPrompt.includes('벽') || normalizedPrompt.includes('벽체')
  const includesDoor = normalizedPrompt.includes('문')
  const includesWindow = normalizedPrompt.includes('창문') || normalizedPrompt.includes('창')

  if (includesConnect && includesAdd) {
    if (referenced.length < 2) {
      return createAmbiguousResponse(
        '연결할 두 공간을 정확히 찾지 못했습니다. 공간 이름을 두 개 이상 포함해 주세요.',
        ['거실과 주방 사이에 연결 추가해줘', '현관/로비와 거실 연결 추가해줘'],
      )
    }
    return createOkResponse('요청한 두 공간 사이에 연결을 추가합니다.', [
      {
        kind: 'add_connection',
        fromId: referenced[0].id,
        toId: referenced[1].id,
        style: 'thin',
      },
    ])
  }

  if (includesConnect && includesRemove) {
    if (referenced.length < 2) {
      return createAmbiguousResponse(
        '삭제할 연결선을 특정하지 못했습니다. 연결된 두 공간 이름을 함께 입력해 주세요.',
        ['거실과 주방 연결 삭제해줘', '현관/로비와 거실 연결 제거해줘'],
      )
    }

    const hasConnection = connections.some(
      (connection) =>
        (connection.from === referenced[0].id && connection.to === referenced[1].id) ||
        (connection.from === referenced[1].id && connection.to === referenced[0].id),
    )
    if (!hasConnection) {
      return createAmbiguousResponse('지정한 두 공간 사이에 기존 연결이 없어 삭제할 수 없습니다.', [
        '연결할 공간 이름을 다시 확인해 주세요.',
      ])
    }

    return createOkResponse('요청한 두 공간 사이의 연결을 삭제합니다.', [
      {
        kind: 'remove_connection',
        fromId: referenced[0].id,
        toId: referenced[1].id,
      },
    ])
  }

  const renameToMatch = raw.match(/['"]?([^'"]+)['"]?\s*(?:으로|로)\s*(?:이름\s*)?(?:변경|수정|바꿔)/)
  if (renameToMatch && referenced.length >= 1) {
    const nextLabel = renameToMatch[1].trim()
    if (!nextLabel) {
      return createAmbiguousResponse('변경할 이름을 확인하지 못했습니다. 새 이름을 함께 입력해 주세요.', [
        '현관/로비를 현관으로 이름 변경해줘',
      ])
    }
    return createOkResponse('요청한 공간 이름을 변경합니다.', [
      {
        kind: 'rename_bubble',
        bubbleId: referenced[0].id,
        nextLabel,
      },
    ])
  }

  const addBubbleMatch = raw.match(/([가-힣A-Za-z0-9/ ]+?)\s*(?:공간|방|버블)\s*(?:을|를)?\s*추가/)
  if (addBubbleMatch) {
    const label = addBubbleMatch[1].trim()
    if (!label) {
      return createAmbiguousResponse('추가할 공간 이름을 확인하지 못했습니다.', [
        '서재 공간 추가해줘',
        '드레스룸 방 추가해줘',
      ])
    }
    return createOkResponse('새 공간 버블을 추가합니다.', [
      {
        kind: 'add_bubble',
        label,
        type: '미선택',
        nearBubbleId: referenced[0]?.id,
      },
    ])
  }

  if (includesWall && includesAdd) {
    if (bubbles.length === 0) {
      return createAmbiguousResponse('벽체를 추가할 기준 공간이 없습니다. 먼저 공간을 1개 이상 배치해 주세요.', [
        '거실 공간 추가해줘',
      ])
    }
    const nearBubble = referenced[0] ?? bubbles[0]
    const start = { x: nearBubble.x + 20, y: nearBubble.y + nearBubble.height + 20 }
    const end = { x: nearBubble.x + nearBubble.width - 20, y: nearBubble.y + nearBubble.height + 20 }
    return createOkResponse('요청한 위치에 벽체를 추가합니다.', [
      {
        kind: 'add_wall',
        start,
        end,
        type: 'general',
      },
    ])
  }

  if ((includesDoor || includesWindow) && includesAdd) {
    if (floorWalls.length === 0) {
      return createAmbiguousResponse('문/창문을 추가할 벽체가 없습니다. 벽체를 먼저 추가해 주세요.', [
        '벽체 추가해줘',
      ])
    }
    const targetWallId = floorWalls[0].id
    const openingType: 'door' | 'window' = includesWindow ? 'window' : 'door'
    return createOkResponse(openingType === 'door' ? '선택한 벽체에 문을 추가합니다.' : '선택한 벽체에 창문을 추가합니다.', [
      {
        kind: 'add_opening',
        openingType,
        wallId: targetWallId,
        wallPosition: 0.5,
      },
    ])
  }

  if (includesDoor && includesRemove) {
    return buildDeleteOpeningResponse('door', floorOpenings)
  }

  if (includesWindow && includesRemove) {
    return buildDeleteOpeningResponse('window', floorOpenings)
  }

  return createAmbiguousResponse('요청을 명확하게 해석하지 못했습니다. 공간 이름과 동작을 구체적으로 입력해 주세요.', [
    '거실과 주방 사이에 연결 추가해줘',
    '거실과 주방 연결 삭제해줘',
    '현관/로비를 현관으로 이름 변경해줘',
    '서재 공간 추가해줘',
    '벽체 추가해줘',
    '문 추가해줘',
    '창문 추가해줘',
  ])
}
