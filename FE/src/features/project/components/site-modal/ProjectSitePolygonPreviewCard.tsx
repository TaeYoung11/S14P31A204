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
    <div className="flex flex-col items-center justify-center rounded-3xl border border-[#dbe2f0] bg-[#f8fafc] p-4">
      {polygonCoords ? (
        <>
          <p className="mb-2 text-xs font-semibold text-[#6366f1]">필지 경계</p>
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
        <p className="text-center text-sm text-[#9ca3af]">
          주소 선택 후
          <br />
          필지 경계가 표시됩니다.
        </p>
      )}
    </div>
  )
}
