// 공개 랜딩 페이지의 고정 오버레이 헤더를 렌더링합니다.
import { Link, useLocation } from 'react-router-dom'
import logoSrc from '@/assets/logo.svg'

const PUBLIC_LANDING_PATHS = new Set(['/', '/about'])

export default function PublicLandingHeader() {
  const { pathname } = useLocation()

  if (!PUBLIC_LANDING_PATHS.has(pathname)) return null

  const isAbout = pathname === '/about'

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 sm:px-10 sm:py-6">
      <Link to="/" className="pointer-events-auto inline-flex items-center no-underline" aria-label="바탕 홈으로 이동">
        <img src={logoSrc} alt="바탕 : BATANG" className="h-[22px] w-auto" />
      </Link>

      <nav className="pointer-events-auto flex items-center gap-5 sm:gap-6">
        <Link
          to="/about"
          className={`relative font-mono text-[12px] font-medium tracking-[0.14em] no-underline transition-colors ${
            isAbout ? 'text-[#4f46e5]' : 'text-[#374151] hover:text-[#4f46e5]'
          }`}
        >
          ABOUT
          {isAbout && <span className="absolute inset-x-0 -bottom-2 h-0.5 bg-[#4f46e5]" />}
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center rounded-lg bg-[#111827] px-4 py-2.5 text-[13px] font-medium text-white no-underline transition hover:-translate-y-px hover:bg-[#1f2937]"
        >
          로그인 →
        </Link>
      </nav>
    </header>
  )
}
