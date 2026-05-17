import { Line } from 'react-konva'

interface TwoDSiteBoundaryLayerProps {
  hasSite: boolean
  sitePoints: number[]
  listening: boolean
}

/**
 * 대지 경계(채움 + 외곽 점선)를 렌더링한다.
 * - 평면도 요소의 경계 기준이 되는 시각적 가이드를 제공한다.
 */
export function TwoDSiteBoundaryLayer({ hasSite, sitePoints, listening }: TwoDSiteBoundaryLayerProps) {
  if (!hasSite) return null
  return (
    <>
      <Line
        points={sitePoints}
        closed
        fill="#8B7D5E10"
        stroke="#8B7D5E"
        strokeWidth={1.2}
        listening={listening}
      />
      <Line
        points={sitePoints}
        closed
        stroke="#6F655580"
        strokeWidth={0.8}
        dash={[10, 8]}
        listening={listening}
      />
    </>
  )
}
