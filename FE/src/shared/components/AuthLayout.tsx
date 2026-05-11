// 인증 화면의 좌측 브랜드 패널과 우측 폼 레이아웃을 구성합니다.
import { Link } from 'react-router-dom'
import logoSrc from '@/assets/logo.svg'

interface AuthLayoutProps {
  children: React.ReactNode
  fitViewport?: boolean
}

function BlueprintPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`max-w-[540px] rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_14px_40px_rgba(17,24,39,0.06)] ${
        compact ? 'p-3 xl:p-4' : 'mt-2 p-[18px]'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b border-dashed border-[#e5e7eb] font-mono uppercase tracking-[0.16em] text-[#6b7280] ${
          compact ? 'mb-2 pb-2 text-[9px]' : 'mb-3 pb-3 text-[10px]'
        }`}
      >
        <span>BATANG · 003 / PLAN</span>
        <span className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full border border-[#4f46e5] bg-[#4f46e5]" />
          <span className="h-2 w-2 rounded-full border border-[#e5e7eb] bg-[#eaecf2]" />
          <span className="h-2 w-2 rounded-full border border-[#e5e7eb] bg-[#eaecf2]" />
        </span>
      </div>
      <svg
        className={`block w-full rounded-lg bg-[#fafbff] ${compact ? 'h-[clamp(82px,17vh,150px)]' : 'h-[clamp(128px,22vh,180px)]'}`}
        viewBox="0 0 540 180"
        preserveAspectRatio="none"
        aria-label="AI 설계 도면 미리보기"
      >
        <defs>
          <pattern id="auth-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(17,24,39,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="540" height="180" fill="url(#auth-grid)" />
        <rect x="40" y="20" width="460" height="140" fill="none" stroke="rgba(17,24,39,0.5)" strokeWidth="2" />
        <line x1="180" y1="20" x2="180" y2="100" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <line x1="40" y1="100" x2="320" y2="100" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <line x1="320" y1="20" x2="320" y2="160" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <line x1="320" y1="80" x2="500" y2="80" stroke="rgba(17,24,39,0.5)" strokeWidth="1.5" />
        <path d="M 180 60 A 14 14 0 0 0 194 74" fill="none" stroke="rgba(17,24,39,0.4)" strokeWidth="1" />
        <path d="M 320 130 A 14 14 0 0 1 306 144" fill="none" stroke="rgba(17,24,39,0.4)" strokeWidth="1" />
        <rect
          x="324"
          y="84"
          width="172"
          height="72"
          fill="rgba(79,70,229,0.08)"
          stroke="rgba(79,70,229,0.6)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x="334" y="102" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(79,70,229,0.9)">
          AI · STUDIO
        </text>
        <line x1="40" y1="172" x2="500" y2="172" stroke="rgba(17,24,39,0.3)" strokeWidth="1" />
        <line x1="40" y1="168" x2="40" y2="176" stroke="rgba(17,24,39,0.3)" strokeWidth="1" />
        <line x1="500" y1="168" x2="500" y2="176" stroke="rgba(17,24,39,0.3)" strokeWidth="1" />
        <text x="270" y="168" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(17,24,39,0.45)">
          12,400
        </text>
        <text x="50" y="36" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(17,24,39,0.35)">
          A-01
        </text>
        <text x="190" y="36" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(17,24,39,0.35)">
          +0.000
        </text>
        <rect x="60" y="120" width="40" height="24" fill="none" stroke="rgba(17,24,39,0.25)" strokeWidth="1" />
        <rect x="120" y="120" width="40" height="24" fill="none" stroke="rgba(17,24,39,0.25)" strokeWidth="1" />
        <circle cx="220" cy="60" r="14" fill="none" stroke="rgba(17,24,39,0.25)" strokeWidth="1" />
      </svg>
      <div
        className={`flex items-center justify-between font-mono tracking-[0.1em] text-[#6b7280] ${
          compact ? 'mt-2 text-[9px]' : 'mt-3 text-[10px]'
        }`}
      >
        <span>scale 1 : 100 · DRAFT</span>
        <span className="rounded bg-[#4f46e5]/10 px-2 py-1 font-medium text-[#4f46e5]">AI 영감 96%</span>
      </div>
    </div>
  )
}

export default function AuthLayout({ children, fitViewport = false }: AuthLayoutProps) {
  return (
    <div
      className={`grid grid-cols-1 overflow-hidden bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] ${
        fitViewport ? 'h-dvh max-h-dvh' : 'min-h-screen'
      }`}
    >
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
            Batang
          </span>
        </div>
      </section>

      <section
        className={`flex flex-col border-l border-[#e5e7eb] bg-white px-5 lg:px-8 ${
          fitViewport ? 'h-dvh overflow-y-auto py-0' : 'min-h-screen py-7'
        }`}
      >
        <div
          className={`flex flex-col items-center ${
            fitViewport
              ? 'min-h-0 flex-1 justify-start pb-6 pt-[clamp(48px,9vh,92px)] lg:pb-8'
              : 'min-h-0 flex-1 justify-center py-2'
          }`}
        >
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        <div className={`shrink-0 truncate text-center text-[11px] text-[#9ca3af] ${
          fitViewport ? 'mt-8 pb-8' : 'pt-2'
        }`}>
          <span className="inline-flex items-center justify-center gap-3">
            <Link to="/about" className="hover:text-[#374151]">
              서비스 소개
            </Link>
            <span className="text-[#d1d5db]">|</span>
            <span className="cursor-pointer hover:text-[#374151]">개인정보처리방침</span>
            <span className="text-[#d1d5db]">|</span>
            <span className="cursor-pointer hover:text-[#374151]">고객지원</span>
          </span>
        </div>
      </section>
    </div>
  )
}
