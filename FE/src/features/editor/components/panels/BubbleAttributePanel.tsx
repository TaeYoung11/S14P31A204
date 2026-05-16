import type { BubbleFloor } from '../../types'
import type {
  BubbleBasicFieldActions,
  BubbleConnectionInfo,
  BubbleInfo,
  BubbleZoneInfo,
} from './BubbleAttributePanel.types'
import { BubbleBasicFieldSection } from './sections/BubbleBasicFieldSection'
import { BubbleConnectionsSection } from './sections/BubbleConnectionsSection'
import { BubbleZonesSection } from './sections/BubbleZonesSection'

export type { BubbleConnectionInfo, BubbleInfo, BubbleZoneInfo } from './BubbleAttributePanel.types'

interface BubbleAttributePanelProps extends BubbleBasicFieldActions {
  selectedBubble: BubbleInfo | null
  bubbleFloors?: BubbleFloor[]
  connections?: BubbleConnectionInfo[]
  zones?: BubbleZoneInfo[]
}

/**
 * 버블 속성 패널 조립 컴포넌트.
 * - 데이터 계산/검증은 섹션/유틸에 위임한다.
 * - 여기서는 선택 상태 분기와 섹션 배치만 담당한다.
 */
export function BubbleAttributePanel({
  selectedBubble,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onRatioChange,
  onColorChange,
  onFloorChange,
  bubbleFloors = [],
  connections = [],
  zones = [],
}: BubbleAttributePanelProps) {
  if (!selectedBubble) {
    return (
      <div className="p-5 text-center text-[#ADB5BD] text-xs font-medium">
        공간을 선택하세요
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <BubbleBasicFieldSection
          selectedBubble={selectedBubble}
          bubbleFloors={bubbleFloors}
          onLabelChange={onLabelChange}
          onTypeChange={onTypeChange}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          onRatioChange={onRatioChange}
          onColorChange={onColorChange}
          onFloorChange={onFloorChange}
        />
        <BubbleZonesSection selectedBubble={selectedBubble} zones={zones} />
        <BubbleConnectionsSection selectedBubble={selectedBubble} connections={connections} />
      </div>

      <div className="pt-4 border-t border-[#F0F2F9] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
        <span className="text-sm font-black text-[#3B45B3]">{selectedBubble.ratio.toFixed(2)} m²</span>
      </div>
    </div>
  )
}
