import { Plus } from 'lucide-react'

interface ProjectCreateTileProps {
  onCreateOpen: () => void
}

export default function ProjectCreateTile({ onCreateOpen }: ProjectCreateTileProps) {
  return (
    <button
      onClick={onCreateOpen}
      className="group flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#c7d2fe] bg-white/85 transition-colors hover:border-[#4f46e5] hover:bg-[#f8faff]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dbeafe] bg-[#eff6ff] transition-colors group-hover:border-[#4f46e5]">
        <Plus className="h-5 w-5 text-[#9ca3af] transition-colors group-hover:text-[#4f46e5]" />
      </div>
      <span className="text-sm font-medium text-[#6b7280] transition-colors group-hover:text-[#4f46e5]">
        새 프로젝트 만들기
      </span>
    </button>
  )
}
