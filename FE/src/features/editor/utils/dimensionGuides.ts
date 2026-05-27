import { FLOOR_MM_PER_PX } from '../constants'
import type { FloorRoom, FloorWall } from '../types'
import { getFlatPointsBounds } from './sitePointTransform'

export interface DimensionGuideRenderData {
  lines: Array<{ key: string; points: number[]; dashed?: boolean }>
  labels: Array<{ key: string; text: string; x: number; y: number; rotation?: number }>
}

interface ComputeDimensionGuidesParams {
  isGenerated: boolean
  rooms: FloorRoom[]
  walls: FloorWall[]
}

const EPSILON = 1e-9

function rotatePointAround(
  x: number,
  y: number,
  radians: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  if (!Number.isFinite(radians) || Math.abs(radians) < EPSILON) return { x, y }
  const dx = x - cx
  const dy = y - cy
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }
}

function toRoomReferencePolygon(room: FloorRoom): Array<{ x: number; y: number }> {
  if (room.polygon && room.polygon.length >= 3) return room.polygon
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.width, y: room.y },
    { x: room.x + room.width, y: room.y + room.height },
    { x: room.x, y: room.y + room.height },
  ]
}

function collectGeometryFlatPoints(rooms: FloorRoom[], walls: FloorWall[]): number[] {
  const points: number[] = []
  rooms.forEach((room) => {
    toRoomReferencePolygon(room).forEach((point) => {
      points.push(point.x, point.y)
    })
  })
  walls.forEach((wall) => {
    points.push(wall.start.x, wall.start.y, wall.end.x, wall.end.y)
  })
  return points
}

function normalizeUndirectedAngle(radians: number): number {
  let angle = radians
  while (angle >= Math.PI / 2) angle -= Math.PI
  while (angle < -Math.PI / 2) angle += Math.PI
  return angle
}

function resolveGuideAxisAngleRadians(rooms: FloorRoom[], walls: FloorWall[]): number | null {
  let bestAngle: number | null = null
  let bestLength = 0

  const considerSegment = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    if (!Number.isFinite(length) || length <= 1e-6) return
    if (length <= bestLength) return
    bestLength = length
    bestAngle = normalizeUndirectedAngle(Math.atan2(dy, dx))
  }

  walls.forEach((wall) => {
    considerSegment(wall.start.x, wall.start.y, wall.end.x, wall.end.y)
  })

  rooms.forEach((room) => {
    const polygon = toRoomReferencePolygon(room)
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i]
      const next = polygon[(i + 1) % polygon.length]
      considerSegment(current.x, current.y, next.x, next.y)
    }
  })

  return bestAngle
}

/**
 * 방 데이터에서 실제 mm/px 비율을 역산한다.
 * - FloorRoom.widthMm / room.width 로 계산 (모든 방이 동일한 transform을 공유하므로 한 방으로 충분)
 * - 방이 없을 경우 고정 상수 FLOOR_MM_PER_PX 폴백
 */
function deriveMmPerPx(rooms: FloorRoom[]): number {
  for (const room of rooms) {
    if (room.width > 1 && room.widthMm > 0) return room.widthMm / room.width
    if (room.height > 1 && room.heightMm > 0) return room.heightMm / room.height
  }
  return FLOOR_MM_PER_PX
}

/**
 * 픽셀 길이를 mm 치수 문자열로 변환한다.
 * 1mm 단위로 반올림, 천 단위 구분 기호를 적용한다.
 * 예: 3000 → "3,000"
 */
function formatDimensionMm(lengthPx: number, mmPerPx: number): string {
  const mm = Math.max(Math.round(lengthPx * mmPerPx), 0)
  return mm.toLocaleString()
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
function buildAxisAlignedDimensionGuides(
  rooms: FloorRoom[],
  walls: FloorWall[],
  mmPerPx: number,
): DimensionGuideRenderData {
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
          text: formatDimensionMm(total, mmPerPx),
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
          text: formatDimensionMm(widthPx, mmPerPx),
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
          text: formatDimensionMm(total, mmPerPx),
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
          text: formatDimensionMm(heightPx, mmPerPx),
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

export function computeDimensionGuides({
  isGenerated,
  rooms,
  walls,
}: ComputeDimensionGuidesParams): DimensionGuideRenderData {
  if (!isGenerated) return { lines: [], labels: [] }
  if (rooms.length === 0 && walls.length === 0) return { lines: [], labels: [] }

  /** 실제 렌더 scale에서 역산한 mm/px 비율 — 고정 상수(25) 대신 사용 */
  const mmPerPx = deriveMmPerPx(rooms)
  const geometryPoints = collectGeometryFlatPoints(rooms, walls)
  const geometryBounds = getFlatPointsBounds(geometryPoints)
  const dominantAngle = resolveGuideAxisAngleRadians(rooms, walls)
  if (!geometryBounds || dominantAngle === null || Math.abs(dominantAngle) < 0.01) {
    return buildAxisAlignedDimensionGuides(rooms, walls, mmPerPx)
  }

  const localRotation = -dominantAngle
  const localRooms = rooms.map((room) => {
    const localPolygon = toRoomReferencePolygon(room).map((point) =>
      rotatePointAround(point.x, point.y, localRotation, geometryBounds.cx, geometryBounds.cy))
    const xs = localPolygon.map((point) => point.x)
    const ys = localPolygon.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      ...room,
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      polygon: localPolygon,
    }
  })
  const localWalls = walls.map((wall) => ({
    ...wall,
    start: rotatePointAround(wall.start.x, wall.start.y, localRotation, geometryBounds.cx, geometryBounds.cy),
    end: rotatePointAround(wall.end.x, wall.end.y, localRotation, geometryBounds.cx, geometryBounds.cy),
  }))

  const axisGuides = buildAxisAlignedDimensionGuides(localRooms, localWalls, mmPerPx)
  const rotationDeg = (dominantAngle * 180) / Math.PI

  return {
    lines: axisGuides.lines.map((line) => {
      const rotatedPoints: number[] = []
      for (let i = 0; i + 1 < line.points.length; i += 2) {
        const mapped = rotatePointAround(
          line.points[i],
          line.points[i + 1],
          dominantAngle,
          geometryBounds.cx,
          geometryBounds.cy,
        )
        rotatedPoints.push(mapped.x, mapped.y)
      }
      return { ...line, points: rotatedPoints }
    }),
    labels: axisGuides.labels.map((label) => {
      const mapped = rotatePointAround(label.x, label.y, dominantAngle, geometryBounds.cx, geometryBounds.cy)
      return {
        ...label,
        x: mapped.x,
        y: mapped.y,
        rotation: (label.rotation ?? 0) + rotationDeg,
      }
    }),
  }
}
