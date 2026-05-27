import { Trash2 } from 'lucide-react'
import SidebarToolButton from './SidebarToolButton'

interface DeleteToolButtonProps {
  selectedTool: string
  onToolSelect: (tool: string) => void
  hasDeletableSelection?: boolean
  onDeleteSelected?: () => void
  disabled?: boolean
}

/**
 * 삭제 도구 버튼
 * - 선택된 삭제 대상이 있으면 즉시 삭제 후 selection으로 복귀한다.
 */
export default function DeleteToolButton({
  selectedTool,
  onToolSelect,
  hasDeletableSelection = false,
  onDeleteSelected,
  disabled = false,
}: DeleteToolButtonProps) {
  const isActive = selectedTool === 'delete' || hasDeletableSelection

  const handleDeleteClick = () => {
    if (hasDeletableSelection && onDeleteSelected) {
      onDeleteSelected()
      onToolSelect('selection')
      return
    }
    onToolSelect(selectedTool === 'delete' ? 'selection' : 'delete')
  }

  return (
    <SidebarToolButton
      label="삭제"
      isDanger
      isActive={isActive}
      isDisabled={disabled}
      onClick={disabled ? undefined : handleDeleteClick}
      icon={<Trash2 size={24} />}
    />
  )
}
