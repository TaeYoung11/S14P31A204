import { CheckSquare, LayoutGrid, List, Plus, Search, X } from 'lucide-react'

interface ProjectListCommandCenterProps {
  filteredProjectCount: number
  isDesigner: boolean
  isSelectionMode: boolean
  search: string
  viewMode: 'grid' | 'list'
  onCreateOpen: () => void
  onSearchChange: (value: string) => void
  onSelectionModeToggle: () => void
  onViewModeChange: (mode: 'grid' | 'list') => void
}

/** 프로젝트 목록 상단의 검색, 보기 전환, 생성 액션을 렌더링한다. */
export default function ProjectListCommandCenter({
  filteredProjectCount,
  isDesigner,
  isSelectionMode,
  search,
  viewMode,
  onCreateOpen,
  onSearchChange,
  onSelectionModeToggle,
  onViewModeChange,
}: ProjectListCommandCenterProps) {
  return (
    <section className="project-command-center mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="project-muted">Projects</p>
          <div className="mt-1 flex items-end gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[#0f172a]">프로젝트</h1>
            <span className="pb-1 text-xs font-black text-[#94a3b8]">{filteredProjectCount}개</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="project-search-box">
            <Search className="pointer-events-none h-4 w-4 text-[#94a3b8]" />
            <input
              id="project-search"
              type="text"
              className="project-search-input"
              placeholder="프로젝트 이름 또는 설명으로 검색"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          <div className="project-view-switch">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`project-view-button ${viewMode === 'grid' ? 'is-active' : ''}`}
              title="그리드 보기"
              aria-label="그리드 보기"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`project-view-button ${viewMode === 'list' ? 'is-active' : ''}`}
              title="목록 보기"
              aria-label="목록 보기"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {isDesigner && (
            <button
              type="button"
              className={`project-icon-button h-11 w-11 ${
                isSelectionMode
                  ? 'border-[#111827] bg-[#111827] text-white hover:border-[#1f2937] hover:bg-[#1f2937] hover:text-white'
                  : ''
              }`}
              onClick={onSelectionModeToggle}
              title={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
              aria-label={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
            >
              {isSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            </button>
          )}

          {isDesigner && (
            <button
              id="create-project-btn"
              className="project-primary-button h-11 px-5"
              onClick={onCreateOpen}
              disabled={isSelectionMode}
            >
              <Plus className="h-4 w-4" />
              새 프로젝트
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
