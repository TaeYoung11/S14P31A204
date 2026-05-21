import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import ProjectCardActionMenu from '@/features/project/components/ProjectCardActionMenu'
import ProjectCardEditButton from '@/features/project/components/ProjectCardEditButton'
import ProjectCardMedia from '@/features/project/components/ProjectCardMedia'
import ProjectCardSelectionButton from '@/features/project/components/ProjectCardSelectionButton'
import ProjectMemberAvatars from '@/features/project/components/ProjectMemberAvatars'
import { useProjectCardThumbnail } from '@/features/project/hooks/useProjectCardThumbnail'
import { useProjectStore } from '@/features/project/stores/projectStore'
import { getProjectMetaText } from '@/features/project/utils/projectCardThumbnail'
import type { Project, UserType } from '@/shared/types'

interface ProjectCardProps {
  project: Project
  userType: UserType
  onDelete: (id: string) => void
  onEdit: (project: Project) => void
  onShare: (project: Project) => void
  viewMode?: 'grid' | 'list'
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (projectId: string) => void
  enableRenderedThumbnail?: boolean
}

/** 프로젝트 목록에서 단일 프로젝트 카드를 렌더링한다. */
export default function ProjectCard({
  project,
  userType,
  onDelete,
  onEdit,
  onShare,
  viewMode = 'grid',
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  enableRenderedThumbnail = false,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject)
  const isDesigner = userType === 'DESIGNER'
  const isListView = viewMode === 'list'
  const thumbnail = useProjectCardThumbnail({ project, isListView, enableRenderedThumbnail })

  const handleOpenProject = () => {
    setCurrentProject(project)
  }

  const handleToggleSelect = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onToggleSelect?.(project.id)
  }

  return (
    <div
      className={`group project-surface relative cursor-pointer rounded-2xl transition-colors hover:border-[#c7d2fe] hover:shadow-[0_16px_42px_rgba(15,23,42,0.10)] ${
        isSelected ? 'border-[#4f46e5]' : ''
      }`}
      onClick={
        isSelectionMode
          ? () => {
              onToggleSelect?.(project.id)
            }
          : undefined
      }
    >
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2 ring-[#93c5fd]" />
      )}
      {!isListView && (
        <ProjectCardMedia
          canShowThumbnail={thumbnail.canShowThumbnail}
          canShowWorkspacePreview={thumbnail.canShowWorkspacePreview}
          editorPath={thumbnail.editorPath}
          isDesigner={isDesigner}
          isSelected={isSelected}
          isSelectionMode={isSelectionMode}
          lastEditorMode={thumbnail.lastEditorMode}
          project={project}
          thumbnailUrl={thumbnail.thumbnailUrl}
          workspacePreview={thumbnail.workspacePreview}
          workspacePreviewMode={thumbnail.workspacePreviewMode}
          onEdit={onEdit}
          onOpenProject={handleOpenProject}
          onThumbnailError={thumbnail.setFailedThumbnailUrl}
          onToggleSelect={handleToggleSelect}
        />
      )}

      <div className="p-4">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {isListView && isSelectionMode && (
              <ProjectCardSelectionButton
                isSelected={isSelected}
                variant="list"
                onToggleSelect={handleToggleSelect}
              />
            )}

            <Link
              to={thumbnail.editorPath}
              className={`min-w-0 flex-1 ${isSelectionMode ? 'pointer-events-none' : ''}`}
              onClick={handleOpenProject}
            >
              <h3 className="truncate text-[15px] font-black text-[#111827] transition-colors group-hover:text-[#4f46e5]">
                {project.name}
              </h3>
            </Link>
          </div>

          {isListView && isDesigner && !isSelectionMode && (
            <ProjectCardEditButton project={project} variant="list" onEdit={onEdit} />
          )}
        </div>

        <p className={`mb-3 text-xs font-medium text-[#64748b] ${isListView ? 'line-clamp-2' : 'truncate'}`}>
          {project.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <ProjectMemberAvatars count={project.member_count} />

          <div className="flex items-center gap-2">
            {project.unread_comment_count > 0 && (
              <span className="rounded-full bg-[#eef2ff] px-2 py-1 text-[11px] font-semibold text-[#4f46e5]">
                댓글 {project.unread_comment_count}
              </span>
            )}
            <span className="text-xs text-[#9ca3af]">
              {getProjectMetaText(project)}
            </span>

            {isDesigner && !isSelectionMode && (
              <ProjectCardActionMenu
                isOpen={menuOpen}
                project={project}
                onDelete={onDelete}
                onShare={onShare}
                onToggleOpen={() => setMenuOpen((value) => !value)}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
