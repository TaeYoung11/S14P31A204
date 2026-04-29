import { FLOOR_MM_PER_PX } from '../constants'
import type { FloorRoom, FloorWall } from '../types'

export interface DimensionGuideRenderData {
  lines: Array<{ key: string; points: number[]; dashed?: boolean }>
  labels: Array<{ key: string; text: string; x: number; y: number; rotation?: number }>
}

interface ComputeDimensionGuidesParams {
  isGenerated: boolean
  rooms: FloorRoom[]
  walls: FloorWall[]
}

function formatDimensionMm(lengthPx: number): string {
  return Math.max(Math.round(lengthPx * FLOOR_MM_PER_PX), 0).toLocaleString()
}

function collectGuides(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const merged: number[] = []
  sorted.forEach((value) => {
    const prev = merged[merged.length - 1]
    if (prev === undefined || Math.abs(prev - value) > tolerance) merged.push(value)
  })
  return merged
}

/**
 * 2D 캔버스의 방/벽 배치를 기준으로 자동 치수선 렌더 데이터를 계산한다.
 * - 상/하/좌/우 체인 치수선 + 전체 길이 치수선을 함께 생성
 * - 렌더링 전용 데이터만 반환해 Canvas 컴포넌트의 책임을 줄인다.
 */
export function computeDimensionGuides({
  isGenerated,
  rooms,
  walls,
}: ComputeDimensionGuidesParams): DimensionGuideRenderData {
  if (!isGenerated) return { lines: [], labels: [] }
  if (rooms.length === 0 && walls.length === 0) return { lines: [], labels: [] }

  const rectBounds = rooms.length > 0
    ? {
        minX: Math.min(...rooms.map((room) => room.x)),
        maxX: Math.max(...rooms.map((room) => room.x + room.width)),
        minY: Math.min(...rooms.map((room) => room.y)),
        maxY: Math.max(...rooms.map((room) => room.y + room.height)),
      }
    : {
        minX: Math.min(...walls.flatMap((wall) => [wall.start.x, wall.end.x])),
        maxX: Math.max(...walls.flatMap((wall) => [wall.start.x, wall.end.x])),
        minY: Math.min(...walls.flatMap((wall) => [wall.start.y, wall.end.y])),
        maxY: Math.max(...walls.flatMap((wall) => [wall.start.y, wall.end.y])),
      }

  const minSegmentPx = 8
  const labelSegmentPx = 14
  const axisTol = 1.5
  const roundGuide = (value: number) => Math.round(value * 10) / 10

  const xGuideValues = [
    rectBounds.minX,
    rectBounds.maxX,
    ...rooms.flatMap((room) => [room.x, room.x + room.width]),
    ...walls.flatMap((wall) => {
      if (Math.abs(wall.start.x - wall.end.x) > axisTol) return []
      const x = (wall.start.x + wall.end.x) / 2
      return x >= rectBounds.minX - axisTol && x <= rectBounds.maxX + axisTol ? [x] : []
    }),
  ]
  const yGuideValues = [
    rectBounds.minY,
    rectBounds.maxY,
    ...rooms.flatMap((room) => [room.y, room.y + room.height]),
    ...walls.flatMap((wall) => {
      if (Math.abs(wall.start.y - wall.end.y) > axisTol) return []
      const y = (wall.start.y + wall.end.y) / 2
      return y >= rectBounds.minY - axisTol && y <= rectBounds.maxY + axisTol ? [y] : []
    }),
  ]

  const xGuides = collectGuides(xGuideValues.map(roundGuide), axisTol).filter(
    (x) => x >= rectBounds.minX - axisTol && x <= rectBounds.maxX + axisTol,
  )
  const yGuides = collectGuides(yGuideValues.map(roundGuide), axisTol).filter(
    (y) => y >= rectBounds.minY - axisTol && y <= rectBounds.maxY + axisTol,
  )

  const lines: DimensionGuideRenderData['lines'] = []
  const labels: DimensionGuideRenderData['labels'] = []
  const topNearY = rectBounds.minY - 22
  const topFarY = rectBounds.minY - 42
  const bottomNearY = rectBounds.maxY + 22
  const leftNearX = rectBounds.minX - 22
  const leftFarX = rectBounds.minX - 42
  const rightNearX = rectBounds.maxX + 22
  const tick = 5

  const addHorizontalChain = (guideY: number, guides: number[], keyPrefix: string, showTotalOnly = false) => {
    if (guides.length < 2) return
    const first = guides[0]
    const last = guides[guides.length - 1]
    lines.push({ key: `${keyPrefix}-base`, points: [first, guideY, last, guideY] })
    guides.forEach((x, index) => {
      lines.push({ key: `${keyPrefix}-tick-${index}`, points: [x, guideY - tick, x, guideY + tick] })
    })
    lines.push({ key: `${keyPrefix}-ext-left`, points: [first, rectBounds.minY, first, guideY] })
    lines.push({ key: `${keyPrefix}-ext-right`, points: [last, rectBounds.minY, last, guideY] })

    if (showTotalOnly) {
      const total = last - first
      if (total >= minSegmentPx) {
        labels.push({
          key: `${keyPrefix}-total`,
          text: formatDimensionMm(total),
          x: (first + last) / 2,
          y: guideY - 12,
        })
      }
      return
    }

    for (let i = 0; i < guides.length - 1; i += 1) {
      const a = guides[i]
      const b = guides[i + 1]
      const widthPx = b - a
      if (widthPx < minSegmentPx) continue
      if (widthPx >= labelSegmentPx) {
        labels.push({
          key: `${keyPrefix}-seg-${i}`,
          text: formatDimensionMm(widthPx),
          x: (a + b) / 2,
          y: guideY - 12,
        })
      }
    }
  }

  const addVerticalChain = (guideX: number, guides: number[], keyPrefix: string, showTotalOnly = false) => {
    if (guides.length < 2) return
    const first = guides[0]
    const last = guides[guides.length - 1]
    lines.push({ key: `${keyPrefix}-base`, points: [guideX, first, guideX, last] })
    guides.forEach((y, index) => {
      lines.push({ key: `${keyPrefix}-tick-${index}`, points: [guideX - tick, y, guideX + tick, y] })
    })
    lines.push({ key: `${keyPrefix}-ext-top`, points: [rectBounds.minX, first, guideX, first] })
    lines.push({ key: `${keyPrefix}-ext-bottom`, points: [rectBounds.minX, last, guideX, last] })

    if (showTotalOnly) {
      const total = last - first
      if (total >= minSegmentPx) {
        labels.push({
          key: `${keyPrefix}-total`,
          text: formatDimensionMm(total),
          x: guideX - 12,
          y: (first + last) / 2,
          rotation: -90,
        })
      }
      return
    }

    for (let i = 0; i < guides.length - 1; i += 1) {
      const a = guides[i]
      const b = guides[i + 1]
      const heightPx = b - a
      if (heightPx < minSegmentPx) continue
      if (heightPx >= labelSegmentPx) {
        labels.push({
          key: `${keyPrefix}-seg-${i}`,
          text: formatDimensionMm(heightPx),
          x: guideX - 12,
          y: (a + b) / 2,
          rotation: -90,
        })
      }
    }
  }

  addHorizontalChain(topNearY, xGuides, 'dim-top')
  addHorizontalChain(topFarY, [rectBounds.minX, rectBounds.maxX], 'dim-top-total', true)
  addHorizontalChain(bottomNearY, xGuides, 'dim-bottom')
  addVerticalChain(leftNearX, yGuides, 'dim-left')
  addVerticalChain(leftFarX, [rectBounds.minY, rectBounds.maxY], 'dim-left-total', true)
  addVerticalChain(rightNearX, yGuides, 'dim-right')

  return {
    lines: lines.map((line) => ({ ...line, dashed: false })),
    labels,
  }
}
