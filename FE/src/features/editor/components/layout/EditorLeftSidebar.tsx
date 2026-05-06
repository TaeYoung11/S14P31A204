import {
  MousePointer2,
  PlusCircle,
  TrendingUp,
  Sparkles,
  Trash2,
  MessagesSquare,
  Brain,
  Square,
  DoorOpen,
  LayoutGrid,
  Scaling,
  Grid3X3,
  Home,
  Hand,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'
import type { EditorMode } from '../../types'

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

interface Tool2DItem {
  id: string
  icon: LucideIcon
  label: string
}

/** 2D 평면도 모드에서 사용 가능한 도구 목록 */
const TOOLS_2D: Tool2DItem[] = [
  { id: 'wall', icon: Square, label: '벽' },
  { id: 'door', icon: DoorOpen, label: '문' },
  { id: 'window', icon: LayoutGrid, label: '창문' },
  { id: 'resize', icon: Scaling, label: '크기' },
]

interface ToolButtonBaseProps {
  selectedTool: string
  onToolSelect: (tool: string) => void
  hasDeletableSelection?: boolean
  onDeleteSelected?: () => void
}

/**
 * 선택 도구 버튼
 * - hand 도구 활성 중에는 '패닝' 레이블로 표시
 * - 클릭 시 항상 selection 도구로 복귀
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
function DeleteToolButton({ selectedTool, onToolSelect, hasDeletableSelection = false, onDeleteSelected }: ToolButtonBaseProps) {
  const style = getDeleteStyle(selectedTool === 'delete' || hasDeletableSelection)

  return (
    <button
      onClick={() => {
        if (hasDeletableSelection && onDeleteSelected) {
          onDeleteSelected()
          onToolSelect('selection')
          return
        }
        onToolSelect(selectedTool === 'delete' ? 'selection' : 'delete')
      }}
      className="w-full flex flex-col items-center gap-1 py-1 group"
    >
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
      <div className={`p-2 rounded-xl transition-all ${isGridVisible
        ? 'bg-[#F0F2FF] text-[#3B45B3]'
        : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
        }`}>
        <Grid3X3 size={24} />
      </div>
      <span className={`text-[10px] font-bold transition-all ${isGridVisible ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
        }`}>
        그리드</span>
    </button>
  )
}

interface EditorLeftSidebarProps {
  mode: EditorMode
  isLineStyleModalOpen: boolean
  isLibraryOpen?: boolean
  isGridVisible?: boolean
  selectedTool: string
  onToolSelect: (tool: string) => void
  onAddSpace: () => void
  onToggleCollaboration?: () => void
  onToggleLibrary?: () => void
  onToggleGrid?: () => void
  onGenerateFloorPlan?: () => void
  onAutoLayoutBubbles?: () => void
  canGenerateFloorPlan?: boolean
  canAutoLayoutBubbles?: boolean
  isFloorPlanGenerated?: boolean
  isBubbleReadOnly?: boolean
  isEditorReadOnly?: boolean
  hasDeletableSelection?: boolean
  onDeleteSelected?: () => void
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
  onToggleCollaboration,
  onToggleLibrary,
  onToggleGrid,
  onGenerateFloorPlan,
  onAutoLayoutBubbles,
  canGenerateFloorPlan = false,
  canAutoLayoutBubbles = false,
  isFloorPlanGenerated = false,
  isBubbleReadOnly = false,
  isEditorReadOnly = false,
  hasDeletableSelection = false,
  onDeleteSelected,
}: EditorLeftSidebarProps) {
  const canStartFloorPlanGeneration = canGenerateFloorPlan && !isFloorPlanGenerated && !isEditorReadOnly
  const canStartBubbleAutoLayout = canAutoLayoutBubbles && !isBubbleReadOnly
  const floorPlanGenerateTitle = isFloorPlanGenerated
    ? '이미 생성된 2D 도면은 2D 모드에서 수정하세요.'
    : canGenerateFloorPlan
      ? '버블 다이어그램으로 2D 도면 생성'
      : '버블이 1개 이상 필요합니다.'
  const bubbleAutoLayoutTitle = isBubbleReadOnly
    ? '읽기 전용 상태에서는 자동 배치를 사용할 수 없습니다.'
    : canAutoLayoutBubbles
      ? '버블과 연결 관계를 기준으로 자동 배치'
      : '버블이 2개 이상 필요합니다.'

  if (isEditorReadOnly) {
    return (
      <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl py-4 shadow-sm shrink-0 self-start mt-0 h-full flex flex-col overflow-hidden">
        <div className="w-full flex-1 flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
          <div className="flex flex-col items-center gap-2 w-full px-1">
            <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
            {(mode === '2d' || mode === '3d') && (
              <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />
            )}
          </div>
        </div>

        {(mode === '2d' || mode === '3d') && (
          <div className="flex flex-col items-center gap-2 w-full px-1 py-4 border-t border-[#F0F2F9] bg-white">
            <button onClick={onToggleCollaboration} className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#3B45B3] group-hover:bg-[#F0F2FF] rounded-xl transition-all">
                <MessagesSquare size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#3B45B3]">협업</span>
            </button>
          </div>
        )}
      </aside>
    )
  }

  return (
    <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl py-4 shadow-sm shrink-0 self-start mt-0 h-full flex flex-col overflow-hidden">
      {/* 스크롤 가능한 도구 영역 */}
      <div className="w-full flex-1 flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
        <div className="flex flex-col items-center gap-2 w-full px-1">
          {/* 버블 다이어그램 모드 도구 */}
          {mode === 'bubble' && (
            <>
              <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />

              <button
                onClick={isBubbleReadOnly ? undefined : onAddSpace}
                disabled={isBubbleReadOnly}
                className="w-full flex flex-col items-center gap-1 py-1 group disabled:cursor-not-allowed"
              >
                <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                  <PlusCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">공간추가</span>
              </button>

              {/* 선스타일 = 연결 도구 + 관계 유형 설정 통합 */}
              <button
                onClick={isBubbleReadOnly ? undefined : () => onToolSelect(selectedTool === 'connect' ? 'selection' : 'connect')}
                disabled={isBubbleReadOnly}
                className="w-full flex flex-col items-center gap-1 py-1 group disabled:cursor-not-allowed"
              >
                <div className={`p-2 rounded-xl transition-all ${!isBubbleReadOnly && (selectedTool === 'connect' || isLineStyleModalOpen)
                  ? 'bg-[#F0F2FF] text-[#3B45B3] shadow-sm'
                  : isBubbleReadOnly
                    ? 'text-[#D9DEF0]'
                    : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
                  }`}>
                  <TrendingUp size={24} />
                </div>
                <span className={`text-[10px] font-bold transition-all ${!isBubbleReadOnly && (selectedTool === 'connect' || isLineStyleModalOpen)
                  ? 'text-[#3B45B3]'
                  : isBubbleReadOnly
                    ? 'text-[#D9DEF0]'
                    : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
                  }`}>
                  선스타일
                </span>
              </button>

              <button
                onClick={onAutoLayoutBubbles}
                disabled={!canStartBubbleAutoLayout}
                title={bubbleAutoLayoutTitle}
                className="w-full flex flex-col items-center gap-1 py-1 group disabled:cursor-not-allowed"
              >
                <div className={`p-2 rounded-xl transition-all ${canStartBubbleAutoLayout
                  ? 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#3B45B3]'
                  : 'text-[#D9DEF0]'
                  }`}>
                  <Sparkles size={24} />
                </div>
                <span className={`text-[10px] font-bold transition-all ${canStartBubbleAutoLayout ? 'text-[#8E95A3] group-hover:text-[#3B45B3]' : 'text-[#D9DEF0]'
                  }`}>
                  자동배치
                </span>
              </button>

              <button
                onClick={onGenerateFloorPlan}
                disabled={!canStartFloorPlanGeneration}
                title={floorPlanGenerateTitle}
                className="w-full flex flex-col items-center gap-1 py-1 group disabled:cursor-not-allowed"
              >
                <div className={`p-2 rounded-xl transition-all ${canStartFloorPlanGeneration
                  ? 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#3B45B3]'
                  : 'text-[#D9DEF0]'
                  }`}>
                  <LayoutDashboard size={24} />
                </div>
                <span className={`text-[10px] font-bold transition-all ${canStartFloorPlanGeneration ? 'text-[#8E95A3] group-hover:text-[#3B45B3]' : 'text-[#D9DEF0]'
                  }`}>
                  평면도생성
                </span>
              </button>

              {isBubbleReadOnly ? (
                <button disabled className="w-full flex flex-col items-center gap-1 py-1 cursor-not-allowed">
                  <div className="p-2 text-[#D9DEF0] rounded-xl transition-all">
                    <Trash2 size={24} />
                  </div>
                  <span className="text-[10px] font-bold text-[#D9DEF0]">삭제</span>
                </button>
              ) : (
                <DeleteToolButton
                  selectedTool={selectedTool}
                  onToolSelect={onToolSelect}
                  hasDeletableSelection={hasDeletableSelection}
                  onDeleteSelected={onDeleteSelected}
                />
              )}
            </>
          )}

          {/* 2D 평면도 모드 도구 */}
          {mode === '2d' && (
            <>
              <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />

              {TOOLS_2D.map(({ id, icon: Icon, label }) => {
                const style = getToolStyle(selectedTool === id)
                return (
                  <button key={id} onClick={() => onToolSelect(id)} className="w-full flex flex-col items-center gap-1 py-1 group">
                    <div className={style.container}><Icon size={24} /></div>
                    <span className={style.text}>{label}</span>
                  </button>
                )
              })}

              <DeleteToolButton
                selectedTool={selectedTool}
                onToolSelect={onToolSelect}
                hasDeletableSelection={hasDeletableSelection}
                onDeleteSelected={onDeleteSelected}
              />
              <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />
            </>
          )}

          {/* 3D 뷰어 모드 도구 */}
          {mode === '3d' && (
            <>
              <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
              <DeleteToolButton
                selectedTool={selectedTool}
                onToolSelect={onToolSelect}
                hasDeletableSelection={hasDeletableSelection}
                onDeleteSelected={onDeleteSelected}
              />

              <button onClick={onToggleLibrary} className="w-full flex flex-col items-center gap-1 py-1 group">
                <div className={`p-2 rounded-xl transition-all ${isLibraryOpen
                  ? 'bg-[#F0F2FF] text-[#3B45B3]'
                  : 'text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E]'
                  }`}>
                  <Home size={24} />
                </div>
                <span className={`text-[10px] font-bold transition-all ${isLibraryOpen ? 'text-[#3B45B3]' : 'text-[#8E95A3] group-hover:text-[#1C1C1E]'
                  }`}>
                  라이브러리
                </span>
              </button>

            </>
          )}
        </div>
      </div>

      {/* 하단 협업·AI 버튼은 2D·3D 모드에서만 표시 */}
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
