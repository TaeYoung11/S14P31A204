import { useCallback, useEffect, useRef } from 'react'
import {
  createInitialTransformRuntimeState,
  nextTransformRuntimeState,
  type TransformRuntimeState,
  type TransformStateAction,
} from './ifcSceneHelpers'

interface TransformRuntimeLogPayload {
  [key: string]: unknown
  reason: string
  action: TransformStateAction['type']
  prevPhase: TransformRuntimeState['phase']
  nextPhase: TransformRuntimeState['phase']
  prevSelectedTargetId: number | null
  nextSelectedTargetId: number | null
  prevActiveTransformTargetId: number | null
  nextActiveTransformTargetId: number | null
  prevSessionId: string | null
  nextSessionId: string | null
  pendingCommitSessionId: string | null
}

interface UseTransformRuntimeMachineParams {
  /** 디버그/트레이스 로그를 외부에서 일관된 포맷으로 기록한다. */
  logAction: (payload: TransformRuntimeLogPayload) => void
  /** 세션 ID prefix (예: ifc, local3d). */
  sessionPrefix: string
}

/**
 * Transform 세션 상태기계를 컴포넌트에서 재사용하기 위한 공용 훅.
 * - reducer 순수 로직은 ifcSceneHelpers에 유지
 * - 훅은 ref 상태 보관, 액션 디스패치, 세션 ID 생성만 담당
 */
export const useTransformRuntimeMachine = ({
  logAction,
  sessionPrefix,
}: UseTransformRuntimeMachineParams) => {
  const stateRef = useRef<TransformRuntimeState>(createInitialTransformRuntimeState())
  const sessionSequenceRef = useRef(0)
  const logActionRef = useRef(logAction)

  // 부모 렌더에서 logAction 함수 레퍼런스가 바뀌어도
  // dispatchAction identity는 유지해 캔버스 초기화 effect 재실행을 방지한다.
  useEffect(() => {
    logActionRef.current = logAction
  }, [logAction])

  /** 상태기계 액션을 디스패치하고 전/후 상태를 로그로 기록한다. */
  const dispatchAction = useCallback((action: TransformStateAction, reason: string) => {
    const previous = stateRef.current
    const next = nextTransformRuntimeState(previous, action)
    stateRef.current = next
    logActionRef.current({
      reason,
      action: action.type,
      prevPhase: previous.phase,
      nextPhase: next.phase,
      prevSelectedTargetId: previous.selectedTargetId,
      nextSelectedTargetId: next.selectedTargetId,
      prevActiveTransformTargetId: previous.activeTransformTargetId,
      nextActiveTransformTargetId: next.activeTransformTargetId,
      prevSessionId: previous.transformSessionId,
      nextSessionId: next.transformSessionId,
      pendingCommitSessionId: next.pendingCommitSessionId,
    })
    return next
  }, [])

  /** drag 시작 시 호출하는 새 transform session ID를 생성한다. */
  const createSessionId = useCallback(() => {
    sessionSequenceRef.current += 1
    return `${sessionPrefix}-${Date.now()}-${sessionSequenceRef.current}`
  }, [sessionPrefix])

  return {
    stateRef,
    dispatchAction,
    createSessionId,
  }
}
