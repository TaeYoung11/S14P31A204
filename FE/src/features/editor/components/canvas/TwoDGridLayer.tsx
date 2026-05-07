import { Line } from 'react-konva'
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
    <>
      {gridLines.minor.map((points, index) => (
        <Line key={`grid-minor-${index}`} points={points} stroke="#EAECF4" strokeWidth={0.5} />
      ))}
      {gridLines.major.map((points, index) => (
        <Line key={`grid-major-${index}`} points={points} stroke="#D4D8EC" strokeWidth={1} />
      ))}
    </>
  )
}
