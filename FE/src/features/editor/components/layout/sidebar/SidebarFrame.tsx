import type { ReactNode } from 'react'

interface SidebarFrameProps {
  children: ReactNode
  footer?: ReactNode
}

/**
 * 왼쪽 사이드바 공통 레이아웃 프레임.
 * - 상단 도구 스크롤 영역
 * - 하단 고정 액션 영역
 */
export default function SidebarFrame({ children, footer }: SidebarFrameProps) {
  return (
    <aside className="mt-0 flex h-full min-h-0 w-[84px] shrink-0 self-stretch flex-col overflow-hidden rounded-3xl border border-[#DFE4F0] bg-white/95 py-4 shadow-[0_14px_30px_rgba(38,48,95,0.1)] backdrop-blur-sm">
      <div className="scrollbar-hide flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto py-2">
        <div className="flex w-full flex-col items-center gap-2 px-1.5">
          {children}
        </div>
      </div>
      {footer}
    </aside>
  )
}
