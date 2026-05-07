import { useCallback } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Point2D } from '../../types'

interface UseCanvasCoordinateHelpersParams {
  scale: number
  baseOffsetX: number
  baseOffsetY: number
  panOffsetX: number
  panOffsetY: number
  isPanMode: boolean
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
}: UseCanvasCoordinateHelpersParams) {
  const getCanvasPoint = useCallback((stage: Konva.Stage): Point2D | null => {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const transform = stage.getAbsoluteTransform().copy()
    transform.invert()
    return transform.point(pointer)
  }, [])

  const toScreenPoint = useCallback((point: Point2D): Point2D => ({
    x: point.x * scale + baseOffsetX + panOffsetX,
    y: point.y * scale + baseOffsetY + panOffsetY,
  }), [scale, baseOffsetX, baseOffsetY, panOffsetX, panOffsetY])

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
    toScreenPoint,
    syncHandlePosition,
    handleMouseEnter,
    handleMouseLeave,
  }
}
