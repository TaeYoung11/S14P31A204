import type { EditorMode } from '@/features/editor/types'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import type { Project } from '@/shared/types'

type WorkspaceThumbnailMode = Exclude<EditorMode, 'view'>

export function getProjectMetaText(project: Project): string {
  return `최종수정일 ${new Date(project.updated_at).toLocaleDateString('ko-KR')}`
}

export function normalizeThumbnailUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function hasWorkspaceBubbles(history?: WorkspaceHistorySnapshotResponse | null): boolean {
  return Boolean(
    (history?.bubble.snapshot?.bubbles?.length ?? 0) > 0 ||
    (history?.floorPlan.snapshot?.bubbles?.length ?? 0) > 0,
  )
}

function hasWorkspaceRooms(history?: WorkspaceHistorySnapshotResponse | null): boolean {
  const layers = history?.floorPlan.snapshot?.layout?.floorLayers ?? []
  return layers.some((layer) => (layer.rooms?.length ?? 0) > 0)
}

/**
 * 카드 썸네일을 어떤 작업 모드 기준으로 표시할지 결정한다.
 * 2D/3D 모드여도 실제 방 데이터가 없고 버블만 있으면 버블 프리뷰를 우선 보여준다.
 */
export function resolveWorkspaceThumbnailMode(
  mode: EditorMode | null,
  history?: WorkspaceHistorySnapshotResponse | null,
): WorkspaceThumbnailMode | null {
  if (!mode || mode === 'view') return null
  if ((mode === '2d' || mode === '3d') && history && !hasWorkspaceRooms(history) && hasWorkspaceBubbles(history)) {
    return 'bubble'
  }
  return mode
}
