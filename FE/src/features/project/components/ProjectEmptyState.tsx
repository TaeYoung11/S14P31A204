import { FolderOpen } from 'lucide-react'

interface ProjectEmptyStateProps {
  hasSearch: boolean
}

/** 프로젝트가 없거나 검색 결과가 없을 때의 빈 상태 화면이다. */
export default function ProjectEmptyState({ hasSearch }: ProjectEmptyStateProps) {
  return (
    <section className="project-empty-panel">
      <div className="project-empty-visual">
        <FolderOpen className="h-7 w-7" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-black text-[#111827]">
          {hasSearch ? '검색 결과가 없습니다' : '첫 프로젝트를 시작해 보세요'}
        </h2>
        <p className="mt-1 text-sm font-medium text-[#64748b]">
          {hasSearch
            ? '입력한 검색어와 일치하는 프로젝트가 없습니다.'
            : '프로젝트를 만들면 이곳에서 바로 확인하고 관리할 수 있습니다.'}
        </p>
      </div>
    </section>
  )
}
