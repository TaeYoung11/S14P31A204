import { Share2, Trash2 } from 'lucide-react'

interface ProjectSelectionToolbarProps {
  isAllVisibleSelected: boolean
  isDeleting: boolean
  selectedCount: number
  onBulkDelete: () => void
  onBulkShare: () => void
  onSelectAllVisible: () => void
}

/** 선택 모드에서 전체 선택, 공유, 삭제 일괄 액션을 제공한다. */
export default function ProjectSelectionToolbar({
  isAllVisibleSelected,
  isDeleting,
  selectedCount,
  onBulkDelete,
  onBulkShare,
  onSelectAllVisible,
}: ProjectSelectionToolbarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c7d2fe] bg-[#eef2ff]/80 px-4 py-3 shadow-[0_10px_30px_rgba(79,70,229,0.08)]">
      <p className="text-sm font-black text-[#312e81]">{selectedCount}개 선택됨</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="project-secondary-button"
          onClick={onSelectAllVisible}
          title={isAllVisibleSelected ? '전체 해제' : '전체 선택'}
          aria-label={isAllVisibleSelected ? '전체 해제' : '전체 선택'}
        >
          {isAllVisibleSelected ? '전체 해제' : '전체 선택'}
        </button>
        <button
          type="button"
          className="project-secondary-button h-12 w-12 px-0"
          disabled={selectedCount === 0}
          onClick={onBulkShare}
          title="선택 프로젝트 공유"
          aria-label="선택 프로젝트 공유"
        >
          <Share2 className="h-6 w-6" strokeWidth={2.6} />
        </button>
        <button
          type="button"
          className="project-danger-button h-12 w-12 px-0"
          disabled={selectedCount === 0 || isDeleting}
          onClick={onBulkDelete}
          title={selectedCount === 1 ? '선택 프로젝트 삭제' : '선택 항목 삭제'}
          aria-label={selectedCount === 1 ? '선택 프로젝트 삭제' : '선택 항목 삭제'}
        >
          <Trash2 className="h-6 w-6" strokeWidth={2.6} />
        </button>
      </div>
    </div>
  )
}
