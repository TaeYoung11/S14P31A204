import { ChevronDown } from 'lucide-react'

export function ThreeDAttributePanel() {
  return (
    <div className="p-4 flex flex-col gap-6">
      {/* 치수 설정 */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[10px] font-extrabold text-[#3B45B3]">치수 설정</h3>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[#ADB5BD]">너비 (MM)</label>
            <div className="relative">
              <input 
                type="text" 
                value="4,000" 
                readOnly
                className="w-full h-8 px-3 rounded-lg bg-[#F8F9FD] border-none text-[11px] font-bold text-[#1C1C1E] focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#ADB5BD]">높이 (MM)</label>
              <div className="relative">
                <input 
                  type="text" 
                  value="2,400" 
                  readOnly
                  className="w-full h-8 px-3 rounded-lg bg-[#F8F9FD] border-none text-[11px] font-bold text-[#1C1C1E] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#ADB5BD]">두께</label>
              <div className="relative">
                <input 
                  type="text" 
                  value="200" 
                  readOnly
                  className="w-full h-8 px-3 rounded-lg bg-[#F8F9FD] border-none text-[11px] font-bold text-[#1C1C1E] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 재질 */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[10px] font-extrabold text-[#3B45B3]">재질</h3>
        <div className="relative">
          <div className="w-full h-9 pl-9 pr-8 rounded-xl bg-[#F8F9FD] flex items-center text-[11px] font-bold text-[#1C1C1E] cursor-pointer">
            콘크리트
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#C8CACC] rounded-sm" />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD]" />
        </div>
      </div>

      {/* 색상 */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[10px] font-extrabold text-[#3B45B3]">색상</h3>
        <div className="relative">
          <div className="w-full h-9 pl-9 pr-8 rounded-xl bg-[#F8F9FD] flex items-center text-[11px] font-bold text-[#1C1C1E] cursor-pointer">
            회색
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#BEC4D1] rounded-sm" />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD]" />
        </div>
      </div>

      <div className="w-full h-px bg-[#F0F2F9]" />

      {/* 계산 면적 */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#8E95A3]">계산 면적</span>
        <span className="text-[13px] font-black text-[#3B45B3]">12.00 m²</span>
      </div>
    </div>
  )
}

