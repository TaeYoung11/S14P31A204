import { useRef } from 'react'

const PRESET_COLORS = [
  '#BEC4D1', '#A0785A', '#B8D4E8', '#C0524A',
  '#4CAF50', '#FF9800', '#9C27B0', '#3B45B3',
]

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toUpperCase() : null
}

interface ColorSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

export function ColorSelector({ value = '#BEC4D1', onChange }: ColorSelectorProps) {
  const colorInputRef = useRef<HTMLInputElement>(null)
  const normalizedValue = normalizeHexColor(value) ?? '#BEC4D1'

  const handleHexChange = (inputValue: string) => {
    const nextColor = normalizeHexColor(inputValue)
    if (nextColor) onChange?.(nextColor)
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">색상</h3>

      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        className="flex w-full items-center gap-3 rounded-lg bg-[#F8F9FD] px-3 py-2.5 text-left transition-colors hover:bg-[#F0F2FA]"
      >
        <div
          className="h-8 w-8 shrink-0 rounded-lg border border-[#E2E6EF] shadow-inner"
          style={{ backgroundColor: normalizedValue }}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase text-[#ADB5BD]">색상 코드 (RGB / HEX)</span>
          <span className="font-mono text-xs font-bold uppercase text-[#1C1C1E]">{normalizedValue}</span>
        </div>
      </button>

      <input
        ref={colorInputRef}
        type="color"
        value={normalizedValue}
        onChange={(event) => onChange?.(event.target.value.toUpperCase())}
        className="sr-only"
      />

      <input
        type="text"
        value={normalizedValue}
        onChange={(event) => handleHexChange(event.target.value)}
        className="rounded-lg border-none bg-[#F8F9FD] px-3 py-2.5 font-mono text-xs font-bold uppercase text-[#1C1C1E] outline-none focus:ring-1 focus:ring-[#3B45B3]"
      />

      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            type="button"
            key={color}
            onClick={() => onChange?.(color)}
            title={color}
            className={`h-7 w-7 rounded-lg border border-[#E2E6EF] shadow-sm transition-all hover:scale-110 ${normalizedValue === color ? 'ring-2 ring-[#3B45B3] ring-offset-1' : ''}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
