import { Group, Line } from 'react-konva'

import type { GridLines } from './useCanvasGridLines'

interface TwoDGridLayerProps {
  isGridVisible: boolean
  gridLines: GridLines
}

/**
 * 2D 편집 보조 그리드를 렌더링한다.
 * - 보조선(minor)과 기준선(major)을 구분해 표시한다.
 */
export function TwoDGridLayer({ isGridVisible, gridLines }: TwoDGridLayerProps) {
  if (!isGridVisible) return null

  return (
    <Group listening={false}>
      {gridLines.minor.map((points, index) => (
        <Line
          key={`minor-${index}`}
          points={points}
          stroke="#E3E6EB"
          strokeWidth={0.6}
          opacity={0.55}
          listening={false}
        />
      ))}
      {gridLines.major.map((points, index) => (
        <Line
          key={`major-${index}`}
          points={points}
          stroke="#C6CDD8"
          strokeWidth={1}
          opacity={0.85}
          listening={false}
        />
      ))}
    </Group>
  )
}
