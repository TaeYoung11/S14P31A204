import { Fragment } from 'react'
import { Line } from 'react-konva'
import type { FloorWall } from '../../types'

interface WallTypeVisual {
  marker: 'solid' | 'dashed' | 'double' | 'none'
  accent: string
  dash?: number[]
}

interface TwoDWallVisualOverlaysProps {
  wall: FloorWall
  wallTypeVisual: WallTypeVisual
  isOutsideSiteWall: boolean
  isSelectedWall: boolean
  wallMaterialColor: string
  materialStrokeWidthPx: number
  strokeWidthPx: number
  normalX: number
  normalY: number
}

/**
 * 벽의 비상호작용 시각 오버레이를 렌더링한다.
 * - 재질선
 * - 벽 종류별 강조선(점선/이중선)
 */
export function TwoDWallVisualOverlays({
  wall,
  wallTypeVisual,
  isOutsideSiteWall,
  isSelectedWall,
  wallMaterialColor,
  materialStrokeWidthPx,
  strokeWidthPx,
  normalX,
  normalY,
}: TwoDWallVisualOverlaysProps) {
  const doubleOffset = Math.max(Math.min(strokeWidthPx * 0.32, 8), 3)

  return (
    <Fragment>
      {!isOutsideSiteWall && (
        <Line
          points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
          stroke={wallMaterialColor}
          strokeWidth={materialStrokeWidthPx}
          lineCap="round"
          lineJoin="round"
          opacity={isSelectedWall ? 0.98 : 0.9}
          listening={false}
        />
      )}
      {wallTypeVisual.marker === 'dashed' && !isOutsideSiteWall && (
        <Line
          points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
          stroke={wallTypeVisual.accent}
          strokeWidth={1.6}
          lineCap="round"
          lineJoin="round"
          dash={wallTypeVisual.dash}
          opacity={isSelectedWall ? 1 : 0.88}
          listening={false}
        />
      )}
      {wallTypeVisual.marker === 'double' && !isOutsideSiteWall && (
        <>
          <Line
            points={[
              wall.start.x + normalX * doubleOffset,
              wall.start.y + normalY * doubleOffset,
              wall.end.x + normalX * doubleOffset,
              wall.end.y + normalY * doubleOffset,
            ]}
            stroke={wallTypeVisual.accent}
            strokeWidth={1.4}
            lineCap="round"
            lineJoin="round"
            opacity={isSelectedWall ? 1 : 0.9}
            listening={false}
          />
          <Line
            points={[
              wall.start.x - normalX * doubleOffset,
              wall.start.y - normalY * doubleOffset,
              wall.end.x - normalX * doubleOffset,
              wall.end.y - normalY * doubleOffset,
            ]}
            stroke={wallTypeVisual.accent}
            strokeWidth={1.4}
            lineCap="round"
            lineJoin="round"
            opacity={isSelectedWall ? 1 : 0.9}
            listening={false}
          />
        </>
      )}
    </Fragment>
  )
}
