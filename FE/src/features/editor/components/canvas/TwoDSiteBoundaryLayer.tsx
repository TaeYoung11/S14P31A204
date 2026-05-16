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
export function TwoDSiteBoundaryLayer({
  hasSite,
  sitePoints,
  listening,
}: TwoDSiteBoundaryLayerProps) {
  if (!hasSite) return null
  return (
    <>
      <Line
        points={sitePoints}
        closed
        fill="#3B45B314"
        stroke="#3B45B3"
        strokeWidth={1.8}
        listening={listening}
      />
      <Line
        points={sitePoints}
        closed
        stroke="#2D359980"
        strokeWidth={1}
        dash={[8, 6]}
        listening={listening}
      />
    </>
  )
}
