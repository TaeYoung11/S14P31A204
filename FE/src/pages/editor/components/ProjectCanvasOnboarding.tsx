import ProjectCanvasOnboardingDialog from '@/pages/editor/components/project-canvas-onboarding/ProjectCanvasOnboardingDialog'
import { useProjectCanvasOnboarding } from '@/pages/editor/hooks/useProjectCanvasOnboarding'
import { projectCanvasOnboardingSlides } from '@/pages/editor/utils/projectCanvasOnboarding'

interface ProjectCanvasOnboardingProps {
  userId?: string | null
}

/** 프로젝트 에디터 첫 진입 시 캔버스 작업 흐름을 안내하는 온보딩 진입점이다. */
export default function ProjectCanvasOnboarding({ userId }: ProjectCanvasOnboardingProps) {
  const onboarding = useProjectCanvasOnboarding({
    userId,
    slideCount: projectCanvasOnboardingSlides.length,
  })
  const slide = projectCanvasOnboardingSlides[onboarding.slideIndex]

  if (!onboarding.isOpen || !slide) return null

  return (
    <ProjectCanvasOnboardingDialog
      activeIndex={onboarding.slideIndex}
      isLastSlide={onboarding.isLastSlide}
      slide={slide}
      slides={projectCanvasOnboardingSlides}
      onClose={onboarding.close}
      onNext={onboarding.goNext}
      onSelectSlide={onboarding.goToSlide}
    />
  )
}
