import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DEFAULT_WALL_MATERIAL, FLOOR_WALL_MATERIAL_OPTIONS, FLOOR_WALL_MATERIAL_VISUALS } from '../../constants'

interface MaterialSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

export function MaterialSelector({ value, onChange }: MaterialSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const current = value ?? DEFAULT_WALL_MATERIAL
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
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-[#F8F9FD] rounded-lg px-3 py-2.5 flex items-center justify-between group hover:bg-[#F0F2FA] transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: currentColor }}
              aria-hidden
            />
            <span className="text-xs font-bold text-[#1C1C1E]">{current}</span>
          </span>
          <ChevronDown size={14} className="text-[#ADB5BD] group-hover:text-[#3B45B3]" />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E6EF] rounded-lg shadow-lg z-10 overflow-hidden">
            {FLOOR_WALL_MATERIAL_OPTIONS.map((label) => {
              const swatch = FLOOR_WALL_MATERIAL_VISUALS[label]?.color ?? FLOOR_WALL_MATERIAL_VISUALS[DEFAULT_WALL_MATERIAL].color
              return (
                <button
                  key={label}
                  onClick={() => handleSelect(label)}
                  className="w-full px-3 py-2.5 text-left hover:bg-[#F8F9FD] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
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
      <p className="text-[10px] text-[#8E95A3] leading-[1.35]">
        재질 색상은 실제 물성 의미가 아닌 시각적 구분용 표시입니다.
      </p>
    </div>
  )
}
