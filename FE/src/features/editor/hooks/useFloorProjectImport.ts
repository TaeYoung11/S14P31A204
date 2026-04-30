import { useCallback, useState } from 'react'
import { parseIfcToFloorProject } from '../utils/ifcToFloorProject'
import type { FloorProject } from '../types/floorProject.types'

interface StageSize {
  width: number
  height: number
}

interface UseFloorProjectImportParams {
  stageSize: StageSize
  onApplyProject: (project: FloorProject) => void
}

/** IFC import 상태와 처리 로직을 관리한다. */
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
      setMessage(`${project.name} IFC 데이터를 불러왔습니다.`)
    },
    [ensureStageReady, onApplyProject],
  )

  const importFloorProjectFromIfc = useCallback(
    async (ifcText: string, sourceName = 'import.ifc') => {
      if (!ensureStageReady()) return
      const parsed = parseIfcToFloorProject(ifcText, sourceName)
      if (!parsed.ok) {
        setMessage(parsed.message)
        return
      }
      importFloorProject(parsed.project)
    },
    [ensureStageReady, importFloorProject],
  )

  const clearImportMessage = useCallback(() => setMessage(''), [])

  return {
    floorProjectImportMessage: message,
    importFloorProjectFromIfc,
    clearImportMessage,
  }
}
