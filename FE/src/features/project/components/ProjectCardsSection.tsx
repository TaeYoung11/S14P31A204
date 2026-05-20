import { Plus } from 'lucide-react'
import ProjectCard from '@/features/project/components/ProjectCard'
import type { Project, UserType } from '@/shared/types'

type ProjectViewMode = 'grid' | 'list'

interface ProjectCardsSectionProps {
  projects: Project[]
  userType: UserType
  viewMode: ProjectViewMode
  isDesigner: boolean
  isSelectionMode: boolean
  selectedProjectIds: string[]
  onDelete: (id: string) => void
  onEdit: (project: Project) => void
  onShare: (project: Project) => void
  onToggleSelect: (projectId: string) => void
  onCreateProject: () => void
}

/** 프로젝트 카드 목록과 디자이너용 생성 카드를 렌더링한다. */
export default function ProjectCardsSection({
  projects,
  userType,
  viewMode,
  isDesigner,
  isSelectionMode,
  selectedProjectIds,
  onDelete,
  onEdit,
  onShare,
  onToggleSelect,
  onCreateProject,
}: ProjectCardsSectionProps) {
  return (
    <div
      className={`grid gap-5 ${
        viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
      }`}
    >
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          userType={userType}
          onDelete={onDelete}
          onEdit={onEdit}
          onShare={onShare}
          viewMode={viewMode}
          isSelectionMode={isSelectionMode}
          isSelected={selectedProjectIds.includes(project.id)}
          onToggleSelect={onToggleSelect}
          enableRenderedThumbnail={!project.thumbnail_url?.trim()}
        />
      ))}

      {isDesigner && !isSelectionMode && (
        <button
          type="button"
          onClick={onCreateProject}
          className="group flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#c7d2fe] bg-white/85 transition-colors hover:border-[#4f46e5] hover:bg-[#f8faff]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dbeafe] bg-[#eff6ff] transition-colors group-hover:border-[#4f46e5]">
            <Plus className="h-5 w-5 text-[#9ca3af] transition-colors group-hover:text-[#4f46e5]" />
          </div>
          <span className="text-sm font-medium text-[#6b7280] transition-colors group-hover:text-[#4f46e5]">
            새 프로젝트 만들기
          </span>
        </button>
      )}
    </div>
  )
}
