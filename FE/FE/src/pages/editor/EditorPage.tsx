import { useSearchParams } from 'react-router-dom'
import {
  MousePointer2,
  PlusCircle,
  TrendingUp,
  Trash2,
  MessagesSquare,
  Sparkles,
  Share2,
  Save,
  Undo2,
  Redo2,
  Search,
  Minus,
  Plus,
  Hand,
  ChevronDown,
  Brain
} from 'lucide-react'

// 편집 화면에서 사용되는 모드 타입
// URL: /projects/:projectId/editor?mode=bubble|2d|3d
export type EditorMode = 'bubble' | '2d' | '3d'

export default function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // mode 파라미터 없을 경우 기본값은 bubble (버블 다이어그램)
  const mode = (searchParams.get('mode') ?? 'bubble') as EditorMode

  const setMode = (newMode: EditorMode) => {
    setSearchParams({ mode: newMode })
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
      {/* --- Header --- */}
      <header className="h-12 bg-white border-b border-[#E2E6EF] flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="text-sm font-black tracking-tighter text-[#1C1C1E]">
            <span className="opacity-60">바탕:</span> BATANG
          </div>
          <nav className="flex items-center gap-6">
            <button className="text-xs font-bold text-[#3B45B3] border-b-2 border-[#3B45B3] h-12 flex items-center">워크스페이스</button>
            <button className="text-xs font-medium text-[#8E95A3] h-12 flex items-center hover:text-[#3B45B3] transition-colors">뷰어</button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-[#8E95A3] hover:bg-[#F0F2F9] rounded-lg transition-colors">
            <Share2 size={18} />
          </button>
          <button className="bg-[#3B45B3] text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-[#2D3691] shadow-[#3B45B3]/20 transition-all flex items-center gap-2">
            <Save size={14} />
            Save
          </button>
        </div>
      </header>

      {/* --- Workspace Toolbar --- */}
      <div className="h-14 flex items-center justify-between px-6 shrink-0 z-40">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-[#1C1C1E]">판교 테크 센터</h1>
        </div>

        {/* Mode Toggle & History */}
        <div className="flex items-center gap-6">
          <div className="bg-[#E2E6EF] p-1 rounded-full flex items-center gap-1">
            {(['bubble', '2d', '3d'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${mode === m
                    ? 'bg-white text-[#3B45B3] shadow-sm'
                    : 'text-[#8E95A3] hover:text-[#505764]'
                  }`}
              >
                {m === 'bubble' ? 'Bubble' : m === '2d' ? '2D Plan' : '3D View'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-6 text-[#8E95A3]">
            <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Undo2 size={18} />
            </button>
            <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Redo2 size={18} />
            </button>
          </div>
        </div>
        <div className="w-[100px]" /> {/* Spacer to balance title */}
      </div>

      <div className="flex flex-1 relative overflow-hidden px-6 pb-6 gap-6">
        {/* --- Left Sidebar --- */}
        <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl flex flex-col items-center py-6 gap-4 shadow-sm shrink-0 self-start mt-0 h-full overflow-y-auto overflow-x-hidden">
          {/* Top Tools */}
          <div className="flex flex-col items-center gap-2 w-full">
            <button className="w-full flex flex-col items-center gap-1 py-2 group">
              <div className="p-2.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl transition-all shadow-sm group-hover:scale-105">
                <MousePointer2 size={24} fill="#3B45B3" fillOpacity={0.1} />
              </div>
              <span className="text-[10px] font-bold text-[#3B45B3]">선택</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                <PlusCircle size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">공간 추가</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                <TrendingUp size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">선 스타일</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#E03131] rounded-xl transition-all">
                <Trash2 size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#E03131]">삭제</span>
            </button>
          </div>

          {/* Bottom Tools */}
          <div className="mt-auto flex flex-col items-center gap-4 w-full">
            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#3B45B3] group-hover:bg-[#F0F2FF] rounded-xl transition-all">
                <MessagesSquare size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#3B45B3]">협업</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#3B45B3] rounded-xl transition-all">
                <Brain size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#3B45B3]">AI</span>
            </button>
          </div>
        </aside>

        {/* --- Main Canvas --- */}
        <main className="flex-1 bg-white border border-[#E2E6EF] rounded-3xl shadow-sm relative overflow-hidden">
          {/* Canvas placeholder */}
          <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10">
            {mode === 'bubble' && '버블 다이어그램 캔버스\n(기존 기능 보존 및 구조 유지)'}
            {mode === '2d' && '2D 평면도 캔버스\n(기존 기능 보존 및 구조 유지)'}
            {mode === '3d' && '3D 뷰어 캔버스\n(기존 기능 보존 및 구조 유지)'}
          </div>

          {/* Bottom Zoom Controls */}
          <div className="absolute bottom-6 left-6 flex items-center gap-1 bg-white/80 backdrop-blur-md border border-[#E2E6EF] rounded-2xl p-1 shadow-lg">
            <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"><Search size={16} /></button>
            <div className="text-[11px] font-bold text-[#1C1C1E] min-w-[36px] text-center">100 %</div>
            <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"><Plus size={16} /></button>
            <div className="w-px h-4 bg-[#E2E6EF] mx-1" />
            <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"><Hand size={16} /></button>
          </div>
        </main>

        {/* --- Right Side Panels --- */}
        <div className="w-[300px] flex flex-col gap-6 shrink-0">
          {/* Attribute Manager */}
          <section className="bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between">
              <h2 className="text-xs font-extrabold text-[#1C1C1E]">속성 관리자</h2>
              <Minus size={14} className="text-[#ADB5BD]" />
            </div>
            <div className="p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-[#3B45B3]">치수 설정</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Length (mm)</label>
                    <input type="text" defaultValue="4,000" className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Width (mm)</label>
                    <input type="text" defaultValue="3,000" className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Height (mm)</label>
                    <input type="text" defaultValue="2,400" className="bg-[#ADB5BD]/10 border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#ADB5BD] outline-none cursor-not-allowed" disabled />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Thickness</label>
                    <input type="text" defaultValue="200" className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none" />
                  </div>
                </div>
              </div>

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

              <div className="mt-2 pt-5 border-t border-[#F0F2F9] flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
                <span className="text-sm font-black text-[#3B45B3]">12.00 m²</span>
              </div>
            </div>
          </section>

          {/* AI Assistant */}
          <section className="bg-[#3B45B3] rounded-2xl shadow-lg shadow-[#3B45B3]/20 overflow-hidden flex flex-col mt-auto">
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Sparkles size={14} fill="white" />
                <h2 className="text-[11px] font-extrabold uppercase tracking-wider">AI 어시스턴트</h2>
              </div>
              <Minus size={14} className="text-white/40" />
            </div>
            <div className="p-4">
              <div className="bg-white rounded-xl p-4 shadow-inner relative">
                <div className="text-[11px] leading-relaxed text-[#1C1C1E] font-medium">
                  거실 공간에 비해 창문 크기가 작습니다.
                  <br />
                  채광 효율을 위해 창문 너비를 1200mm에서 <span className="text-[#3B45B3] font-bold">1800mm</span>로 확장할까요?
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
