// 편집기 좌측 도구 사이드바
// 선택, 공간 추가, 선 스타일, 삭제 등 편집 도구와 협업·AI 버튼을 제공한다.

import { MousePointer2, PlusCircle, TrendingUp, Trash2, MessagesSquare, Brain } from 'lucide-react'
import { DrawingConnection } from '../types'

interface EditorSidebarProps {
  onOpenAddModal: () => void
  onOpenLineModal: () => void
  isLineModalOpen: boolean
  /** 연결선 그리기 모드 상태 (활성 시 선 스타일 버튼 하이라이트) */
  drawingConnection: DrawingConnection | null
}

export default function EditorSidebar({
  onOpenAddModal,
  onOpenLineModal,
  isLineModalOpen,
  drawingConnection,
}: EditorSidebarProps) {
  const lineActive = isLineModalOpen || !!drawingConnection

  return (
    <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl flex flex-col items-center py-6 gap-4 shadow-sm shrink-0 h-full overflow-y-auto overflow-x-hidden">
      {/* 상단 편집 도구 */}
      <div className="flex flex-col items-center gap-2 w-full">

        {/* 선택 도구 (기본 활성 상태) */}
        <button className="w-full flex flex-col items-center gap-1 py-2 group">
          <div className="p-2.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl transition-all shadow-sm group-hover:scale-105">
            <MousePointer2 size={24} fill="#3B45B3" fillOpacity={0.1} />
          </div>
          <span className="text-[10px] font-bold text-[#3B45B3]">선택</span>
        </button>

        {/* 공간 추가 — 버블 생성 모달 열기 */}
        <button
          onClick={onOpenAddModal}
          className="w-full flex flex-col items-center gap-1 py-1 group"
        >
          <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
            <PlusCircle size={24} />
          </div>
          <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">공간 추가</span>
        </button>

        {/* 선 스타일 — 연결선 또는 자유 선 생성 모달 열기 */}
        <button
          onClick={onOpenLineModal}
          className="w-full flex flex-col items-center gap-1 py-1 group"
        >
          <div className={`p-2 rounded-xl transition-all ${
            lineActive
              ? 'bg-[#F0F2FF] text-[#3B45B3]'
              : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
          }`}>
            <TrendingUp size={24} />
          </div>
          <span className={`text-[10px] font-bold transition-all ${
            lineActive ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
          }`}>
            선 스타일
          </span>
        </button>

        {/* 삭제 */}
        <button className="w-full flex flex-col items-center gap-1 py-1 group">
          <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#E03131] rounded-xl transition-all">
            <Trash2 size={24} />
          </div>
          <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#E03131]">삭제</span>
        </button>
      </div>

      {/* 하단 협업·AI 도구 */}
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
  )
}
