import { INITIAL_ADD_SPACE_FORM } from '../constants'
import type { BubbleData } from '../types'
import { calcMmDimensionsByAreaAndAspect, calcPxDimensionsFromMm } from './bubbleCalc'

const DEFAULT_AREA_M2 = 10

/** 연결선 중복 여부 비교를 위한 양방향 키를 생성한다. */
export const toConnectionKey = (from: string, to: string) => [from, to].sort().join('::')

/** LLM이 추가한 임시 벽체 ID를 생성한다. */
export const createWallId = () => `llm-wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

/** LLM이 추가한 임시 문/창문 ID를 생성한다. */
export const createOpeningId = () => `llm-opening-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

/** 치수 값을 정수화하고 허용 범위로 제한한다. */
export const clampDimension = (value: number, min: number, max: number) =>
  Math.min(Math.max(Math.round(value), min), max)

/** 벽체 상대 위치(0~1)를 허용 범위로 제한한다. */
export const clampWallPosition = (value: number) => Math.min(Math.max(value, 0), 1)

/** 현재 버블 목록 기준 다음 표시 인덱스를 계산한다. */
export const getNextBubbleIndex = (bubbles: BubbleData[]) => {
  const max = bubbles.reduce((acc, bubble) => {
    const parsed = Number.parseInt(bubble.index, 10)
    return Number.isNaN(parsed) ? acc : Math.max(acc, parsed)
  }, 0)
  return String(max + 1).padStart(2, '0')
}

/** 기존 버블 근처 좌표를 기준으로 신규 버블 기본값을 구성한다. */
export function buildNewBubble(label: string, type: string, near: BubbleData | undefined): BubbleData {
  const mm = calcMmDimensionsByAreaAndAspect(DEFAULT_AREA_M2, 1)
  const px = calcPxDimensionsFromMm(mm.widthMm, mm.heightMm)
  const x = near ? near.x + near.width + 30 : 220
  const y = near ? near.y + 20 : 220

  return {
    id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    floor: near?.floor ?? 1,
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
