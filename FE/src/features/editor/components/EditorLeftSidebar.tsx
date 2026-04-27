import {
  MousePointer2,
  PlusCircle,
  TrendingUp,
  Trash2,
  MessagesSquare,
  Brain,
  Square,
  DoorOpen,
  LayoutGrid,
  Grid3X3,
  Home,
  Download,
  Hand,
} from 'lucide-react'
import type { EditorMode } from '../types'

// ── 스타일 유틸 ───────────────────────────────────────────────────────────────

/** 일반 도구 버튼 활성/비활성 스타일 */
function getToolStyle(isActive: boolean) {
  return isActive
    ? {
        container: 'p-2.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl transition-all shadow-sm group-hover:scale-105',
        text: 'text-[10px] font-bold text-[#3B45B3]',
      }
    : {
        container: 'p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all',
        text: 'text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]',
      }
}

/** 삭제 도구 버튼 스타일 (빨간색 테마) */
function getDeleteStyle(isActive: boolean) {
  return isActive
    ? {
        container: 'p-2.5 text-[#E03131] bg-[#FFF5F5] rounded-xl transition-all shadow-sm group-hover:scale-105',
        text: 'text-[10px] font-bold text-[#E03131]',
      }
    : {
        container: 'p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#E03131] rounded-xl transition-all',
        text: 'text-[10px] font-bold text-[#8E95A3] group-hover:text-[#E03131]',
      }
}

// ── 공통 서브컴포넌트 ─────────────────────────────────────────────────────────

interface ToolButtonBaseProps {
  selectedTool: string
  onToolSelect: (tool: string) => void
}

/**
 * 선택/패닝 토글 버튼
 * - 'hand' 도구일 때: 손 아이콘 + "패닝" 레이블 표시
 * - 그 외: 화살표 아이콘 + "선택" 레이블 표시
 * - 클릭하면 항상 'selection' 도구로 복귀
 */
function SelectionToolButton({ selectedTool, onToolSelect }: ToolButtonBaseProps) {
  const isActive = selectedTool === 'selection' || selectedTool === 'hand'
  const style = getToolStyle(isActive)

  return (
    <button onClick={() => onToolSelect('selection')} className="w-full flex flex-col items-center gap-1 py-1 group">
      <div className={style.container}>
        {selectedTool === 'hand' ? (
          <Hand size={24} />
        ) : (
          <MousePointer2 size={24} fill={isActive ? '#3B45B3' : 'none'} fillOpacity={isActive ? 0.1 : 0} />
        )}
      </div>
      <span className={style.text}>{selectedTool === 'hand' ? '패닝' : '선택'}</span>
    </button>
  )
}

/** 삭제 도구 버튼 */
function DeleteToolButton({ selectedTool, onToolSelect }: ToolButtonBaseProps) {
  const style = getDeleteStyle(selectedTool === 'delete')

  return (
    <button onClick={() => onToolSelect('delete')} className="w-full flex flex-col items-center gap-1 py-1 group">
      <div className={style.container}>
        <Trash2 size={24} />
      </div>
      <span className={style.text}>삭제</span>
    </button>
  )
}

interface GridToggleButtonProps {
  isGridVisible?: boolean
  onToggleGrid?: () => void
}

/** 그리드 표시 토글 버튼 */
function GridToggleButton({ isGridVisible, onToggleGrid }: GridToggleButtonProps) {
  return (
    <button onClick={onToggleGrid} className="w-full flex flex-col items-center gap-1 py-1 group">
      <div className={`p-2 rounded-xl transition-all ${
        isGridVisible
          ? 'bg-[#F0F2FF] text-[#3B45B3]'
          : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
      }`}>
        <Grid3X3 size={24} />
      </div>
      <span className={`text-[10px] font-bold transition-all ${
        isGridVisible ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
      }`}>
        그리드
      </span>
    </button>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface EditorLeftSidebarProps {
  mode: EditorMode
  isLineStyleModalOpen: boolean
  isLibraryOpen?: boolean
  isGridVisible?: boolean
  selectedTool: string
  onToolSelect: (tool: string) => void
  onAddSpace: () => void
  onLineStyle: () => void
  onToggleCollaboration?: () => void
  onToggleLibrary?: () => void
  onToggleGrid?: () => void
  onExportIFC?: () => void
}

/**
 * 에디터 왼쪽 도구 사이드바
 * 모드(버블/2D/3D)에 따라 적절한 도구 버튼 세트를 노출한다.
 * 하단 협업·AI 버튼은 2D·3D 모드에서만 표시.
 */
export default function EditorLeftSidebar({
  mode,
  isLineStyleModalOpen,
  isLibraryOpen,
  isGridVisible,
  selectedTool,
  onToolSelect,
  onAddSpace,
  onLineStyle,
  onToggleCollaboration,
  onToggleLibrary,
  onToggleGrid,
  onExportIFC,
}: EditorLeftSidebarProps) {
  return (
    <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl py-4 shadow-sm shrink-0 self-start mt-0 h-full flex flex-col overflow-hidden">
      {/* 스크롤 가능한 도구 영역 */}
      <div className="w-full flex-1 flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
        <div className="flex flex-col items-center gap-2 w-full px-1">

          {/* ── 버블 다이어그램 모드 도구 ─────────────────────────────────── */}
          {mode === 'bubble' && (
            <>
              <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />

              <button onClick={onAddSpace} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <PlusCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">공간추가</span>
              </button>

              <button onClick={onLineStyle} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className={`p-2 rounded-xl transition-all ${
                  isLineStyleModalOpen
                    ? 'bg-[#F0F2FF] text-[#3B45B3]'
                    : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
                }`}>
                  <TrendingUp size={24} />
                </div>
                <span className={`text-[10px] font-bold transition-all ${
                  isLineStyleModalOpen ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
                }`}>
                  선스타일
                </span>
              </button>

              <DeleteToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
            </>
          )}

          {/* ── 2D 평면도 모드 도구 ───────────────────────────────────────── */}
          {mode === '2d' && (
            <>
              <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />

              <button onClick={() => onToolSelect('wall')} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className={getToolStyle(selectedTool === 'wall').container}>
                  <Square size={24} />
                </div>
                <span className={getToolStyle(selectedTool === 'wall').text}>벽체</span>
              </button>

              <button onClick={() => onToolSelect('door')} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className={getToolStyle(selectedTool === 'door').container}>
                  <DoorOpen size={24} />
                </div>
                <span className={getToolStyle(selectedTool === 'door').text}>문</span>
              </button>

              <button onClick={() => onToolSelect('window')} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className={getToolStyle(selectedTool === 'window').container}>
                  <LayoutGrid size={24} />
                </div>
                <span className={getToolStyle(selectedTool === 'window').text}>창문</span>
              </button>

              <DeleteToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
              <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />
            </>
          )}

          {/* ── 3D 뷰어 모드 도구 ────────────────────────────────────────── */}
          {mode === '3d' && (
            <>
              <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
              <DeleteToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
              <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />

              <button onClick={onToggleLibrary} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className={`p-2 rounded-xl transition-all ${
                  isLibraryOpen
                    ? 'bg-[#F0F2FF] text-[#3B45B3]'
                    : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
                }`}>
                  <Home size={24} />
                </div>
                <span className={`text-[10px] font-bold transition-all ${
                  isLibraryOpen ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
                }`}>
                  라이브러리
                </span>
              </button>

              <button onClick={onExportIFC} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#3B45B3] rounded-xl transition-all">
                  <Download size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#3B45B3]">IFC 내보내기</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 하단 협업·AI 버튼 — 2D·3D 모드에서만 표시 */}
      {(mode === '2d' || mode === '3d') && (
        <div className="flex flex-col items-center gap-2 w-full px-1 py-4 border-t border-[#F0F2F9] bg-white">
          <button onClick={onToggleCollaboration} className="w-full flex flex-col items-center gap-1 py-1 group">
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
      )}
    </aside>
  )
}
