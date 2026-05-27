import { ChevronDown } from 'lucide-react'
import {
  FLOOR_DOOR_HINGE_OPTIONS,
  FLOOR_DOOR_SWING_OPTIONS,
} from '../../../constants'
import type { FloorOpening } from '../../../types'

interface TwoDOpeningAttributesProps {
  selectedOpening: FloorOpening
  openingWidthDraft: string
  openingHeightDraft: string
  windowSillHeightDraft: string
  onOpeningWidthDraftChange: (value: string) => void
  onOpeningHeightDraftChange: (value: string) => void
  onWindowSillHeightDraftChange: (value: string) => void
  onOpeningWidthFocus: () => void
  onOpeningHeightFocus: () => void
  onWindowSillHeightFocus: () => void
  onOpeningWidthBlur: () => void
  onOpeningHeightBlur: () => void
  onWindowSillHeightBlur: () => void
  onDoorSwingDirectionChange?: (
    id: string,
    swingDirection: NonNullable<FloorOpening['doorSwingDirection']>,
  ) => void
  onDoorHingeSideChange?: (
    id: string,
    hingeSide: NonNullable<FloorOpening['doorHingeSide']>,
  ) => void
}

/** 2D 문/창문 선택 시 표시되는 속성 섹션 */
export function TwoDOpeningAttributes({
  selectedOpening,
  openingWidthDraft,
  openingHeightDraft,
  windowSillHeightDraft,
  onOpeningWidthDraftChange,
  onOpeningHeightDraftChange,
  onWindowSillHeightDraftChange,
  onOpeningWidthFocus,
  onOpeningHeightFocus,
  onWindowSillHeightFocus,
  onOpeningWidthBlur,
  onOpeningHeightBlur,
  onWindowSillHeightBlur,
  onDoorSwingDirectionChange,
  onDoorHingeSideChange,
}: TwoDOpeningAttributesProps) {
  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">선택 요소</span>
        <span className="text-xs font-black text-[#3B45B3]">{selectedOpening.type === 'door' ? '문' : '창문'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">폭 (MM)</span>
          <input
            type="number"
            min={300}
            max={4000}
            step={50}
            value={openingWidthDraft}
            onChange={(e) => onOpeningWidthDraftChange(e.target.value)}
            onFocus={onOpeningWidthFocus}
            onBlur={onOpeningWidthBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">높이 (MM)</span>
          <input
            type="number"
            min={300}
            max={4000}
            step={50}
            value={openingHeightDraft}
            onChange={(e) => onOpeningHeightDraftChange(e.target.value)}
            onFocus={onOpeningHeightFocus}
            onBlur={onOpeningHeightBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>
      </div>

      {selectedOpening.type === 'window' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">창턱 높이 (MM)</span>
          <input
            type="number"
            min={0}
            max={2500}
            step={50}
            value={windowSillHeightDraft}
            onChange={(e) => onWindowSillHeightDraftChange(e.target.value)}
            onFocus={onWindowSillHeightFocus}
            onBlur={onWindowSillHeightBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>
      )}

      {selectedOpening.type === 'door' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">개폐 방식</span>
            <div className="relative group">
              <select
                value={selectedOpening.doorSwingDirection ?? 'inward'}
                onChange={(e) =>
                  onDoorSwingDirectionChange?.(
                    selectedOpening.id,
                    e.target.value as NonNullable<FloorOpening['doorSwingDirection']>,
                  )}
                className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
              >
                {FLOOR_DOOR_SWING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">경첩 방향</span>
            <div className="relative group">
              <select
                value={selectedOpening.doorHingeSide ?? 'left'}
                onChange={(e) =>
                  onDoorHingeSideChange?.(
                    selectedOpening.id,
                    e.target.value as NonNullable<FloorOpening['doorHingeSide']>,
                  )}
                className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
              >
                {FLOOR_DOOR_HINGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
