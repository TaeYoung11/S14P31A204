/**
 * 조닝 영역 유기체 형태(Organic Shape) 계산 유틸리티
 * Convex Hull + Chaikin 스무딩 알고리즘 사용
 */

import type { BubbleData, ZoneData, Point2D } from '../types'

/** 조닝에 포함된 버블 목록 반환 */
export function getZoneBubbles(zone: ZoneData, bubbles: BubbleData[]): BubbleData[] {
  return zone.bubbleIds
    .map((id) => bubbles.find((b) => b.id === id))
    .filter((b): b is BubbleData => Boolean(b))
}

/** 버블 외곽 타원 둘레에서 균일하게 점을 샘플링 */
function sampleBubbleEdgePoints(bubble: BubbleData, padding: number, sampleCount = 18): Point2D[] {
  const cx = bubble.x + bubble.width / 2
  const cy = bubble.y + bubble.height / 2
  const rx = bubble.width / 2 + padding
  const ry = bubble.height / 2 + padding
  return Array.from({ length: sampleCount }, (_, i) => {
    const angle = (Math.PI * 2 * i) / sampleCount
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
  })
}

/** 벡터 외적 계산 (Convex Hull 방향 판단용) */
function crossProduct(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Andrew's Monotone Chain 알고리즘으로 Convex Hull 생성 */
function buildConvexHull(points: Point2D[]): Point2D[] {
  const uniqueMap = new Map<string, Point2D>()
  points.forEach((p) =>
    uniqueMap.set(`${Math.round(p.x * 10)}:${Math.round(p.y * 10)}`, p)
  )
  const sorted = Array.from(uniqueMap.values()).sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x
  )
  if (sorted.length <= 3) return sorted

  const lower: Point2D[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }

  const upper: Point2D[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/** Chaikin 알고리즘으로 다각형 경계를 부드럽게 처리 */
function smoothClosedPoints(points: Point2D[], iterations = 2): Point2D[] {
  if (points.length < 3) return points
  let pts = points
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point2D[] = []
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]
      const nxt = pts[(i + 1) % pts.length]
      next.push({ x: cur.x * 0.75 + nxt.x * 0.25, y: cur.y * 0.75 + nxt.y * 0.25 })
      next.push({ x: cur.x * 0.25 + nxt.x * 0.75, y: cur.y * 0.25 + nxt.y * 0.75 })
    }
    pts = next
  }
  return pts
}

/**
 * 조닝 영역의 유기체 형태 폴리곤 좌표와 레이블 위치 계산
 * @returns points(Konva용 flat 배열), labelX, labelY | null (버블 없을 때)
 */
export function getZoneOrganicShape(zone: ZoneData, bubbles: BubbleData[], padding = 26) {
  const zoneBubbles = getZoneBubbles(zone, bubbles)
  if (zoneBubbles.length === 0) return null

  const sampled = zoneBubbles.flatMap((b) => sampleBubbleEdgePoints(b, padding))
  if (sampled.length < 3) return null

  const hull = buildConvexHull(sampled)
  const smooth = smoothClosedPoints(hull, 2)

  const minX = Math.min(...smooth.map((p) => p.x))
  const minY = Math.min(...smooth.map((p) => p.y))

  return {
    points: smooth.flatMap((p) => [p.x, p.y]),
    labelX: minX + 10,
    labelY: minY + 8,
  }
}
