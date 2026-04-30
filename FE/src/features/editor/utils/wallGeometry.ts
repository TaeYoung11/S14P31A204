import type { FloorWall, Point2D } from '../types'

export const DEFAULT_WALL_OVERLAP_TOLERANCE_PX = 1.5
export const DEFAULT_WALL_MIN_SEGMENT_LENGTH_PX = 8

export type AxisAlignedWallProjection =
  | { axis: 'vertical'; fixed: number; min: number; max: number }
  | { axis: 'horizontal'; fixed: number; min: number; max: number }

/** 벽 선분을 방향 무관한 동일 키로 정규화한다. (중복 제거용) */
export function getWallGeometryKey(wall: FloorWall): string {
  const sx = Math.round(wall.start.x)
  const sy = Math.round(wall.start.y)
  const ex = Math.round(wall.end.x)
  const ey = Math.round(wall.end.y)
  const forward = `${sx},${sy}|${ex},${ey}`
  const backward = `${ex},${ey}|${sx},${sy}`
  return forward < backward ? forward : backward
}

/** 수평/수직 벽을 투영 형태로 변환한다. (비축 정렬이면 null) */
export function projectAxisAlignedWall(
  wall: FloorWall,
  tolerance = DEFAULT_WALL_OVERLAP_TOLERANCE_PX,
): AxisAlignedWallProjection | null {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  if (Math.abs(dx) <= tolerance) {
    return {
      axis: 'vertical',
      fixed: (wall.start.x + wall.end.x) / 2,
      min: Math.min(wall.start.y, wall.end.y),
      max: Math.max(wall.start.y, wall.end.y),
    }
  }
  if (Math.abs(dy) <= tolerance) {
    return {
      axis: 'horizontal',
      fixed: (wall.start.y + wall.end.y) / 2,
      min: Math.min(wall.start.x, wall.end.x),
      max: Math.max(wall.start.x, wall.end.x),
    }
  }
  return null
}

/** 같은 축 선분의 겹치는 구간(start/end)을 반환한다. */
export function getWallOverlapInterval(
  a: AxisAlignedWallProjection,
  b: AxisAlignedWallProjection,
  tolerance = DEFAULT_WALL_OVERLAP_TOLERANCE_PX,
): { start: number; end: number } | null {
  if (a.axis !== b.axis) return null
  if (Math.abs(a.fixed - b.fixed) > tolerance) return null
  const start = Math.max(a.min, b.min)
  const end = Math.min(a.max, b.max)
  return end - start > tolerance ? { start, end } : null
}

/**
 * 기준 겹침 구간을 제거하고 남는 벽 조각을 생성한다.
 * 자동 벽 일부만 삭제된 경우 수동 residual wall로 승격할 때 사용한다.
 */
export function buildWallOutsideOverlapSegments(
  wall: FloorWall,
  overlapStart: number,
  overlapEnd: number,
  minLength = DEFAULT_WALL_MIN_SEGMENT_LENGTH_PX,
): Array<{ start: Point2D; end: Point2D }> {
  const projection = projectAxisAlignedWall(wall)
  if (!projection) return []

  const segments: Array<{ start: Point2D; end: Point2D }> = []
  if (projection.axis === 'vertical') {
    if (overlapStart - projection.min >= minLength) {
      segments.push({
        start: { x: projection.fixed, y: projection.min },
        end: { x: projection.fixed, y: overlapStart },
      })
    }
    if (projection.max - overlapEnd >= minLength) {
      segments.push({
        start: { x: projection.fixed, y: overlapEnd },
        end: { x: projection.fixed, y: projection.max },
      })
    }
    return segments
  }

  if (overlapStart - projection.min >= minLength) {
    segments.push({
      start: { x: projection.min, y: projection.fixed },
      end: { x: overlapStart, y: projection.fixed },
    })
  }
  if (projection.max - overlapEnd >= minLength) {
    segments.push({
      start: { x: overlapEnd, y: projection.fixed },
      end: { x: projection.max, y: projection.fixed },
    })
  }
  return segments
}

/** 짧은 벽이 긴 벽에 완전히 포함되는 중복 벽인지 판정한다. */
export function shouldRemoveAsContainedOverlap(
  candidate: FloorWall,
  reference: FloorWall,
  tolerance = DEFAULT_WALL_OVERLAP_TOLERANCE_PX,
): boolean {
  const a = projectAxisAlignedWall(candidate, tolerance)
  const b = projectAxisAlignedWall(reference, tolerance)
  if (!a || !b) return false
  if (a.axis !== b.axis) return false
  if (Math.abs(a.fixed - b.fixed) > tolerance) return false

  const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min)
  if (overlap <= tolerance) return false

  const aLength = Math.max(a.max - a.min, 0)
  const bLength = Math.max(b.max - b.min, 0)
  if (aLength <= tolerance || bLength <= tolerance) return false

  const aContainedByB = a.min >= b.min - tolerance && a.max <= b.max + tolerance
  if (!aContainedByB) return false

  return aLength < bLength - tolerance
}
