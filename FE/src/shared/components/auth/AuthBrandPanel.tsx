import { Link } from 'react-router-dom'
import logoSrc from '@/assets/logo.svg'
import BlueprintPreview from '@/shared/components/auth/BlueprintPreview'

interface AuthBrandPanelProps {
  fitViewport: boolean
}

/**
 * 로그인/회원가입 화면의 좌측 브랜드 영역.
 * 인증 폼과 무관한 설명, 로고, 도면 프리뷰를 한 곳에 묶어 AuthLayout은 화면 조립만 담당하게 한다.
 */
export default function AuthBrandPanel({ fitViewport }: AuthBrandPanelProps) {
  return (
    <section
      className={`relative hidden max-h-dvh flex-col overflow-hidden bg-[#f4f5f9] lg:flex ${
        fitViewport ? 'h-dvh px-10 py-7 xl:px-12 xl:py-8' : 'px-14 py-10'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(17,24,39,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.04)_1px,transparent_1px)] bg-[length:56px_56px] [mask-image:radial-gradient(ellipse_80%_70%_at_30%_50%,black_30%,transparent_80%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_100%_0%,rgba(79,70,229,0.10),transparent_70%),radial-gradient(40%_40%_at_0%_100%,rgba(79,70,229,0.06),transparent_70%)]" />

      <div className="relative z-10 flex shrink-0 items-center justify-between">
        <Link to="/" className="inline-flex no-underline" aria-label="바탕 홈으로 이동">
          <img src={logoSrc} alt="바탕 : BATANG" className="h-[22px] w-auto" />
        </Link>
      </div>

      <div
        className={`relative z-10 flex min-h-0 flex-1 flex-col justify-center ${
          fitViewport ? 'gap-4 py-4 xl:gap-5' : 'gap-6 py-8'
        }`}
      >
        <h1
          className={`max-w-[560px] font-bold leading-[1.12] tracking-[-0.035em] text-[#111827] ${
            fitViewport ? 'text-[clamp(24px,3vw,42px)]' : 'text-[clamp(30px,3.2vw,48px)]'
          }`}
        >
          설계의 <span className="text-[#4f46e5]">언어</span>를 바꾸다.
          <span className="mt-3 block text-[0.7em] font-semibold leading-[1.3] text-[#374151]">
            건축사의 초기 설계, 이제 AI와 함께 시작합니다.
          </span>
        </h1>
        <p
          className={`max-w-[480px] text-[#374151] ${
            fitViewport ? 'text-[13px] leading-[1.55]' : 'text-sm leading-[1.75]'
          }`}
        >
          BATANG은 디자이너와 고객이 같은 프로젝트 맥락에서 도면, 모델, 댓글을 함께 확인하는 협업 플랫폼입니다.
          설계 의도와 요청 사항을 한 화면에서 추적하고 다음 작업으로 연결하세요.
        </p>
        <BlueprintPreview compact={fitViewport} />
      </div>

      <div
        className={`relative z-10 flex shrink-0 items-end justify-between gap-4 ${
          fitViewport ? 'mt-2' : 'mt-6'
        }`}
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[clamp(9px,0.75vw,11px)] tracking-[0.18em] text-[#6b7280]">
          <span>PRECISION</span>
          <span>CLARITY</span>
          <span>STRUCTURE</span>
        </div>
        <span className="select-none text-[clamp(32px,3.4vw,56px)] font-bold leading-none tracking-[-0.04em] text-[#111827]/5">
          BATANG
        </span>
      </div>
    </section>
  )
}
