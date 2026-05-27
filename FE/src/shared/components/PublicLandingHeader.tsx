import { Link, useLocation } from 'react-router-dom'
import BrandLogo from '@/shared/components/BrandLogo'

const PUBLIC_LANDING_PATHS = new Set(['/'])

/** 공개 랜딩 화면에서만 노출되는 고정 헤더. */
export default function PublicLandingHeader() {
  const { pathname } = useLocation()

  if (!PUBLIC_LANDING_PATHS.has(pathname)) return null

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5">
      <Link
        to="/"
        className="pointer-events-auto inline-flex items-center gap-2.5 no-underline"
        aria-label="바탕 홈으로 이동"
      >
        <BrandLogo
          logoClassName="h-8 w-auto drop-shadow-sm sm:h-9"
          textClassName="text-[14px] drop-shadow-sm sm:text-[15px]"
        />
      </Link>

      <nav className="pointer-events-auto flex items-center">
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-5 text-[14px] font-semibold text-white no-underline shadow-[0_12px_28px_var(--color-primary-shadow)] transition hover:-translate-y-px hover:bg-[var(--color-primary-hover)] hover:shadow-[0_16px_34px_var(--color-primary-shadow)] sm:px-6"
        >
          로그인 →
        </Link>
      </nav>
    </header>
  )
}
