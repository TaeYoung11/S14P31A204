import { useCallback } from 'react'

interface UseProjectSiteModalActionsParams {
  hasPolygon: boolean
  isCloseDisabled: boolean
  onCancel: () => void | Promise<void>
  onComplete: () => void | Promise<void>
  onActionError?: (message: string) => void
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallbackMessage
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
  onActionError,
}: UseProjectSiteModalActionsParams) {
  const handleRequestClose = useCallback(() => {
    if (isCloseDisabled) {
      onActionError?.('현재 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    void Promise.resolve(onCancel()).catch((error: unknown) => {
      onActionError?.(getErrorMessage(error, '프로젝트 생성 취소 처리 중 오류가 발생했습니다.'))
    })
  }, [isCloseDisabled, onActionError, onCancel])

  const handleComplete = useCallback(() => {
    if (isCloseDisabled || !hasPolygon) return
    void Promise.resolve(onComplete()).catch((error: unknown) => {
      onActionError?.(getErrorMessage(error, '프로젝트 생성 완료 처리 중 오류가 발생했습니다.'))
    })
  }, [hasPolygon, isCloseDisabled, onActionError, onComplete])

  return {
    handleRequestClose,
    handleComplete,
  }
}
