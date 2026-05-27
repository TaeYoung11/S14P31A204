import { ChevronDown } from 'lucide-react'
import type { AddSpaceFormData } from '../../types'
import { ROOM_TYPES } from '../../constants'
import { ColorSelector } from '../shared/ColorSelector'
import EditorModal from '../shared/EditorModal'

interface AddSpaceModalProps {
  isOpen: boolean
  activeFloorNumber: number
  formData: AddSpaceFormData
  onClose: () => void
  onConfirm: () => void
  onChange: (next: AddSpaceFormData) => void
}

const SECTION_CLASS = 'bg-[#F8F9FD] border border-[#EEF1FA] rounded-2xl p-4'
const FIELD_LABEL_CLASS = 'text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider'
const INPUT_CLASS = 'w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none'

/** 공간 추가 모달 */
export function AddSpaceModal({ isOpen, activeFloorNumber, formData, onClose, onConfirm, onChange }: AddSpaceModalProps) {
  return (
    <EditorModal
      isOpen={isOpen}
      onClose={onClose}
      title="공간 추가"
      subtitle={`새로운 룸의 기본 속성과 면적을 설정합니다. (생성 층: ${activeFloorNumber}층)`}
      confirmLabel="공간 생성하기"
      onConfirm={onConfirm}
    >
      <section className={`${SECTION_CLASS} flex flex-col gap-4`}>
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL_CLASS}>방 이름</label>
          <input
            type="text"
            placeholder="예: 거실 A"
            className={INPUT_CLASS}
            value={formData.name}
            onChange={(event) => onChange({ ...formData, name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL_CLASS}>방 종류</label>
          <div className="relative">
            <select
              className={`${INPUT_CLASS} appearance-none cursor-pointer`}
              value={formData.type}
              onChange={(event) => onChange({ ...formData, type: event.target.value })}
            >
              {ROOM_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3B45B3] pointer-events-none" />
          </div>
        </div>
      </section>

      <section className={`${SECTION_CLASS} flex flex-col gap-4`}>
        <div className="flex flex-col gap-2">
          <label className={FIELD_LABEL_CLASS}>면적 (m²)</label>
          <input
            type="number"
            min={1}
            step={0.5}
            placeholder="예: 45"
            className={INPUT_CLASS}
            value={formData.ratio}
            onChange={(event) => onChange({ ...formData, ratio: event.target.value })}
          />
        </div>
        <p className="text-[10px] font-medium text-[#8A92A5]">면적 입력값을 기준으로 공간 크기가 자동 계산됩니다.</p>
      </section>

      <section className={SECTION_CLASS}>
        <ColorSelector
          value={formData.color}
          onChange={(color) => onChange({ ...formData, color })}
        />
      </section>
    </EditorModal>
  )
}
