import { ChevronDown } from 'lucide-react'
import {
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
  FLOOR_WALL_TYPE_OPTIONS,
} from '../../../constants'
import type { FloorWall } from '../../../types'
import { MaterialSelector } from '../../shared/MaterialSelector'

interface TwoDWallAttributesProps {
  selectedWall: FloorWall
  wallThicknessDraft: string
  wallHeightDraft: string
  onWallThicknessDraftChange: (value: string) => void
  onWallHeightDraftChange: (value: string) => void
  onWallThicknessFocus: () => void
  onWallHeightFocus: () => void
  onWallThicknessBlur: () => void
  onWallHeightBlur: () => void
  onWallTypeChange?: (id: string, type: FloorWall['type']) => void
  onWallMaterialChange?: (id: string, material: string) => void
}

/** 2D 벽 선택 시 표시되는 속성 섹션 */
export function TwoDWallAttributes({
  selectedWall,
  wallThicknessDraft,
  wallHeightDraft,
  onWallThicknessDraftChange,
  onWallHeightDraftChange,
  onWallThicknessFocus,
  onWallHeightFocus,
  onWallThicknessBlur,
  onWallHeightBlur,
  onWallTypeChange,
  onWallMaterialChange,
}: TwoDWallAttributesProps) {
  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">선택 요소</span>
        <span className="text-xs font-black text-[#3B45B3]">벽체</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 유형</span>
        <div className="relative group">
          <select
            value={selectedWall.type}
            onChange={(e) => onWallTypeChange?.(selectedWall.id, e.target.value as FloorWall['type'])}
            className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
          >
            {FLOOR_WALL_TYPE_OPTIONS.map((typeOption) => (
              <option key={typeOption.value} value={typeOption.value}>{typeOption.label}</option>
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
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 두께 (MM)</span>
          <input
            type="number"
            min={FLOOR_WALL_THICKNESS_MIN_MM}
            max={FLOOR_WALL_THICKNESS_MAX_MM}
            step={10}
            value={wallThicknessDraft}
            onChange={(e) => onWallThicknessDraftChange(e.target.value)}
            onFocus={onWallThicknessFocus}
            onBlur={onWallThicknessBlur}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 높이 (MM)</span>
          <input
            type="number"
            min={FLOOR_WALL_HEIGHT_MIN_MM}
            max={FLOOR_WALL_HEIGHT_MAX_MM}
            step={100}
            value={wallHeightDraft}
            onChange={(e) => onWallHeightDraftChange(e.target.value)}
            onFocus={onWallHeightFocus}
            onBlur={onWallHeightBlur}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>
      </div>

      <MaterialSelector
        value={selectedWall.material}
        onChange={(material) => onWallMaterialChange?.(selectedWall.id, material)}
      />
    </div>
  )
}
