import type { BubbleData } from '../types'
import {
  getFlatPointsBounds,
  scaleFlatPointsAround,
  translateFlatPoints,
} from './sitePointTransform'

/**
 * 점 배열이 스테이지 내부에 맞도록 필요한 줌 비율(%)을 계산한다.
 * 반환값은 clamp 전 원시 값이며, 호출부에서 편집기 min/max 줌 규칙을 적용한다.
 */
export function computeFitZoomPercent(
  points: number[],
  stageWidth: number,
  stageHeight: number,
  marginPx: number,
): number | null {
  const bounds = getFlatPointsBounds(points)
  if (!bounds) return null

  const availableWidth = Math.max(stageWidth - marginPx * 2, 1)
  const availableHeight = Math.max(stageHeight - marginPx * 2, 1)
  const fitScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
  if (!Number.isFinite(fitScale) || fitScale <= 0) return null

  return fitScale * 100
}

/**
 * 대지 렌더링 결과가 현재 버블 영역을 감싸도록 최소한으로 이동/확대한다.
 * - 기존 대지 비율은 유지
 * - 화면 fit 결과를 최대한 유지하고, 부족할 때만 보정
 */
export function ensureSiteContainsBubbles(
  points: number[],
  bubbles: BubbleData[],
  paddingPx: number,
  maxScale: number,
): number[] {
  if (!Array.isArray(points) || points.length < 6 || bubbles.length === 0) return points

  const siteBounds = getFlatPointsBounds(points)
  if (!siteBounds) return points

  const bubbleMinX = Math.min(...bubbles.map((bubble) => bubble.x))
  const bubbleMinY = Math.min(...bubbles.map((bubble) => bubble.y))
  const bubbleMaxX = Math.max(...bubbles.map((bubble) => bubble.x + bubble.width))
  const bubbleMaxY = Math.max(...bubbles.map((bubble) => bubble.y + bubble.height))
  const bubbleWidth = bubbleMaxX - bubbleMinX
  const bubbleHeight = bubbleMaxY - bubbleMinY
  if (bubbleWidth <= 0 || bubbleHeight <= 0) return points

  const bubbleCx = (bubbleMinX + bubbleMaxX) / 2
  const bubbleCy = (bubbleMinY + bubbleMaxY) / 2
  const aligned = translateFlatPoints(points, bubbleCx - siteBounds.cx, bubbleCy - siteBounds.cy)

  const requiredWidth = bubbleWidth + paddingPx * 2
  const requiredHeight = bubbleHeight + paddingPx * 2
  const scaleX = requiredWidth / siteBounds.width
  const scaleY = requiredHeight / siteBounds.height
  const nextScale = Math.min(Math.max(1, scaleX, scaleY), maxScale)
  if (!Number.isFinite(nextScale) || nextScale <= 1) return aligned

  return scaleFlatPointsAround(aligned, nextScale, bubbleCx, bubbleCy)
}
