import { useCallback, useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'

interface UseStagePanInteractionParams {
  stageRef: MutableRefObject<Konva.Stage | null>
  isPanMode: boolean
  isMiddlePanning: boolean
  baseOffsetX: number
  baseOffsetY: number
  setPanOffset: (nextPanOffset: { x: number; y: number }) => void
}

/**
 * Stage 패닝 드래그 이벤트와 커서 동기화를 관리한다.
 */
export function useStagePanInteraction({
  stageRef,
  isPanMode,
  isMiddlePanning,
  baseOffsetX,
  baseOffsetY,
  setPanOffset,
}: UseStagePanInteractionParams) {
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    if (isPanMode) {
      container.style.cursor = isMiddlePanning ? 'grabbing' : 'grab'
      return
    }
    container.style.cursor = 'default'
  }, [stageRef, isPanMode, isMiddlePanning])

  const onStageDragMove = useCallback((e: KonvaEventObject<DragEvent>) => {
    if (e.target.getType() !== 'Stage') return
    setPanOffset({
      x: e.target.x() - baseOffsetX,
      y: e.target.y() - baseOffsetY,
    })
  }, [baseOffsetX, baseOffsetY, setPanOffset])

  const onStageDragStart = useCallback((e: KonvaEventObject<DragEvent>) => {
    if (e.target.getType() !== 'Stage') return
    const container = e.target.getStage()?.container()
    if (container && isPanMode) container.style.cursor = 'grabbing'
  }, [isPanMode])

  const onStageDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    if (e.target.getType() !== 'Stage') return
    const container = e.target.getStage()?.container()
    if (container && isPanMode) container.style.cursor = 'grab'
  }, [isPanMode])

  return {
    onStageDragMove,
    onStageDragStart,
    onStageDragEnd,
  }
}
