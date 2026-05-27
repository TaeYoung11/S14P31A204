import { CirclePlus, Sparkles, TrendingUp } from 'lucide-react'
import AddSpaceToolButton from './AddSpaceToolButton'
import DeleteToolButton from './DeleteToolButton'
import SelectionToolButton from './SelectionToolButton'
import SidebarToolButton from './SidebarToolButton'

interface BubbleSidebarToolsProps {
  selectedTool: string
  isLineStyleModalOpen: boolean
  isBubbleReadOnly: boolean
  canAutoLayoutBubbles: boolean
  hasDeletableSelection: boolean
  isDeleteActionLocked?: boolean
  onToolSelect: (tool: string) => void
  onAddSpace: () => void
  onAutoLayoutBubbles?: () => void
  onDeleteSelected?: () => void
}

/**
 * 버블 모드 전용 도구 그룹
 */
export default function BubbleSidebarTools({
  selectedTool,
  isLineStyleModalOpen,
  isBubbleReadOnly,
  canAutoLayoutBubbles,
  hasDeletableSelection,
  isDeleteActionLocked = false,
  onToolSelect,
  onAddSpace,
  onAutoLayoutBubbles,
  onDeleteSelected,
}: BubbleSidebarToolsProps) {
  const canStartBubbleAutoLayout = canAutoLayoutBubbles && !isBubbleReadOnly

  const bubbleAutoLayoutTitle = isBubbleReadOnly
    ? '보기 전용 상태에서는 자동 배치를 사용할 수 없습니다.'
    : canAutoLayoutBubbles
      ? '대지 경계 안에서 연결 관계를 고려해 버블 자동 배치'
      : '버블을 2개 이상 배치해 주세요'

  const isConnectActive = !isBubbleReadOnly && (selectedTool === 'connect' || isLineStyleModalOpen)
  const handleToggleConnectTool = () => onToolSelect(selectedTool === 'connect' ? 'selection' : 'connect')

  return (
    <>
      <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />

      <AddSpaceToolButton
        label="버블 생성"
        title="버블 생성"
        isDisabled={isBubbleReadOnly}
        onClick={isBubbleReadOnly ? undefined : onAddSpace}
        icon={<CirclePlus size={24} />}
      />

      <SidebarToolButton
        label="연결선 설정"
        isDisabled={isBubbleReadOnly}
        isActive={isConnectActive}
        onClick={
          isBubbleReadOnly
            ? undefined
            : handleToggleConnectTool
        }
        icon={<TrendingUp size={24} />}
      />

      <SidebarToolButton
        label="자동 배치"
        title={bubbleAutoLayoutTitle}
        isDisabled={!canStartBubbleAutoLayout}
        onClick={onAutoLayoutBubbles}
        icon={<Sparkles size={24} />}
      />

      <DeleteToolButton
        selectedTool={selectedTool}
        onToolSelect={onToolSelect}
        hasDeletableSelection={hasDeletableSelection}
        onDeleteSelected={onDeleteSelected}
        disabled={isBubbleReadOnly || isDeleteActionLocked}
      />
    </>
  )
}
