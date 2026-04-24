// 캔버스 줌 컨트롤
// 캔버스 좌하단에 고정 표시되는 줌 인/아웃 및 핸드 툴 버튼 모음.

import { Search, Plus, Hand } from 'lucide-react'

export default function CanvasZoomControl() {
  return (
    <div className="absolute bottom-6 left-6 flex items-center gap-1 bg-white/80 backdrop-blur-md border border-[#E2E6EF] rounded-2xl p-1 shadow-lg z-10">
      <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors">
        <Search size={16} />
      </button>
      <div className="text-[11px] font-bold text-[#1C1C1E] min-w-[36px] text-center">100%</div>
      <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors">
        <Plus size={16} />
      </button>
      <div className="w-px h-4 bg-[#E2E6EF] mx-1" />
      <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors">
        <Hand size={16} />
      </button>
    </div>
  )
}
