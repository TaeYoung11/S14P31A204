// 공개 랜딩 페이지의 고정 오버레이 헤더를 렌더링합니다.
import { Link, useLocation } from 'react-router-dom'
import logoSrc from '@/assets/logo.svg'

const PUBLIC_LANDING_PATHS = new Set(['/', '/about'])

export default function PublicLandingHeader() {
  const { pathname } = useLocation()

  if (!PUBLIC_LANDING_PATHS.has(pathname)) return null

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5">
      <Link to="/" className="pointer-events-auto inline-flex items-center no-underline" aria-label="바탕 홈으로 이동">
        <img src={logoSrc} alt="바탕 : BATANG" className="h-[22px] w-auto drop-shadow-sm" />
      </Link>

      <nav className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-2 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:gap-3">
        <Link
          to="/login"
          className="inline-flex items-center rounded-full bg-gradient-to-r from-[#5b46e8] to-[#7c3aed] px-4 py-2.5 text-[13px] font-semibold text-white no-underline shadow-[0_10px_24px_rgba(91,70,232,0.26)] transition hover:-translate-y-px hover:shadow-[0_14px_30px_rgba(91,70,232,0.34)] sm:px-5"
        >
          로그인 →
        </Link>
      </nav>
    </header>
  )
}
