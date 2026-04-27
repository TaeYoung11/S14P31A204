import { useState } from 'react'
import { Info, Plus, Minus, Compass, Download } from 'lucide-react'

interface RealisticViewerProps {
  onExport?: () => void
}

/** 실사 렌더링 뷰어 컴포넌트 — 3D 모델의 고해상도 렌더링 화면을 시뮬레이션 */
export function RealisticViewer({ onExport }: RealisticViewerProps) {
  const [activeView, setActiveView] = useState(1) // 0=Daylight, 1=Dusk, 2=Night, 3=Interior

  return (
    <div className="absolute inset-0 bg-[#0A0A0B] overflow-hidden flex items-center justify-center animate-in fade-in duration-700">
      {/* 실사 렌더링 배경 이미지 */}
      <div className="absolute inset-0">
        <img
          src="/luxury_house_render.png"
          alt="Luxury House Photorealistic Render"
          className="w-full h-full object-cover opacity-90"
        />
        {/* 깊이감 그라디언트 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
      </div>

      {/* 프로젝트 정보 패널 (우측 상단) */}
      <div className="absolute top-10 right-10 w-[280px] bg-[#1C1C1E]/60 backdrop-blur-2xl border border-white/10 rounded-[24px] p-6 text-white shadow-2xl animate-in slide-in-from-right-4 duration-500 delay-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <h3 className="text-sm font-black tracking-tight text-white/90">프로젝트 정보</h3>
            <span className="text-[10px] font-bold text-white/40">PROJECT SPECIFICATIONS</span>
          </div>
          <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center border border-white/5">
            <Info size={16} className="text-white/60" />
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">코드명</span>
            <span className="text-xs font-black tracking-wider">MM-24-0015</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">최근 업데이트</span>
            <span className="text-xs font-black">2024.05.24</span>
          </div>
          <div className="h-px bg-white/10 my-1" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">버전</span>
            <span className="text-xs font-black text-[#60A5FA]">V 1.2.4 (FINAL)</span>
          </div>
        </div>

        {/* 내보내기 버튼 */}
        <button
          onClick={onExport}
          className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/15 rounded-2xl text-[12px] font-black text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Download size={14} />
          프로젝트 내보내기
        </button>
      </div>

      {/* 줌 컨트롤 위젯 (좌측 하단) */}
      <div className="absolute bottom-12 left-12 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500 delay-300">
        <div className="flex flex-col bg-[#1C1C1E]/60 backdrop-blur-xl border border-white/10 rounded-[20px] shadow-2xl overflow-hidden">
          <button className="p-3.5 text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 hover:text-white">
            <Plus size={22} />
          </button>
          <button className="p-3.5 text-white/80 hover:bg-white/10 transition-colors hover:text-white">
            <Minus size={22} />
          </button>
        </div>

        <button className="w-14 h-14 bg-[#3B45B3]/80 backdrop-blur-xl border border-white/20 rounded-[20px] flex items-center justify-center text-white shadow-[0_10px_30px_rgba(59,69,179,0.3)] hover:bg-[#3B45B3] hover:scale-105 active:scale-95 transition-all">
          <Compass size={26} />
        </button>
      </div>

      {/* 뷰 선택기 (상단 중앙) */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#1C1C1E]/60 backdrop-blur-2xl border border-white/10 rounded-full p-1.5 flex gap-1 shadow-2xl">
        {['Daylight', 'Dusk', 'Night', 'Interior'].map((v, i) => (
          <button
            key={v}
            onClick={() => setActiveView(i)}
            className={`px-6 py-2 rounded-full text-[11px] font-black tracking-tight transition-all ${
              activeView === i
                ? 'bg-white text-[#1C1C1E] shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* 내비게이션 단축키 도움말 (우측 하단) */}
      <div className="absolute bottom-12 right-12 flex items-center gap-4">
        <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl text-[10px] font-bold text-white/60 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-white/10 rounded border border-white/10 text-white">ESC</kbd>
            <span>워크스페이스로 복귀</span>
          </div>
        </div>
      </div>
    </div>
  )
}
