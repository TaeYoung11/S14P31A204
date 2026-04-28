import type { MouseEvent as ReactMouseEvent } from 'react'
import { Sparkles } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'

interface AssistantPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLButtonElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/** AI 어시스턴트 패널 */
export function AssistantPanel({
  isOpen,
  offset,
  width,
  height,
  onDragStart,
  onResizeStart,
  onToggle,
}: AssistantPanelProps) {
  return (
    <PanelFrame
      panelKey="assistant"
      title="AI 어시스턴트"
      titleIcon={<Sparkles size={14} fill="white" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      theme="dark"
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4">
        <div className="bg-white rounded-xl p-4 shadow-inner">
          <div className="text-[11px] leading-relaxed text-[#1C1C1E] font-medium">
            거실 공간에 비해 창문 크기가 작습니다.
            <br />
            채광 효율을 위해 창문 너비를 1200mm에서{' '}
            <span className="text-[#3B45B3] font-bold">1800mm</span>로 확장할까요?
          </div>
        </div>
      </div>
    </PanelFrame>
  )
}
