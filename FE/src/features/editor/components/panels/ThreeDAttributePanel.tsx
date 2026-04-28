import { ChevronDown } from 'lucide-react'
import { ColorSelector } from '../shared/ColorSelector'
import type { BubbleInfo } from './BubbleAttributePanel'

interface ThreeDAttributePanelProps {
  selectedBubble: BubbleInfo | null
  onLabelChange: (id: string, label: string) => void
  onColorChange: (id: string, color: string) => void
}

/**
 * 3D 뷰어 모드 속성 패널
 * 선택된 공간의 이름·색상을 변경할 수 있으며,
 * 벽체 치수(길이·높이·두께)와 재질은 기본값으로 표시된다.
 */
export function ThreeDAttributePanel({ selectedBubble, onLabelChange, onColorChange }: ThreeDAttributePanelProps) {
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
        {/* 공간 이름 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">공간 이름</span>
          <input
            type="text"
            value={selectedBubble.label}
            onChange={(e) => onLabelChange(selectedBubble.id, e.target.value)}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>

        {/* 길이 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">길이 (MM)</span>
          <input
            type="text"
            value={Math.round(selectedBubble.widthMm).toLocaleString()}
            readOnly
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none opacity-75"
          />
        </div>

        {/* 높이 & 두께 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">높이 (MM)</span>
            <input
              type="text"
              value="2,400"
              readOnly
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none opacity-75"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">두께</span>
            <input
              type="text"
              value="200"
              readOnly
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] outline-none opacity-75"
            />
          </div>
        </div>

        {/* 재질 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">재질</span>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#BEC4D1] rounded-sm z-10" />
            <select className="w-full bg-[#F8F9FD] border-none rounded-lg pl-9 pr-8 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer">
              <option>콘크리트</option>
              <option>목재</option>
              <option>벽돌</option>
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
            />
          </div>
        </div>

        {/* 색상 — 실제 버블 색상과 연동 */}
        <ColorSelector
          value={selectedBubble.color}
          onChange={(color) => onColorChange(selectedBubble.id, color)}
        />
      </div>

      {/* 면적 요약 — 실제 버블 면적 반영 */}
      <div className="pt-4 border-t border-[#F0F2F9] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
        <span className="text-sm font-black text-[#3B45B3]">{selectedBubble.ratio.toFixed(2)} m²</span>
      </div>
    </div>
  )
}
