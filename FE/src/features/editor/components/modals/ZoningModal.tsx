import type { BubbleData, ZoningFormData } from '../../types'
import { ColorSelector } from '../shared/ColorSelector'
import EditorModal from '../shared/EditorModal'

interface ZoningModalProps {
  isOpen: boolean
  isEditing: boolean
  formData: ZoningFormData
  bubbles: BubbleData[]
  autoColorPreview: string
  onClose: () => void
  onConfirm: () => void
  onChange: (next: ZoningFormData) => void
  onToggleBubble: (bubbleId: string) => void
}

/** 조닝 생성/수정 모달 */
export function ZoningModal({
  isOpen,
  isEditing,
  formData,
  bubbles,
  autoColorPreview,
  onClose,
  onConfirm,
  onChange,
  onToggleBubble,
}: ZoningModalProps) {
  return (
    <EditorModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? '조닝 영역 수정' : '조닝 영역 추가'}
      subtitle={isEditing ? '선택된 조닝의 속성을 수정합니다.' : '공간을 묶어 투명 조닝 영역을 생성합니다.'}
      confirmLabel={isEditing ? '조닝 수정하기' : '조닝 생성하기'}
      onConfirm={onConfirm}
      confirmDisabled={formData.bubbleIds.length === 0}
    >
      <section className="bg-[#F8F9FD] border border-[#EEF1FA] rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">조닝 이름</label>
          <input
            type="text"
            placeholder="예: 공용 라운지 존"
            className="w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none"
            value={formData.name}
            onChange={(event) => onChange({ ...formData, name: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">조닝 색상 모드</label>
          <div className="bg-[#E8ECF6] p-1 rounded-full grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onChange({ ...formData, colorMode: 'auto' })}
              className={`px-3 py-2 rounded-full text-[11px] font-black transition-all ${
                formData.colorMode === 'auto' ? 'bg-white text-[#5D4AD8] shadow-sm' : 'text-[#8E95A3] hover:text-[#505764]'
              }`}
            >
              자동
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...formData, colorMode: 'manual' })}
              className={`px-3 py-2 rounded-full text-[11px] font-black transition-all ${
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
          <div className="bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3.5 h-3.5 rounded-full border border-black/5 shrink-0"
                style={{ backgroundColor: autoColorPreview }}
              />
              <div className="min-w-0">
                <p className="text-[11px] font-black text-[#1C1C1E] truncate">자동 색상</p>
                <p className="text-[10px] font-medium text-[#7E889B] truncate">선택 공간 색상 기준 (기본 연보라)</p>
              </div>
            </div>
            <span className="text-[10px] font-black text-[#6C757D]">{autoColorPreview}</span>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">포함할 공간</label>
          <span className="text-[10px] font-black text-[#3B45B3]">{formData.bubbleIds.length}개 선택</span>
        </div>
        <div className="max-h-[220px] overflow-y-auto rounded-2xl border border-[#EEF1FA] bg-[#F8F9FD] p-2 flex flex-col gap-2">
          {bubbles.map((bubble) => {
            const isSelected = formData.bubbleIds.includes(bubble.id)
            return (
              <button
                key={bubble.id}
                type="button"
                onClick={() => onToggleBubble(bubble.id)}
                className={`w-full rounded-xl px-3 py-3 text-left transition-all border ${
                  isSelected
                    ? 'border-[#6268F2] bg-[#EEF0FF] shadow-[0_4px_14px_rgba(98,104,242,0.10)]'
                    : 'border-transparent bg-white hover:border-[#DCE2F4]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/5"
                      style={{ backgroundColor: bubble.color }}
                    />
                    <span className="text-xs font-black text-[#1C1C1E] truncate">{bubble.label}</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#6C757D] shrink-0">{bubble.area}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </EditorModal>
  )
}
