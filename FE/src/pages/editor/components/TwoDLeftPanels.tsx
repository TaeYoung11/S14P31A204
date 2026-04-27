import { Eye, Lock, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react'

export function TwoDLeftPanels() {
  return (
    <div className="absolute top-6 left-6 flex flex-col gap-4 z-10 bottom-24 pointer-events-none">
      {/* 층 보기 패널 */}
      <div className="w-[200px] bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden pointer-events-auto">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0F2F9]">
          <span className="text-[11px] font-extrabold text-[#1C1C1E]">층 보기</span>
          <button className="text-[#ADB5BD] hover:text-[#505764] transition-colors">
            <Plus size={14} />
          </button>
        </div>
        <div className="p-2 flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 py-1.5 hover:bg-[#F8F9FD] rounded-lg group">
            <div className="flex items-center gap-2">
              <Eye size={12} className="text-[#3B45B3]" />
              <span className="text-[11px] font-bold text-[#1C1C1E]">1층 평면도</span>
            </div>
            <Lock size={12} className="text-[#ADB5BD] group-hover:text-[#505764]" />
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 hover:bg-[#F8F9FD] rounded-lg group">
            <div className="flex items-center gap-2">
              <Eye size={12} className="text-[#3B45B3]" />
              <span className="text-[11px] font-bold text-[#1C1C1E]">대지 면적</span>
            </div>
            <Lock size={12} className="text-[#ADB5BD] group-hover:text-[#505764]" />
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* 계층 구조 패널 */}
      <div className="w-[200px] bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden pointer-events-auto">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0F2F9]">
          <span className="text-[11px] font-extrabold text-[#1C1C1E]">계층 구조</span>
          <button className="text-[#ADB5BD] hover:text-[#505764] transition-colors">
            <Minus size={14} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {/* Living Room */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <ChevronDown size={12} className="text-[#1C1C1E]" />
              <div className="w-1 h-3 bg-[#1C1C1E] rounded-sm" />
              <div className="w-1 h-3 bg-[#1C1C1E] rounded-sm mr-1" />
              <span className="text-[11px] font-bold text-[#1C1C1E]">[Living Room]</span>
            </div>
            
            <div className="pl-6 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Minus size={12} className="text-[#ADB5BD]" />
                <div className="w-0.5 h-3 bg-[#1C1C1E] rounded-sm mr-1" />
                <span className="text-[11px] font-bold text-[#1C1C1E]">_01</span>
              </div>
              <div className="pl-5 flex items-center gap-1.5">
                <div className="w-2 h-2 border border-[#ADB5BD] rounded-sm" />
                <span className="text-[10px] font-medium text-[#6B7A99]">여닫이 문</span>
              </div>
            </div>
          </div>

          {/* 01 */}
          <div className="flex items-center gap-1.5 mt-2">
            <ChevronRight size={12} className="text-[#ADB5BD]" />
            <div className="w-1 h-3 bg-[#ADB5BD] rounded-sm" />
            <div className="w-1 h-3 bg-[#ADB5BD] rounded-sm mr-1" />
            <span className="text-[11px] font-bold text-[#1C1C1E]">01</span>
          </div>
        </div>
      </div>
    </div>
  )
}
