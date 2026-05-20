import ProjectWorkspaceBubbleThumbnail from '@/features/project/components/ProjectWorkspaceBubbleThumbnail'
import ProjectWorkspaceThreeDThumbnail from '@/features/project/components/ProjectWorkspaceThreeDThumbnail'
import ProjectWorkspaceTwoDThumbnail from '@/features/project/components/ProjectWorkspaceTwoDThumbnail'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import type { EditorMode } from '@/features/editor/types'

interface ProjectWorkspaceThumbnailProps {
  mode: Exclude<EditorMode, 'view'>
  history?: WorkspaceHistorySnapshotResponse | null
}

/** 마지막 편집 모드에 맞는 워크스페이스 프리뷰 컴포넌트를 선택한다. */
export default function ProjectWorkspaceThumbnail({ mode, history }: ProjectWorkspaceThumbnailProps) {
  if (mode === 'bubble') return <ProjectWorkspaceBubbleThumbnail history={history} />
  if (mode === '2d') return <ProjectWorkspaceTwoDThumbnail history={history} />
  return <ProjectWorkspaceThreeDThumbnail history={history} />
}
