import { useCallback } from 'react'
import type { FloorRoom, Point2D } from '../../types'
import type { AxisAlignedRect } from '../../utils/geometry2d'
import { isRectInsidePolygon } from '../../utils/siteBoundaryValidation'
import { rectsOverlap } from './twoDCanvas.utils'

interface UseRoomResizeActionsParams {
  rooms: FloorRoom[]
  hasSite: boolean
  sitePolygon: Point2D[]
  onRoomResize?: (bubbleId: string, x: number, y: number, width: number, height: number) => void
}

/**
 * Room 리사이즈 충돌 검증과 적용 로직을 캡슐화한다.
 * - Room 간 중첩을 차단하고, 대지 경계가 있을 때 내부 유지 여부를 함께 검사한다.
 */
export function useRoomResizeActions({
  rooms,
  hasSite,
  sitePolygon,
  onRoomResize,
}: UseRoomResizeActionsParams) {
  const canResizeRoom = useCallback((roomBubbleId: string, nextRect: AxisAlignedRect): boolean => {
    if (hasSite && !isRectInsidePolygon(nextRect, sitePolygon)) return false

    const overlapPadding = 2
    for (const room of rooms) {
      if (room.bubbleId === roomBubbleId) continue
      const otherRect: AxisAlignedRect = {
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
      }
      if (rectsOverlap(nextRect, otherRect, overlapPadding)) return false
    }
    // 벽 충돌로 리사이즈가 막혀 조작감이 급격히 나빠지는 문제를 방지한다.
    // 벽 정합성은 상위(onRoomResize) 동기화 경로에서 보정한다.
    return true
  }, [hasSite, rooms, sitePolygon])

  const applyRoomResize = useCallback((
    roomBubbleId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean => {
    const currentRoom = rooms.find((room) => room.bubbleId === roomBubbleId)
    if (!currentRoom) return false
    const nextRect: AxisAlignedRect = {
      x,
      y,
      width: Math.max(width, 40),
      height: Math.max(height, 40),
    }
    if (!canResizeRoom(roomBubbleId, nextRect)) return false
    onRoomResize?.(roomBubbleId, nextRect.x, nextRect.y, nextRect.width, nextRect.height)
    return true
  }, [canResizeRoom, onRoomResize, rooms])

  return {
    canResizeRoom,
    applyRoomResize,
  }
}
