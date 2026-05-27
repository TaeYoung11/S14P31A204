import { useCallback, useEffect, useRef } from 'react'
import type { PhaseStatus } from '../types'

interface UseFloorPlanGenerateTimeoutOptions {
  projectId?: string
  userId?: string
  workspacePhaseStatus: PhaseStatus
  timeoutMs: number
  onTimeout: () => void
  resetForbiddenFlag: () => void
}

interface FloorPlanGenerateTimeoutResult {
  startFloorPlanGenerateTimeout: () => void
  clearFloorPlanGenerateTimeout: () => void
}

/**
 * 평면도 생성(CONVERTING) 단계의 타임아웃 상태를 관리한다.
 * - 프로젝트/사용자 변경 시 금지 플래그 초기화
 * - CONVERTING 종료 시 타이머 정리
 */
export function useFloorPlanGenerateTimeout({
  projectId,
  userId,
  workspacePhaseStatus,
  timeoutMs,
  onTimeout,
  resetForbiddenFlag,
}: UseFloorPlanGenerateTimeoutOptions): FloorPlanGenerateTimeoutResult {
  const timeoutRef = useRef<number | null>(null)

  const clearFloorPlanGenerateTimeout = useCallback(() => {
    if (timeoutRef.current === null) return
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const startFloorPlanGenerateTimeout = useCallback(() => {
    clearFloorPlanGenerateTimeout()
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      onTimeout()
    }, timeoutMs)
  }, [clearFloorPlanGenerateTimeout, onTimeout, timeoutMs])

  useEffect(() => {
    resetForbiddenFlag()
  }, [projectId, userId, resetForbiddenFlag])

  useEffect(() => {
    if (workspacePhaseStatus === 'CONVERTING') {
      if (timeoutRef.current === null) startFloorPlanGenerateTimeout()
      return () => {
        clearFloorPlanGenerateTimeout()
      }
    }
    clearFloorPlanGenerateTimeout()
    return () => {
      clearFloorPlanGenerateTimeout()
    }
  }, [workspacePhaseStatus, clearFloorPlanGenerateTimeout, startFloorPlanGenerateTimeout])

  return {
    startFloorPlanGenerateTimeout,
    clearFloorPlanGenerateTimeout,
  }
}
