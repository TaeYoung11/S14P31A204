import { useMemo } from 'react'
import type { BubbleData, ZoningFormData } from '../../../types'
import { ColorSelector } from '../../shared/ColorSelector'

interface ZoningBasicSectionProps {
  formData: ZoningFormData
  autoColorPreview: string
  onChange: (next: ZoningFormData) => void
}

interface ZoningBubblePickerSectionProps {
  floorBubbles: BubbleData[]
  selectedBubbleIds: string[]
  selectedCount: number
  validationMessage?: string | null
  onToggleBubble: (bubbleId: string) => void
}

/**
 * 조닝 이름/색상 모드/색상 선택 섹션.
 * - 자동 모드에서는 선택 버블 기반 미리보기 색상만 노출한다.
 * - 수동 모드에서는 팔레트를 통해 색상을 직접 선택한다.
 */
export function ZoningBasicSection({ formData, autoColorPreview, onChange }: ZoningBasicSectionProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#EEF1FA] bg-[#F8F9FD] p-4">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-wider text-[#1C1C1E]">조닝 이름</label>
        <input
          type="text"
          placeholder="예: 공용 라운지 존"
          className="w-full rounded-xl border border-[#E5E9F3] bg-white px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] outline-none focus:border-[#C7CEEC] focus:ring-2 focus:ring-[#3B45B3]/20"
          value={formData.name}
          onChange={(event) => onChange({ ...formData, name: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-wider text-[#1C1C1E]">조닝 색상 모드</label>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[#E8ECF6] p-1">
          <button
            type="button"
            onClick={() => onChange({ ...formData, colorMode: 'auto' })}
            className={`rounded-full px-3 py-2 text-[11px] font-black transition-all ${
              formData.colorMode === 'auto' ? 'bg-white text-[#5D4AD8] shadow-sm' : 'text-[#8E95A3] hover:text-[#505764]'
            }`}
          >
            자동
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...formData, colorMode: 'manual' })}
            className={`rounded-full px-3 py-2 text-[11px] font-black transition-all ${
              formData.colorMode === 'manual' ? 'bg-white text-[#3B45B3] shadow-sm' : 'text-[#8E95A3] hover:text-[#505764]'
            }`}
          >
            수동
          </button>
        </div>
      </div>

      {formData.colorMode === 'manual' ? (
        <ColorSelector
          value={formData.color}
          onChange={(color) => onChange({ ...formData, color })}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E9F3] bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/5"
              style={{ backgroundColor: autoColorPreview }}
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-black text-[#1C1C1E]">자동 색상</p>
              <p className="truncate text-[10px] font-medium text-[#7E889B]">선택 공간 색상 기준 (기본 연보라)</p>
            </div>
          </div>
          <span className="text-[10px] font-black text-[#6C757D]">{autoColorPreview}</span>
        </div>
      )}
    </section>
  )
}

/**
 * 조닝에 포함할 공간 선택 섹션.
 * 현재 활성 층 버블만 노출하며 선택 개수를 상단에 표시한다.
 */
export function ZoningBubblePickerSection({
  floorBubbles,
  selectedBubbleIds,
  selectedCount,
  validationMessage,
  onToggleBubble,
}: ZoningBubblePickerSectionProps) {
  const selectedBubbleIdSet = useMemo(() => new Set(selectedBubbleIds), [selectedBubbleIds])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-wider text-[#1C1C1E]">포함할 공간</label>
        <span className="text-[10px] font-black text-[#3B45B3]">{selectedCount}개 선택</span>
      </div>
      <div className="flex max-h-[220px] flex-col gap-2 overflow-y-auto rounded-2xl border border-[#EEF1FA] bg-[#F8F9FD] p-2">
        {validationMessage ? (
          <div className="sticky top-0 z-10 rounded-xl border border-[#F5C2C7] bg-[#FFF5F5] px-3 py-2 text-[11px] font-bold text-[#C92A2A]">
            {validationMessage}
          </div>
        ) : null}
        {floorBubbles.length === 0 ? (
          <div className="py-3 text-center text-[11px] font-medium text-[#ADB5BD]">
            현재 층에 포함할 공간이 없습니다
          </div>
        ) : floorBubbles.map((bubble) => {
          const isSelected = selectedBubbleIdSet.has(bubble.id)
          return (
            <button
              key={bubble.id}
              type="button"
              onClick={() => onToggleBubble(bubble.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                isSelected
                  ? 'border-[#6268F2] bg-[#EEF0FF] shadow-[0_4px_14px_rgba(98,104,242,0.10)]'
                  : 'border-transparent bg-white hover:border-[#DCE2F4]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
                    style={{ backgroundColor: bubble.color }}
                  />
                  <span className="truncate text-xs font-black text-[#1C1C1E]">{bubble.label}</span>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-[#6C757D]">{bubble.area}</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
