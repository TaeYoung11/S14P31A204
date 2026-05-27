import { useCallback } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { FloorOpening, FloorWall, Point2D } from '../../types'

interface UseOpeningInteractionHandlersParams {
  isPanMode: boolean
  isWallTool: boolean
  isOpeningTool: boolean
  selectedTool: string
  getCanvasPoint: (stage: Konva.Stage) => Point2D | null
  createOpeningOnWall: (wall: FloorWall, point: Point2D) => void
  onOpeningDelete?: (openingId: string) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onSelect?: (id: string | null, isShift?: boolean) => void
  onOpeningDragStart: (state: { openingId: string }) => void
  onClearOpeningSnapGuide: () => void
}

/**
 * 개구부 그룹의 클릭/드래그 시작 상호작용 핸들러를 생성한다.
 * - 도구 모드별 분기(선택/삭제/개구부 생성)를 한곳에서 관리한다.
 */
export function useOpeningInteractionHandlers({
  isPanMode,
  isWallTool,
  isOpeningTool,
  selectedTool,
  getCanvasPoint,
  createOpeningOnWall,
  onOpeningDelete,
  onOpeningSelect,
  onWallSelect,
  onSelect,
  onOpeningDragStart,
  onClearOpeningSnapGuide,
}: UseOpeningInteractionHandlersParams) {
  const createOpeningGroupHandlers = useCallback((opening: FloorOpening, wall: FloorWall) => {
    const onClick = (e: KonvaEventObject<MouseEvent>) => {
      if (isPanMode) return
      e.cancelBubble = true
      if (isWallTool) return

      if (isOpeningTool) {
        const stage = e.target.getStage()
        const point = stage ? getCanvasPoint(stage) : null
        if (!point) return
        createOpeningOnWall(wall, point)
        return
      }

      if (selectedTool === 'delete') {
        onOpeningDelete?.(opening.id)
        return
      }
      if (selectedTool === 'selection') return

      onOpeningSelect?.(opening.id, e.evt.shiftKey)
      onWallSelect?.(null)
      onSelect?.(null)
    }

    const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
      if (selectedTool !== 'selection' || isPanMode || e.evt.button !== 0) return
      if (e.evt.shiftKey) {
        e.cancelBubble = true
        onOpeningSelect?.(opening.id, true)
        return
      }
      e.cancelBubble = true
      onOpeningSelect?.(opening.id, false)
      onOpeningDragStart({ openingId: opening.id })
      onClearOpeningSnapGuide()
    }

    return { onClick, onMouseDown }
  }, [
    isPanMode,
    isWallTool,
    isOpeningTool,
    selectedTool,
    getCanvasPoint,
    createOpeningOnWall,
    onOpeningDelete,
    onOpeningSelect,
    onWallSelect,
    onSelect,
    onOpeningDragStart,
    onClearOpeningSnapGuide,
  ])

  return { createOpeningGroupHandlers }
}
