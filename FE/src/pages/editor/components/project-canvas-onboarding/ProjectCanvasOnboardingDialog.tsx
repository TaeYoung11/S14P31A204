import { X } from 'lucide-react'
import ProjectCanvasOnboardingActions from '@/pages/editor/components/project-canvas-onboarding/ProjectCanvasOnboardingActions'
import ProjectCanvasOnboardingDots from '@/pages/editor/components/project-canvas-onboarding/ProjectCanvasOnboardingDots'
import ProjectCanvasOnboardingFeatureList from '@/pages/editor/components/project-canvas-onboarding/ProjectCanvasOnboardingFeatureList'
import ProjectCanvasOnboardingIllustration from '@/pages/editor/components/project-canvas-onboarding/ProjectCanvasOnboardingIllustration'
import type { ProjectCanvasOnboardingSlide } from '@/pages/editor/utils/projectCanvasOnboarding'

interface ProjectCanvasOnboardingDialogProps {
  activeIndex: number
  isLastSlide: boolean
  slide: ProjectCanvasOnboardingSlide
  slides: ProjectCanvasOnboardingSlide[]
  onClose: () => void
  onNext: () => void
  onSelectSlide: (index: number) => void
}

/** 프로젝트 에디터 첫 진입 안내 모달을 조립하는 프레젠테이션 컴포넌트이다. */
export default function ProjectCanvasOnboardingDialog({
  activeIndex,
  isLastSlide,
  slide,
  slides,
  onClose,
  onNext,
  onSelectSlide,
}: ProjectCanvasOnboardingDialogProps) {
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-[#15213D]/70 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-[360px] flex-col overflow-y-auto rounded-[22px] bg-white shadow-[0_24px_70px_rgba(12,20,44,0.32)] sm:max-h-[calc(100vh-48px)] sm:max-w-[420px] sm:rounded-[28px]">
        <button
          type="button"
          aria-label="온보딩 닫기"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-2 text-[#7A8294] transition hover:bg-[#EEF1F8] hover:text-[#1D1E20] sm:right-4 sm:top-4"
        >
          <X size={18} />
        </button>

        <ProjectCanvasOnboardingIllustration slide={slide} />

        <div className="flex flex-1 flex-col px-5 pb-5 pt-4 text-center sm:px-7 sm:pb-6 sm:pt-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7B86A8] sm:text-xs">
            {slide.eyebrow}
          </p>
          <h2 className="mt-2 text-[22px] font-black leading-tight text-[#1C1C1E] sm:mt-3 sm:text-[26px]">
            {slide.title}
          </h2>
          <p className="mx-auto mt-2 max-w-[310px] text-[13px] font-semibold leading-5 text-[#697386] sm:mt-3 sm:text-sm sm:leading-6">
            {slide.description}
          </p>

          <ProjectCanvasOnboardingFeatureList features={slide.features} />
          <ProjectCanvasOnboardingDots activeIndex={activeIndex} slides={slides} onSelect={onSelectSlide} />
          <ProjectCanvasOnboardingActions isLastSlide={isLastSlide} onClose={onClose} onNext={onNext} />
        </div>
      </section>
    </div>
  )
}
