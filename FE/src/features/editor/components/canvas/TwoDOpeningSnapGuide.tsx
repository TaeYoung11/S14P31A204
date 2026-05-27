import { Circle, Group, Line } from 'react-konva'
import type { FloorWall } from '../../types'
import { getWallPointAtPosition } from './twoDCanvas.utils'

interface TwoDOpeningSnapGuideProps {
  guideWall: FloorWall
  wallPosition: number
}

/**
 * 개구부 위치 스냅 가이드를 렌더링한다.
 * - 벽 법선 방향 보조선 + 앵커 포인트를 표시한다.
 */
export function TwoDOpeningSnapGuide({ guideWall, wallPosition }: TwoDOpeningSnapGuideProps) {
  const anchor = getWallPointAtPosition(guideWall, wallPosition)
  const dx = guideWall.end.x - guideWall.start.x
  const dy = guideWall.end.y - guideWall.start.y
  const len = Math.hypot(dx, dy)
  if (len <= 0) return null
  const nx = -dy / len
  const ny = dx / len
  const guideLen = 22

  return (
    <Group>
      <Line
        points={[
          anchor.x - nx * guideLen,
          anchor.y - ny * guideLen,
          anchor.x + nx * guideLen,
          anchor.y + ny * guideLen,
        ]}
        stroke="#4C57D3"
        strokeWidth={1.5}
        dash={[4, 4]}
      />
      <Circle x={anchor.x} y={anchor.y} radius={3} fill="#4C57D3" />
    </Group>
  )
}
