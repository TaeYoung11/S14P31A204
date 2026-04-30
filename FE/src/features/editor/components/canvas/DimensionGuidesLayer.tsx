import { Group, Line, Text } from 'react-konva'
import type { DimensionGuideRenderData } from '../../utils/dimensionGuides'

interface DimensionGuidesLayerProps {
  guides: DimensionGuideRenderData
}

/**
 * 치수선 렌더 전용 레이어.
 * 계산 로직과 표현을 분리해 TwoDCanvas 본문의 복잡도를 낮춘다.
 */
export function DimensionGuidesLayer({ guides }: DimensionGuidesLayerProps) {
  if (guides.lines.length === 0) return null

  return (
    <Group listening={false}>
      {guides.lines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke="#A1A9B8"
          strokeWidth={1}
          dash={line.dashed ? [4, 3] : undefined}
        />
      ))}
      {guides.labels.map((label) => (
        <Text
          key={label.key}
          x={label.x - 18}
          y={label.y - 6}
          width={36}
          align="center"
          text={label.text}
          fontSize={9}
          fontStyle="bold"
          fill="#7F8898"
          rotation={label.rotation ?? 0}
        />
      ))}
    </Group>
  )
}
