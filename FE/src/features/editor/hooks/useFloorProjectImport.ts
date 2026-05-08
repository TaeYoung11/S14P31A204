import { useCallback, useState } from 'react'
import { parseIfcToFloorProject } from '../utils/ifcToFloorProject'
import { parseWebIfcToFloorProject } from '../utils/webIfcToFloorProject'
import type { FloorProject } from '../types/floorProject.types'

interface StageSize {
  width: number
  height: number
}

interface UseFloorProjectImportParams {
  stageSize: StageSize
  onApplyProject: (project: FloorProject) => void
}

interface WebIfcApiForFloorProjectImport {
  GetTypeCodeFromName: (typeName: string) => number
  GetNameFromTypeCode?: (typeCode: number) => string
  GetLineIDsWithType: (modelID: number, type: number, includeInherited?: boolean) => { size: () => number; get: (index: number) => number }
  GetLine: (modelID: number, expressID: number, flatten?: boolean, inverse?: boolean, inversePropKey?: string | null) => unknown
  GetFlatMesh?: (modelID: number, expressID: number) => {
    geometries: { size: () => number; get: (index: number) => { geometryExpressID: number; flatTransformation?: number[] } }
    delete?: () => void
  }
  GetGeometry?: (modelID: number, geometryExpressID: number) => {
    GetVertexData: () => number
    GetVertexDataSize: () => number
    delete?: () => void
  }
  GetVertexArray?: (ptr: number, size: number) => Float32Array
}

const isWebIfcApiForFloorProjectImport = (value: unknown): value is WebIfcApiForFloorProjectImport => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.GetTypeCodeFromName === 'function' &&
    typeof record.GetLineIDsWithType === 'function' &&
    typeof record.GetLine === 'function'
  )
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

  const importFloorProjectFromWebIfc = useCallback(
    async (
      ifcApi: unknown,
      modelId: number,
      sourceName = 'import.ifc',
    ): Promise<boolean> => {
      if (!ensureStageReady()) return false
      if (!isWebIfcApiForFloorProjectImport(ifcApi)) {
        setMessage('web-ifc API를 확인할 수 없어 IFC 직접 파싱에 실패했습니다.')
        return false
      }

      const parsed = parseWebIfcToFloorProject({
        ifcApi,
        modelId,
        sourceName,
      })
      if (!parsed.ok) {
        setMessage(parsed.message)
        return false
      }

      importFloorProject(parsed.project)
      return true
    },
    [ensureStageReady, importFloorProject],
  )

  const clearImportMessage = useCallback(() => setMessage(''), [])

  return {
    floorProjectImportMessage: message,
    importFloorProjectFromIfc,
    importFloorProjectFromWebIfc,
    clearImportMessage,
  }
}
