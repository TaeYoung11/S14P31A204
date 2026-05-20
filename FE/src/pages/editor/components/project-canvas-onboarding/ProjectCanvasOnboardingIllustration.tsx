import { Camera, Moon, Sun } from 'lucide-react'
import type { ProjectCanvasOnboardingSlide } from '@/pages/editor/utils/projectCanvasOnboarding'

interface ProjectCanvasOnboardingIllustrationProps {
  slide: ProjectCanvasOnboardingSlide
}

/** 현재 슬라이드의 핵심 기능을 작은 편집 화면 미리보기로 보여준다. */
export default function ProjectCanvasOnboardingIllustration({ slide }: ProjectCanvasOnboardingIllustrationProps) {
  const Icon = slide.icon
  const shouldShowRenderBadge = slide.icon === Camera

  return (
    <div className="mx-4 mt-4 rounded-[18px] bg-[#F1F6FB] px-4 py-4 sm:mx-5 sm:mt-5 sm:rounded-[22px] sm:px-5 sm:pb-5 sm:pt-6">
      <div className="relative mx-auto h-[150px] max-w-[290px] overflow-hidden rounded-[16px] bg-[#F8FBFF] sm:h-[190px] sm:max-w-[330px] sm:rounded-[20px]">
        <div className="absolute left-5 top-5 flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FF6B6B] sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-[#FFC857] sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-[#12B981] sm:h-2.5 sm:w-2.5" />
        </div>

        <div className="absolute left-6 top-12 h-24 w-9 rounded-xl bg-white shadow-sm sm:left-7 sm:top-14 sm:h-28 sm:w-10">
          <div className="mx-auto mt-4 h-4 w-4 rounded bg-[#3B45B3]" />
          <div className="mx-auto mt-3 h-4 w-4 rounded bg-[#D7DDF5]" />
          <div className="mx-auto mt-3 h-4 w-4 rounded bg-[#D7DDF5]" />
        </div>

        <div className="absolute left-[76px] top-[44px] h-[92px] w-[154px] rounded-[16px] border border-[#DDE5F4] bg-white shadow-[0_18px_36px_rgba(59,69,179,0.12)] sm:left-[86px] sm:top-[52px] sm:h-[112px] sm:w-[182px] sm:rounded-[18px]">
          <div className="absolute left-4 top-5 h-11 w-16 rounded-full bg-[#C7D2FE] opacity-90 sm:h-14 sm:w-20" />
          <div className="absolute right-5 top-6 h-12 w-20 rounded-full bg-[#BFE7FF] sm:h-16 sm:w-24" />
          <div className="absolute bottom-5 left-[48px] h-10 w-20 rounded-full bg-[#D6F5E8] sm:left-[58px] sm:h-12 sm:w-24" />
          <div className="absolute left-[68px] top-[48px] h-[2px] w-16 rotate-[25deg] bg-[#8E95A3] sm:left-[82px] sm:top-[58px] sm:w-20" />
          <div className="absolute left-[56px] top-[66px] h-[2px] w-14 -rotate-[16deg] bg-[#8E95A3] sm:left-[67px] sm:top-[82px] sm:w-16" />
        </div>

        <div
          className="absolute bottom-6 right-6 flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white shadow-[0_16px_30px_rgba(59,69,179,0.22)] sm:bottom-7 sm:right-7 sm:h-16 sm:w-16"
          style={{ backgroundColor: slide.accent }}
        >
          <Icon size={26} />
        </div>

        {shouldShowRenderBadge && (
          <div className="absolute right-20 top-5 flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 text-[#697386] shadow-sm">
            <Moon size={12} />
            <Sun size={12} />
          </div>
        )}

        <div className="absolute bottom-4 left-8 h-px w-[210px] bg-[#C8CFDD] sm:bottom-5 sm:w-[250px]" />
      </div>
    </div>
  )
}
