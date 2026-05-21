import type { ProjectCanvasOnboardingFeature } from '@/pages/editor/utils/projectCanvasOnboarding'

interface ProjectCanvasOnboardingFeatureListProps {
  features: ProjectCanvasOnboardingFeature[]
}

/** 슬라이드별 핵심 조작을 아이콘, 이름, 설명으로 정리한다. */
export default function ProjectCanvasOnboardingFeatureList({ features }: ProjectCanvasOnboardingFeatureListProps) {
  return (
    <div className="mt-4 grid gap-2 text-left sm:mt-5">
      {features.map((item) => {
        const ItemIcon = item.icon
        return (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-xl border border-[#E7EBF4] bg-[#FAFBFE] px-3 py-2 sm:py-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#3B45B3] shadow-sm sm:h-9 sm:w-9">
              <ItemIcon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-[#1D1E20] sm:text-sm">{item.label}</p>
              <p className="text-[11px] font-semibold leading-4 text-[#7B8497] sm:text-xs">{item.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
