/**
 * MaterialSelector — 재질 선택 드롭다운 컴포넌트
 *
 * FLOOR_WALL_MATERIAL_OPTIONS 목록에서 재질을 선택하며, 색상 스와치를 함께 표시한다.
 * - value가 목록에 없는 경우(IFC 정의값) 상단에 별도로 표시한다.
 * - 재질 색상은 시각적 구분용으로, 실제 물성과는 무관하다.
 */
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DEFAULT_WALL_MATERIAL, FLOOR_WALL_MATERIAL_OPTIONS, FLOOR_WALL_MATERIAL_VISUALS, IFC_MATERIAL_NAME_KO } from '../../constants'

interface MaterialSelectorProps {
  /** 현재 선택된 재질 이름 */
  value?: string
  /**
   * value가 없을 때 표시할 레이블.
   * IFC 파일에서 재질이 지정되지 않은 요소에 '미지정' 등으로 표시한다.
   */
  fallbackLabel?: string
  /** 재질 선택 시 호출되는 콜백 */
  onChange?: (value: string) => void
  disabled?: boolean
}

/**
 * 재질 선택 드롭다운.
 * - FLOOR_WALL_MATERIAL_OPTIONS 목록에서 재질을 선택한다.
 * - 목록에 없는 값(IFC 정의 재질)은 상단에 별도 표시하고 선택은 불가하다.
 * - 각 항목에 색상 스와치를 함께 표시해 시각적 구분을 돕는다.
 */
export function MaterialSelector({ value, fallbackLabel, onChange, disabled = false }: MaterialSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  // IFC 파일에서 영문으로 정의된 재질명은 한글로 변환해 표시한다.
  const rawCurrent = value?.trim() || fallbackLabel?.trim() || DEFAULT_WALL_MATERIAL
  const current = IFC_MATERIAL_NAME_KO[rawCurrent] ?? rawCurrent
  const currentColor = FLOOR_WALL_MATERIAL_VISUALS[current]?.color ?? (
    fallbackLabel?.trim()
      ? '#ADB5BD'
      : FLOOR_WALL_MATERIAL_VISUALS[DEFAULT_WALL_MATERIAL].color
  )

  /** 재질 항목 클릭 시 변경 콜백을 호출하고 드롭다운을 닫는다. */
  const handleSelect = (label: string) => {
    if (disabled) return
    onChange?.(label)
    setIsOpen(false)
  }

  // 잠금 전환 시 열려 있던 드롭다운을 즉시 닫아, 재활성화 후 자동 재오픈을 방지한다.
  useEffect(() => {
    if (!disabled) return
    const closeTimer = window.setTimeout(() => {
      setIsOpen(false)
    }, 0)
    return () => window.clearTimeout(closeTimer)
  }, [disabled])

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">재질</h3>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className="group flex w-full items-center justify-between rounded-lg bg-[#F8F9FD] px-3 py-2.5 transition-colors hover:bg-[#F0F2FA] disabled:cursor-not-allowed disabled:opacity-55"
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
        {isOpen && !disabled && (
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
