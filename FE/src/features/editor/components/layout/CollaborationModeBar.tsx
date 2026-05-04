import { Users } from 'lucide-react'

interface CollaborationModeBarProps {
  onToggle: () => void
}

/**
 * 협업 모드 활성 상태 표시 바 (2D / 3D 모드 하단 중앙)
 * 클릭 시 협업 모드를 비활성화한다.
 */
export function CollaborationModeBar({ onToggle }: CollaborationModeBarProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
      <button
        onClick={onToggle}
        className="bg-white border border-[#E2E6EF] rounded-2xl px-6 py-2.5 shadow-lg flex items-center gap-3 hover:bg-[#F8F9FD] transition-all"
      >
        <Users size={18} className="text-[#3B45B3]" />
        <span className="text-[13px] font-extrabold text-[#3B45B3]">협업 모드 활성</span>
      </button>
    </div>
  )
}
