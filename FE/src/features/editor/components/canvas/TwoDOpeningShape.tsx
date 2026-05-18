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
      <>
        <Line
          points={[-openingWidthPx / 2, 0, openingWidthPx / 2, 0]}
          stroke="#FDFBF7"
          strokeWidth={Math.max(wallStrokePx + 1, 5)}
          lineCap="square"
        />
        <Line
          points={[-openingWidthPx / 2, -3, openingWidthPx / 2, -3]}
          stroke={isSelectedOpening ? '#2563EB' : '#2F343B'}
          strokeWidth={1.4}
          lineCap="square"
        />
        <Line
          points={[-openingWidthPx / 2, 3, openingWidthPx / 2, 3]}
          stroke={isSelectedOpening ? '#2563EB' : '#2F343B'}
          strokeWidth={1.4}
          lineCap="square"
        />
      </>
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
        stroke="#FDFBF7"
        strokeWidth={Math.max(wallStrokePx + 1, 5)}
        lineCap="square"
      />
      <Circle x={hingeX} y={0} radius={2} fill={isSelectedOpening ? '#2563EB' : '#2F343B'} />
      {doorSwingDirection === 'sliding' ? (
        <Line
          points={[-openingWidthPx / 2, -6, openingWidthPx / 2, -6]}
          stroke={isSelectedOpening ? '#2563EB' : '#2F343B'}
          strokeWidth={1.5}
          dash={[8, 4]}
        />
      ) : (
        <>
          <Line
            points={[hingeX, 0, doorLeafEndX, doorLeafEndY]}
            stroke={isSelectedOpening ? '#2563EB' : '#2F343B'}
            strokeWidth={1.4}
          />
          <Arc
            x={hingeX}
            y={0}
            innerRadius={0}
            outerRadius={openingWidthPx}
            angle={90}
            rotation={arcRotation}
            stroke={isSelectedOpening ? '#2563EB' : '#2F343B'}
            strokeWidth={isSelectedOpening ? 1.8 : 1.2}
          />
        </>
      )}
    </>
  )
}
