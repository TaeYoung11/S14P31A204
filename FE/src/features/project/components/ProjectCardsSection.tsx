import ProjectCard from '@/features/project/components/ProjectCard'
import ProjectCreateTile from '@/features/project/components/ProjectCreateTile'
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
        <ProjectCreateTile onCreateOpen={onCreateProject} />
      )}
    </div>
  )
}
