import type { Point2D } from '../../types'

interface UsePinDraftParams {
  isCollaborationMode?: boolean
  onPinCreate?: (x: number, y: number, content?: string) => void
}

/**
 * 협업 모드에서 캔버스 클릭 지점에 핀 생성을 요청한다.
 */
export function usePinDraft({ isCollaborationMode, onPinCreate }: UsePinDraftParams) {
  const startPinDraftAt = (point: Point2D) => {
    if (!isCollaborationMode) return
    onPinCreate?.(point.x, point.y)
  }

  return {
    startPinDraftAt,
  }
}
