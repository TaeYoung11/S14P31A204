import { ChevronDown } from 'lucide-react'
import type { AddSpaceFormData } from '../../types'
import { ROOM_TYPES } from '../../constants'
import { ColorSelector } from '../shared/ColorSelector'
import EditorModal from '../shared/EditorModal'

interface AddSpaceModalProps {
  isOpen: boolean
  formData: AddSpaceFormData
  onClose: () => void
  onConfirm: () => void
  onChange: (next: AddSpaceFormData) => void
}

/** 공간 추가 모달 */
export function AddSpaceModal({ isOpen, formData, onClose, onConfirm, onChange }: AddSpaceModalProps) {
  return (
    <EditorModal
      isOpen={isOpen}
      onClose={onClose}
      title="공간 추가"
      subtitle="새로운 룸의 기본 속성과 면적을 설정합니다."
      confirmLabel="공간 생성하기"
      onConfirm={onConfirm}
    >
      <section className="bg-[#F8F9FD] border border-[#EEF1FA] rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">방 이름</label>
          <input
            type="text"
            placeholder="예: 거실 A"
            className="w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none"
            value={formData.name}
            onChange={(event) => onChange({ ...formData, name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">방 종류</label>
          <div className="relative">
            <select
              className="w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none appearance-none cursor-pointer"
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

      <section className="bg-[#F8F9FD] border border-[#EEF1FA] rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">면적 (m²)</label>
          <input
            type="number"
            min={1}
            step={0.5}
            placeholder="예: 45"
            className="w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none"
            value={formData.ratio}
            onChange={(event) => onChange({ ...formData, ratio: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">가로 (mm)</label>
            <input
              type="number"
              min={1}
              placeholder="예: 4000"
              className="w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none"
              value={formData.width}
              onChange={(event) => onChange({ ...formData, width: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">세로 (mm)</label>
            <input
              type="number"
              min={1}
              placeholder="예: 3000"
              className="w-full bg-white border border-[#E5E9F3] rounded-xl px-4 py-3 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 focus:border-[#C7CEEC] outline-none"
              value={formData.height}
              onChange={(event) => onChange({ ...formData, height: event.target.value })}
            />
          </div>
        </div>
        <p className="text-[10px] font-medium text-[#8A92A5]">면적 또는 가로·세로 중 하나만 입력해도 자동 계산됩니다.</p>
      </section>

      <section className="bg-[#F8F9FD] border border-[#EEF1FA] rounded-2xl p-4">
        <ColorSelector
          value={formData.color}
          onChange={(color) => onChange({ ...formData, color })}
        />
      </section>
    </EditorModal>
  )
}
