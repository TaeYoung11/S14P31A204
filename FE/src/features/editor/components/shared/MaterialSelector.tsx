import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DEFAULT_WALL_MATERIAL, FLOOR_WALL_MATERIAL_OPTIONS, FLOOR_WALL_MATERIAL_VISUALS } from '../../constants'

interface MaterialSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

export function MaterialSelector({ value, onChange }: MaterialSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const current = value?.trim() || DEFAULT_WALL_MATERIAL
  const currentColor = FLOOR_WALL_MATERIAL_VISUALS[current]?.color ?? FLOOR_WALL_MATERIAL_VISUALS[DEFAULT_WALL_MATERIAL].color

  const handleSelect = (label: string) => {
    onChange?.(label)
    setIsOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">재질</h3>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group flex w-full items-center justify-between rounded-lg bg-[#F8F9FD] px-3 py-2.5 transition-colors hover:bg-[#F0F2FA]"
        >
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: currentColor }}
              aria-hidden
            />
            <span className="text-xs font-bold text-[#1C1C1E]">{current}</span>
          </span>
          <ChevronDown size={14} className="text-[#ADB5BD] group-hover:text-[#3B45B3]" />
        </button>
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-[#E2E6EF] bg-white shadow-lg">
            {current && !(FLOOR_WALL_MATERIAL_OPTIONS as readonly string[]).includes(current) && (
              <div className="border-b border-[#EEF1F7] px-3 py-2.5">
                <span className="text-[10px] font-bold text-[#8E95A3]">IFC 정의값: {current}</span>
              </div>
            )}
            {FLOOR_WALL_MATERIAL_OPTIONS.map((label) => {
              const swatch = FLOOR_WALL_MATERIAL_VISUALS[label]?.color ?? FLOOR_WALL_MATERIAL_VISUALS[DEFAULT_WALL_MATERIAL].color
              return (
                <button
                  type="button"
                  key={label}
                  onClick={() => handleSelect(label)}
                  className="w-full px-3 py-2.5 text-left transition-colors hover:bg-[#F8F9FD]"
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: swatch }}
                      aria-hidden
                    />
                    <span className="text-xs font-bold text-[#1C1C1E]">{label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <p className="text-[10px] leading-[1.35] text-[#8E95A3]">
        재질 색상은 실제 물성 의미가 아닌 시각적 구분용 표시입니다.
      </p>
    </div>
  )
}
