import { Circle } from 'react-konva'
import type { Point2D } from '../../types'
import { snapCoordinate } from './twoDCanvas.utils'

interface TwoDWallEndpointHandleProps {
  wallId: string
  endpoint: 'start' | 'end'
  point: Point2D
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  onWallEndpointChange?: (wallId: string, endpoint: 'start' | 'end', point: Point2D) => void
  onWorkspaceEditStart?: () => void
  onWorkspaceEditCommit?: () => void
}

/**
 * 선택된 벽의 끝점 이동 핸들이다.
 * - 드래그 중 좌표를 그리드 규칙에 맞춰 스냅한 뒤 상위 상태를 갱신한다.
 */
export function TwoDWallEndpointHandle({
  wallId,
  endpoint,
  point,
  isGridSnapEnabled,
  gridSnapStepPx,
  onWallEndpointChange,
  onWorkspaceEditStart,
  onWorkspaceEditCommit,
}: TwoDWallEndpointHandleProps) {
  return (
    <Circle
      x={point.x}
      y={point.y}
      radius={6}
      fill="#FFFFFF"
      stroke="#3B45B3"
      strokeWidth={2}
      draggable
      onDragStart={(e) => {
        e.cancelBubble = true
        onWorkspaceEditStart?.()
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        const x = snapCoordinate(e.target.x(), isGridSnapEnabled, gridSnapStepPx)
        const y = snapCoordinate(e.target.y(), isGridSnapEnabled, gridSnapStepPx)
        onWallEndpointChange?.(wallId, endpoint, { x, y })
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onWorkspaceEditCommit?.()
      }}
      onMouseDown={(e) => {
        e.cancelBubble = true
      }}
    />
  )
}
