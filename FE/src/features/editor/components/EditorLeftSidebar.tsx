import {
  MousePointer2,
  PlusCircle,
  TrendingUp,
  Trash2,
  MessagesSquare,
  Brain,
  Square,
  DoorOpen,
  Layout,
  Grid3X3,
  Box,
  Home,
} from 'lucide-react'
import type { EditorMode } from '../types'

interface EditorLeftSidebarProps {
  mode: EditorMode
  isLineStyleModalOpen: boolean
  onAddSpace: () => void
  onLineStyle: () => void
  onToggleCollaboration?: () => void
}

/** 왼쪽 도구 사이드바 — 모드에 따라 도구가 변경됨 */
export default function EditorLeftSidebar({
  mode,
  isLineStyleModalOpen,
  onAddSpace,
  onLineStyle,
  onToggleCollaboration,
}: EditorLeftSidebarProps) {
  return (
    <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl py-6 shadow-sm shrink-0 self-start mt-0 h-full">
      <div className="w-full h-full min-h-0 flex flex-col items-center overflow-x-visible">
        {/* 상단 도구 */}
        <div className="flex flex-col items-center gap-2 w-full px-1">
          <button className="w-full flex flex-col items-center gap-1 py-2 group">
            <div className="p-2.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl transition-all shadow-sm group-hover:scale-105">
              <MousePointer2 size={24} fill="#3B45B3" fillOpacity={0.1} />
            </div>
            <span className="text-[10px] font-bold text-[#3B45B3]">선택</span>
          </button>

          {mode === 'bubble' ? (
            <>
              <button onClick={onAddSpace} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <PlusCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">공간 추가</span>
              </button>

              <button onClick={onLineStyle} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div
                  className={`p-2 rounded-xl transition-all ${
                    isLineStyleModalOpen
                      ? 'bg-[#F0F2FF] text-[#3B45B3]'
                      : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
                  }`}
                >
                  <TrendingUp size={24} />
                </div>
                <span
                  className={`text-[10px] font-bold transition-all ${
                    isLineStyleModalOpen ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
                  }`}
                >
                  선 스타일
                </span>
              </button>
            </>
          ) : mode === '2d' ? (
            <>
              <button className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <Square size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">벽체</span>
              </button>

              <button className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <DoorOpen size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">문</span>
              </button>

              <button className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <Layout size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">창호</span>
              </button>
            </>
          ) : (
            <>
              <button className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <Box size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">투시</span>
              </button>

              <button className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <Grid3X3 size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">그리드</span>
              </button>

              <button className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <Home size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">라이브러리</span>
              </button>
            </>
          )}

          {mode !== '3d' && (
            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#E03131] rounded-xl transition-all">
                <Trash2 size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#E03131]">삭제</span>
            </button>
          )}

          {mode === '2d' && (
            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                <Grid3X3 size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">그리드</span>
            </button>
          )}
        </div>

        {/* 하단 도구 (mt-auto로 사이드바 하단 고정) */}
        <div className="mt-auto flex flex-col items-center gap-4 w-full px-1">
          <button 
            onClick={(mode === '2d' || mode === '3d') ? onToggleCollaboration : undefined}
            className="w-full flex flex-col items-center gap-1 py-1 group"
          >
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
      </div>
    </aside>
  )
}
