import { describe, expect, it } from 'vitest'
import type { BubbleData, ConnectionData, ZoneData } from '../../../../src/features/editor/types'
import { assertLayoutImportV2 } from '../../../../src/features/editor/services/floorPlanGenerate.contract'
import {
  DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
  buildFloorPlanLayoutImportPayload,
  getLayoutImportBoundaryLogMetadata,
  pruneZoneBubbleIds,
  type LayoutImportBoundaryInput,
} from '../../../../src/features/editor/utils/editorPageHelpers'

const PROJECT_ID = '123e4567-e89b-42d3-a456-426614174000'

function createBubble(overrides: Partial<BubbleData> = {}): BubbleData {
  return {
    id: 'room-a',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    widthMm: 1000,
    heightMm: 800,
    label: 'Room A',
    type: 'living',
    ratio: 0.8,
    area: '0.8 m2',
    color: '#FFFFFF',
    index: '01',
    ...overrides,
  }
}

function buildPayload(
  bubbles: BubbleData[],
  boundaryInput: LayoutImportBoundaryInput,
  connections: ConnectionData[] = [],
) {
  return buildFloorPlanLayoutImportPayload(PROJECT_ID, 'Test Project', bubbles, connections, boundaryInput)
}

function expectPairCloseTo(actual: [number, number], expected: [number, number]) {
  expect(actual[0]).toBeCloseTo(expected[0])
  expect(actual[1]).toBeCloseTo(expected[1])
}

function getSignedArea(polygon: Array<[number, number]>): number {
  return polygon.reduce((area, [x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length]
    return area + x1 * y2 - x2 * y1
  }, 0) / 2
}

function expectNoBoundaryMetadata(payload: unknown) {
  const serialized = JSON.stringify(payload)
  expect(serialized).not.toContain('boundarySource')
  expect(serialized).not.toContain('paddingMm')
  expect(serialized).not.toContain('fallbackReason')
  expect(serialized).not.toContain('boundaryOmitReason')
}

describe('buildFloorPlanLayoutImportPayload', () => {
  it('버블 좌상단 좌표를 방 중심 mm 좌표로 변환한다', () => {
    const payload = buildPayload(
      [createBubble()],
      { source: 'none', reason: 'empty-bubbles' },
    )

    expect(payload.rooms).toHaveLength(1)
    expect(payload.rooms[0].x).toBeCloseTo(600)
    expect(payload.rooms[0].y).toBeCloseTo(600)
    expect(payload.rooms[0]).toMatchObject({
      id: 'room-a',
      source_bubble_id: 'room-a',
    })
    assertLayoutImportV2(payload)
  })

  it('실제 대지 경계를 포함하고 닫힌 polygon의 마지막 중복 좌표를 제거한다', () => {
    const payload = buildPayload(
      [createBubble()],
      { source: 'site', sitePlanPoints: [0, 0, 10, 0, 10, 10, 0, 10, 0, 0] },
    )

    expect(payload.boundaries).toHaveLength(1)
    const polygon = payload.boundaries?.[0].polygon ?? []
    expect(polygon).toHaveLength(4)
    expectPairCloseTo(polygon[0], [0, 0])
    expectPairCloseTo(polygon[1], [100, 0])
    expectPairCloseTo(polygon[2], [100, 100])
    expectPairCloseTo(polygon[3], [0, 100])
    assertLayoutImportV2(payload)
  })

  it('실제 대지 경계 polygon 방향을 정규화한다', () => {
    const payload = buildPayload(
      [createBubble()],
      { source: 'site', sitePlanPoints: [0, 0, 0, 10, 10, 10, 10, 0] },
    )

    const polygon = payload.boundaries?.[0].polygon ?? []
    expect(polygon).toHaveLength(4)
    expect(getSignedArea(polygon)).toBeGreaterThan(0)
    assertLayoutImportV2(payload)
  })

  it('유효하지 않은 실제 대지 경계 polygon은 boundaries에서 생략한다', () => {
    const payload = buildPayload(
      [createBubble()],
      { source: 'site', sitePlanPoints: [0, 0, 10, 10] },
    )

    expect(payload.boundaries).toBeUndefined()
    assertLayoutImportV2(payload)
  })

  it('중복 제거된 버블 bounds와 정책 padding으로 default boundary를 생성한다', () => {
    const payload = buildPayload(
      [
        createBubble(),
        createBubble({
          id: 'room-b',
          x: 200,
          y: 50,
          width: 50,
          height: 60,
          widthMm: 500,
          heightMm: 600,
          label: 'Room B',
          index: '02',
        }),
      ],
      { source: 'default', paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM, fallbackReason: 'missing-site' },
    )

    expect(payload.boundaries).toHaveLength(1)
    const polygon = payload.boundaries?.[0].polygon ?? []
    expectPairCloseTo(polygon[0], [-1900, -1800])
    expectPairCloseTo(polygon[1], [4500, -1800])
    expectPairCloseTo(polygon[2], [4500, 3100])
    expectPairCloseTo(polygon[3], [-1900, 3100])
    assertLayoutImportV2(payload)
  })

  it('중복 id 버블은 첫 번째 버블만 default boundary 계산에 사용한다', () => {
    const payload = buildPayload(
      [
        createBubble({ id: 'duplicated', x: 0, y: 0, width: 100, height: 100 }),
        createBubble({ id: 'duplicated', x: 1000, y: 1000, width: 100, height: 100 }),
      ],
      { source: 'default', paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM, fallbackReason: 'missing-site' },
    )

    const polygon = payload.boundaries?.[0].polygon ?? []
    expectPairCloseTo(polygon[0], [-2000, -2000])
    expectPairCloseTo(polygon[2], [3000, 3000])
    expect(payload.rooms).toHaveLength(1)
    assertLayoutImportV2(payload)
  })

  it('사용 가능한 버블 bounds가 없으면 default boundary를 생략한다', () => {
    const payload = buildPayload(
      [],
      { source: 'default', paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM, fallbackReason: 'missing-site' },
    )

    expect(payload.boundaries).toBeUndefined()
  })

  it('방 좌표와 boundary에 동일한 bubble 기반 mmPerPx를 사용한다', () => {
    const payload = buildPayload(
      [createBubble({ width: 100, widthMm: 2000, height: 40, heightMm: 800 })],
      { source: 'site', sitePlanPoints: [1, 1, 2, 1, 2, 2, 1, 2] },
    )

    expect(payload.rooms[0].x).toBeCloseTo(1200)
    expect(payload.rooms[0].y).toBeCloseTo(800)
    expectPairCloseTo(payload.boundaries?.[0].polygon[0] ?? [0, 0], [20, 20])
    assertLayoutImportV2(payload)
  })

  it('default boundary는 stage 크기 기반 fallback sitePoints에 의존하지 않는다', () => {
    const bubbles = [createBubble()]
    const boundaryInput: LayoutImportBoundaryInput = {
      source: 'default',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
      fallbackReason: 'missing-site',
    }

    const firstPayload = buildPayload(bubbles, boundaryInput)
    const secondPayload = buildPayload(bubbles, boundaryInput)

    expect(firstPayload.boundaries?.[0].polygon).toEqual(secondPayload.boundaries?.[0].polygon)
    assertLayoutImportV2(firstPayload)
  })

  it('none source에서는 boundaries를 생략하고 transport metadata를 payload에 포함하지 않는다', () => {
    const payload = buildPayload(
      [createBubble()],
      { source: 'none', reason: 'empty-bubbles' },
    )

    expect(payload.boundaries).toBeUndefined()
    expectNoBoundaryMetadata(payload)
    assertLayoutImportV2(payload)
  })
})

describe('getLayoutImportBoundaryLogMetadata', () => {
  it('site boundary가 포함되면 입력 의도와 포함 결과만 로그 메타데이터로 남긴다', () => {
    const bubbles = [createBubble()]
    const boundaryInput: LayoutImportBoundaryInput = {
      source: 'site',
      sitePlanPoints: [0, 0, 10, 0, 10, 10, 0, 10],
    }
    const payload = buildPayload(bubbles, boundaryInput)

    expect(getLayoutImportBoundaryLogMetadata(boundaryInput, bubbles, payload)).toEqual({
      boundarySource: 'site',
      boundaryIncluded: true,
    })
  })

  it('default boundary가 포함되면 fallback reason과 padding을 로그 메타데이터로 남긴다', () => {
    const bubbles = [createBubble()]
    const boundaryInput: LayoutImportBoundaryInput = {
      source: 'default',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
      fallbackReason: 'missing-site',
    }
    const payload = buildPayload(bubbles, boundaryInput)

    expect(getLayoutImportBoundaryLogMetadata(boundaryInput, bubbles, payload)).toEqual({
      boundarySource: 'default',
      boundaryIncluded: true,
      fallbackReason: 'missing-site',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
    })
  })

  it('유효하지 않은 site boundary가 생략되면 invalid-site-boundary omit reason을 남긴다', () => {
    const bubbles = [createBubble()]
    const boundaryInput: LayoutImportBoundaryInput = {
      source: 'site',
      sitePlanPoints: [0, 0, 10, 10],
    }
    const payload = buildPayload(bubbles, boundaryInput)

    expect(getLayoutImportBoundaryLogMetadata(boundaryInput, bubbles, payload)).toEqual({
      boundarySource: 'site',
      boundaryIncluded: false,
      boundaryOmitReason: 'invalid-site-boundary',
    })
  })

  it('default boundary 입력에서 버블이 없으면 empty-bubbles omit reason과 fallback 정보를 함께 남긴다', () => {
    const bubbles: BubbleData[] = []
    const boundaryInput: LayoutImportBoundaryInput = {
      source: 'default',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
      fallbackReason: 'missing-site',
    }
    const payload = buildPayload(bubbles, boundaryInput)

    expect(getLayoutImportBoundaryLogMetadata(boundaryInput, bubbles, payload)).toEqual({
      boundarySource: 'default',
      boundaryIncluded: false,
      fallbackReason: 'missing-site',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
      boundaryOmitReason: 'empty-bubbles',
    })
  })

  it('none source는 boundaries를 생략하고 입력 reason만 omit reason으로 남긴다', () => {
    const bubbles = [createBubble()]
    const boundaryInput: LayoutImportBoundaryInput = {
      source: 'none',
      reason: 'empty-bubbles',
    }
    const payload = buildPayload(bubbles, boundaryInput)

    expect(getLayoutImportBoundaryLogMetadata(boundaryInput, bubbles, payload)).toEqual({
      boundarySource: 'none',
      boundaryIncluded: false,
      boundaryOmitReason: 'empty-bubbles',
    })
  })
})

describe('pruneZoneBubbleIds', () => {
  it('삭제된 버블 id를 각 조닝의 bubbleIds에서 제거한다', () => {
    const zones: ZoneData[] = [
      { id: 'zone-1', name: 'A', color: '#111111', source: 'manual', bubbleIds: ['b1', 'b2', 'b3'] },
      { id: 'zone-2', name: 'B', color: '#222222', source: 'auto', bubbleIds: ['b3', 'b4'] },
    ]

    const next = pruneZoneBubbleIds(zones, ['b3', 'bX'])

    expect(next).toEqual([
      { id: 'zone-1', name: 'A', color: '#111111', source: 'manual', bubbleIds: ['b1', 'b2'] },
      { id: 'zone-2', name: 'B', color: '#222222', source: 'auto', bubbleIds: ['b4'] },
    ])
  })

  it('변경 대상이 없으면 동일 참조를 반환한다', () => {
    const zones: ZoneData[] = [
      { id: 'zone-1', name: 'A', color: '#111111', source: 'manual', bubbleIds: ['b1', 'b2'] },
    ]

    const next = pruneZoneBubbleIds(zones, ['b9'])

    expect(next).toBe(zones)
  })
})


