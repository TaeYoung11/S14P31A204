import { useRef } from 'react'

const PRESET_COLORS = [
  '#BEC4D1', '#A0785A', '#B8D4E8', '#C0524A',
  '#4CAF50', '#FF9800', '#9C27B0', '#3B45B3',
]

interface ColorSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

export function ColorSelector({ value = '#BEC4D1', onChange }: ColorSelectorProps) {
  const colorInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">색상</h3>

      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        className="w-full flex items-center gap-3 bg-[#F8F9FD] rounded-lg px-3 py-2.5 text-left hover:bg-[#F0F2FA] transition-colors"
      >
        <div
          className="w-8 h-8 rounded-lg shadow-inner shrink-0 border border-[#E2E6EF]"
          style={{ backgroundColor: value }}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase">선택된 색상</span>
          <span className="text-xs font-mono font-bold text-[#1C1C1E] uppercase">{value}</span>
        </div>
      </button>

      <input
        ref={colorInputRef}
        type="color"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className="sr-only"
      />

      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map(color => (
          <button
            type="button"
            key={color}
            onClick={() => onChange?.(color)}
            title={color}
            className={`w-7 h-7 rounded-lg shadow-sm transition-all hover:scale-110 border border-[#E2E6EF] ${
              value === color ? 'ring-2 ring-[#3B45B3] ring-offset-1' : ''
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
