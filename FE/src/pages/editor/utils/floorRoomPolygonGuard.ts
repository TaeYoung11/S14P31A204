import type { EditorCanvasContentProps } from '../types/editorCanvasContentProps'

/**
 * 2D 방 폴리곤 변경 요청 입력을 검증한다.
 * - bubbleId가 비어 있거나
 * - 꼭짓점이 3개 미만이거나
 * - 좌표가 유한수가 아니면
 * 업데이트를 무시한다.
 */
export const createSafeFloorRoomPolygonHandler = (
  handleUpdateFloorRoomPolygon: EditorCanvasContentProps['handleUpdateFloorRoomPolygon'],
): EditorCanvasContentProps['handleUpdateFloorRoomPolygon'] => {
  return (bubbleId, polygon) => {
    if (typeof bubbleId !== 'string' || bubbleId.trim().length === 0) return
    if (!Array.isArray(polygon) || polygon.length < 3) return

    const hasInvalidPoint = polygon.some((point) => {
      if (!point || typeof point !== 'object') return true
      return !Number.isFinite(point.x) || !Number.isFinite(point.y)
    })
    if (hasInvalidPoint) return

    handleUpdateFloorRoomPolygon(bubbleId, polygon)
  }
}

