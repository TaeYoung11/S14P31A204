import { useCallback, useState } from 'react'
import { SAMPLE_FLOOR_PROJECT } from '../mocks/sampleFloorProject'
import { parseFloorProjectJson } from '../utils/floorProjectParser'
import type { FloorProject } from '../types/floorProject.types'

interface StageSize {
  width: number
  height: number
}

interface UseFloorProjectImportParams {
  stageSize: StageSize
  onApplyProject: (project: FloorProject) => void
}

/**
 * BATANG 2D 표준 JSON import 상태와 처리 로직을 관리한다.
 * - 입력 검증 실패 메시지
 * - 샘플 데이터 import
 * - JSON 문자열 import
 */
export function useFloorProjectImport({ stageSize, onApplyProject }: UseFloorProjectImportParams) {
  const [message, setMessage] = useState('')

  const isStageReady = stageSize.width > 0 && stageSize.height > 0

  const ensureStageReady = useCallback(() => {
    if (isStageReady) return true
    setMessage('캔버스 크기 초기화 후 다시 시도해 주세요.')
    return false
  }, [isStageReady])

  const importFloorProject = useCallback(
    (project: FloorProject) => {
      if (!ensureStageReady()) return
      onApplyProject(project)
      setMessage(`${project.name} 데이터를 불러왔습니다.`)
    },
    [ensureStageReady, onApplyProject],
  )

  const importFloorProjectFromJson = useCallback(
    async (rawJson: string) => {
      if (!ensureStageReady()) return
      const parsed = parseFloorProjectJson(rawJson)
      if (!parsed.ok) {
        setMessage(parsed.message)
        return
      }
      importFloorProject(parsed.project)
    },
    [ensureStageReady, importFloorProject],
  )

  const importSampleFloorProject = useCallback(() => {
    importFloorProject(SAMPLE_FLOOR_PROJECT)
  }, [importFloorProject])

  const clearImportMessage = useCallback(() => setMessage(''), [])

  return {
    floorProjectImportMessage: message,
    importFloorProjectFromJson,
    importSampleFloorProject,
    clearImportMessage,
  }
}
