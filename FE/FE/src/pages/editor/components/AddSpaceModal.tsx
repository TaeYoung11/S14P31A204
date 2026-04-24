// 공간 추가 모달
// 방 이름·종류·면적 비율을 입력받아 새 버블을 캔버스에 생성한다.

import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'

interface AddSpaceModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: { name: string; type: string; area: string }) => void
}

const ROOM_TYPES  = ['거실', '침실', '주방', '화장실', '방', '복도']
const INITIAL_FORM = { name: '', type: '거실', area: '' }

export default function AddSpaceModal({ isOpen, onClose, onConfirm }: AddSpaceModalProps) {
  const [form, setForm] = useState(INITIAL_FORM)

  if (!isOpen) return null

  /** 폼 제출 — 부모에 데이터 전달 후 폼 초기화 */
  const handleConfirm = () => {
    onConfirm(form)
    setForm(INITIAL_FORM)
  }

  /** 특정 필드의 onChange 핸들러 팩토리 */
  const update = (field: keyof typeof INITIAL_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-8 pt-8 pb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[18px] font-black text-[#1C1C1E]">공간 추가</h2>
            <button onClick={onClose} className="text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors">
              <X size={20} />
            </button>
          </div>
          <p className="text-[11px] font-bold text-[#ADB5BD] mb-8">
            새로운 룸의 기본 속성과 면적 비율을 설정합니다.
          </p>

          <div className="flex flex-col gap-6">
            <Field label="방 이름">
              <input
                type="text"
                placeholder="공간 이름을 입력하세요 (예: 거실 A)"
                className="w-full bg-[#F8F9FD] border-none rounded-xl px-4 py-3.5 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 outline-none"
                value={form.name}
                onChange={update('name')}
              />
            </Field>

            <Field label="방 종류">
              <div className="relative">
                <select
                  className="w-full bg-[#F8F9FD] border-none rounded-xl px-4 py-3.5 text-xs font-bold text-[#1C1C1E] focus:ring-2 focus:ring-[#3B45B3]/20 outline-none appearance-none cursor-pointer"
                  value={form.type}
                  onChange={update('type')}
                >
                  {ROOM_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3B45B3] pointer-events-none" />
              </div>
            </Field>

            <Field label="방 비율">
              <input
                type="text"
                placeholder="비율을 입력하세요 (예: 45m^2)"
                className="w-full bg-[#F8F9FD] border-none rounded-xl px-4 py-3.5 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 outline-none"
                value={form.area}
                onChange={update('area')}
              />
            </Field>
          </div>
        </div>

        <div className="px-8 pb-8 pt-2 flex items-center justify-end gap-6">
          <button
            onClick={onClose}
            className="text-[13px] font-bold text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="bg-[#3B45B3] text-white px-6 py-3 rounded-xl text-[13px] font-black shadow-lg shadow-[#3B45B3]/20 hover:bg-[#2D3691] transition-all"
          >
            공간 생성하기
          </button>
        </div>
      </div>
    </div>
  )
}

/** 레이블과 입력 요소를 묶는 폼 필드 레이아웃 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
