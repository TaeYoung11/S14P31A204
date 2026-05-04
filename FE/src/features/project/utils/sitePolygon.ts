import * as turf from '@turf/turf'

const DUPLICATE_POINT_PRECISION = 8

export interface SitePolygonValidationResult {
  isValid: boolean
  reason?: 'too_few_points' | 'duplicate_points' | 'self_intersection' | 'invalid_geometry'
}

function toPointKey(lng: number, lat: number): string {
  return `${lng.toFixed(DUPLICATE_POINT_PRECISION)}:${lat.toFixed(DUPLICATE_POINT_PRECISION)}`
}

function samePoint(a: number[], b: number[]): boolean {
  return Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1])
}

function isPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
  if (Math.abs(cross) > 1e-9) return false
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay)
  if (dot < 0) return false
  const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay)
  return dot <= lenSq
}

function segmentsIntersect(a1: number[], a2: number[], b1: number[], b2: number[]): boolean {
  const [x1, y1] = a1
  const [x2, y2] = a2
  const [x3, y3] = b1
  const [x4, y4] = b2

  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    (cy - ay) * (bx - ax) > (by - ay) * (cx - ax)

  const general = ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4)
    && ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)

  if (general) return true

  return (
    isPointOnSegment(x1, y1, x3, y3, x4, y4) ||
    isPointOnSegment(x2, y2, x3, y3, x4, y4) ||
    isPointOnSegment(x3, y3, x1, y1, x2, y2) ||
    isPointOnSegment(x4, y4, x1, y1, x2, y2)
  )
}

function hasSelfIntersection(ring: number[][]): boolean {
  const closed = toClosedRing(ring)
  const segmentCount = closed.length - 1
  for (let i = 0; i < segmentCount; i += 1) {
    const a1 = closed[i]
    const a2 = closed[i + 1]
    for (let j = i + 1; j < segmentCount; j += 1) {
      const b1 = closed[j]
      const b2 = closed[j + 1]

      // 인접 선분(공유 꼭짓점)과 첫/마지막 선분의 공유점은 교차에서 제외한다.
      const isAdjacent = Math.abs(i - j) <= 1 || (i === 0 && j === segmentCount - 1)
      if (isAdjacent) continue

      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

function stripClosingPoint(ring: number[][]): number[][] {
  if (ring.length < 2) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  return samePoint(first, last) ? ring.slice(0, -1) : ring
}

function toClosedRing(ring: number[][]): number[][] {
  if (ring.length < 1) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  return samePoint(first, last) ? ring : [...ring, first]
}

/**
 * 좌표 배열을 [lng, lat] 형태로 정규화한다.
 * - 숫자가 아닌 값/좌표쌍이 아닌 항목은 제거
 * - 닫힘 좌표(첫점=끝점)는 내부 저장 전 제거
 */
export function normalizePolygonRing(value: unknown): number[][] {
  if (!Array.isArray(value)) return []

  const normalized = value
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => [Number(lng), Number(lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))

  return stripClosingPoint(normalized)
}

/**
 * 대지 폴리곤 링의 유효성을 검사한다.
 * - 점 개수(최소 3)
 * - 중복 정점(첫점/끝점 닫힘 중복 제외)
 * - 자기교차
 * - 지오메트리 유효성(면적 > 0)
 */
export function validatePolygonRing(ring: number[][]): SitePolygonValidationResult {
  const normalized = normalizePolygonRing(ring)
  if (normalized.length < 3) {
    return { isValid: false, reason: 'too_few_points' }
  }

  const visited = new Set<string>()
  for (const [lng, lat] of normalized) {
    const key = toPointKey(lng, lat)
    if (visited.has(key)) {
      return { isValid: false, reason: 'duplicate_points' }
    }
    visited.add(key)
  }

  if (hasSelfIntersection(normalized)) {
    return { isValid: false, reason: 'self_intersection' }
  }

  try {
    const closedRing = toClosedRing(normalized)
    const polygon = turf.polygon([closedRing])
    const area = turf.area(polygon)
    if (!Number.isFinite(area) || area <= 0) {
      return { isValid: false, reason: 'invalid_geometry' }
    }
  } catch {
    return { isValid: false, reason: 'invalid_geometry' }
  }

  return { isValid: true }
}

/**
 * 중첩된 GeoJSON 좌표에서 유효한 첫 outer ring을 추출한다.
 * - Polygon / MultiPolygon 등 중첩 배열을 재귀 탐색
 */
export function extractOuterRingFromCoordinates(coordinates: unknown): number[][] | null {
  const direct = normalizePolygonRing(coordinates)
  if (direct.length >= 3 && validatePolygonRing(direct).isValid) return direct

  if (!Array.isArray(coordinates)) return null

  for (const child of coordinates) {
    const nested = extractOuterRingFromCoordinates(child)
    if (nested) return nested
  }

  return null
}
