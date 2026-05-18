import type { ReactNode } from 'react'
import { Group } from 'react-konva'
import type { CanvasViewTransform } from '../../types'
import { radiansToDegrees } from '../../utils/canvasViewTransform'

interface CanvasViewTransformGroupProps {
  viewTransform?: CanvasViewTransform | null
  children: ReactNode
}

/**
 * 캔버스 렌더 계층 전용 뷰 회전 컨테이너.
 * - canonical 편집 데이터는 건드리지 않고,
 * - 그리는 레이어에만 회전을 적용한다.
 */
export default function CanvasViewTransformGroup({
  viewTransform = null,
  children,
}: CanvasViewTransformGroupProps) {
  return (
    <Group
      x={viewTransform?.centerX ?? 0}
      y={viewTransform?.centerY ?? 0}
      offsetX={viewTransform?.centerX ?? 0}
      offsetY={viewTransform?.centerY ?? 0}
      rotation={viewTransform ? radiansToDegrees(viewTransform.rotationRadians) : 0}
    >
      {children}
    </Group>
  )
}
