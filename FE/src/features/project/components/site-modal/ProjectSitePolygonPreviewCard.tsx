import { mapSiteRingToCanvasPoints } from '@/features/project/utils/siteGeometry'

interface ProjectSitePolygonPreviewCardProps {
  polygonCoords: number[][] | null
}

function toPreviewPath(coords: number[][]): string {
  const canvasPoints = mapSiteRingToCanvasPoints(coords, {
    targetWidth: 260,
    targetHeight: 240,
    padding: 16,
  })
  if (!canvasPoints) return ''

  return canvasPoints
    .map((point) => `${point.x.toFixed(1)},${(240 - point.y).toFixed(1)}`)
    .join(' ')
}

/**
 * 대지 폴리곤 미리보기 카드.
 * 좌표가 있으면 SVG 폴리곤을 그리고, 없으면 안내 문구를 노출한다.
 */
export function ProjectSitePolygonPreviewCard({
  polygonCoords,
}: ProjectSitePolygonPreviewCardProps) {
  return (
    <div className="project-site-preview-card">
      {polygonCoords ? (
        <>
          <p className="mb-2 text-xs font-black text-[#4f46e5]">필지 경계</p>
          <svg viewBox="0 0 260 240" className="w-full">
            <polygon
              points={toPreviewPath(polygonCoords)}
              fill="#4f46e5"
              fillOpacity={0.15}
              stroke="#4f46e5"
              strokeWidth={1.5}
            />
          </svg>
        </>
      ) : (
        <div className="text-center">
          <p className="text-sm font-black text-[#64748b]">필지 경계 대기 중</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#9ca3af]">
            주소를 선택하면 경계가 표시됩니다.
          </p>
        </div>
      )}
    </div>
  )
}
