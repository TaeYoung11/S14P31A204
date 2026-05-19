import type { ReactNode } from 'react'
import AuthBrandPanel from '@/shared/components/auth/AuthBrandPanel'
import AuthFooterLinks from '@/shared/components/auth/AuthFooterLinks'

interface AuthLayoutProps {
  children: ReactNode
  fitViewport?: boolean
}

export default function AuthLayout({ children, fitViewport = true }: AuthLayoutProps) {
  return (
    <div
      className={`auth-layout-shell grid grid-cols-1 overflow-hidden bg-[#f8fafc] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] ${
        fitViewport ? 'h-dvh max-h-dvh' : 'min-h-screen'
      }`}
    >
      <AuthBrandPanel fitViewport={fitViewport} />

      <section
        className={`auth-form-stage flex flex-col border-l border-white/70 px-4 sm:px-5 lg:px-8 ${
          fitViewport ? 'h-dvh overflow-y-auto py-0' : 'min-h-screen py-7'
        }`}
      >
        <div
          className={`flex flex-col items-center ${
            fitViewport
              ? 'min-h-0 flex-1 justify-center py-[clamp(20px,4.5vh,48px)]'
              : 'min-h-0 flex-1 justify-center py-2'
          }`}
        >
          <div className="w-full max-w-[430px]">{children}</div>
        </div>

        <AuthFooterLinks fitViewport={fitViewport} />
      </section>
    </div>
  )
}
