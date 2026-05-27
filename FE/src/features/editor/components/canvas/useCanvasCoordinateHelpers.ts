import { useCallback } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { CanvasViewTransform, Point2D } from '../../types'
import { rotatePointAround } from '../../utils/canvasViewTransform'

interface UseCanvasCoordinateHelpersParams {
  scale: number
  baseOffsetX: number
  baseOffsetY: number
  panOffsetX: number
  panOffsetY: number
  isPanMode: boolean
  viewTransform?: CanvasViewTransform | null
}

/**
 * Konva 캔버스 좌표 변환/핸들 위치 동기화/커서 변경 헬퍼를 제공한다.
 */
export function useCanvasCoordinateHelpers({
  scale,
  baseOffsetX,
  baseOffsetY,
  panOffsetX,
  panOffsetY,
  isPanMode,
  viewTransform,
}: UseCanvasCoordinateHelpersParams) {
  /**
   * 화면 포인터 좌표를 canonical 캔버스 좌표로 변환한다.
   * - Stage scale/pan을 역변환
   * - 뷰 전용 회전(viewTransform)이 있으면 추가 역회전
   */
  const getCanvasPoint = useCallback((stage: Konva.Stage): Point2D | null => {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const transform = stage.getAbsoluteTransform().copy()
    transform.invert()
    const localPoint = transform.point(pointer)
    if (!viewTransform) return localPoint
    return rotatePointAround(
      localPoint,
      -viewTransform.rotationRadians,
      viewTransform.centerX,
      viewTransform.centerY,
    )
  }, [viewTransform])

  const getStagePoint = useCallback((stage: Konva.Stage): Point2D | null => {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const transform = stage.getAbsoluteTransform().copy()
    transform.invert()
    return transform.point(pointer)
  }, [])

  /**
   * canonical 캔버스 좌표를 화면 좌표로 변환한다.
   * 라벨 오버레이처럼 DOM 레이어 배치가 필요한 경우 사용한다.
   */
  const toScreenPoint = useCallback((point: Point2D): Point2D => {
    const displayPoint = viewTransform
      ? rotatePointAround(point, viewTransform.rotationRadians, viewTransform.centerX, viewTransform.centerY)
      : point
    return {
      x: displayPoint.x * scale + baseOffsetX + panOffsetX,
      y: displayPoint.y * scale + baseOffsetY + panOffsetY,
    }
  }, [viewTransform, scale, baseOffsetX, baseOffsetY, panOffsetX, panOffsetY])

  const syncHandlePosition = useCallback((e: KonvaEventObject<DragEvent>, x: number, y: number) => {
    e.target.position({ x, y })
    e.target.getLayer()?.batchDraw()
  }, [])

  const handleMouseEnter = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = isPanMode ? 'grab' : 'pointer'
  }, [isPanMode])

  const handleMouseLeave = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = 'default'
  }, [])

  return {
    getCanvasPoint,
    getStagePoint,
    toScreenPoint,
    syncHandlePosition,
    handleMouseEnter,
    handleMouseLeave,
  }
}
