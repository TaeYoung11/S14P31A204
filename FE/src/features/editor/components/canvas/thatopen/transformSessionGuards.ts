import type {
  TransformRuntimeState,
  TransformSessionPhase,
} from './ifcSceneHelpers'

const LOCKED_PHASES: TransformSessionPhase[] = ['dragging', 'commit', 'cleanup']

/**
 * 현재 transform 런타임이 드래그 소유권(ownership)을 유지 중인지 판별한다.
 * render/hierarchy/filter 변경 시 interaction 상태를 건드리면 안 되는 구간을 가드한다.
 */
export const isTransformSessionLocked = (state: TransformRuntimeState) => (
  LOCKED_PHASES.includes(state.phase)
)

/** 전달된 sessionId가 현재 pending commit 세션과 일치하는지 확인한다. */
export const isPendingCommitSession = (
  state: TransformRuntimeState,
  sessionId: string | null | undefined,
) => Boolean(sessionId) && state.pendingCommitSessionId === sessionId

/** 전달된 sessionId가 stale(이전 세션)인지 확인한다. */
export const isStalePendingCommitSession = (
  state: TransformRuntimeState,
  sessionId: string | null | undefined,
) => Boolean(sessionId) && state.pendingCommitSessionId !== sessionId

/**
 * active transform owner와 선택 owner가 충돌하는지 확인한다.
 * commit queue 실행 전에 타깃이 세션 소유권과 일치하는지 검증할 때 사용한다.
 */
export const isTransformOwnerMismatch = (
  state: TransformRuntimeState,
  ownerId: number | null,
) => (
  Number.isFinite(state.activeTransformTargetId)
  && Number.isFinite(ownerId)
  && state.activeTransformTargetId !== ownerId
)

