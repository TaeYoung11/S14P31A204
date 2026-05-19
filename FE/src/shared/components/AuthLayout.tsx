import type { ReactNode } from 'react'
import AuthBrandPanel from '@/shared/components/auth/AuthBrandPanel'
import AuthFooterLinks from '@/shared/components/auth/AuthFooterLinks'

interface AuthLayoutProps {
  children: ReactNode
  fitViewport?: boolean
}

/**
 * 인증 화면의 좌측 브랜드 패널과 우측 폼 영역을 조립하는 공용 레이아웃.
 * 로그인/회원가입 페이지는 폼만 전달하고, 브랜드 문맥과 하단 링크는 여기서 일관되게 관리한다.
 */
export default function AuthLayout({ children, fitViewport = false }: AuthLayoutProps) {
  return (
    <div
      className={`grid grid-cols-1 overflow-hidden bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] ${
        fitViewport ? 'h-dvh max-h-dvh' : 'min-h-screen'
      }`}
    >
      <AuthBrandPanel fitViewport={fitViewport} />

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

        <AuthFooterLinks fitViewport={fitViewport} />
      </section>
    </div>
  )
}
