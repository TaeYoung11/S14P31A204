import { useEffect, type MutableRefObject } from 'react'
import { projectService } from '@/features/project/services/project.service'

interface UseInitialIfcImportParams {
  projectId: string | undefined
  stageWidth: number
  stageHeight: number
  importFloorProjectFromIfc: (ifcText: string, fileName: string) => Promise<void>
  attemptedInitialIfcImportProjectIdRef: MutableRefObject<string | null>
}

/**
 * 프로젝트별 IFC를 에디터 진입 시 1회 자동 로드한다.
 * - stage 크기가 준비된 이후에만 실행한다.
 * - 동일 projectId에 대해서는 중복 import를 방지한다.
 */
export function useInitialIfcImport({
  projectId,
  stageWidth,
  stageHeight,
  importFloorProjectFromIfc,
  attemptedInitialIfcImportProjectIdRef,
}: UseInitialIfcImportParams) {
  useEffect(() => {
    if (!projectId) return
    if (attemptedInitialIfcImportProjectIdRef.current === projectId) return
    if (stageWidth <= 0 || stageHeight <= 0) return

    let cancelled = false
    attemptedInitialIfcImportProjectIdRef.current = projectId

    void projectService.getIfcModelText(projectId)
      .then(async (ifcText) => {
        if (cancelled || !ifcText) return
        await importFloorProjectFromIfc(ifcText, `${projectId}.ifc`)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[editor] failed to auto-import IFC model:', error)
      })

    return () => {
      cancelled = true
    }
  }, [
    projectId,
    stageWidth,
    stageHeight,
    importFloorProjectFromIfc,
    attemptedInitialIfcImportProjectIdRef,
  ])
}
