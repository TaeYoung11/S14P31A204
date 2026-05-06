import type { FloorPlanSiteBoundaryValidation } from '../../utils/siteBoundaryValidation'

interface TwoDSiteValidationBannerProps {
  siteValidation: FloorPlanSiteBoundaryValidation
}

/**
 * 대지 경계 위반 집계를 화면 상단에 표시한다.
 * - Room/Wall/Opening 각각의 위반 수를 즉시 확인할 수 있도록 제공한다.
 */
export function TwoDSiteValidationBanner({ siteValidation }: TwoDSiteValidationBannerProps) {
  if (siteValidation.outsideCount <= 0) return null

  return (
    <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[11px] font-bold text-[#991B1B]">
      대지 경계 검증
      {`: 공간 ${siteValidation.outsideRoomIds.size} · 벽 ${siteValidation.outsideWallIds.size} · 개구부 ${siteValidation.outsideOpeningIds.size}`}
    </div>
  )
}
