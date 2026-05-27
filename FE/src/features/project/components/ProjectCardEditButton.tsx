import { Pencil } from 'lucide-react'
import type { Project } from '@/shared/types'

interface ProjectCardEditButtonProps {
  project: Project
  variant: 'media' | 'list'
  onEdit: (project: Project) => void
}

/** 프로젝트 카드에서 프로젝트 기본 정보 수정 모달을 여는 버튼이다. */
export default function ProjectCardEditButton({
  project,
  variant,
  onEdit,
}: ProjectCardEditButtonProps) {
  const className = variant === 'media'
    ? 'absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:bg-white group-hover:opacity-100'
    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f8fafc] text-[#374151] transition-colors hover:bg-[#eef2ff] hover:text-[#4f46e5]'

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.preventDefault()
        onEdit(project)
      }}
      title="수정"
    >
      <Pencil className="h-3.5 w-3.5 text-[#374151]" />
    </button>
  )
}
