import { Link, useLocation } from 'react-router-dom'
import logoSrc from '@/assets/logo.svg'

const PUBLIC_LANDING_PATHS = new Set(['/', '/about'])

/** 공개 랜딩 화면에서만 노출되는 고정 헤더. */
export default function PublicLandingHeader() {
  const { pathname } = useLocation()

  if (!PUBLIC_LANDING_PATHS.has(pathname)) return null

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5">
      <Link
        to="/"
        className="pointer-events-auto inline-flex items-center gap-2.5 no-underline"
        aria-label="바탕 홈으로 이동"
      >
        <img src={logoSrc} alt="바탕 : BATANG" className="h-8 w-auto drop-shadow-sm sm:h-9" />
        <span className="font-mono text-[14px] font-semibold tracking-[0.18em] text-slate-900 drop-shadow-sm sm:text-[15px]">
          BATANG
        </span>
      </Link>

      <nav className="pointer-events-auto flex items-center">
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-[#5b46e8] to-[#7c3aed] px-5 text-[14px] font-semibold text-white no-underline shadow-[0_12px_28px_rgba(91,70,232,0.24)] transition hover:-translate-y-px hover:shadow-[0_16px_34px_rgba(91,70,232,0.30)] sm:px-6"
        >
          로그인 →
        </Link>
      </nav>
    </header>
  )
}
