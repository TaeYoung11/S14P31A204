import { ChevronDown } from 'lucide-react'
import type { BubbleInfo } from './BubbleAttributePanel'
import { ROOM_TYPES } from '../constants'

interface TwoDAttributePanelProps {
  selectedBubble: BubbleInfo | null
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
}

/** 2D 평면도 모드 전용 속성 패널 — 버블 데이터와 연동 */
export function TwoDAttributePanel({
  selectedBubble,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onRatioChange,
}: TwoDAttributePanelProps) {
  if (!selectedBubble) {
    return (
      <div className="p-5 text-center text-[#ADB5BD] text-[11px] font-medium">
        공간을 선택하세요
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {/* 방 이름 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">공간 이름</span>
          <input
            type="text"
            value={selectedBubble.label}
            onChange={(e) => onLabelChange(selectedBubble.id, e.target.value)}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>

        {/* 방 종류 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">공간 유형</span>
          <div className="relative group">
            <select
              value={selectedBubble.type}
              onChange={(e) => onTypeChange(selectedBubble.id, e.target.value)}
              className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
            >
              {ROOM_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
            />
          </div>
        </div>

        {/* 가로/세로 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">가로 (MM)</span>
            <input
              type="number"
              value={Math.round(selectedBubble.widthMm)}
              onChange={(e) => onWidthChange(selectedBubble.id, Number(e.target.value))}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">세로 (MM)</span>
            <input
              type="number"
              value={Math.round(selectedBubble.heightMm)}
              onChange={(e) => onHeightChange(selectedBubble.id, Number(e.target.value))}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        </div>

        {/* 높이 & 두께 (2D/건축 특화 속성) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽체 높이 (MM)</span>
            <input
              type="text"
              value="2,400"
              readOnly
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] opacity-60 cursor-not-allowed"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 두께 (MM)</span>
            <input
              type="text"
              value="200"
              readOnly
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] opacity-60 cursor-not-allowed"
            />
          </div>
        </div>

        {/* 재질 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">주요 재질</span>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#BEC4D1] rounded-sm z-10 shadow-sm" />
            <select className="w-full bg-[#F8F9FD] border-none rounded-lg pl-9 pr-8 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer">
              <option>콘크리트</option>
              <option>목재 (Oak)</option>
              <option>벽돌 (Red)</option>
              <option>철골 구조</option>
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 면적 요약 */}
      <div className="pt-4 border-t border-[#F0F2F9] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
        <span className="text-sm font-black text-[#3B45B3]">{selectedBubble.ratio.toFixed(2)} m²</span>
      </div>
    </div>
  )
}
