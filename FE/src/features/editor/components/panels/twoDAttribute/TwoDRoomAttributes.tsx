import { ChevronDown } from 'lucide-react'
import type { BubbleInfo } from '../BubbleAttributePanel'
import { ROOM_TYPES } from '../../../constants'

interface TwoDRoomAttributesProps {
  selectedBubble: BubbleInfo
  roomWidthDraft: string
  roomHeightDraft: string
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onRoomWidthDraftChange: (value: string) => void
  onRoomHeightDraftChange: (value: string) => void
  onRoomWidthFocus: () => void
  onRoomHeightFocus: () => void
  onRoomWidthBlur: () => void
  onRoomHeightBlur: () => void
  isRoomGeometryLocked?: boolean
}

/** 2D Room 선택 시 표시되는 속성 섹션 */
export function TwoDRoomAttributes({
  selectedBubble,
  roomWidthDraft,
  roomHeightDraft,
  onLabelChange,
  onTypeChange,
  onRoomWidthDraftChange,
  onRoomHeightDraftChange,
  onRoomWidthFocus,
  onRoomHeightFocus,
  onRoomWidthBlur,
  onRoomHeightBlur,
  isRoomGeometryLocked = false,
}: TwoDRoomAttributesProps) {
  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">공간 이름</span>
          <input
            type="text"
            value={selectedBubble.label}
            onChange={(e) => onLabelChange(selectedBubble.id, e.target.value)}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">가로 (MM)</span>
            <input
              type="number"
              value={roomWidthDraft}
              disabled={isRoomGeometryLocked}
              onFocus={onRoomWidthFocus}
              onChange={(e) => onRoomWidthDraftChange(e.target.value)}
              onBlur={onRoomWidthBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              className="bg-[#F8F9FD] disabled:bg-[#F2F4F8] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] disabled:text-[#9AA4BA] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">세로 (MM)</span>
            <input
              type="number"
              value={roomHeightDraft}
              disabled={isRoomGeometryLocked}
              onFocus={onRoomHeightFocus}
              onChange={(e) => onRoomHeightDraftChange(e.target.value)}
              onBlur={onRoomHeightBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              className="bg-[#F8F9FD] disabled:bg-[#F2F4F8] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] disabled:text-[#9AA4BA] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        </div>
        {isRoomGeometryLocked && (
          <p className="text-[10px] font-semibold text-[#8A94AB]">
            룸 형상/치수는 벽 편집 결과로 자동 계산됩니다.
          </p>
        )}

      </div>

      <div className="pt-4 border-t border-[#F0F2F9] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
        <span className="text-sm font-black text-[#3B45B3]">{selectedBubble.ratio.toFixed(2)} m²</span>
      </div>
    </div>
  )
}
