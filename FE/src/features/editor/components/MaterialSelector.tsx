import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const MATERIALS = [
  '콘크리트',
  '목재',
  '유리',
  '벽돌',
  '금속',
  '석재',
]

interface MaterialSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

export function MaterialSelector({ value, onChange }: MaterialSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const current = value ?? MATERIALS[0]

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
          <span className="text-xs font-bold text-[#1C1C1E]">{current}</span>
          <ChevronDown size={14} className="text-[#ADB5BD] group-hover:text-[#3B45B3]" />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E6EF] rounded-lg shadow-lg z-10 overflow-hidden">
            {MATERIALS.map(label => (
              <button
                key={label}
                onClick={() => handleSelect(label)}
                className="w-full px-3 py-2.5 text-left hover:bg-[#F8F9FD] transition-colors"
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
