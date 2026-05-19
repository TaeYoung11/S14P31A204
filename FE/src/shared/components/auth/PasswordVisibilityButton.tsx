import { Eye, EyeOff } from 'lucide-react'

interface PasswordVisibilityButtonProps {
  isVisible: boolean
  onToggle: () => void
  labelPrefix?: string
}

/** 비밀번호 입력값의 노출 상태를 토글하는 공용 아이콘 버튼. */
export default function PasswordVisibilityButton({
  isVisible,
  onToggle,
  labelPrefix = '비밀번호',
}: PasswordVisibilityButtonProps) {
  return (
    <button
      type="button"
      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center text-[#94a3b8] transition-colors hover:text-[#64748b]"
      onClick={onToggle}
      aria-label={isVisible ? `${labelPrefix} 숨기기` : `${labelPrefix} 보기`}
    >
      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )
}
