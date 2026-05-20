import { Link } from 'react-router-dom'
import BrandLogo from '@/shared/components/BrandLogo'
import BlueprintPreview from '@/shared/components/auth/BlueprintPreview'

interface AuthBrandPanelProps {
  fitViewport: boolean
}

/** 로그인/회원가입 화면에서 서비스 맥락과 설계 협업 프리뷰를 보여주는 브랜드 패널. */
export default function AuthBrandPanel({ fitViewport }: AuthBrandPanelProps) {
  return (
    <section
      className={`auth-brand-panel relative hidden max-h-dvh flex-col overflow-hidden bg-[#eef6ff] lg:flex ${
        fitViewport ? 'h-dvh px-10 py-7 xl:px-12 xl:py-8' : 'px-14 py-10'
      }`}
    >
      <div className="auth-stage-bg pointer-events-none absolute inset-0" />
      <div className="auth-light-grid pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex shrink-0 items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2.5 no-underline" aria-label="바탕 홈으로 이동">
          <BrandLogo textClassName="text-[13px] drop-shadow-sm" />
        </Link>
      </div>

      <div
        className={`relative z-10 flex min-h-0 flex-1 flex-col justify-center ${
          fitViewport ? 'gap-7 py-5 xl:gap-8' : 'gap-8 py-8'
        }`}
      >
        <h1
          className={`auth-hero-copy max-w-[560px] font-bold leading-[1.08] text-[#0f172a] ${
            fitViewport ? 'text-[clamp(34px,4.2vw,62px)]' : 'text-[clamp(40px,4vw,64px)]'
          }`}
        >
          AI로 완성하는 <span className="text-[#4f46e5]">설계 협업</span>
        </h1>
        <BlueprintPreview compact={fitViewport} />
      </div>

      <div
        className={`relative z-10 flex shrink-0 items-end justify-between gap-4 ${
          fitViewport ? 'mt-2' : 'mt-6'
        }`}
      >
        <div />
        <span className="select-none text-[clamp(32px,3.4vw,56px)] font-bold leading-none text-[#111827]/5">
          BATANG
        </span>
      </div>
    </section>
  )
}
