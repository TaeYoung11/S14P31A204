import { useEffect, type MutableRefObject } from 'react'
import { projectService } from '@/features/project/services/project.service'

interface UseInitialIfcImportParams {
  projectId: string | undefined
  hasIfcUploaded: boolean
  stageWidth: number
  stageHeight: number
  /**
   * IFC 소스 URL과 assetId가 확인된 시점에 호출된다.
   * 상위에서 presigned URL 발급 및 실제 로드를 담당한다.
   */
  onResolvedIfcUrl: (url: string, assetId?: string) => void
  /** projectId별 IFC 임포트 1회 보장을 위한 시도 기록 ref */
  attemptedInitialIfcImportProjectIdRef: MutableRefObject<string | null>
}

/**
 * 에디터 첫 진입 시 프로젝트 IFC 소스 정보를 1회 조회해 상위로 전달한다.
 *
 * - stage 크기(width/height)가 0보다 커야 실행된다 (캔버스 미준비 방지).
 * - projectId당 중복 조회를 ref로 차단한다.
 * - 실제 IFC 로드/렌더링은 onResolvedIfcUrl 콜백을 통해 상위에서 처리한다.
 */
export function useInitialIfcImport({
  projectId,
  hasIfcUploaded,
  stageWidth,
  stageHeight,
  onResolvedIfcUrl,
  attemptedInitialIfcImportProjectIdRef,
}: UseInitialIfcImportParams) {
  useEffect(() => {
    if (!projectId) return
    if (!hasIfcUploaded) return
    if (attemptedInitialIfcImportProjectIdRef.current === projectId) return
    if (stageWidth <= 0 || stageHeight <= 0) return

    let cancelled = false
    attemptedInitialIfcImportProjectIdRef.current = projectId

    const load = async () => {
      const source = await projectService.getIfcSource(projectId).catch(() => null)
      if (cancelled) return
      if (!source?.currentIfcUrl) return
      onResolvedIfcUrl(source.currentIfcUrl, source.currentIfcAssetId)
    }

    void load().catch((error: unknown) => {
      if (cancelled) return
      console.error('[editor] IFC 초기 소스 조회 실패:', error)
    })

    return () => {
      cancelled = true
    }
  }, [
    projectId,
    hasIfcUploaded,
    stageWidth,
    stageHeight,
    onResolvedIfcUrl,
    attemptedInitialIfcImportProjectIdRef,
  ])
}
