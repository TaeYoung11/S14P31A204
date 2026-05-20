import type { MouseEvent } from 'react'
import { Check, Pencil } from 'lucide-react'
import type { Project } from '@/shared/types'

interface ListSelectionButtonProps {
  isSelected: boolean
  onToggleSelect: (event: MouseEvent) => void
}

interface ListEditButtonProps {
  project: Project
  onEdit: (project: Project) => void
}

export function ListSelectionButton({
  isSelected,
  onToggleSelect,
}: ListSelectionButtonProps) {
  return (
    <button
      type="button"
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
        isSelected
          ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
          : 'border-[#cbd5e1] bg-white text-transparent hover:border-[#4f46e5] hover:text-[#4f46e5]'
      }`}
      onClick={onToggleSelect}
      title={isSelected ? '선택 해제' : '선택'}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  )
}

export function ListEditButton({ project, onEdit }: ListEditButtonProps) {
  return (
    <button
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f8fafc] text-[#374151] transition-colors hover:bg-[#eef2ff] hover:text-[#4f46e5]"
      onClick={(event) => {
        event.preventDefault()
        onEdit(project)
      }}
      title="수정"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}
