import type { ReactNode } from 'react'

interface InspectorSectionFrameProps {
  title: string
  icon: ReactNode
  children: ReactNode
}

/**
 * 인스펙터 내부 공통 섹션 프레임.
 * 제목 바/본문 스크롤 스타일을 한 곳에서 통일해 중복 마크업을 줄인다.
 */
export function InspectorSectionFrame({ title, icon, children }: InspectorSectionFrameProps) {
  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-[#EEF2F7] px-2.5 py-1.5">
        <span className="text-[#3B45B3]">{icon}</span>
        <h3 className="text-[11px] font-extrabold text-[#1F2937]">{title}</h3>
      </div>
      <div className="max-h-[190px] overflow-y-auto p-2 text-[11px]">
        {children}
      </div>
    </section>
  )
}

