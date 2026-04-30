import type { EditorDraftRecord, WorkspaceSnapshot } from '../types'
import { deleteDraft, getDraft, setDraft } from '../lib/draftDb'

export interface SaveLocalFallbackDraftInput {
  projectId: string
  versionNo: number
  snapshot: WorkspaceSnapshot
  savedAt?: string
}

export const workspaceDraftRepository = {
  loadLocalFallbackDraft(projectId: string): Promise<EditorDraftRecord | null> {
    return getDraft(projectId)
  },

  saveLocalFallbackDraft({
    projectId,
    versionNo,
    snapshot,
    savedAt = new Date().toISOString(),
  }: SaveLocalFallbackDraftInput): Promise<void> {
    return setDraft(projectId, {
      projectId,
      versionNo,
      data: snapshot,
      savedAt,
    })
  },

  clearLocalFallbackDraft(projectId: string): Promise<void> {
    return deleteDraft(projectId)
  },
}
