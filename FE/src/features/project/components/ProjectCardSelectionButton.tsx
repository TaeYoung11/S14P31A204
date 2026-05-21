import { Check } from 'lucide-react'
import type { MouseEvent } from 'react'

interface ProjectCardSelectionButtonProps {
  isSelected: boolean
  variant: 'media' | 'list'
  onToggleSelect: (event: MouseEvent) => void
}

/** 프로젝트 카드의 선택 상태를 토글하는 체크 버튼이다. */
export default function ProjectCardSelectionButton({
  isSelected,
  variant,
  onToggleSelect,
}: ProjectCardSelectionButtonProps) {
  const className = variant === 'media'
    ? `absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
        isSelected
          ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
          : 'border-white/80 bg-white/90 text-transparent backdrop-blur-sm hover:border-[#4f46e5] hover:text-[#4f46e5]'
      }`
    : `mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
        isSelected
          ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
          : 'border-[#cbd5e1] bg-white text-transparent hover:border-[#4f46e5] hover:text-[#4f46e5]'
      }`

  return (
    <button
      type="button"
      className={className}
      onClick={onToggleSelect}
      title={isSelected ? '선택 해제' : '선택'}
    >
      <Check className={variant === 'media' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
    </button>
  )
}
