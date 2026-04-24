// 속성 관리자 패널
// 선택된 요소의 치수(길이·너비·높이·두께)와 재질을 표시 및 편집한다.

import { Minus, ChevronDown } from 'lucide-react'

/** 치수 입력 필드 정의 */
const DIMENSION_FIELDS = [
  { label: '길이 (mm)', defaultValue: '4,000' },
  { label: '너비 (mm)', defaultValue: '3,000' },
  { label: '높이 (mm)', defaultValue: '2,400' },
  { label: '두께 (mm)', defaultValue: '200'   },
]

export default function AttributePanel() {
  return (
    <section className="bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between">
        <h2 className="text-xs font-extrabold text-[#1C1C1E]">속성 관리자</h2>
        <Minus size={14} className="text-[#ADB5BD]" />
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* 치수 설정 */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-[#3B45B3]">치수 설정</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {DIMENSION_FIELDS.map(({ label, defaultValue }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">{label}</label>
                <input
                  type="text"
                  defaultValue={defaultValue}
                  className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 재질 선택 */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-[#3B45B3]">재질</h3>
          <button className="w-full bg-[#F8F9FD] rounded-lg px-3 py-2.5 flex items-center justify-between group hover:bg-[#F0F2FA] transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#BEC4D1] rounded shadow-inner" />
              <span className="text-xs font-bold text-[#1C1C1E]">콘크리트 (회색)</span>
            </div>
            <ChevronDown size={14} className="text-[#ADB5BD] group-hover:text-[#3B45B3]" />
          </button>
        </div>

        {/* 계산 면적 표시 */}
        <div className="mt-2 pt-5 border-t border-[#F0F2F9] flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
          <span className="text-sm font-black text-[#3B45B3]">12.00 m²</span>
        </div>
      </div>
    </section>
  )
}
