import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const MATERIALS = [
  'Concrete',
  'Brick',
  'Steel',
  'Wood',
  'Glass',
  'Stone',
  'Tile',
]

interface MaterialSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

export function MaterialSelector({ value, onChange }: MaterialSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const current = value?.trim() || MATERIALS[0]

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
          <span className="text-xs font-bold text-[#1C1C1E]">{current}</span>
          <ChevronDown size={14} className="text-[#ADB5BD] group-hover:text-[#3B45B3]" />
        </button>
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-[#E2E6EF] bg-white shadow-lg">
            {current && !MATERIALS.includes(current) && (
              <div className="border-b border-[#EEF1F7] px-3 py-2.5">
                <span className="text-[10px] font-bold text-[#8E95A3]">IFC 정의값: {current}</span>
              </div>
            )}
            {MATERIALS.map((label) => (
              <button
                type="button"
                key={label}
                onClick={() => handleSelect(label)}
                className="w-full px-3 py-2.5 text-left transition-colors hover:bg-[#F8F9FD]"
              >
                <span className="text-xs font-bold text-[#1C1C1E]">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
