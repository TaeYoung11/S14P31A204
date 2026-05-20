import { MoreHorizontal, Trash2, UserPlus } from 'lucide-react'
import type { Project } from '@/shared/types'

interface ProjectCardActionMenuProps {
  isOpen: boolean
  project: Project
  onDelete: (id: string) => void
  onShare: (project: Project) => void
  onToggleOpen: () => void
  onClose: () => void
}

/** 프로젝트 카드의 더보기 메뉴를 렌더링한다. */
export default function ProjectCardActionMenu({
  isOpen,
  project,
  onDelete,
  onShare,
  onToggleOpen,
  onClose,
}: ProjectCardActionMenuProps) {
  return (
    <div className="relative shrink-0">
      <button
        id={`project-menu-${project.id}`}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9ca3af] transition-all hover:bg-[#f3f4f6] hover:text-[#374151]"
        onClick={(event) => {
          event.preventDefault()
          onToggleOpen()
        }}
        title="더보기"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#374151] hover:bg-[#f3f4f6]"
            onClick={() => {
              onShare(project)
              onClose()
            }}
          >
            <UserPlus className="h-4 w-4" /> 공유 초대
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#dc2626] hover:bg-[#fef2f2]"
            onClick={() => {
              onDelete(project.id)
              onClose()
            }}
          >
            <Trash2 className="h-4 w-4" /> 삭제
          </button>
        </div>
      )}
    </div>
  )
}
