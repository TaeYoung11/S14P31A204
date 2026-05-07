import { Hand, MousePointer2 } from 'lucide-react'
import SidebarToolButton from './SidebarToolButton'

interface SelectionToolButtonProps {
  selectedTool: string
  onToolSelect: (tool: string) => void
}

/**
 * 선택 도구 버튼
 * - hand 상태에서도 선택 버튼을 활성 상태로 보여주고, 클릭 시 selection으로 복귀한다.
 */
export default function SelectionToolButton({ selectedTool, onToolSelect }: SelectionToolButtonProps) {
  const isHandTool = selectedTool === 'hand'
  const isActive = selectedTool === 'selection' || isHandTool

  return (
    <SidebarToolButton
      label={isHandTool ? '패닝' : '선택'}
      isActive={isActive}
      onClick={() => onToolSelect('selection')}
      icon={
        isHandTool ? (
          <Hand size={24} />
        ) : (
          <MousePointer2 size={24} fill={isActive ? '#3B45B3' : 'none'} fillOpacity={isActive ? 0.1 : 0} />
        )
      }
    />
  )
}
