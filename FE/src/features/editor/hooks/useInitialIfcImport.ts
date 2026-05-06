import { useEffect, type MutableRefObject } from 'react'
import { projectService } from '@/features/project/services/project.service'

const FALLBACK_IFC_URL = '/mock/shinchan_house.ifc'
const FALLBACK_IFC_FILE_NAME = 'shinchan_house.ifc'

interface UseInitialIfcImportParams {
  projectId: string | undefined
  stageWidth: number
  stageHeight: number
  importFloorProjectFromIfc: (ifcText: string, fileName: string) => Promise<void>
  /** projectId별 IFC 임포트 1회 보장을 위한 시도 기록 ref */
  attemptedInitialIfcImportProjectIdRef: MutableRefObject<string | null>
}

async function fetchIfcText(ifcUrl: string): Promise<string | null> {
  const response = await fetch(ifcUrl)
  if (!response.ok) return null
  const ifcText = await response.text()
  return ifcText.trim().length > 0 ? ifcText : null
}

/**
 * 에디터 첫 진입 시 프로젝트 IFC 모델을 자동으로 1회 로드한다.
 *
 * - stage 크기(width/height)가 0보다 커야 실행된다 (캔버스 미준비 방지).
 * - projectId당 중복 임포트를 ref로 차단한다.
 * - stageWidth/stageHeight 변경(창 리사이즈 등)에는 재임포트하지 않는다.
 */
export function useInitialIfcImport({
  projectId,
  stageWidth,
  stageHeight,
  importFloorProjectFromIfc,
  attemptedInitialIfcImportProjectIdRef,
}: UseInitialIfcImportParams) {
  // IFC 파일을 가져와 캔버스에 반영한다
  useEffect(() => {
    if (!projectId) return
    if (attemptedInitialIfcImportProjectIdRef.current === projectId) return
    if (stageWidth <= 0 || stageHeight <= 0) return

    let cancelled = false
    attemptedInitialIfcImportProjectIdRef.current = projectId

    const loadIfc = async () => {
      const projectIfcSource = await projectService.getIfcSource(projectId).catch(() => null)
      const projectIfcUrl = projectIfcSource?.currentIfcUrl
      const projectIfcText = projectIfcUrl ? await fetchIfcText(projectIfcUrl).catch(() => null) : null
      const ifcText = projectIfcText ?? await fetchIfcText(FALLBACK_IFC_URL)
      if (cancelled || !ifcText) return
      await importFloorProjectFromIfc(ifcText, projectIfcText ? `${projectId}.ifc` : FALLBACK_IFC_FILE_NAME)
    }

    void loadIfc().catch((error: unknown) => {
      if (cancelled) return
      console.error('[editor] IFC 자동 로드 실패:', error)
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
