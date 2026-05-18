import type { ReactNode } from 'react'
import SidebarToolButton from './SidebarToolButton'

interface AddSpaceToolButtonProps {
  label: string
  title: string
  isDisabled: boolean
  onClick?: () => void
  icon: ReactNode
}

/**
 * 공간/버블/방 생성 전용 사이드바 버튼
 * - 생성 계열 버튼의 공통 렌더링 규칙(label/title/disabled)을 한 곳에서 관리한다.
 */
export default function AddSpaceToolButton({
  label,
  title,
  isDisabled,
  onClick,
  icon,
}: AddSpaceToolButtonProps) {
  return (
    <SidebarToolButton
      label={label}
      title={title}
      isDisabled={isDisabled}
      onClick={!isDisabled ? onClick : undefined}
      icon={icon}
    />
  )
}
