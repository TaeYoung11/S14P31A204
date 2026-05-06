import { Arc, Circle, Line } from 'react-konva'
import type { FloorOpening } from '../../types'

interface TwoDOpeningShapeProps {
  opening: FloorOpening
  openingWidthPx: number
  wallStrokePx: number
  isSelectedOpening: boolean
}

/**
 * 개구부의 시각적 본체를 렌더링한다.
 * - 문(여닫이/슬라이딩)과 창문의 표현 규칙을 한곳에 모아 관리한다.
 */
export function TwoDOpeningShape({
  opening,
  openingWidthPx,
  wallStrokePx,
  isSelectedOpening,
}: TwoDOpeningShapeProps) {
  if (opening.type === 'window') {
    return (
      <Line
        points={[-openingWidthPx / 2, 0, openingWidthPx / 2, 0]}
        stroke={isSelectedOpening ? '#0B7DAA' : '#0EA5E9'}
        strokeWidth={Math.max(wallStrokePx - 1, 4)}
        lineCap="round"
        dash={[10, 4]}
      />
    )
  }

  const doorHingeSide = opening.doorHingeSide ?? 'left'
  const doorSwingDirection = opening.doorSwingDirection ?? 'inward'
  const hingeX = doorHingeSide === 'left' ? -openingWidthPx / 2 : openingWidthPx / 2
  const doorLeafEndX = doorHingeSide === 'left' ? openingWidthPx / 2 : -openingWidthPx / 2
  const doorLeafEndY = doorSwingDirection === 'outward' ? -openingWidthPx : openingWidthPx
  const arcRotation = doorHingeSide === 'left'
    ? (doorSwingDirection === 'outward' ? -90 : 0)
    : (doorSwingDirection === 'outward' ? 180 : 90)

  return (
    <>
      <Line
        points={[-openingWidthPx / 2, 0, openingWidthPx / 2, 0]}
        stroke="white"
        strokeWidth={Math.max(wallStrokePx + 1, 5)}
        lineCap="round"
      />
      <Circle x={hingeX} y={0} radius={2} fill="#3B45B3" />
      {doorSwingDirection === 'sliding' ? (
        <Line
          points={[-openingWidthPx / 2, -6, openingWidthPx / 2, -6]}
          stroke={isSelectedOpening ? '#4C57D3' : '#3B45B3'}
          strokeWidth={1.5}
          dash={[8, 4]}
        />
      ) : (
        <>
          <Line
            points={[hingeX, 0, doorLeafEndX, doorLeafEndY]}
            stroke={isSelectedOpening ? '#4C57D3' : '#3B45B3'}
            strokeWidth={1.4}
          />
          <Arc
            x={hingeX}
            y={0}
            innerRadius={0}
            outerRadius={openingWidthPx}
            angle={90}
            rotation={arcRotation}
            stroke={isSelectedOpening ? '#4C57D3' : '#3B45B3'}
            strokeWidth={isSelectedOpening ? 2 : 1.5}
            fill="rgba(59,69,179,0.07)"
          />
        </>
      )}
    </>
  )
}
