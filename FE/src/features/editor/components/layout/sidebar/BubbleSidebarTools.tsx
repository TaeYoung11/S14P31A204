import { LayoutDashboard, PlusCircle, Sparkles, TrendingUp } from 'lucide-react'
import DeleteToolButton from './DeleteToolButton'
import SelectionToolButton from './SelectionToolButton'
import SidebarToolButton from './SidebarToolButton'

interface BubbleSidebarToolsProps {
  selectedTool: string
  isLineStyleModalOpen: boolean
  isBubbleReadOnly: boolean
  canGenerateFloorPlan: boolean
  canAutoLayoutBubbles: boolean
  isFloorPlanGenerated: boolean
  hasDeletableSelection: boolean
  isDeleteActionLocked?: boolean
  onToolSelect: (tool: string) => void
  onAddSpace: () => void
  onGenerateFloorPlan?: () => void
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
  canGenerateFloorPlan,
  canAutoLayoutBubbles,
  isFloorPlanGenerated,
  hasDeletableSelection,
  isDeleteActionLocked = false,
  onToolSelect,
  onAddSpace,
  onGenerateFloorPlan,
  onAutoLayoutBubbles,
  onDeleteSelected,
}: BubbleSidebarToolsProps) {
  const canStartFloorPlanGeneration = canGenerateFloorPlan && !isFloorPlanGenerated
  const canStartBubbleAutoLayout = canAutoLayoutBubbles && !isBubbleReadOnly

  const floorPlanGenerateTitle = isFloorPlanGenerated
    ? '평면도는 이미 생성되었습니다. 2D 편집 모드를 사용해 주세요.'
    : canGenerateFloorPlan
      ? '버블 기반 2D 평면도 생성'
      : '버블을 1개 이상 추가해 주세요'

  const bubbleAutoLayoutTitle = isBubbleReadOnly
    ? '보기 전용 상태에서는 자동 배치를 사용할 수 없습니다.'
    : canAutoLayoutBubbles
      ? '대지 경계 안에서 연결 관계를 고려해 버블 자동 배치'
      : '버블을 2개 이상 배치해 주세요'

  const isConnectActive = !isBubbleReadOnly && (selectedTool === 'connect' || isLineStyleModalOpen)

  return (
    <>
      <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />

      <SidebarToolButton
        label="공간 만들기"
        isDisabled={isBubbleReadOnly}
        onClick={isBubbleReadOnly ? undefined : onAddSpace}
        icon={<PlusCircle size={24} />}
      />

      <SidebarToolButton
        label="연결선 설정"
        isDisabled={isBubbleReadOnly}
        isActive={isConnectActive}
        onClick={
          isBubbleReadOnly
            ? undefined
            : () => onToolSelect(selectedTool === 'connect' ? 'selection' : 'connect')
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

      <SidebarToolButton
        label="평면도 생성"
        title={floorPlanGenerateTitle}
        isDisabled={!canStartFloorPlanGeneration}
        onClick={onGenerateFloorPlan}
        icon={<LayoutDashboard size={24} />}
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
