import { useCallback } from 'react'

interface UseProjectSiteModalActionsParams {
  hasPolygon: boolean
  isCloseDisabled: boolean
  onCancel: () => void | Promise<void>
  onComplete: () => void
}

/**
 * 대지 정보 모달의 핵심 액션을 관리한다.
 * - 모달 닫기(X, ESC, 오버레이)는 생성 취소 흐름으로 연결한다.
 * - 생성 버튼은 대지 폴리곤이 있을 때만 완료 액션을 수행한다.
 */
export function useProjectSiteModalActions({
  hasPolygon,
  isCloseDisabled,
  onCancel,
  onComplete,
}: UseProjectSiteModalActionsParams) {
  const handleRequestClose = useCallback(() => {
    if (isCloseDisabled) return
    void Promise.resolve(onCancel()).catch(() => {
      // onCancel 내부에서 오류 처리 정책을 갖도록 하고, 여기서는 unhandled rejection만 방지한다.
    })
  }, [isCloseDisabled, onCancel])

  const handleComplete = useCallback(() => {
    if (isCloseDisabled || !hasPolygon) return
    onComplete()
  }, [hasPolygon, isCloseDisabled, onComplete])

  return {
    handleRequestClose,
    handleComplete,
  }
}
