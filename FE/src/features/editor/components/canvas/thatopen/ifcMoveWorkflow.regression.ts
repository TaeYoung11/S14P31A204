import type { IfcPsetMetricMaps } from './ifcPropertyParser'
import {
  buildIfcCanonicalIdMap,
  createInitialTransformRuntimeState,
  nextTransformRuntimeState,
  nextIfcMoveLifecycleState,
  resolveIfcCanonicalLocalIds,
  type IfcMoveLifecycleState,
} from './ifcSceneHelpers'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`[ifc-move-regression] ${message}`)
}

/**
 * shinchan_house.ifc 기반 이동 회귀 케이스.
 * - IFCWALL #408 / ObjectPlacement #407 조합을 대표 케이스로 사용한다.
 */
export const runIfcMoveWorkflowRegressionCases = () => {
  const mockMetrics: IfcPsetMetricMaps = {
    byId: {
      407: {
        expressId: 408,
        name: '1F_Div_Right',
        ifcClass: 'IfcWall',
        category: 'Wall',
      },
      408: {
        expressId: 408,
        name: '1F_Div_Right',
        ifcClass: 'IfcWall',
        category: 'Wall',
      },
      422: {
        expressId: 422,
        name: '1F_Div_Left',
        ifcClass: 'IfcWall',
        category: 'Wall',
      },
    },
    byName: {},
  }

  const canonicalMap = buildIfcCanonicalIdMap(mockMetrics)
  const wallAliasSet = canonicalMap.localIdsByExpressId.get(408)
  assert(Boolean(wallAliasSet?.has(407)), 'expressId=408 alias에 localId=407이 포함되어야 한다')
  assert(Boolean(wallAliasSet?.has(408)), 'expressId=408 alias에 localId=408이 포함되어야 한다')

  const resolvedIds = resolveIfcCanonicalLocalIds(canonicalMap, {
    hitLocalId: 407,
    localId: 408,
    expressId: 408,
    proxyLocalIds: [407],
    itemMappedLocalIds: [408],
  })
  assert(resolvedIds.includes(407), '커밋 후보 localIds에 hitLocalId=407이 포함되어야 한다')
  assert(resolvedIds.includes(408), '커밋 후보 localIds에 localId=408이 포함되어야 한다')

  let state: IfcMoveLifecycleState = {
    phase: 'idle',
    targetKey: null,
    lastError: null,
  }
  state = nextIfcMoveLifecycleState(state, { type: 'start_drag', targetKey: 'project-a:408' })
  assert(state.phase === 'dragging', 'start_drag 이후 phase=dragging 이어야 한다')
  state = nextIfcMoveLifecycleState(state, { type: 'commit_start', targetKey: 'project-a:408' })
  assert(state.phase === 'commit', 'commit_start 이후 phase=commit 이어야 한다')
  state = nextIfcMoveLifecycleState(state, { type: 'commit_success', targetKey: 'project-a:408' })
  assert(state.phase === 'cleanup', 'commit_success 이후 phase=cleanup 이어야 한다')
  state = nextIfcMoveLifecycleState(state, { type: 'cleanup_done' })
  assert(state.phase === 'idle', 'cleanup_done 이후 phase=idle 이어야 한다')

  state = nextIfcMoveLifecycleState(state, { type: 'start_drag', targetKey: 'project-a:422' })
  state = nextIfcMoveLifecycleState(state, { type: 'commit_start', targetKey: 'project-a:422' })
  state = nextIfcMoveLifecycleState(state, {
    type: 'commit_failure',
    targetKey: 'project-a:422',
    message: 'editor.getElements returned empty',
  })
  assert(state.phase === 'cleanup', 'commit_failure 이후 phase=cleanup 이어야 한다')
  assert(state.lastError === 'editor.getElements returned empty', 'commit_failure 에러 메시지가 유지되어야 한다')

  let runtime = createInitialTransformRuntimeState()
  runtime = nextTransformRuntimeState(runtime, { type: 'SELECT_TARGET', targetId: 408 })
  runtime = nextTransformRuntimeState(runtime, { type: 'ATTACH_GIZMO', targetId: 408 })
  runtime = nextTransformRuntimeState(runtime, {
    type: 'START_DRAG',
    targetId: 408,
    transformSessionId: 'session-a',
  })
  runtime = nextTransformRuntimeState(runtime, {
    type: 'UPDATE_DELTA',
    transformSessionId: 'session-a',
    delta: {
      position: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  })
  runtime = nextTransformRuntimeState(runtime, {
    type: 'REQUEST_COMMIT',
    transformSessionId: 'session-a',
  })
  runtime = nextTransformRuntimeState(runtime, { type: 'SELECT_TARGET', targetId: 422 })
  assert(runtime.selectedTargetId === 422, 'drag 중 선택 변경은 selectedTargetId에 반영되어야 한다')
  assert(runtime.activeTransformTargetId === 408, 'drag 소유권(activeTransformTargetId)은 cleanup 전까지 유지되어야 한다')

  const beforeStaleDelta = runtime.runtimeDelta
  runtime = nextTransformRuntimeState(runtime, {
    type: 'UPDATE_DELTA',
    transformSessionId: 'stale-session',
    delta: {
      position: { x: 9, y: 9, z: 9 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  })
  assert(runtime.runtimeDelta === beforeStaleDelta, 'stale UPDATE_DELTA 는 무시되어야 한다')

  runtime = nextTransformRuntimeState(runtime, {
    type: 'COMMIT_SUCCESS',
    transformSessionId: 'session-a',
    targetId: 408,
  })
  runtime = nextTransformRuntimeState(runtime, { type: 'CLEANUP', transformSessionId: 'session-a' })
  assert(runtime.phase === 'idle', 'session cleanup 이후 phase=idle 이어야 한다')

  const beforeStale = runtime
  runtime = nextTransformRuntimeState(runtime, {
    type: 'COMMIT_SUCCESS',
    transformSessionId: 'stale-session',
    targetId: 999,
  })
  assert(runtime === beforeStale, 'stale COMMIT_SUCCESS 는 무시되어야 한다')
}
