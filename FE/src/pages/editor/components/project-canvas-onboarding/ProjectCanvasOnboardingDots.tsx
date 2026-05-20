import type { ProjectCanvasOnboardingSlide } from '@/pages/editor/utils/projectCanvasOnboarding'

interface ProjectCanvasOnboardingDotsProps {
  activeIndex: number
  slides: ProjectCanvasOnboardingSlide[]
  onSelect: (index: number) => void
}

/** 사용자가 원하는 안내 슬라이드로 바로 이동할 수 있는 진행 표시이다. */
export default function ProjectCanvasOnboardingDots({
  activeIndex,
  slides,
  onSelect,
}: ProjectCanvasOnboardingDotsProps) {
  return (
    <div className="mt-4 flex justify-center gap-2 sm:mt-5">
      {slides.map((item, index) => (
        <button
          key={item.title}
          type="button"
          aria-label={`${index + 1}번째 안내 보기`}
          onClick={() => onSelect(index)}
          className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-[#4F5BFF]' : 'w-2.5 bg-[#D6DAE5]'}`}
        />
      ))}
    </div>
  )
}
