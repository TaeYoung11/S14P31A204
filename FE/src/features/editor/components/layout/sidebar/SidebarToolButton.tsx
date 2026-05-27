import type { ReactNode } from 'react'

interface SidebarToolButtonProps {
  label: string
  icon: ReactNode
  isActive?: boolean
  isDisabled?: boolean
  isDanger?: boolean
  title?: string
  onClick?: () => void
}

/**
 * 좌측 사이드바 공통 도구 버튼
 * - 활성/비활성/삭제(위험) 상태 시각 규칙을 한 곳으로 통합한다.
 */
export default function SidebarToolButton({
  label,
  icon,
  isActive = false,
  isDisabled = false,
  isDanger = false,
  title,
  onClick,
}: SidebarToolButtonProps) {
  const triggerToolAction = () => {
    if (isDisabled) return
    onClick?.()
  }

  const iconBoxBaseClass = 'flex h-10 w-10 items-center justify-center rounded-xl transition-all'

  const activeContainerClass = isDanger
    ? `${iconBoxBaseClass} bg-[#FFF2F2] text-[#E03131] shadow-[0_8px_18px_rgba(224,49,49,0.16)]`
    : `${iconBoxBaseClass} bg-[#EEF1FF] text-[#3B45B3] shadow-[0_8px_18px_rgba(59,69,179,0.16)]`
  const activeTextClass = isDanger ? 'text-[#E03131]' : 'text-[#3B45B3]'

  const inactiveContainerClass = isDanger
    ? `${iconBoxBaseClass} text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#E03131]`
    : `${iconBoxBaseClass} text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]`
  const inactiveTextClass = isDanger
    ? 'text-[#8692A8] group-hover:text-[#E03131]'
    : 'text-[#8692A8] group-hover:text-[#1C1C1E]'

  const disabledContainerClass = `${iconBoxBaseClass} text-[#D9DEF0]`
  const disabledTextClass = 'text-[#D9DEF0]'

  const containerClass = isDisabled
    ? disabledContainerClass
    : isActive
      ? activeContainerClass
      : inactiveContainerClass
  const labelClass = isDisabled
    ? disabledTextClass
    : isActive
      ? activeTextClass
      : inactiveTextClass

  return (
    <button
      type="button"
      title={title ?? label}
      onPointerDown={(event) => {
        if (isDisabled || !onClick) return
        if (event.button !== 0) return
        event.preventDefault()
        triggerToolAction()
      }}
      onClick={(event) => {
        if (isDisabled || !onClick) return
        // pointerdown에서 이미 처리한 경우 중복 실행을 피한다.
        if (event.detail > 0) return
        triggerToolAction()
      }}
      disabled={isDisabled}
      className="group flex w-full min-w-0 flex-col items-center gap-1.5 px-0.5 py-1.5 text-center disabled:cursor-not-allowed"
    >
      <div className={containerClass}>{icon}</div>
      <span className={`w-full truncate whitespace-nowrap px-0.5 text-[10px] font-semibold leading-tight transition-colors ${labelClass}`}>
        {label}
      </span>
    </button>
  )
}
