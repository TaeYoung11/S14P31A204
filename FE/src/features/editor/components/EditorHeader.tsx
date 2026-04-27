import { Share2, Save } from 'lucide-react'

/** 에디터 최상단 헤더 — 프로젝트명, 네비게이션, 저장/공유 */
export default function EditorHeader() {
  return (
    <header className="h-12 bg-white border-b border-[#E2E6EF] flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
      <div className="flex items-center gap-8">
        <div className="text-sm font-black tracking-tighter text-[#1C1C1E]">
          <span className="opacity-60">바탕:</span> BATANG
        </div>
        <nav className="flex items-center gap-6">
          <button className="text-xs font-bold text-[#3B45B3] border-b-2 border-[#3B45B3] h-12 flex items-center">
            워크스페이스
          </button>
          <button className="text-xs font-medium text-[#8E95A3] h-12 flex items-center hover:text-[#3B45B3] transition-colors">
            뷰어
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 text-[#8E95A3] hover:bg-[#F0F2F9] rounded-lg transition-colors">
          <Share2 size={18} />
        </button>
        <button className="bg-[#3B45B3] text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-[#2D3691] shadow-[#3B45B3]/20 transition-all flex items-center gap-2">
          <Save size={14} />
          저장
        </button>
      </div>
    </header>
  )
}
