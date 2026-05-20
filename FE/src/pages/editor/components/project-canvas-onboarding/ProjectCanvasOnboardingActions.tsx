import { CheckCircle2 } from 'lucide-react'

interface ProjectCanvasOnboardingActionsProps {
  isLastSlide: boolean
  onClose: () => void
  onNext: () => void
}

/** 온보딩을 건너뛰거나 다음 단계로 이동하는 하단 액션 영역이다. */
export default function ProjectCanvasOnboardingActions({
  isLastSlide,
  onClose,
  onNext,
}: ProjectCanvasOnboardingActionsProps) {
  return (
    <div className="mt-5 flex gap-2 sm:mt-6">
      <button
        type="button"
        onClick={onClose}
        className="h-12 w-24 rounded-2xl border border-[#E2E6EF] text-sm font-black text-[#697386] transition hover:bg-[#F4F6FB] sm:h-[52px]"
      >
        건너뛰기
      </button>
      <button
        type="button"
        onClick={onNext}
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#4F5BFF] text-sm font-black text-white shadow-[0_14px_28px_rgba(79,91,255,0.28)] transition hover:bg-[#3F49E8] sm:h-[52px]"
      >
        {isLastSlide && <CheckCircle2 size={18} />}
        {isLastSlide ? '시작하기' : '다음'}
      </button>
    </div>
  )
}
