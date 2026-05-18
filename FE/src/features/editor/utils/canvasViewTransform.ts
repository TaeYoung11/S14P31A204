import type { CanvasViewTransform, Point2D } from '../types'
import { alignFlatPointsToAxis, getFlatPointsBounds } from './sitePointTransform'

/**
 * 보기 모드(정렬/실북향)에 맞는 캔버스 렌더 전용 변환을 계산한다.
 * - `isTrueNorthView=true`이면 원본(canonical) 방향을 그대로 사용한다.
 * - `false`이면 대지 주축을 화면 축에 맞추는 회전만 적용한다.
 */
export function resolveCanvasViewTransform(
  points: number[],
  isTrueNorthView: boolean,
): CanvasViewTransform | null {
  if (isTrueNorthView) return null
  const bounds = getFlatPointsBounds(points)
  if (!bounds) return null
  const { rotationRadians } = alignFlatPointsToAxis(points)
  if (!Number.isFinite(rotationRadians) || Math.abs(rotationRadians) < 1e-6) return null
  return {
    centerX: bounds.cx,
    centerY: bounds.cy,
    rotationRadians,
  }
}

/**
 * 점을 임의 중심점 기준으로 회전한다.
 * - 편집 상태(canonical)와 렌더 상태(view) 좌표를 상호 변환할 때 사용한다.
 */
export function rotatePointAround(
  point: Point2D,
  radians: number,
  centerX: number,
  centerY: number,
): Point2D {
  if (!Number.isFinite(radians) || Math.abs(radians) < 1e-9) return point
  const dx = point.x - centerX
  const dy = point.y - centerY
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  }
}

/** Konva `rotation` prop 용 라디안→도 변환 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}
