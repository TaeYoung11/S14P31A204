import type { EditorDraftRecord } from '../types'

export interface AutosaveStatus {
  versionNo: number
}

export interface AutosaveRepository {
  save(projectId: string, draft: EditorDraftRecord): Promise<void>
  getStatus(projectId: string): Promise<AutosaveStatus | null>
}

/** API 연동 전까지 사용하는 자동저장 저장소 계약의 기본 구현체 */
export const autosaveRepository: AutosaveRepository = {
  async save(_projectId, _draft) {
    return
  },

  async getStatus(_projectId) {
    return null
  },
}
