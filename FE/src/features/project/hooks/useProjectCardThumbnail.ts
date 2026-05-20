import { useEffect, useState } from 'react'
import type { EditorMode } from '@/features/editor/types'
import { useProjectThumbnail } from '@/features/project/hooks/useProjectThumbnail'
import { useProjectWorkspacePreview } from '@/features/project/hooks/useProjectWorkspacePreview'
import { saveProjectWorkspaceThumbnail } from '@/features/project/services/projectWorkspaceThumbnail.service'
import { buildProjectEditorPath, readProjectEditorMode } from '@/features/project/utils/projectEditorModeCache'
import { readProjectWorkspaceThumbnailUrl } from '@/features/project/utils/projectWorkspaceThumbnailCache'
import { normalizeThumbnailUrl, resolveWorkspaceThumbnailMode } from '@/features/project/utils/projectCardThumbnail'
import type { Project } from '@/shared/types'

interface UseProjectCardThumbnailParams {
  project: Project
  isListView: boolean
  enableRenderedThumbnail: boolean
}

/**
 * 프로젝트 카드의 썸네일 선택 우선순위를 관리한다.
 * DB 썸네일을 우선 사용하고, 브라우저 localStorage 캡처와 워크스페이스 프리뷰는 fallback으로 유지한다.
 */
export function useProjectCardThumbnail({
  project,
  isListView,
  enableRenderedThumbnail,
}: UseProjectCardThumbnailParams) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState('')
  const lastEditorMode = readProjectEditorMode(project.id) ?? project.thumbnail_mode ?? null
  const editorPath = buildProjectEditorPath(project.id, lastEditorMode ?? 'bubble')
  const projectThumbnailUrl = normalizeThumbnailUrl(project.thumbnail_url)
  const shouldLoadFallbackThumbnail = enableRenderedThumbnail && !isListView && !projectThumbnailUrl

  const { data: renderedThumbnailUrl } = useProjectThumbnail(
    project.id,
    shouldLoadFallbackThumbnail && lastEditorMode === 'view',
  )
  const { data: workspacePreview } = useProjectWorkspacePreview(
    project.id,
    lastEditorMode,
    shouldLoadFallbackThumbnail,
  )

  const workspacePreviewMode = resolveWorkspaceThumbnailMode(lastEditorMode, workspacePreview)
  const renderedUrl = lastEditorMode === 'view' ? normalizeThumbnailUrl(renderedThumbnailUrl) : null
  const workspaceThumbnailUrl = workspacePreviewMode
    ? readProjectWorkspaceThumbnailUrl(project.id, workspacePreviewMode)
    : null
  const projectWorkspaceThumbnailUrl = isProjectWorkspaceThumbnail(project.thumbnail_mode, lastEditorMode)
    ? projectThumbnailUrl
    : null
  const modeThumbnailUrl = lastEditorMode === 'view'
    ? renderedUrl
    : workspaceThumbnailUrl ?? projectWorkspaceThumbnailUrl
  const thumbnailUrl = projectThumbnailUrl ?? modeThumbnailUrl ?? ''
  const canShowThumbnail = Boolean(thumbnailUrl) && thumbnailUrl !== failedThumbnailUrl
  const canShowWorkspacePreview = Boolean(workspacePreviewMode && workspacePreview)

  useEffect(() => {
    if (
      projectThumbnailUrl ||
      !workspacePreviewMode ||
      !workspaceThumbnailUrl ||
      projectWorkspaceThumbnailUrl === workspaceThumbnailUrl
    ) {
      return
    }
    saveProjectWorkspaceThumbnail(project.id, workspacePreviewMode, workspaceThumbnailUrl)
  }, [project.id, projectThumbnailUrl, projectWorkspaceThumbnailUrl, workspacePreviewMode, workspaceThumbnailUrl])

  return {
    canShowThumbnail,
    canShowWorkspacePreview,
    editorPath,
    lastEditorMode,
    setFailedThumbnailUrl,
    thumbnailUrl,
    workspacePreview,
    workspacePreviewMode,
  }
}

function isProjectWorkspaceThumbnail(
  thumbnailMode: Project['thumbnail_mode'],
  lastEditorMode: EditorMode | null,
): thumbnailMode is Exclude<EditorMode, 'view'> {
  return Boolean(thumbnailMode && thumbnailMode !== 'view' && lastEditorMode === thumbnailMode)
}
