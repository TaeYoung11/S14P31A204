import { Check, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import ProjectFallbackThumbnail from '@/features/project/components/ProjectFallbackThumbnail'
import ProjectWorkspaceThumbnail from '@/features/project/components/ProjectWorkspaceThumbnail'
import type { EditorMode } from '@/features/editor/types'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import type { Project } from '@/shared/types'

interface ProjectCardMediaProps {
  canShowThumbnail: boolean
  canShowWorkspacePreview: boolean
  editorPath: string
  isDesigner: boolean
  isSelected: boolean
  isSelectionMode: boolean
  lastEditorMode: EditorMode | null
  project: Project
  thumbnailUrl: string
  workspacePreview?: WorkspaceHistorySnapshotResponse | null
  workspacePreviewMode: Exclude<EditorMode, 'view'> | null
  onEdit: (project: Project) => void
  onOpenProject: () => void
  onThumbnailError: (url: string) => void
  onToggleSelect: (event: React.MouseEvent) => void
}

/**
 * 프로젝트 카드의 상단 썸네일 영역이다.
 * 이미지, 워크스페이스 프리뷰, 모드 fallback 표시 우선순위는 상위 훅에서 계산한다.
 */
export default function ProjectCardMedia({
  canShowThumbnail,
  canShowWorkspacePreview,
  editorPath,
  isDesigner,
  isSelected,
  isSelectionMode,
  lastEditorMode,
  project,
  thumbnailUrl,
  workspacePreview,
  workspacePreviewMode,
  onEdit,
  onOpenProject,
  onThumbnailError,
  onToggleSelect,
}: ProjectCardMediaProps) {
  return (
    <Link
      to={editorPath}
      className={`block ${isSelectionMode ? 'pointer-events-none' : ''}`}
      onClick={onOpenProject}
    >
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#eef2ff] via-[#f8fafc] to-[#e0f2fe]">
        {canShowThumbnail ? (
          <img
            src={thumbnailUrl}
            alt={project.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => onThumbnailError(thumbnailUrl)}
          />
        ) : canShowWorkspacePreview && workspacePreviewMode ? (
          <ProjectWorkspaceThumbnail mode={workspacePreviewMode} history={workspacePreview} />
        ) : (
          <ProjectFallbackThumbnail mode={lastEditorMode} />
        )}

        {isSelectionMode ? (
          <SelectionButton isSelected={isSelected} onToggleSelect={onToggleSelect} />
        ) : (
          isDesigner && <EditButton project={project} onEdit={onEdit} />
        )}
      </div>
    </Link>
  )
}

function SelectionButton({
  isSelected,
  onToggleSelect,
}: {
  isSelected: boolean
  onToggleSelect: (event: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
        isSelected
          ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
          : 'border-white/80 bg-white/90 text-transparent backdrop-blur-sm hover:border-[#4f46e5] hover:text-[#4f46e5]'
      }`}
      onClick={onToggleSelect}
      title={isSelected ? '선택 해제' : '선택'}
    >
      <Check className="h-4 w-4" />
    </button>
  )
}

function EditButton({
  project,
  onEdit,
}: {
  project: Project
  onEdit: (project: Project) => void
}) {
  return (
    <button
      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:bg-white group-hover:opacity-100"
      onClick={(event) => {
        event.preventDefault()
        onEdit(project)
      }}
      title="수정"
    >
      <Pencil className="h-3.5 w-3.5 text-[#374151]" />
    </button>
  )
}
