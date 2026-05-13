/**
 * ThatOpenIfcCanvas — IFC 모델 3D 뷰어/편집 캔버스
 *
 * @thatopen/components 기반으로 IFC 파일을 로드하고 Three.js 씬을 구성한다.
 * 주요 기능:
 *  - IFC 모델 로드 및 초기 재질 스타일 적용
 *  - 클릭으로 IFC 요소·라이브러리 프리셋 선택 및 TransformControls 연결
 *  - 선택 요소의 색상·재질·치수 실시간 편집
 *  - Delete/Backspace 키로 선택 요소 삭제
 *  - 카메라 회전 잠금 및 줌 스케일 반영
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Object3D } from 'three'
import type { IfcElementChange, IfcElementInfo } from '../../types'
import { patchIfcTextForMaterialDefaults } from '../../services/ifcChange.service'
import type { ThreeDLibraryPreset } from './threeDLibrary.types'
import {
  applyObjectColor,
  applyObjectMaterial,
  getMaterialDefaultColor,
  type ThreeModule,
} from './thatopen/ifcMaterials'
import {
  createPresetMesh,
  findLibraryRoot,
  getLibraryElementInfo,
  getLibraryPresetFromObject,
  updateLibraryPresetData,
  type LibraryObject3D,
} from './thatopen/ifcLibraryMesh'
import { getLibraryOwnerId } from './thatopen/transformOwner'
import {
  getIfcElementFromFragments,
  normalizeIfcElement,
  parseBatangDimensionProperties,
  parseIfcStoreys,
  type IfcPsetMetricMaps,
  type IfcStoreyInfo,
} from './thatopen/ifcPropertyParser'
import {
  type Selected3DTarget,
  type IfcCanonicalIdMap,
  type IfcEditableObject3D,
  type IfcMoveLifecycleState,
  type ThatOpenSceneState,
  applyIfcSelectionVisibility,
  getElementDimensionSignature,
  getElementColorSignature,
  getElementMaterialSignature,
  getIfcMoveTargetKey,
  hasIdentityMatrixDelta,
  nextIfcMoveLifecycleState,
  getRuntimeIfcModelId,
  fetchIfcText,
  fitObjectWithPadding,
  disposeObjectMaterials,
  clearSelectedTarget,
  positionPresetGroupBesideIfc,
  inferWorldUnitsPerMm,
  toDisplayCoordinates,
  applyInitialIfcMaterialStyles,
  applyIfcItemColor,
  attachIfcTransformProxy,
  createEmptyIfcCanonicalIdMap,
  findIfcEditableRoot,
  resolveEditorMaterialFromColor,
  resolveIfcCanonicalLocalIds,
} from './thatopen/ifcSceneHelpers'
import { runIfcMoveWorkflowRegressionCases } from './thatopen/ifcMoveWorkflow.regression'
import { useTransformRuntimeMachine } from './thatopen/useTransformRuntimeMachine'
import {
  isPendingCommitSession,
  isStalePendingCommitSession,
  isTransformOwnerMismatch,
  isTransformSessionLocked,
} from './thatopen/transformSessionGuards'

/** ThatOpenIfcCanvas 컴포넌트 props */
interface ThatOpenIfcCanvasProps {
  /** 로드할 IFC 파일 URL (presigned URL 또는 mock 경로) */
  ifcUrl: string
  /** 현재 프로젝트 ID. 씬 내 모델 ID 생성에 사용된다. */
  projectId?: string | null
  /** 씬에 배치된 라이브러리 프리셋 목록 */
  libraryElements: ThreeDLibraryPreset[]
  /** IFC 요소 변경 이력 (색상·재질·삭제 등) */
  ifcElementChanges: IfcElementChange[]
  /** 증가할 때마다 현재 선택 요소를 삭제하는 트리거 토큰 */
  deleteRequestToken?: number
  /** 카메라 회전 잠금 여부 */
  isRotationLocked: boolean
  /** 현재 줌 스케일 (1.0 = 100%) */
  zoomScale: number
  /** 현재 선택된 IFC 요소 */
  selectedIfcElement?: IfcElementInfo | null
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onIfcElementDelete?: (element: IfcElementInfo) => void
  onLibraryElementChange?: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete?: (id: string) => void
  onThreeDCoordinatesChange?: (coords: { x: number; y: number; z: number }) => void
  /** IFC 로드 완료 시 파싱된 건물 층 목록을 전달하는 콜백 */
  onStoreysLoad?: (storeys: IfcStoreyInfo[]) => void
  /** 현재 표시할 층의 expressId. null이면 전체 표시 */
  activeStoreyExpressId?: number | null
  /** 겹쳐보기로 함께 표시할 층 expressId 목록 */
  overlayIfcStoreyExpressIds?: number[]
  /** 겹쳐보기 층별 투명도 (0.1~1) */
  overlayIfcStoreyOpacityByExpressId?: Record<number, number>
  /** 계층구조에서 선택 요청한 IFC 요소 localId */
  requestedIfcElementLocalId?: number | null
  /** 계층구조 IFC 요소 선택 요청 토큰 */
  ifcElementSelectionRequestToken?: number
  /** 계층구조에서 선택 요청한 라이브러리 요소 id */
  requestedLibraryElementId?: string | null
  /** 계층구조 라이브러리 요소 선택 요청 토큰 */
  libraryElementSelectionRequestToken?: number
  /** TransformControls 모드: 이동(translate) / 회전(rotate) / 크기(scale) */
  transformMode?: 'translate' | 'rotate' | 'scale'
}

interface LoadedFragmentModel {
  object: Object3D
  useCamera: (camera: unknown) => void
}

type MovedIfcProxyRegistryRecord = {
  key: string
  rootModelId: string
  modelId: string
  hideLocalIds: number[]
  object: IfcEditableObject3D
  element?: IfcElementInfo
  keepModelHiddenAfterCommit: boolean
}

type ComponentsModule = typeof import('@thatopen/components')
type TransformControlsModule = typeof import('three/examples/jsm/controls/TransformControls.js')
type IfcRaycastPick = {
  fragments?: { modelId: string }
  localId?: number
  itemId?: number
  object?: Object3D
  distance?: number
} | null

const IFC_MOVE_DEBUG = import.meta.env.VITE_3D_MOVE_DEBUG === 'true'
const IFC_MOVE_ALWAYS_TRACE_EVENTS = new Set<string>([
  'drag_start',
  'drag_end',
  'commit_queue_schedule',
  'commit_queue_execute_immediate',
  'commit_queue_execute',
  'commit_start',
  'commit_success',
  'commit_failure',
  'commit_timing',
  'commit_apply_changes_start',
  'commit_apply_changes_done',
  'commit_core_update_start',
  'commit_core_update_done',
  'commit_core_update_failed',
  'commit_visibility_strategy',
  'commit_visibility_rehide_start',
  'commit_visibility_rehide_done',
  'commit_visibility_rehide_failed',
  'pending_unpersisted_color_reapply_start',
  'pending_unpersisted_color_reapply_done',
  'pending_unpersisted_color_reapply_failed',
  'commit_visibility_scope',
  'canonical_alias_expansion',
  'visibility_scope_suspicious',
  'drag_end_schedule_commit',
  'transform_attach_skip_detached',
  'transform_attach_rebind_start',
  'transform_attach_rebind_done',
  'transform_attach_rebind_failed',
  'selection_switch_clear_previous',
  'selection_switch_commit_decision',
  'selection_switch_clear_timing',
  'selection_switch_atomic_defer_restore',
  'selection_switch_atomic_restore_apply',
  'selection_switch_atomic_restore_skip',
  'storey_visibility_effect_apply',
  'storey_visibility_effect_skip_same_signature',
  'window_blur_flush_skip_clean',
  'window_blur_save_flush_skip_active_ifc_selection',
  'commit_save_mark_pending',
  'commit_save_flush_pending',
  'commit_save_flush_skip_none',
  'commit_save_auto_disabled_skip_flush',
  'commit_save_deferred_schedule',
  'commit_save_deferred_idle_schedule',
  'commit_save_deferred_skip_inflight',
  'commit_save_deferred_postpone_active_selection',
  'commit_save_deferred_force_after_postpone_limit',
  'commit_save_deferred_success',
  'commit_save_deferred_failed',
  'commit_save_force_sync_start',
  'commit_save_force_sync_success',
  'commit_save_force_sync_failed',
  'commit_save_force_sync_skip_none',
  'commit_save_force_sync_skip_auto_enabled',
  'selection_switch_force_sync_saved',
  'local3d_canvas_mounted',
  'pick_candidates',
  'pick_floor_object',
  'pick_ifc_raycast_status',
  'pick_ifc_raycast_retry_without_proxy',
  'pick_blocked_by_transform_helper_hit',
  'pick_skipped_while_transform_dragging',
  'pick_transform_dragging_stale_recovered',
  'pick_transform_dragging_force_release',
  'pick_blocked_by_transform_dragging',
  'transform_dragging_force_release_on_pointerup',
  'transform_dragging_force_release_on_blur',
  'transform_interaction_state_reset',
  'transform_mode_rebind',
  'pick_no_hit',
  'library_sync_start',
  'library_sync_rebuild_done',
  'transform_commit',
])
const IFC_AUTO_SAVE_ON_MOVE = false
const IFC_SAVE_DEBOUNCE_MS = 1200
const IFC_SAVE_MAX_POSTPONE_MS = 6000
const IFC_COMMIT_QUEUE_DELAY_MS = 0
const IFC_COMMIT_QUIET_WINDOW_MS = 0
const DELTA_MODEL_TOKEN = '-DELTA-MODEL-'
const LEGACY_DELTA_MODEL_TOKEN = '-DELTADEL-'
const containsAllIds = (allIds: number[], subset: number[]) => {
  const base = new Set(allIds)
  return subset.every((id) => base.has(id))
}
const isDeltaModelId = (modelId?: string | null) => (
  Boolean(modelId && (modelId.includes(DELTA_MODEL_TOKEN) || modelId.includes(LEGACY_DELTA_MODEL_TOKEN)))
)
const normalizeRootModelId = (modelId: string | undefined, fallbackModelId: string) => {
  if (!modelId) return fallbackModelId
  const deltaIndex = modelId.indexOf(DELTA_MODEL_TOKEN)
  if (deltaIndex >= 0) return modelId.slice(0, deltaIndex)
  const legacyDeltaIndex = modelId.indexOf(LEGACY_DELTA_MODEL_TOKEN)
  if (legacyDeltaIndex >= 0) return modelId.slice(0, legacyDeltaIndex)
  return modelId
}
const getFirstMeshColorHex = (THREE: ThreeModule, object?: Object3D) => {
  if (!object) return undefined
  let resolved: string | undefined
  object.traverse((child) => {
    if (resolved) return
    if (!(child instanceof THREE.Mesh)) return
    const material = Array.isArray(child.material) ? child.material[0] : child.material
    const color = (material as { color?: { getHexString?: () => string } })?.color
    const hex = color?.getHexString?.()
    if (hex) resolved = `#${hex.toUpperCase()}`
  })
  return resolved
}
const traceIfcMove = (event: string, payload?: Record<string, unknown>) => {
  try {
    if (payload) {
      console.log(`[IFC_MOVE][TRACE] ${event}`, payload)
      return
    }
    console.log(`[IFC_MOVE][TRACE] ${event}`)
  } catch {
    // no-op
  }
}
const IFC_MOVE_BUILD_MARKER = 'ifc-move-debug-build-2026-05-11-09'
const TRANSFORM_GIZMO_AXIS_NAMES = new Set([
  'X', 'Y', 'Z', 'E',
  'XY', 'YZ', 'XZ',
  'XYZ', 'XYZE',
])

export default function ThatOpenIfcCanvas({
  ifcUrl,
  projectId,
  libraryElements,
  ifcElementChanges,
  deleteRequestToken = 0,
  isRotationLocked,
  zoomScale,
  selectedIfcElement,
  onIfcElementSelect,
  onIfcElementDelete,
  onLibraryElementChange,
  onLibraryElementDelete,
  onThreeDCoordinatesChange,
  onStoreysLoad,
  activeStoreyExpressId,
  overlayIfcStoreyExpressIds,
  overlayIfcStoreyOpacityByExpressId,
  requestedIfcElementLocalId,
  ifcElementSelectionRequestToken = 0,
  requestedLibraryElementId,
  libraryElementSelectionRequestToken = 0,
  transformMode = 'translate',
}: ThatOpenIfcCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<ThatOpenSceneState | null>(null)
  const presetGroupRef = useRef<import('three').Group | null>(null)
  const rotationLockedRef = useRef(isRotationLocked)
  const onIfcElementSelectRef = useRef(onIfcElementSelect)
  const onIfcElementDeleteRef = useRef(onIfcElementDelete)
  const onLibraryElementChangeRef = useRef(onLibraryElementChange)
  const onLibraryElementDeleteRef = useRef(onLibraryElementDelete)
  const onThreeDCoordinatesChangeRef = useRef(onThreeDCoordinatesChange)
  const onStoreysLoadRef = useRef(onStoreysLoad)
  /** 파싱된 층별 요소 ID 맵 (층 필터링에 사용) */
  const elementIdsByStoreyRef = useRef<Map<number, Set<number>>>(new Map())
  /** IFC canonical ID 매핑 (expressId <-> localId) */
  const canonicalIdMapRef = useRef<IfcCanonicalIdMap>(createEmptyIfcCanonicalIdMap())
  const ifcPsetMetricsRef = useRef<IfcPsetMetricMaps>({ byId: {}, byName: {} })
  const selectedTargetRef = useRef<Selected3DTarget>(null)
  const ifcMoveLifecycleRef = useRef<IfcMoveLifecycleState>({
    phase: 'idle',
    targetKey: null,
    lastError: null,
  })
  const deferredSaveTimerRef = useRef<number | null>(null)
  const deferredSaveModelIdRef = useRef<string | null>(null)
  const deferredSaveInFlightRef = useRef(false)
  const deferredSaveScheduledAtRef = useRef(0)
  const deferredSavePostponeCountRef = useRef(0)
  const pendingIfcSaveModelIdRef = useRef<string | null>(null)
  const pendingIfcSaveReasonRef = useRef<string | null>(null)
  const pendingUnpersistedIfcColorByRootRef = useRef<Map<string, Map<number, string>>>(new Map())
  const movedIfcProxyRegistryRef = useRef<Map<string, MovedIfcProxyRegistryRecord>>(new Map())
  const deletedIfcLocalIdSetRef = useRef<Set<number>>(new Set())
  const resetTransformInteractionRef = useRef<((reason: string) => void) | null>(null)
  const storeyVisibilitySignatureRef = useRef<string | null>(null)
  const ifcMoveTraceSeqRef = useRef(0)
  const ifcMoveTraceBufferRef = useRef<Array<{
    seq: number
    at: string
    event: string
    payload?: Record<string, unknown>
  }>>([])
  const regressionCheckedRef = useRef(false)
  const ifcCommitInFlightRef = useRef(false)
  const ifcMoveDirtyRef = useRef(false)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [ifcEditFeedback, setIfcEditFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const isIfcMoveDebugEnabled = useCallback(() => {
    if (IFC_MOVE_DEBUG) return true
    if (typeof window === 'undefined') return false
    try {
      const search = new URLSearchParams(window.location.search)
      const queryFlag = search.get('ifcMoveDebug')
      if (queryFlag === '1' || queryFlag === 'true') return true
      if (window.localStorage?.getItem('ifcMoveDebug') === '1') return true
      const runtimeFlag = (window as Window & { __IFC_MOVE_DEBUG__?: boolean }).__IFC_MOVE_DEBUG__
      return runtimeFlag === true
    } catch {
      return false
    }
  }, [])
  useEffect(() => {
    traceIfcMove('build_marker_loaded', { marker: IFC_MOVE_BUILD_MARKER })
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const win = window as Window & {
      __IFC_MOVE_TRACE__?: Array<{
        seq: number
        at: string
        event: string
        payload?: Record<string, unknown>
      }>
      __dumpIfcMoveTrace__?: () => Array<{
        seq: number
        at: string
        event: string
        payload?: Record<string, unknown>
      }>
      __printIfcMoveTrace__?: (limit?: number) => Array<Record<string, unknown>>
      __clearIfcMoveTrace__?: () => void
      __IFC_MOVE_DEBUG__?: boolean
    }
    win.__IFC_MOVE_TRACE__ = ifcMoveTraceBufferRef.current
    win.__dumpIfcMoveTrace__ = () => [...ifcMoveTraceBufferRef.current]
    win.__printIfcMoveTrace__ = (limit = 100) => {
      const rows = ifcMoveTraceBufferRef.current.slice(-Math.max(1, limit)).map((trace) => ({
        seq: trace.seq,
        at: trace.at,
        event: trace.event,
        ...(trace.payload ?? {}),
      }))
      console.table(rows)
      return rows
    }
    win.__clearIfcMoveTrace__ = () => {
      ifcMoveTraceBufferRef.current = []
      ifcMoveTraceSeqRef.current = 0
    }
  }, [])
  const logIfcMove = useCallback((event: string, payload?: Record<string, unknown>) => {
    const isDebugEnabled = isIfcMoveDebugEnabled()
    const shouldTrace = isDebugEnabled || IFC_MOVE_ALWAYS_TRACE_EVENTS.has(event)
    if (!shouldTrace) return
    const snapshotPayload = (() => {
      if (!payload) return undefined
      try {
        return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
      } catch {
        return payload
      }
    })()
    const entry = {
      seq: ++ifcMoveTraceSeqRef.current,
      at: new Date().toISOString(),
      event,
      payload: snapshotPayload,
    }
    ifcMoveTraceBufferRef.current.push(entry)
    if (ifcMoveTraceBufferRef.current.length > 800) {
      ifcMoveTraceBufferRef.current.splice(0, ifcMoveTraceBufferRef.current.length - 800)
    }
    if (typeof window !== 'undefined') {
      const win = window as Window & {
        __IFC_MOVE_TRACE__?: Array<{
          seq: number
          at: string
          event: string
          payload?: Record<string, unknown>
        }>
      }
      win.__IFC_MOVE_TRACE__ = ifcMoveTraceBufferRef.current
    }
    if (!isDebugEnabled && !IFC_MOVE_ALWAYS_TRACE_EVENTS.has(event)) return
    const logPrefix = isDebugEnabled ? '[IFC_MOVE]' : '[IFC_MOVE][TRACE]'
    if (snapshotPayload) {
      console.log(`${logPrefix}[${entry.seq}] ${event}`, { at: entry.at, ...snapshotPayload })
      return
    }
    console.log(`${logPrefix}[${entry.seq}] ${event}`, { at: entry.at })
  }, [isIfcMoveDebugEnabled])
  const logTransformRuntimeAction = useCallback((payload: {
    [key: string]: unknown
    reason: string
    action: string
    prevPhase: string
    nextPhase: string
    prevSelectedTargetId: number | null
    nextSelectedTargetId: number | null
    prevActiveTransformTargetId: number | null
    nextActiveTransformTargetId: number | null
    prevSessionId: string | null
    nextSessionId: string | null
    pendingCommitSessionId: string | null
  }) => {
    logIfcMove('transform_runtime_action', payload)
  }, [logIfcMove])
  const resolveCanonicalOwnerLocalId = useCallback((target: Selected3DTarget): number | null => {
    if (!target || target.source !== 'ifc') return null
    const editTarget = (target.object as IfcEditableObject3D | undefined)?.userData?.ifcEditTarget
    const resolved = resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
      hitLocalId: target.hitLocalId,
      localId: target.localId,
      proxyLocalIds: editTarget?.localIds,
      expressId: Number.isFinite(Number(editTarget?.element?.expressId))
        ? Number(editTarget?.element?.expressId)
        : undefined,
    })
    if (resolved.length > 0) return resolved[0]
    if (Number.isFinite(target.localId)) return target.localId
    if (Number.isFinite(target.hitLocalId)) return target.hitLocalId
    return null
  }, [])
  const resolveTargetOwnerId = useCallback((target: Selected3DTarget): number | null => {
    if (!target) return null
    if (target.source === 'ifc') return resolveCanonicalOwnerLocalId(target)
    return getLibraryOwnerId(target.object as LibraryObject3D)
  }, [resolveCanonicalOwnerLocalId])
  const {
    stateRef: transformRuntimeStateRef,
    dispatchAction: dispatchTransformRuntimeAction,
    createSessionId: createTransformSessionId,
  } = useTransformRuntimeMachine({
    sessionPrefix: 'tx',
    logAction: logTransformRuntimeAction,
  })
  const syncTransformSelectionState = useCallback((
    target: Selected3DTarget,
    reason: string,
    options?: { attachGizmo?: boolean },
  ) => {
    const ownerId = resolveTargetOwnerId(target)
    dispatchTransformRuntimeAction(
      { type: 'SELECT_TARGET', targetId: ownerId },
      `${reason}:select`,
    )
    if (options?.attachGizmo && Number.isFinite(ownerId)) {
      dispatchTransformRuntimeAction(
        { type: 'ATTACH_GIZMO', targetId: ownerId as number },
        `${reason}:attach`,
      )
    }
  }, [dispatchTransformRuntimeAction, resolveTargetOwnerId])
  /** 현재 transform 세션이 렌더 필터/외부 선택 변경보다 우선권을 가지는지 판별한다. */
  const isRuntimeTransformLocked = useCallback(() => {
    const runtimeState = transformRuntimeStateRef.current
    return isTransformSessionLocked(runtimeState)
  }, [transformRuntimeStateRef])
  useEffect(() => {
    logIfcMove('local3d_canvas_mounted', {
      mode: 'ifc',
      note: 'This session is rendering ThatOpenIfcCanvas, not FloorPlan3DCanvas',
    })
  }, [logIfcMove])
  const logIfcModelSnapshot = useCallback((
    sceneState: ThatOpenSceneState,
    event: string,
    modelId: string,
    localIds: number[] = [],
  ) => {
    if (!isIfcMoveDebugEnabled()) return
    const rootModelId = normalizeRootModelId(modelId, sceneState.modelId)
    const allModelIds = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
    const relatedModelIds = allModelIds.filter((candidateId) => (
      normalizeRootModelId(candidateId, rootModelId) === rootModelId
    ))
    const deltaModelIds = relatedModelIds.filter((candidateId) => isDeltaModelId(candidateId))
    logIfcMove(event, {
      rootModelId,
      modelId,
      relatedModelIds,
      deltaModelIds,
      deltaModelCount: deltaModelIds.length,
      localIds,
    })
  }, [isIfcMoveDebugEnabled, logIfcMove])
  const showIfcEditFeedback = useCallback((kind: 'info' | 'error', text: string) => {
    if (typeof window === 'undefined') return
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
    setIfcEditFeedback({ kind, text })
    logIfcMove('feedback', { kind, text })
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setIfcEditFeedback(null)
      feedbackTimeoutRef.current = null
    }, 4200)
  }, [logIfcMove])
  const scheduleDeferredIfcSave = useCallback((modelId: string, reason: string, delayMs = IFC_SAVE_DEBOUNCE_MS) => {
    if (typeof window === 'undefined') return
    deferredSaveModelIdRef.current = modelId
    deferredSaveScheduledAtRef.current = performance.now()
    deferredSavePostponeCountRef.current = 0
    if (deferredSaveTimerRef.current) {
      window.clearTimeout(deferredSaveTimerRef.current)
      deferredSaveTimerRef.current = null
    }
    logIfcMove('commit_save_deferred_schedule', { modelId, reason, delayMs })
    deferredSaveTimerRef.current = window.setTimeout(() => {
      deferredSaveTimerRef.current = null
      const run = async () => {
        const targetModelId = deferredSaveModelIdRef.current
        const sceneState = sceneRef.current
        if (!targetModelId || !sceneState) return
        const activeSelection = selectedTargetRef.current
        if (
          activeSelection?.source === 'ifc'
          && normalizeRootModelId(activeSelection.modelId, sceneState.modelId)
            === normalizeRootModelId(targetModelId, sceneState.modelId)
        ) {
          deferredSavePostponeCountRef.current += 1
          const postponeElapsedMs = performance.now() - deferredSaveScheduledAtRef.current
          if (postponeElapsedMs < IFC_SAVE_MAX_POSTPONE_MS) {
            if (
              deferredSavePostponeCountRef.current <= 2
              || deferredSavePostponeCountRef.current % 5 === 0
            ) {
              logIfcMove('commit_save_deferred_postpone_active_selection', {
                modelId: targetModelId,
                selectedLocalId: activeSelection.localId,
                selectedHitLocalId: activeSelection.hitLocalId,
                selectedHasProxyObject: Boolean(activeSelection.object),
                retryDelayMs: 900,
                postponeCount: deferredSavePostponeCountRef.current,
                postponeElapsedMs: Number(postponeElapsedMs.toFixed(1)),
              })
            }
            deferredSaveTimerRef.current = window.setTimeout(() => {
              deferredSaveTimerRef.current = null
              void run()
            }, 900)
            return
          }
          logIfcMove('commit_save_deferred_force_after_postpone_limit', {
            modelId: targetModelId,
            selectedLocalId: activeSelection.localId,
            selectedHitLocalId: activeSelection.hitLocalId,
            selectedHasProxyObject: Boolean(activeSelection.object),
            postponeCount: deferredSavePostponeCountRef.current,
            postponeElapsedMs: Number(postponeElapsedMs.toFixed(1)),
            maxPostponeMs: IFC_SAVE_MAX_POSTPONE_MS,
          })
        }
        if (deferredSaveInFlightRef.current) {
          logIfcMove('commit_save_deferred_skip_inflight', { modelId: targetModelId })
          return
        }
        const editor = (sceneState.fragments.core as import('@thatopen/fragments').FragmentsModels & {
          editor?: import('@thatopen/fragments').Editor
        }).editor
        if (!editor || typeof editor.save !== 'function') return
        deferredSaveInFlightRef.current = true
        const startedAt = performance.now()
        try {
          await editor.save(targetModelId)
          deferredSavePostponeCountRef.current = 0
          deferredSaveScheduledAtRef.current = 0
          logIfcMove('commit_save_deferred_success', {
            modelId: targetModelId,
            elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
            skippedCoreUpdate: true,
          })
        } catch (error) {
          deferredSavePostponeCountRef.current = 0
          deferredSaveScheduledAtRef.current = 0
          logIfcMove('commit_save_deferred_failed', {
            modelId: targetModelId,
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          deferredSaveInFlightRef.current = false
        }
      }
      const requestIdle = (window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      }).requestIdleCallback
      if (typeof requestIdle === 'function') {
        logIfcMove('commit_save_deferred_idle_schedule', { modelId, reason })
        requestIdle(() => { void run() }, { timeout: 2000 })
        return
      }
      void run()
    }, delayMs)
  }, [logIfcMove])
  const markPendingIfcSave = useCallback((modelId: string, reason: string) => {
    pendingIfcSaveModelIdRef.current = modelId
    pendingIfcSaveReasonRef.current = reason
    logIfcMove('commit_save_mark_pending', {
      modelId,
      reason,
    })
  }, [logIfcMove])
  const flushPendingIfcSave = useCallback((trigger: string, delayMs = 0) => {
    const modelId = pendingIfcSaveModelIdRef.current
    const pendingReason = pendingIfcSaveReasonRef.current
    if (!modelId || !pendingReason) {
      logIfcMove('commit_save_flush_skip_none', { trigger })
      return
    }
    if (!IFC_AUTO_SAVE_ON_MOVE) {
      logIfcMove('commit_save_auto_disabled_skip_flush', {
        trigger,
        modelId,
        reason: pendingReason,
      })
      pendingIfcSaveModelIdRef.current = null
      pendingIfcSaveReasonRef.current = null
      return
    }
    pendingIfcSaveModelIdRef.current = null
    pendingIfcSaveReasonRef.current = null
    const reason = `${pendingReason}:${trigger}`
    logIfcMove('commit_save_flush_pending', {
      trigger,
      modelId,
      reason,
      delayMs,
    })
    scheduleDeferredIfcSave(modelId, reason, delayMs)
  }, [logIfcMove, scheduleDeferredIfcSave])
  const flushPendingIfcSaveSync = useCallback(async (
    sceneState: ThatOpenSceneState,
    trigger: string,
  ) => {
    const modelId = pendingIfcSaveModelIdRef.current
    const pendingReason = pendingIfcSaveReasonRef.current
    if (!modelId || !pendingReason) {
      logIfcMove('commit_save_force_sync_skip_none', { trigger })
      return false
    }
    if (IFC_AUTO_SAVE_ON_MOVE) {
      logIfcMove('commit_save_force_sync_skip_auto_enabled', {
        trigger,
        modelId,
        reason: pendingReason,
      })
      return false
    }
    pendingIfcSaveModelIdRef.current = null
    pendingIfcSaveReasonRef.current = null
    const reason = `${pendingReason}:${trigger}:force_sync`
    const editor = (sceneState.fragments.core as import('@thatopen/fragments').FragmentsModels & {
      editor?: import('@thatopen/fragments').Editor
    }).editor
    if (!editor || typeof editor.save !== 'function') {
      logIfcMove('commit_save_force_sync_failed', {
        modelId,
        reason,
        error: 'editor.save_unavailable',
      })
      return false
    }
    const startedAt = performance.now()
    logIfcMove('commit_save_force_sync_start', {
      modelId,
      reason,
    })
    try {
      await editor.save(modelId)
      deferredSavePostponeCountRef.current = 0
      deferredSaveScheduledAtRef.current = 0
      pendingUnpersistedIfcColorByRootRef.current.delete(
        normalizeRootModelId(modelId, sceneState.modelId),
      )
      logIfcMove('commit_save_force_sync_success', {
        modelId,
        reason,
        elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      })
      return true
    } catch (error) {
      logIfcMove('commit_save_force_sync_failed', {
        modelId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }, [logIfcMove])
  const getMovedIfcProxyRegistryKey = useCallback((rootModelId: string, localIds: number[]) => {
    const primaryLocalId = localIds.find(Number.isFinite)
    return `${rootModelId}:${Number.isFinite(primaryLocalId) ? primaryLocalId : 'unknown'}`
  }, [])
  const isMovedIfcProxyObject = useCallback((object?: Object3D | null) => {
    if (!object) return false
    return Array.from(movedIfcProxyRegistryRef.current.values()).some((record) => record.object === object)
  }, [])
  const findMovedIfcProxyRecord = useCallback((
    sceneState: ThatOpenSceneState,
    modelId: string,
    localIds: number[],
  ) => {
    const rootModelId = normalizeRootModelId(modelId, sceneState.modelId)
    const localIdSet = new Set(localIds.filter(Number.isFinite))
    if (localIdSet.size === 0) return null
    return Array.from(movedIfcProxyRegistryRef.current.values()).find((record) => (
      record.rootModelId === rootModelId
      && record.hideLocalIds.some((localId) => localIdSet.has(localId))
    )) ?? null
  }, [])
  const registerMovedIfcProxy = useCallback((
    sceneState: ThatOpenSceneState,
    params: {
      modelId: string
      hideLocalIds: number[]
      object: IfcEditableObject3D
      element?: IfcElementInfo
    },
  ) => {
    const rootModelId = normalizeRootModelId(params.modelId, sceneState.modelId)
    const hideLocalIds = Array.from(new Set(params.hideLocalIds.filter(Number.isFinite)))
    if (hideLocalIds.length === 0) return null
    const key = getMovedIfcProxyRegistryKey(rootModelId, hideLocalIds)
    const record: MovedIfcProxyRegistryRecord = {
      key,
      rootModelId,
      modelId: params.modelId,
      hideLocalIds,
      object: params.object,
      element: params.element,
      keepModelHiddenAfterCommit: true,
    }
    params.object.visible = true
    params.object.userData.ifcKeepModelHiddenAfterCommit = true
    movedIfcProxyRegistryRef.current.set(key, record)
    logIfcMove('moved_proxy_registry_register', {
      key,
      rootModelId,
      modelId: params.modelId,
      hideLocalIds,
      registrySize: movedIfcProxyRegistryRef.current.size,
    })
    return record
  }, [getMovedIfcProxyRegistryKey, logIfcMove])
  const removeMovedIfcProxyRecords = useCallback((
    sceneState: ThatOpenSceneState,
    localIds: number[],
    reason: string,
    options: { disposeObject?: boolean } = {},
  ) => {
    const localIdSet = new Set(localIds.filter(Number.isFinite))
    if (localIdSet.size === 0) return
    const removed: string[] = []
    Array.from(movedIfcProxyRegistryRef.current.entries()).forEach(([key, record]) => {
      if (!record.hideLocalIds.some((localId) => localIdSet.has(localId))) return
      movedIfcProxyRegistryRef.current.delete(key)
      removed.push(key)
      if (options.disposeObject) {
        record.object.parent?.remove(record.object)
        disposeObjectMaterials(sceneState.three, record.object)
      }
    })
    if (removed.length > 0) {
      logIfcMove('moved_proxy_registry_remove', {
        reason,
        removed,
        localIds: Array.from(localIdSet),
        registrySize: movedIfcProxyRegistryRef.current.size,
      })
    }
  }, [logIfcMove])
  const rehideMovedIfcProxyRegistry = useCallback(async (
    sceneState: ThatOpenSceneState,
    reason: string,
    options: { forceRender?: boolean } = {},
  ) => {
    const records = Array.from(movedIfcProxyRegistryRef.current.values())
      .filter((record) => record.keepModelHiddenAfterCommit && record.hideLocalIds.length > 0)
    if (records.length === 0) {
      logIfcMove('moved_proxy_registry_rehide_skip_empty', { reason })
      return
    }
    const allModelIds = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
    logIfcMove('moved_proxy_registry_rehide_start', {
      reason,
      recordCount: records.length,
      registrySize: movedIfcProxyRegistryRef.current.size,
    })
    for (const record of records) {
      record.object.visible = true
      const relatedModelIds = allModelIds.filter((candidateId) => (
        normalizeRootModelId(candidateId, record.rootModelId) === record.rootModelId
      ))
      const modelIds = relatedModelIds.length > 0 ? relatedModelIds : [record.modelId]
      for (const modelId of modelIds) {
        try {
          await applyIfcSelectionVisibility(sceneState, {
            modelId,
            localIds: record.hideLocalIds,
            proxyObject: record.object,
            mode: 'proxy',
            proxyOpacity: 1,
            reason: `registry_rehide:${reason}`,
            skipCoreUpdate: true,
            forceRender: false,
          })
        } catch (error) {
          logIfcMove('moved_proxy_registry_rehide_failed', {
            reason,
            key: record.key,
            modelId,
            hideLocalIds: record.hideLocalIds,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
    if (options.forceRender !== false) {
      sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
    }
    logIfcMove('moved_proxy_registry_rehide_done', {
      reason,
      recordCount: records.length,
    })
  }, [logIfcMove])
  const getMovedIfcProxyHideLocalIds = useCallback(() => (
    new Set(Array.from(movedIfcProxyRegistryRef.current.values()).flatMap((record) => record.hideLocalIds))
  ), [])
  const purgeIfcEditOverlays = useCallback((sceneState: ThatOpenSceneState, reason: string) => {
    const targets = [...sceneState.ifcEditGroup.children].filter((child) => !isMovedIfcProxyObject(child))
    if (targets.length === 0) {
      logIfcMove('overlay_purge', { reason, removedCount: 0 })
      return
    }
    targets.forEach((child) => {
      child.parent?.remove(child)
      disposeObjectMaterials(sceneState.three, child)
    })
    logIfcMove('overlay_purge', { reason, removedCount: targets.length })
  }, [isMovedIfcProxyObject, logIfcMove])
  const resolveLocalIdsFromItemIds = useCallback(async (
    sceneState: ThatOpenSceneState,
    modelId: string,
    itemIds: number[],
  ) => {
    if (itemIds.length === 0) return [] as number[]
    const model = (sceneState.fragments.core.models.list as Map<string, unknown>).get(modelId) as {
      getLocalIdsFromItemIds?: (ids: Iterable<number>) => Promise<number[]> | number[]
    } | undefined
    if (!model?.getLocalIdsFromItemIds) return [] as number[]
    try {
      const mapped = await Promise.resolve(model.getLocalIdsFromItemIds(itemIds))
      return (mapped ?? []).filter(Number.isFinite)
    } catch {
      return [] as number[]
    }
  }, [])
  const sanitizeMappedLocalIds = useCallback((
    context: string,
    modelId: string,
    hitLocalId: number | undefined,
    mappedLocalIds: number[],
  ) => {
    const normalized = Array.from(new Set(mappedLocalIds.filter(Number.isFinite)))
    if (!Number.isFinite(hitLocalId) || normalized.length === 0) return normalized
    if (normalized.includes(hitLocalId as number)) return normalized
    logIfcMove(`${context}_item_mapping_mismatch`, {
      modelId,
      hitLocalId,
      mappedLocalIds: normalized,
      fallback: 'ignore_item_mapping',
    })
    return []
  }, [logIfcMove])
  const resolveEditableIfcTargets = useCallback(async (
    sceneState: ThatOpenSceneState,
    preferredModelId: string,
    candidateLocalIds: number[],
  ) => {
    const editor = (sceneState.fragments.core as import('@thatopen/fragments').FragmentsModels & {
      editor?: import('@thatopen/fragments').Editor
    }).editor
    if (!editor) return null
    const rootPreferredModelId = normalizeRootModelId(preferredModelId, sceneState.modelId)
    const rootSceneModelId = normalizeRootModelId(sceneState.modelId, sceneState.modelId)
    const nonDeltaModelIds = Array.from(
      (sceneState.fragments.core.models.list as Map<string, unknown>).keys(),
    ).filter((modelId) => !isDeltaModelId(modelId))
    const modelIdsToTry = Array.from(new Set<string>([
      rootPreferredModelId,
      rootSceneModelId,
      ...nonDeltaModelIds,
    ]))
    for (const candidateModelId of modelIdsToTry) {
      const elementMap = new Map<number, Awaited<ReturnType<typeof editor.getElements>>[number]>()
      for (const localId of candidateLocalIds) {
        try {
          const elements = await editor.getElements(candidateModelId, [localId])
          elements.forEach((element) => {
            if (!element) return
            elementMap.set(element.localId, element)
          })
        } catch {
          // 일부 localId는 editor 조회 대상이 아닐 수 있다.
        }
      }
      if (elementMap.size === 0) continue
      return {
        modelId: candidateModelId,
        editableLocalIds: Array.from(elementMap.keys()),
        editableElements: Array.from(elementMap.values()),
        modelIdsTried: modelIdsToTry,
      }
    }
    return {
      modelId: null,
      editableLocalIds: [] as number[],
      editableElements: [] as Awaited<ReturnType<typeof editor.getElements>>,
      modelIdsTried: modelIdsToTry,
    }
  }, [])
  const reapplyPendingUnpersistedIfcColors = useCallback(async (
    sceneState: ThatOpenSceneState,
    reason: string,
    rootModelIdFilter?: string,
  ) => {
    const rootEntries = Array.from(pendingUnpersistedIfcColorByRootRef.current.entries())
      .filter(([rootModelId]) => !rootModelIdFilter || rootModelId === rootModelIdFilter)
    if (rootEntries.length === 0) return
    for (const [rootModelId, colorMap] of rootEntries) {
      if (colorMap.size === 0) continue
      const perColor = new Map<string, number[]>()
      colorMap.forEach((color, localId) => {
        const arr = perColor.get(color) ?? []
        arr.push(localId)
        perColor.set(color, arr)
      })
      const relatedModelIds = Array.from(
        (sceneState.fragments.core.models.list as Map<string, unknown>).keys(),
      ).filter((candidateId) => normalizeRootModelId(candidateId, rootModelId) === rootModelId)
      if (relatedModelIds.length === 0) continue
      logIfcMove('pending_unpersisted_color_reapply_start', {
        reason,
        rootModelId,
        relatedModelIds,
        colorGroupCount: perColor.size,
        trackedCount: colorMap.size,
      })
      try {
        // NOTE:
        // fragments.highlight on mixed root/delta model groups intermittently throws
        // "mesh.material.slice is not a function" in runtime bundle.
        // Until upstream/lib-safe target filtering is guaranteed, keep only the
        // tracking/logging path and rely on force-sync save on selection switch.
        perColor.forEach((localIds, color) => {
          void color
          void localIds
        })
        logIfcMove('pending_unpersisted_color_reapply_done', {
          reason,
          rootModelId,
          relatedModelIds,
          colorGroupCount: perColor.size,
          trackedCount: colorMap.size,
          strategy: 'skip_fragments_highlight_runtime_guard',
        })
      } catch (error) {
        logIfcMove('pending_unpersisted_color_reapply_failed', {
          reason,
          rootModelId,
          relatedModelIds,
          error: String(error),
        })
      }
    }
  }, [logIfcMove])
  const registerCanonicalIds = useCallback((expressIdRaw: number | string | undefined, localIds: number[]) => {
    const expressId = Number(expressIdRaw)
    if (!Number.isFinite(expressId)) return
    const normalizedLocalIds = localIds.filter(Number.isFinite)
    if (normalizedLocalIds.length === 0) return
    normalizedLocalIds.forEach((localId) => {
      canonicalIdMapRef.current.expressIdByLocalId.set(localId, expressId)
    })
    const existing = canonicalIdMapRef.current.localIdsByExpressId.get(expressId)
    if (existing) {
      const beforeSize = existing.size
      normalizedLocalIds.forEach((localId) => existing.add(localId))
      if (existing.size > 12 && existing.size > beforeSize) {
        logIfcMove('canonical_alias_expansion', {
          expressId,
          beforeSize,
          afterSize: existing.size,
          appendedCount: normalizedLocalIds.length,
          localIdsSample: Array.from(existing).slice(0, 12),
        })
      }
      return
    }
    const created = new Set<number>(normalizedLocalIds)
    canonicalIdMapRef.current.localIdsByExpressId.set(expressId, created)
    if (created.size > 12) {
      logIfcMove('canonical_alias_expansion', {
        expressId,
        beforeSize: 0,
        afterSize: created.size,
        appendedCount: normalizedLocalIds.length,
        localIdsSample: Array.from(created).slice(0, 12),
      })
    }
  }, [logIfcMove])
  const commitIfcProxyTransformToModel = useCallback(async (
    sceneState: ThatOpenSceneState,
    target: Extract<Selected3DTarget, { source: 'ifc' }>,
    options?: {
      keepProxyVisibleAfterCommit?: boolean
      transformSessionId?: string | null
    },
  ) => {
    const requestedSessionId = options?.transformSessionId ?? null
    const runtimeStateAtStart = transformRuntimeStateRef.current
    if (isStalePendingCommitSession(runtimeStateAtStart, requestedSessionId)) {
      logIfcMove('commit_stale_session_ignored', {
        stage: 'start',
        requestedSessionId,
        pendingCommitSessionId: runtimeStateAtStart.pendingCommitSessionId,
        phase: runtimeStateAtStart.phase,
      })
      return
    }
    if (!target.object) return
    const commitStartedAt = performance.now()
    const logCommitTiming = (phase: string) => {
      logIfcMove('commit_timing', {
        phase,
        elapsedMs: Number((performance.now() - commitStartedAt).toFixed(1)),
        modelId: target.modelId,
        localId: target.localId,
        hitLocalId: target.hitLocalId,
      })
    }
    const normalizedTargetModelId = normalizeRootModelId(target.modelId, sceneState.modelId)

    const editor = (sceneState.fragments.core as import('@thatopen/fragments').FragmentsModels & {
      editor?: import('@thatopen/fragments').Editor
    }).editor
    const targetKey = getIfcMoveTargetKey(normalizedTargetModelId, target.localId)
    ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
      type: 'commit_start',
      targetKey,
    })
    logIfcMove('commit_start', {
      targetKey,
      modelId: normalizedTargetModelId,
      localId: target.localId,
      hitLocalId: target.hitLocalId,
      hitItemId: target.hitItemId,
    })
    logCommitTiming('start')
    if (!editor) {
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_failure',
        targetKey,
        message: 'Fragments editor unavailable',
      })
      logIfcMove('commit_failure', { targetKey, reason: 'Fragments editor unavailable' })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }

    target.object.updateMatrixWorld(true)
    const worldMatrix = target.object.matrixWorld.clone()
    const previousElements = (target.object.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix
    const previousWorldMatrix = new sceneState.three.Matrix4()
    if (Array.isArray(previousElements) && previousElements.length === 16) {
      previousWorldMatrix.fromArray(previousElements)
    } else {
      previousWorldMatrix.copy(worldMatrix)
    }
    const deltaMatrix = worldMatrix.clone().multiply(previousWorldMatrix.clone().invert())
    const deltaPosition = new sceneState.three.Vector3()
    const deltaQuaternion = new sceneState.three.Quaternion()
    const deltaScale = new sceneState.three.Vector3()
    deltaMatrix.decompose(deltaPosition, deltaQuaternion, deltaScale)
    const isIdentityDelta = hasIdentityMatrixDelta(deltaMatrix.elements)
    if (isIdentityDelta) {
      ;(target.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit = false
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_success',
        targetKey,
      })
      logIfcMove('commit_skip_identity_delta', { targetKey })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }

    const editTarget = (target.object as IfcEditableObject3D).userData.ifcEditTarget
    const proxyColorHex = getFirstMeshColorHex(sceneState.three, target.object)
    const proxyInferredMaterial = resolveEditorMaterialFromColor(proxyColorHex)
    const commitMaterialName = editTarget?.element?.material
    const commitDisplayColor = editTarget?.element?.color
      ?? (commitMaterialName ? getMaterialDefaultColor(commitMaterialName) : undefined)
    logIfcMove('commit_visual_style_resolved', {
      targetKey,
      elementMaterial: editTarget?.element?.material ?? null,
      elementColor: editTarget?.element?.color ?? null,
      proxyColorHex: proxyColorHex ?? null,
      proxyInferredMaterial: proxyInferredMaterial ?? null,
      commitMaterialName: commitMaterialName ?? null,
      commitDisplayColor: commitDisplayColor ?? null,
      proxyColorUsedForCommit: false,
    })
    const proxyLocalIds = (editTarget?.localIds ?? []).filter(Number.isFinite)
    const rawItemMappedLocalIds = Number.isFinite(target.hitItemId)
      ? await resolveLocalIdsFromItemIds(sceneState, normalizedTargetModelId, [target.hitItemId as number])
      : []
    const itemMappedLocalIds = sanitizeMappedLocalIds(
      'commit',
      normalizedTargetModelId,
      target.hitLocalId,
      rawItemMappedLocalIds,
    )
    const candidateLocalIds = resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
      hitLocalId: target.hitLocalId,
      localId: target.localId,
      expressId: Number.isFinite(Number(editTarget?.element?.expressId))
        ? Number(editTarget?.element?.expressId)
        : undefined,
      proxyLocalIds,
      itemMappedLocalIds,
    })
    logIfcMove('commit_candidates_resolved', {
      targetKey,
      proxyLocalIds,
      itemMappedLocalIds,
      candidateLocalIds,
      deltaPosition: { x: deltaPosition.x, y: deltaPosition.y, z: deltaPosition.z },
    })
    if (candidateLocalIds.length === 0) {
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_failure',
        targetKey,
        message: 'No canonical localIds resolved',
      })
      logIfcMove('commit_failure', { targetKey, reason: 'No canonical localIds resolved' })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }

    const editability = await resolveEditableIfcTargets(sceneState, normalizedTargetModelId, candidateLocalIds)
    logIfcMove('commit_editability_resolved', {
      targetKey,
      candidateLocalIds,
      editableModelId: editability?.modelId ?? null,
      editableLocalIds: editability?.editableLocalIds ?? [],
      modelIdsTried: editability?.modelIdsTried ?? [],
    })
    if (!editability || !editability.modelId || editability.editableLocalIds.length === 0) {
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_failure',
        targetKey,
        message: 'No editable IFC elements found',
      })
      console.warn('[editor] IFC 이동 커밋 대상 조회 실패', {
        modelId: normalizedTargetModelId,
        hitLocalId: target.hitLocalId,
        localId: target.localId,
        hitItemId: target.hitItemId,
        modelIdsTried: editability?.modelIdsTried ?? [],
        candidateLocalIds,
      })
      logIfcMove('commit_failure', {
        targetKey,
        reason: 'No editable IFC elements found',
        candidateLocalIds,
        modelIdsTried: editability?.modelIdsTried ?? [],
      })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }
    const requiredLocalIds = itemMappedLocalIds.length > 0 ? itemMappedLocalIds : candidateLocalIds
    if (!containsAllIds(editability.editableLocalIds, requiredLocalIds)) {
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_failure',
        targetKey,
        message: 'Partial editable coverage detected',
      })
      logIfcMove('commit_failure_partial_coverage', {
        targetKey,
        requiredLocalIds,
        editableLocalIds: editability.editableLocalIds,
      })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }
    const editableModelId = editability.modelId
    const editableElements = editability.editableElements
    const affectedLocalIds = new Set<number>(editability.editableLocalIds)
    const visibilityLocalIdsRaw = Array.from(new Set<number>(
      [target.hitLocalId, target.localId].filter(Number.isFinite),
    ))
    const visibilityLocalIds = visibilityLocalIdsRaw.length > 0
      ? visibilityLocalIdsRaw
      : Array.from(affectedLocalIds).slice(0, 1)
    logIfcMove('commit_visibility_scope', {
      targetKey,
      affectedCount: affectedLocalIds.size,
      affectedSample: Array.from(affectedLocalIds).slice(0, 12),
      visibilityCount: visibilityLocalIds.length,
      visibilityLocalIds,
    })
    if (affectedLocalIds.size > 12) {
      logIfcMove('visibility_scope_suspicious', {
        targetKey,
        reason: 'affected_local_ids_too_large_for_visibility',
        affectedCount: affectedLocalIds.size,
        visibilityCount: visibilityLocalIds.length,
      })
    }
    const targetMatricesByLocalId = new Map<number, number[]>()
    logIfcMove('commit_visibility_prepare_skip', {
      targetKey,
      stage: 'prepare',
      reason: 'proxy_visibility_already_managed_on_pick',
      localIds: visibilityLocalIds,
    })

    const elementsForApply: Awaited<ReturnType<typeof editor.getElements>> = []
    for (const element of editableElements) {
      try {
        const materialIdsInElement = Array.from(new Set(
          Object.values(
            ((element as unknown as {
              core?: { samples?: Record<number, { material: number }> }
            }).core?.samples ?? {}),
          )
            .map((sample) => sample?.material)
            .filter((materialId) => Number.isFinite(materialId)) as number[],
        ))
        logIfcMove('commit_element_material_ids', {
          targetKey,
          elementLocalId: element.localId,
          materialIdsInElement,
        })
        const beforeMeshes = await element.getMeshes()
        const beforeMatrix = beforeMeshes.matrix.clone()
        const meshes = await element.getMeshes()
        meshes.applyMatrix4(deltaMatrix)
        meshes.updateMatrix()
        await element.setMeshes(meshes)
        const internalAfterRoot = element as unknown as {
          updateRequests?: Record<string, unknown>
          core?: {
            globalTransforms?: Record<string, unknown>
            localTransforms?: Record<string, unknown>
          }
          getGlobalTransformId?: () => number
        }
        const rootUpdateRequestKeys = Object.keys(internalAfterRoot.updateRequests ?? {})
        logIfcMove('commit_element_after_root_setMeshes', {
          targetKey,
          elementLocalId: element.localId,
          globalTransformId: internalAfterRoot.getGlobalTransformId?.(),
          globalTransformKeys: Object.keys(internalAfterRoot.core?.globalTransforms ?? {}),
          localTransformKeys: Object.keys(internalAfterRoot.core?.localTransforms ?? {}),
          rootUpdateRequestKeys,
          rootUpdateRequestCount: rootUpdateRequestKeys.length,
          beforeMatrix: beforeMatrix.elements,
          afterMatrix: meshes.matrix.elements,
        })
        if (rootUpdateRequestKeys.length === 0) {
          // 일부 모델은 root(global)보다 sample(local transform) 갱신에서만 변경 요청이 생성된다.
          const fallbackMeshes = await element.getMeshes()
          fallbackMeshes.children.forEach((child) => {
            child.applyMatrix4(deltaMatrix)
            child.updateMatrix()
          })
          await element.setMeshes(fallbackMeshes)
          const internalAfterLocal = element as unknown as {
            updateRequests?: Record<string, unknown>
          }
          logIfcMove('commit_element_after_local_setMeshes', {
            targetKey,
            elementLocalId: element.localId,
            localUpdateRequestKeys: Object.keys(internalAfterLocal.updateRequests ?? {}),
          })
        }
        const matrixForPersist = await element.getMeshes()
        targetMatricesByLocalId.set(element.localId, Array.from(matrixForPersist.matrix.elements))
        const internalRequestSnapshot = element as unknown as {
          getRequests?: () => Array<{ type?: number; localId?: number; data?: unknown }> | null
        }
        const elementRequests = internalRequestSnapshot.getRequests?.() ?? []
        const updateMaterialRequestLocalIds = elementRequests
          .filter((request) => request?.type === 7)
          .map((request) => request.localId)
        logIfcMove('commit_element_requests_snapshot', {
          targetKey,
          elementLocalId: element.localId,
          totalRequestCount: elementRequests.length,
          requestTypes: elementRequests.map((request) => request.type),
          updateMaterialRequestLocalIds,
        })
        elementsForApply.push(element)
      } catch {
        // 일부 element는 메쉬 업데이트가 불가능할 수 있다.
      }
    }
    if (elementsForApply.length === 0) {
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_failure',
        targetKey,
        message: 'Mesh update rejected for all elements',
      })
      console.warn('[editor] IFC 이동 커밋 메쉬 적용 실패', {
        modelId: normalizedTargetModelId,
        editableLocalIds: editableElements.map((element) => element.localId),
      })
      logIfcMove('commit_failure', {
        targetKey,
        reason: 'Mesh update rejected for all elements',
        editableLocalIds: editableElements.map((element) => element.localId),
      })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }
    const applyChangesStartedAt = performance.now()
    logIfcMove('commit_apply_changes_start', {
      targetKey,
      editableModelId,
      elementCount: elementsForApply.length,
    })
    const appliedChangeIds = await editor.applyChanges(editableModelId, elementsForApply)
    logIfcMove('commit_apply_changes_done', {
      targetKey,
      editableModelId,
      elementCount: elementsForApply.length,
      appliedCount: appliedChangeIds.length,
      elapsedMs: Number((performance.now() - applyChangesStartedAt).toFixed(1)),
    })
    logIfcMove('commit_apply_changes_result', {
      targetKey,
      appliedChangeIds,
      appliedCount: appliedChangeIds.length,
    })
    if (appliedChangeIds.length > 0) {
      const coreUpdateStartedAt = performance.now()
      const modelIdsBeforeUpdate = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
      logIfcMove('commit_core_update_start', {
        targetKey,
        reason: 'apply_changes',
        force: false,
        modelCountBefore: modelIdsBeforeUpdate.length,
        modelIdsBefore: modelIdsBeforeUpdate,
      })
      try {
        await sceneState.fragments.core.update(false)
      } catch (error) {
        logIfcMove('commit_core_update_failed', {
          targetKey,
          reason: 'apply_changes',
          force: false,
          error: String(error),
          fallback: 'retry_force_true',
        })
        await sceneState.fragments.core.update(true)
      }
      const modelIdsAfterUpdate = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
      logIfcMove('commit_core_update_done', {
        targetKey,
        reason: 'apply_changes',
        force: false,
        modelCountAfter: modelIdsAfterUpdate.length,
        modelIdsAfter: modelIdsAfterUpdate,
        elapsedMs: Number((performance.now() - coreUpdateStartedAt).toFixed(1)),
      })
      logCommitTiming('after_apply_changes_update')
      logIfcModelSnapshot(sceneState, 'commit_models_after_apply', editableModelId, Array.from(affectedLocalIds))
    } else {
      logIfcMove('commit_after_apply_update_skipped', {
        targetKey,
        reason: 'applied_count_zero',
      })
    }
    const modelIdsAfterApply = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
    const rootModelIdAfterApply = normalizeRootModelId(editableModelId, sceneState.modelId)
    const deltaModelIdsAfterApply = modelIdsAfterApply.filter((candidateId) => (
      normalizeRootModelId(candidateId, rootModelIdAfterApply) === rootModelIdAfterApply
      && isDeltaModelId(candidateId)
    ))
    const transformRequestsForReplay = elementsForApply.flatMap((element) => {
      const requests = (element as unknown as {
        getRequests?: () => Array<{ type?: number; localId?: number; data?: unknown }> | null
      }).getRequests?.() ?? []
      return requests.filter((request) => request?.type === 10 || request?.type === 8)
    }) as import('@thatopen/fragments').EditRequest[]
    let didPersistToRootModel = false
    if (appliedChangeIds.length === 0) {
      logIfcMove('commit_zero_changes_fallback_start', {
        targetKey,
        deltaModelIdsAfterApply,
        deltaModelCount: deltaModelIdsAfterApply.length,
        transformReplayCount: transformRequestsForReplay.length,
      })
      const modelForTransforms = (sceneState.fragments.core.models.list as Map<string, unknown>).get(editableModelId) as {
        getGlobalTranformsIdsOfItems?: (ids: number[]) => Promise<number[]>
        getGlobalTransforms?: (
          localIds?: Iterable<number>,
        ) => Promise<Map<number, import('@thatopen/fragments').RawGlobalTransformData>>
      } | undefined
      const manualTransformRequests: import('@thatopen/fragments').EditRequest[] = []
      if (modelForTransforms?.getGlobalTranformsIdsOfItems && modelForTransforms?.getGlobalTransforms) {
        for (const [elementLocalId, matrixElements] of targetMatricesByLocalId.entries()) {
          const transformIds = await modelForTransforms.getGlobalTranformsIdsOfItems([elementLocalId]).catch(() => [])
          if (!transformIds || transformIds.length === 0) {
            logIfcMove('commit_manual_transform_missing_transform_id', { targetKey, elementLocalId })
            continue
          }
          const transforms = await modelForTransforms.getGlobalTransforms(transformIds).catch(() => new Map())
          const transformId = transformIds[0]
          const currentTransform = transforms.get(transformId)
          const toSafeNumber = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback)
          const nextPosition = [
            toSafeNumber(matrixElements[12], currentTransform?.position?.[0] ?? 0),
            toSafeNumber(matrixElements[13], currentTransform?.position?.[1] ?? 0),
            toSafeNumber(matrixElements[14], currentTransform?.position?.[2] ?? 0),
          ]
          const nextXDirection = [
            toSafeNumber(matrixElements[0], currentTransform?.xDirection?.[0] ?? 1),
            toSafeNumber(matrixElements[1], currentTransform?.xDirection?.[1] ?? 0),
            toSafeNumber(matrixElements[2], currentTransform?.xDirection?.[2] ?? 0),
          ]
          const nextYDirection = [
            toSafeNumber(matrixElements[4], currentTransform?.yDirection?.[0] ?? 0),
            toSafeNumber(matrixElements[5], currentTransform?.yDirection?.[1] ?? 1),
            toSafeNumber(matrixElements[6], currentTransform?.yDirection?.[2] ?? 0),
          ]
          manualTransformRequests.push({
            type: 10,
            localId: transformId,
            data: {
              position: nextPosition,
              xDirection: nextXDirection,
              yDirection: nextYDirection,
              itemId: currentTransform?.itemId ?? elementLocalId,
            },
          } as import('@thatopen/fragments').EditRequest)
        }
      }
      logIfcMove('commit_manual_transform_requests', {
        targetKey,
        requestCount: manualTransformRequests.length,
        elementLocalIds: Array.from(targetMatricesByLocalId.keys()),
      })
      const transformRequestsToPersist = manualTransformRequests.length > 0
        ? manualTransformRequests
        : transformRequestsForReplay
      if (transformRequestsToPersist.length > 0) {
        logIfcMove('commit_zero_changes_transform_replay_apply', {
          targetKey,
          requestCount: transformRequestsToPersist.length,
          source: manualTransformRequests.length > 0 ? 'manual_transform' : 'element_requests_replay',
        })
        await editor.edit(editableModelId, transformRequestsToPersist)
        const coreUpdateStartedAt = performance.now()
        const modelIdsBeforeUpdate = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
        logIfcMove('commit_core_update_start', {
          targetKey,
          reason: 'manual_transform_replay',
          force: false,
          modelCountBefore: modelIdsBeforeUpdate.length,
          modelIdsBefore: modelIdsBeforeUpdate,
        })
        try {
          await sceneState.fragments.core.update(false)
        } catch (error) {
          logIfcMove('commit_core_update_failed', {
            targetKey,
            reason: 'manual_transform_replay',
            force: false,
            error: error instanceof Error ? error.message : String(error),
            fallback: 'retry_force_true',
          })
          await sceneState.fragments.core.update(true)
        }
        const modelIdsAfterUpdate = Array.from((sceneState.fragments.core.models.list as Map<string, unknown>).keys())
        logIfcMove('commit_core_update_done', {
          targetKey,
          reason: 'manual_transform_replay',
          force: false,
          modelCountAfter: modelIdsAfterUpdate.length,
          modelIdsAfter: modelIdsAfterUpdate,
          elapsedMs: Number((performance.now() - coreUpdateStartedAt).toFixed(1)),
        })
        logCommitTiming('after_manual_transform_edit_update')
        logIfcModelSnapshot(sceneState, 'commit_models_after_manual_transform_edit', editableModelId, Array.from(affectedLocalIds))
        if (typeof editor.save === 'function') {
          markPendingIfcSave(editableModelId, 'manual_transform_fallback')
          didPersistToRootModel = IFC_AUTO_SAVE_ON_MOVE
          logIfcMove('commit_manual_transform_save_pending', { targetKey, editableModelId })
        }
      } else {
        logIfcMove('commit_zero_changes_no_transform_requests', {
          targetKey,
          reason: 'No transform requests were produced for replay',
          appliedChangeIds,
          deltaModelIdsAfterApply,
        })
      }
    }
    if (!didPersistToRootModel && typeof editor.save === 'function') {
      try {
        markPendingIfcSave(editableModelId, 'normal_commit')
        didPersistToRootModel = IFC_AUTO_SAVE_ON_MOVE
        logIfcMove('commit_save_pending', { targetKey, editableModelId })
      } catch (error) {
        logIfcMove('commit_save_failed', {
          targetKey,
          editableModelId,
          error: error instanceof globalThis.Error ? error.message : String(error),
        })
      }
    }
    if (isIfcMoveDebugEnabled()) {
      try {
        const verified = await editor.getElements(editableModelId, [editability.editableLocalIds[0]])
        const firstElement = verified[0]
        if (firstElement) {
          const verifiedMeshes = await firstElement.getMeshes()
          logIfcMove('commit_post_verify_first_element_matrix', {
            targetKey,
            elementLocalId: firstElement.localId,
            matrix: verifiedMeshes.matrix.elements,
          })
        }
      } catch (error) {
        logIfcMove('commit_post_verify_failed', {
          targetKey,
          error: error instanceof globalThis.Error ? error.message : String(error),
        })
      }
    }
    const rootModelIdAfterCommit = normalizeRootModelId(editableModelId, sceneState.modelId)
    const relatedModelIdsAfterCommit = Array.from(
      (sceneState.fragments.core.models.list as Map<string, unknown>).keys(),
    ).filter((candidateId) => (
      normalizeRootModelId(candidateId, rootModelIdAfterCommit) === rootModelIdAfterCommit
    ))
    const deltaModelIdsAfterCommit = relatedModelIdsAfterCommit.filter((candidateId) => isDeltaModelId(candidateId))
    const unpersistedDeltaExists = !didPersistToRootModel && deltaModelIdsAfterCommit.length > 0
    const keepProxyVisibleAfterCommit = options?.keepProxyVisibleAfterCommit === true
    const shouldKeepModelHiddenAfterCommit = keepProxyVisibleAfterCommit || unpersistedDeltaExists
    const visibilityModeAfterCommit: 'proxy' | 'model' = keepProxyVisibleAfterCommit ? 'proxy' : 'model'
    logIfcMove('commit_visibility_strategy', {
      targetKey,
      rootModelId: rootModelIdAfterCommit,
      relatedModelIds: relatedModelIdsAfterCommit,
      deltaModelIds: deltaModelIdsAfterCommit,
      didPersistToRootModel,
      unpersistedDeltaExists,
      keepModelHiddenAfterCommit: shouldKeepModelHiddenAfterCommit,
      visibilityMode: visibilityModeAfterCommit,
    })
    const commitHideLocalIds = Array.from(new Set<number>([
      target.hitLocalId,
      target.localId,
      Number(editTarget?.element?.expressId),
      ...proxyLocalIds,
      ...itemMappedLocalIds,
      ...candidateLocalIds,
      ...editability.editableLocalIds,
      ...Array.from(affectedLocalIds),
    ].filter(Number.isFinite)))
    ;(target.object as IfcEditableObject3D).userData.ifcEditTarget = {
      ...(target.object as IfcEditableObject3D).userData.ifcEditTarget!,
      modelId: editableModelId,
      localIds: commitHideLocalIds,
      hitLocalId: editableElements[0]?.localId ?? target.hitLocalId,
    }
    ;(target.object.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
      Array.from(worldMatrix.elements)
    ;(target.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit = true
    registerMovedIfcProxy(sceneState, {
      modelId: editableModelId,
      hideLocalIds: commitHideLocalIds,
      object: target.object as IfcEditableObject3D,
      element: editTarget?.element,
    })
    const rehideLocalIds = commitHideLocalIds.length > 0
      ? commitHideLocalIds
      : visibilityLocalIds
    const rehideModelIds = relatedModelIdsAfterCommit.length > 0
      ? relatedModelIdsAfterCommit
      : [editableModelId]
    logIfcMove('commit_visibility_rehide_start', {
      targetKey,
      stage: 'finalize',
      modelIds: rehideModelIds,
      localIds: rehideLocalIds,
      visibilityModeAfterCommit,
      keepProxyVisibleAfterCommit,
      keepModelHiddenAfterCommit: shouldKeepModelHiddenAfterCommit,
    })
    if (shouldKeepModelHiddenAfterCommit && target.object) {
      target.object.visible = true
      for (const modelId of rehideModelIds) {
        try {
          await applyIfcSelectionVisibility(sceneState, {
            modelId,
            localIds: rehideLocalIds,
            proxyObject: target.object,
            mode: 'proxy',
            proxyOpacity: 1,
            reason: 'commit_rehide_after_core_update',
            skipCoreUpdate: true,
            forceRender: false,
          })
          logIfcMove('commit_visibility_rehide_done', {
            targetKey,
            modelId,
            localIds: rehideLocalIds,
          })
        } catch (error) {
          logIfcMove('commit_visibility_rehide_failed', {
            targetKey,
            modelId,
            localIds: rehideLocalIds,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } else {
      logIfcMove('commit_visibility_rehide_done', {
        targetKey,
        skipped: true,
        reason: shouldKeepModelHiddenAfterCommit ? 'missing_proxy_object' : 'model_restore_allowed',
        modelIds: rehideModelIds,
        localIds: rehideLocalIds,
      })
    }
    await rehideMovedIfcProxyRegistry(sceneState, 'commit_success', { forceRender: false })
    logCommitTiming('after_visibility_apply')
    const runtimeStateBeforeFinalize = transformRuntimeStateRef.current
    if (isStalePendingCommitSession(runtimeStateBeforeFinalize, requestedSessionId)) {
      logIfcMove('commit_stale_session_ignored', {
        stage: 'finalize',
        requestedSessionId,
        pendingCommitSessionId: runtimeStateBeforeFinalize.pendingCommitSessionId,
        targetKey,
      })
      return
    }
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
    logCommitTiming('after_render')
    ;(target.object as IfcEditableObject3D).userData.ifcEditTarget = {
      ...(target.object as IfcEditableObject3D).userData.ifcEditTarget!,
      modelId: editableModelId,
      localIds: commitHideLocalIds,
      hitLocalId: editableElements[0]?.localId ?? target.hitLocalId,
    }
    ;(target.object.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
      Array.from(worldMatrix.elements)
    ;(target.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit = true
    logIfcModelSnapshot(sceneState, 'commit_models_after_visibility', editableModelId, Array.from(affectedLocalIds))
    ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
      type: 'commit_success',
      targetKey,
    })
    logIfcMove('commit_success', {
      targetKey,
      editableModelId,
      editableLocalIds: editability.editableLocalIds,
      affectedLocalIds: Array.from(affectedLocalIds),
      keepProxyVisibleAfterCommit,
    })
    logCommitTiming('success')
    ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
  }, [
    isIfcMoveDebugEnabled,
    logIfcModelSnapshot,
    logIfcMove,
    markPendingIfcSave,
    registerMovedIfcProxy,
    rehideMovedIfcProxyRegistry,
    resolveEditableIfcTargets,
    resolveLocalIdsFromItemIds,
    sanitizeMappedLocalIds,
    transformRuntimeStateRef,
  ])
  const deleteSelectedTarget = useCallback(async () => {
    const sceneState = sceneRef.current
    const selectedTarget = selectedTargetRef.current
    if (!sceneState || !selectedTarget) return

    if (selectedTarget.source === 'ifc') {
      const deletedLocalIds = Array.from(new Set(
        (selectedTarget.object
          ? (selectedTarget.object as IfcEditableObject3D).userData.ifcEditTarget?.localIds
          : undefined) ?? [selectedTarget.hitLocalId],
      )).filter(Number.isFinite) as number[]
      const deletedElement = selectedTarget.object
        ? (() => {
            const element = (selectedTarget.object as IfcEditableObject3D).userData.ifcEditTarget?.element
            if (!element) return null
            return {
              ...element,
              properties: {
                ...element.properties,
                LocalID: selectedTarget.hitLocalId,
                DeletedLocalIds: deletedLocalIds.join(','),
              },
            }
          })()
        : ifcPsetMetricsRef.current.byId[selectedTarget.localId]
          ? {
              ...ifcPsetMetricsRef.current.byId[selectedTarget.localId],
              id: String(selectedTarget.localId),
              source: 'ifc' as const,
              properties: {
                LocalID: selectedTarget.hitLocalId,
                DeletedLocalIds: deletedLocalIds.join(','),
              },
            }
          : null
      await applyIfcSelectionVisibility(sceneState, {
        modelId: selectedTarget.modelId,
        localIds: deletedLocalIds.length > 0 ? deletedLocalIds : [selectedTarget.hitLocalId],
        proxyObject: selectedTarget.object,
        mode: 'model',
        reason: 'delete_selected_target',
      })
      sceneState.transformControls.detach()
      sceneState.transformControls.visible = false
      sceneState.transformControls.enabled = false
      removeMovedIfcProxyRecords(sceneState, deletedLocalIds, 'delete_selected_target')
      if (selectedTarget.object) {
        selectedTarget.object.parent?.remove(selectedTarget.object)
        disposeObjectMaterials(sceneState.three, selectedTarget.object)
      }
      selectedTargetRef.current = null
      syncTransformSelectionState(null, 'delete_selected_ifc_target')
      dispatchTransformRuntimeAction(
        { type: 'CANCEL_TRANSFORM', reason: 'target_deleted' },
        'delete_selected_ifc_target',
      )
      dispatchTransformRuntimeAction({ type: 'CLEANUP' }, 'delete_selected_ifc_target_cleanup')
      flushPendingIfcSave('delete_selected_target', 0)
      onIfcElementSelectRef.current?.(null)
      onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(sceneState.camera.position))
      if (deletedElement) onIfcElementDeleteRef.current?.(deletedElement)
      return
    }

    if (selectedTarget.source === 'library') {
      const libraryObject = selectedTarget.object as LibraryObject3D
      const preset = getLibraryPresetFromObject(libraryObject)
      sceneState.transformControls.detach()
      sceneState.transformControls.visible = false
      sceneState.transformControls.enabled = false
      libraryObject.parent?.remove(libraryObject)
      disposeObjectMaterials(sceneState.three, libraryObject)
      selectedTargetRef.current = null
      syncTransformSelectionState(null, 'delete_selected_library_target')
      dispatchTransformRuntimeAction(
        { type: 'CANCEL_TRANSFORM', reason: 'target_deleted' },
        'delete_selected_library_target',
      )
      dispatchTransformRuntimeAction({ type: 'CLEANUP' }, 'delete_selected_library_target_cleanup')
      onIfcElementSelectRef.current?.(null)
      onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(sceneState.camera.position))
      if (preset) onLibraryElementDeleteRef.current?.(preset.id)
    }
  }, [dispatchTransformRuntimeAction, flushPendingIfcSave, removeMovedIfcProxyRecords, syncTransformSelectionState])
  useEffect(() => {
    onIfcElementSelectRef.current = onIfcElementSelect
  }, [onIfcElementSelect])

  useEffect(() => {
    onIfcElementDeleteRef.current = onIfcElementDelete
  }, [onIfcElementDelete])

  useEffect(() => {
    onLibraryElementChangeRef.current = onLibraryElementChange
  }, [onLibraryElementChange])

  useEffect(() => {
    onLibraryElementDeleteRef.current = onLibraryElementDelete
  }, [onLibraryElementDelete])

  useEffect(() => {
    onThreeDCoordinatesChangeRef.current = onThreeDCoordinatesChange
  }, [onThreeDCoordinatesChange])

  useEffect(() => {
    onStoreysLoadRef.current = onStoreysLoad
  }, [onStoreysLoad])

  useEffect(() => () => {
    if (typeof window === 'undefined') return
    if (!feedbackTimeoutRef.current) return
    window.clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = null
  }, [])
  useEffect(() => {
    storeyVisibilitySignatureRef.current = null
  }, [ifcUrl, projectId])
  useEffect(() => () => {
    if (typeof window === 'undefined') return
    if (deferredSaveTimerRef.current) {
      window.clearTimeout(deferredSaveTimerRef.current)
      deferredSaveTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let pointerDownDom: HTMLCanvasElement | null = null
    let components: import('@thatopen/components').Components | null = null
        let handlePointerDown: ((event: PointerEvent) => void) | null = null
        let handleKeyDown: ((event: KeyboardEvent) => void) | null = null
        let handleGlobalPointerUp: ((event: PointerEvent) => void) | null = null
    let handleWindowBlur: (() => void) | null = null
    let pendingIfcCommitTimer: number | null = null
    let pendingIfcCommitToken = 0
    const pendingCommitSessionByToken = new Map<number, string | null>()
    let lastInteractionAt = performance.now()
    let pointerPickSequence = 0
    let lastIfcDragEndAt = 0
    let cameraControlsChangeListener: (() => void) | null = null
    let cameraControlsWithEvents:
      | {
          addEventListener?: (type: 'change', listener: () => void) => void
          removeEventListener?: (type: 'change', listener: () => void) => void
        }
      | null = null

    const loadIfc = async () => {
      if (!ifcUrl) return
      try {
        setStatus('loading')
        setErrorMessage('')

        const [OBC, THREE, transformControlsModule]: [
          ComponentsModule,
          ThreeModule,
          TransformControlsModule,
        ] = await Promise.all([
          import('@thatopen/components'),
          import('three'),
          import('three/examples/jsm/controls/TransformControls.js'),
        ])
        if (disposed) return

        components = new OBC.Components()
        const worlds = components.get(OBC.Worlds)
        const world = worlds.create<
          import('@thatopen/components').SimpleScene,
          import('@thatopen/components').SimpleCamera,
          import('@thatopen/components').SimpleRenderer
        >()

        world.scene = new OBC.SimpleScene(components)
        world.renderer = new OBC.SimpleRenderer(components, container)
        world.renderer.showLogo = false
        world.camera = new OBC.SimpleCamera(components)

        components.init()
        world.scene.setup()
        world.scene.three.background = null
        world.renderer.three.autoClear = true
        world.renderer.three.autoClearColor = true
        world.renderer.three.autoClearDepth = true
        world.renderer.three.autoClearStencil = true
        await world.camera.controls?.setLookAt(8, 6, 8, 0, 0, 0)
        if (world.camera.controls) {
          world.camera.controls.azimuthRotateSpeed = rotationLockedRef.current ? 0 : 1
          world.camera.controls.polarRotateSpeed = rotationLockedRef.current ? 0 : 1
        }
        const emitCoordinates = (position: { x: number; y: number; z: number }) => {
          onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(position))
        }
        emitCoordinates(world.camera.three.position)
        cameraControlsWithEvents = world.camera.controls as unknown as {
          addEventListener?: (type: 'change', listener: () => void) => void
          removeEventListener?: (type: 'change', listener: () => void) => void
        } | null
        cameraControlsChangeListener = () => {
          const selectedTarget = selectedTargetRef.current
          if (selectedTarget?.object) return
          emitCoordinates(world.camera.three.position)
        }
        cameraControlsWithEvents?.addEventListener?.('change', cameraControlsChangeListener)

        const grids = components.get(OBC.Grids)
        grids.create(world)

        const fragments = components.get(OBC.FragmentsManager)
        // MIME 이슈를 피하기 위해 .js 워커 엔트리를 사용한다.
        fragments.init('/fragments-worker.js')

        const ifcLoader = components.get(OBC.IfcLoader)
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: '/',
            absolute: false,
          },
        })

        const ifcText = await fetchIfcText(ifcUrl)
        const modelId = getRuntimeIfcModelId(projectId)
        const patchedIfcText = patchIfcTextForMaterialDefaults(ifcText)
        const data = new TextEncoder().encode(patchedIfcText)
        ifcPsetMetricsRef.current = parseBatangDimensionProperties(patchedIfcText)
        // 파서 alias(#id)와 fragments localId를 혼합하면 편집 대상이 과확장되어 복제처럼 보일 수 있으므로
        // canonical 매핑은 런타임 선택/조회 결과로만 누적한다.
        canonicalIdMapRef.current = createEmptyIfcCanonicalIdMap()
        if (import.meta.env.DEV && !regressionCheckedRef.current) {
          regressionCheckedRef.current = true
          try {
            runIfcMoveWorkflowRegressionCases()
          } catch (error) {
            console.warn('[editor] IFC 이동 회귀 케이스 실패', { error })
          }
        }
        // IFC 층(IfcBuildingStorey) 파싱 및 층별 요소 ID 맵 구성
        const storeys = parseIfcStoreys(patchedIfcText)
        const storeysWithElements = storeys.map((storey) => {
          const expandedLocalIds = new Set<number>()
          storey.elementLocalIds.forEach((rawId) => {
            if (Number.isFinite(rawId)) expandedLocalIds.add(rawId)
            const aliasIds = canonicalIdMapRef.current.localIdsByExpressId.get(rawId)
            if (!aliasIds) return
            aliasIds.forEach((aliasId) => expandedLocalIds.add(aliasId))
          })
          const elements = Array.from(expandedLocalIds).map((localId) => {
            const parsed = ifcPsetMetricsRef.current.byId[localId]
            return {
              localId,
              name: parsed?.name ?? `요소 ${localId}`,
              ifcClass: parsed?.ifcClass ?? 'IfcElement',
              category: parsed?.category ?? 'Element',
            }
          })
          return {
            ...storey,
            elementLocalIds: expandedLocalIds,
            elements,
          }
        })
        const storeyIdMap = new Map<number, Set<number>>(
          storeysWithElements.map((s) => [s.expressId, s.elementLocalIds]),
        )
        elementIdsByStoreyRef.current = storeyIdMap
        const model = await ifcLoader.load(data, true, modelId)
        if (disposed) return

        const contentGroup = new THREE.Group()
        contentGroup.name = 'ifc-editor-content'
        world.scene.three.add(contentGroup)

        const presetGroup = new THREE.Group()
        presetGroup.name = 'library-presets'

        const fragmentModel = model as unknown as LoadedFragmentModel
        fragmentModel.useCamera(world.camera.three)
        applyInitialIfcMaterialStyles(THREE, fragmentModel.object)
        const worldUnitsPerMm = inferWorldUnitsPerMm(THREE, fragmentModel.object)
        contentGroup.add(fragmentModel.object)
        contentGroup.add(presetGroup)

        const ifcEditGroup = new THREE.Group()
        ifcEditGroup.name = 'ifc-edit-overlays'
        contentGroup.add(ifcEditGroup)

        const transformControls = new transformControlsModule.TransformControls(
          world.camera.three,
          world.renderer.three.domElement,
        )
        transformControls.setMode('translate')
        transformControls.visible = false
        transformControls.enabled = false
        const transformHelper = transformControls.getHelper()
        world.scene.three.add(transformHelper)
        let isTransformPointerActive = false
        let transformPointerActiveSince = 0
        let lastTransformAxis: string | null = null
        let lastDragStartPosition: { x: number; y: number; z: number } | null = null
        let isTransformDragging = false
        let activeDragSessionId: string | null = null
        const isObjectInSceneGraph = (object: Object3D | undefined | null) => {
          if (!object) return false
          let cursor: Object3D | null = object
          while (cursor) {
            if (cursor === world.scene.three) return true
            cursor = (cursor.parent ?? null) as Object3D | null
          }
          return false
        }
        const safelyAttachTransformControls = async (
          activeScene: ThatOpenSceneState,
          target: Selected3DTarget,
          reason: string,
        ) => {
          if (!target) return null
          const object = target.source === 'ifc'
            ? (target.object as IfcEditableObject3D | undefined)
            : (target.object as Object3D | undefined)
          if (object && isObjectInSceneGraph(object)) {
            activeScene.transformControls.attach(object)
            activeScene.transformControls.visible = true
            activeScene.transformControls.enabled = true
            return object
          }
          if (target.source !== 'ifc') {
            logIfcMove('transform_attach_skip_detached', {
              reason,
              source: target.source,
              hasObject: Boolean(object),
            })
            activeScene.transformControls.detach()
            activeScene.transformControls.visible = false
            activeScene.transformControls.enabled = false
            return null
          }
          logIfcMove('transform_attach_rebind_start', {
            reason,
            modelId: target.modelId,
            localId: target.localId,
            hitLocalId: target.hitLocalId,
            hasObject: Boolean(object),
          })
          try {
            const proxyLocalIds = (
              object?.userData?.ifcEditTarget?.localIds?.filter(Number.isFinite)
              ?? [target.hitLocalId, target.localId].filter(Number.isFinite)
            ) as number[]
            const fallbackElement = object?.userData?.ifcEditTarget?.element
              ?? {
                id: String(target.localId),
                name: 'IFC Element',
                ifcClass: 'IfcElement',
                category: 'Element',
                source: 'ifc' as const,
                expressId: target.localId,
                properties: {},
              }
            const rebound = await attachIfcTransformProxy(
              THREE,
              fragments,
              hider,
              activeScene.transformControls,
              activeScene.ifcEditGroup,
              target.modelId,
              proxyLocalIds,
              target.hitLocalId,
              target.hitItemId,
              fallbackElement,
            )
            if (rebound && isObjectInSceneGraph(rebound)) {
              await applyIfcSelectionVisibility(activeScene, {
                modelId: target.modelId,
                localIds: proxyLocalIds.length > 0
                  ? proxyLocalIds
                  : [target.hitLocalId].filter(Number.isFinite),
                proxyObject: rebound,
                mode: 'proxy',
                proxyOpacity: 1,
                reason: 'transform_attach_rebind',
                forceRender: true,
              })
              logIfcMove('transform_attach_rebind_done', {
                reason,
                modelId: target.modelId,
                localId: target.localId,
                hitLocalId: target.hitLocalId,
                localIdCount: proxyLocalIds.length,
              })
              return rebound
            }
            logIfcMove('transform_attach_rebind_failed', {
              reason,
              modelId: target.modelId,
              localId: target.localId,
              hitLocalId: target.hitLocalId,
              why: 'rebound_proxy_not_in_scene',
            })
          } catch (error) {
            logIfcMove('transform_attach_rebind_failed', {
              reason,
              modelId: target.modelId,
              localId: target.localId,
              hitLocalId: target.hitLocalId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          activeScene.transformControls.detach()
          activeScene.transformControls.visible = false
          activeScene.transformControls.enabled = false
          return null
        }
        const clearPendingIfcCommit = (reason: string) => {
          if (!pendingIfcCommitTimer) return
          window.clearTimeout(pendingIfcCommitTimer)
          pendingIfcCommitTimer = null
          pendingCommitSessionByToken.clear()
          logIfcMove('commit_queue_clear', { reason })
        }
        const waitForCommitInFlightToSettle = async (reason: string, timeoutMs = 1400) => {
          if (typeof window === 'undefined') return
          if (!ifcCommitInFlightRef.current) return
          const startedAt = performance.now()
          await new Promise<void>((resolve) => {
            const poll = () => {
              if (!ifcCommitInFlightRef.current) {
                logIfcMove('commit_wait_settled', {
                  reason,
                  elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
                })
                resolve()
                return
              }
              if (performance.now() - startedAt >= timeoutMs) {
                logIfcMove('commit_wait_timeout', {
                  reason,
                  elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
                  timeoutMs,
                })
                resolve()
                return
              }
              window.setTimeout(poll, 16)
            }
            poll()
          })
        }
        const flushActiveIfcCommit = async (
          target: Extract<Selected3DTarget, { source: 'ifc' }>,
          reason: string,
          options?: {
            keepProxyVisibleAfterCommit?: boolean
            keepSelectionAttached?: boolean
            transformSessionId?: string | null
          },
        ) => {
          if (!target.object) return
          if (ifcCommitInFlightRef.current) {
            logIfcMove('commit_flush_skip_inflight', {
              reason,
              modelId: target.modelId,
              localId: target.localId,
            })
            return
          }
          const activeScene = sceneRef.current
          if (!activeScene) return
          ifcCommitInFlightRef.current = true
          const commitSessionId = options?.transformSessionId ?? transformRuntimeStateRef.current.pendingCommitSessionId
          logIfcMove('commit_flush_start', {
            reason,
            modelId: target.modelId,
            localId: target.localId,
            hitLocalId: target.hitLocalId,
            transformSessionId: commitSessionId,
          })
          try {
            await commitIfcProxyTransformToModel(activeScene, target, {
              keepProxyVisibleAfterCommit: options?.keepProxyVisibleAfterCommit,
              transformSessionId: commitSessionId,
            })
            if (commitSessionId) {
              const runtimeStateAfterCommit = transformRuntimeStateRef.current
              if (isStalePendingCommitSession(runtimeStateAfterCommit, commitSessionId)) {
                logIfcMove('commit_flush_skip_stale_session_after_await', {
                  reason,
                  transformSessionId: commitSessionId,
                  pendingCommitSessionId: runtimeStateAfterCommit.pendingCommitSessionId,
                })
                return
              }
            }
            const moveState = ifcMoveLifecycleRef.current
            if (moveState.lastError) {
              if (commitSessionId) {
                dispatchTransformRuntimeAction(
                  {
                    type: 'COMMIT_FAIL',
                    transformSessionId: commitSessionId,
                    message: moveState.lastError,
                  },
                  'flushActiveIfcCommit_failure',
                )
              }
              logIfcMove('commit_flush_failed', {
                reason,
                modelId: target.modelId,
                localId: target.localId,
                error: moveState.lastError,
              })
              return
            }
            if (commitSessionId) {
              dispatchTransformRuntimeAction(
                {
                  type: 'COMMIT_SUCCESS',
                  transformSessionId: commitSessionId,
                  targetId: resolveTargetOwnerId(target) ?? target.localId,
                },
                'flushActiveIfcCommit_success',
              )
            }
            ifcMoveDirtyRef.current = false
            if (options?.keepSelectionAttached && selectedTargetRef.current?.source === 'ifc') {
              const currentSelected = selectedTargetRef.current
              if (currentSelected.object === target.object) {
                const resolvedModelId =
                  (target.object as IfcEditableObject3D).userData.ifcEditTarget?.modelId ?? target.modelId
                const normalizedResolvedModelId = normalizeRootModelId(
                  resolvedModelId,
                  activeScene.modelId,
                )
                const keepModelHiddenAfterCommit = Boolean(
                  (target.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit,
                )
                selectedTargetRef.current = {
                  ...currentSelected,
                  modelId: normalizedResolvedModelId,
                  keepModelHiddenAfterCommit,
                  // 실제 clearSelectedTarget 복구가 실행되기 전에는 restored=false를 유지한다.
                  visibilityRestoredAtCommit: false,
                  object: target.object,
                }
                syncTransformSelectionState(selectedTargetRef.current, 'flush_keep_selection_attached', {
                  attachGizmo: true,
                })
                const reboundObject = await safelyAttachTransformControls(
                  activeScene,
                  selectedTargetRef.current,
                  'flushActiveIfcCommit_keepSelectionAttached',
                )
                selectedTargetRef.current = {
                  ...selectedTargetRef.current,
                  object: (reboundObject as IfcEditableObject3D | null) ?? undefined,
                }
                syncTransformSelectionState(selectedTargetRef.current, 'flush_keep_selection_rebound', {
                  attachGizmo: Boolean(reboundObject),
                })
                activeScene.renderer.render(activeScene.scene, activeScene.camera as import('three').PerspectiveCamera)
                logIfcMove('cleanup_success', {
                  modelId: normalizedResolvedModelId,
                  localId: currentSelected.localId,
                  keepModelHiddenAfterCommit,
                  keptProxyForContinuousMove: Boolean(reboundObject),
                })
              }
            }
            logIfcMove('commit_flush_success', {
              reason,
              modelId: target.modelId,
              localId: target.localId,
            })
          } catch (error) {
            if (commitSessionId) {
              dispatchTransformRuntimeAction(
                {
                  type: 'COMMIT_FAIL',
                  transformSessionId: commitSessionId,
                  message: error instanceof Error ? error.message : String(error),
                },
                'flushActiveIfcCommit_exception',
              )
            }
            logIfcMove('commit_flush_exception', {
              reason,
              modelId: target.modelId,
              localId: target.localId,
              error: error instanceof Error ? error.message : String(error),
            })
          } finally {
            ifcCommitInFlightRef.current = false
            lastDragStartPosition = null
            if (commitSessionId) {
              dispatchTransformRuntimeAction(
                { type: 'CLEANUP', transformSessionId: commitSessionId },
                'flushActiveIfcCommit_cleanup',
              )
              if (activeDragSessionId === commitSessionId) activeDragSessionId = null
            }
          }
        }
        const runQueuedIfcCommit = async (token: number) => {
          if (disposed) return
          if (token !== pendingIfcCommitToken) {
            logIfcMove('commit_queue_skip_stale_token', { token, currentToken: pendingIfcCommitToken })
            return
          }
          const queuedSessionId = pendingCommitSessionByToken.get(token) ?? null
          if (queuedSessionId) {
            const runtimeState = transformRuntimeStateRef.current
            if (!isPendingCommitSession(runtimeState, queuedSessionId)) {
              logIfcMove('commit_queue_skip_stale_session', {
                token,
                queuedSessionId,
                pendingCommitSessionId: runtimeState.pendingCommitSessionId,
              })
              return
            }
          }
          const selectedTarget = selectedTargetRef.current
          if (!selectedTarget) return
          if (queuedSessionId) {
            const runtimeState = transformRuntimeStateRef.current
            const selectedOwnerId = resolveTargetOwnerId(selectedTarget)
            if (isTransformOwnerMismatch(runtimeState, selectedOwnerId)) {
              logIfcMove('commit_queue_skip_owner_mismatch', {
                token,
                queuedSessionId,
                activeTransformTargetId: runtimeState.activeTransformTargetId,
                selectedOwnerId,
              })
              return
            }
          }
          const quietElapsedMs = performance.now() - lastInteractionAt
          if (quietElapsedMs < IFC_COMMIT_QUIET_WINDOW_MS) {
            logIfcMove('commit_queue_defer_quiet_window', {
              token,
              quietElapsedMs: Number(quietElapsedMs.toFixed(1)),
              quietWindowMs: IFC_COMMIT_QUIET_WINDOW_MS,
            })
            pendingIfcCommitTimer = window.setTimeout(() => {
              pendingIfcCommitTimer = null
              void runQueuedIfcCommit(token)
            }, IFC_COMMIT_QUIET_WINDOW_MS - quietElapsedMs + 40)
            return
          }
          if (isTransformDragging || isTransformPointerActive) {
            logIfcMove('commit_queue_defer_interacting', {
              token,
              isTransformDragging,
              isTransformPointerActive,
            })
            pendingIfcCommitTimer = window.setTimeout(() => {
              void runQueuedIfcCommit(token)
            }, 120)
            return
          }
          logIfcMove('commit_queue_execute', {
            token,
            source: selectedTarget.source,
            dragToCommitLatencyMs: lastIfcDragEndAt > 0
              ? Number((performance.now() - lastIfcDragEndAt).toFixed(1))
              : null,
          })
          if (selectedTarget.source === 'ifc') {
            if (!selectedTarget.object) {
              logIfcMove('drag_end_skip_no_proxy_object', {
                modelId: selectedTarget.modelId,
                localId: selectedTarget.localId,
                hitLocalId: selectedTarget.hitLocalId,
              })
              return
            }
            if (ifcCommitInFlightRef.current) {
              logIfcMove('commit_queue_defer_inflight', {
                token,
                modelId: selectedTarget.modelId,
                localId: selectedTarget.localId,
              })
              pendingIfcCommitTimer = window.setTimeout(() => {
                void runQueuedIfcCommit(token)
              }, 120)
              return
            }
            ifcCommitInFlightRef.current = true
            try {
              const activeScene = sceneRef.current
              if (activeScene) {
                await commitIfcProxyTransformToModel(activeScene, selectedTarget, {
                  keepProxyVisibleAfterCommit: true,
                  transformSessionId: queuedSessionId,
                })
                if (queuedSessionId) {
                  const runtimeStateAfterCommit = transformRuntimeStateRef.current
                  if (isStalePendingCommitSession(runtimeStateAfterCommit, queuedSessionId)) {
                    logIfcMove('commit_queue_skip_stale_session_after_await', {
                      token,
                      queuedSessionId,
                      pendingCommitSessionId: runtimeStateAfterCommit.pendingCommitSessionId,
                    })
                    return
                  }
                }
                const moveState = ifcMoveLifecycleRef.current
                if (!moveState.lastError) {
                  if (queuedSessionId) {
                    dispatchTransformRuntimeAction(
                      {
                        type: 'COMMIT_SUCCESS',
                        transformSessionId: queuedSessionId,
                        targetId: resolveTargetOwnerId(selectedTarget) ?? selectedTarget.localId,
                      },
                      'runQueuedIfcCommit_success',
                    )
                  }
                  ifcMoveDirtyRef.current = false
                  const resolvedModelId =
                    (selectedTarget.object as IfcEditableObject3D).userData.ifcEditTarget?.modelId
                      ?? selectedTarget.modelId
                  const normalizedResolvedModelId = normalizeRootModelId(
                    resolvedModelId,
                    activeScene.modelId,
                  )
                  const keepModelHiddenAfterCommit = Boolean(
                    (selectedTarget.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit,
                  )
                  const continuedTarget: Extract<Selected3DTarget, { source: 'ifc' }> = {
                    ...selectedTarget,
                    modelId: normalizedResolvedModelId,
                    keepModelHiddenAfterCommit,
                    // 실제 clearSelectedTarget 복구가 실행되기 전에는 restored=false를 유지한다.
                    visibilityRestoredAtCommit: false,
                    object: selectedTarget.object,
                  }
                  const reboundObject = await safelyAttachTransformControls(
                    activeScene,
                    continuedTarget,
                    'runQueuedIfcCommit_success',
                  )
                  selectedTargetRef.current = {
                    ...continuedTarget,
                    object: (reboundObject as IfcEditableObject3D | null) ?? undefined,
                  }
                  syncTransformSelectionState(selectedTargetRef.current, 'queued_commit_rebound', {
                    attachGizmo: Boolean(reboundObject),
                  })
                  activeScene.renderer.render(activeScene.scene, activeScene.camera as import('three').PerspectiveCamera)
                  logIfcMove('cleanup_success', {
                    modelId: continuedTarget.modelId,
                    localId: continuedTarget.localId,
                    keepModelHiddenAfterCommit,
                    keptProxyForContinuousMove: Boolean(reboundObject),
                  })
                } else {
                  if (queuedSessionId) {
                    dispatchTransformRuntimeAction(
                      {
                        type: 'COMMIT_FAIL',
                        transformSessionId: queuedSessionId,
                        message: moveState.lastError,
                      },
                      'runQueuedIfcCommit_failure',
                    )
                  }
                  ifcMoveDirtyRef.current = false
                  await clearSelectedTarget(activeScene, selectedTarget, true)
                  purgeIfcEditOverlays(activeScene, 'commit_failure_cleanup')
                  activeScene.renderer.render(activeScene.scene, activeScene.camera as import('three').PerspectiveCamera)
                  selectedTargetRef.current = {
                    ...selectedTarget,
                    object: undefined,
                  }
                  syncTransformSelectionState(selectedTargetRef.current, 'queued_commit_failure_target')
                  logIfcMove('cleanup_failure', {
                    modelId: selectedTarget.modelId,
                    localId: selectedTarget.localId,
                    error: moveState.lastError,
                  })
                  showIfcEditFeedback('error', `IFC 이동 커밋 실패: ${moveState.lastError}`)
                }
              }
            } catch (error) {
              if (queuedSessionId) {
                dispatchTransformRuntimeAction(
                  {
                    type: 'COMMIT_FAIL',
                    transformSessionId: queuedSessionId,
                    message: error instanceof Error ? error.message : 'Unknown commit error',
                  },
                  'runQueuedIfcCommit_exception',
                )
              }
              ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
                type: 'commit_failure',
                targetKey: getIfcMoveTargetKey(selectedTarget.modelId, selectedTarget.localId),
                message: error instanceof Error ? error.message : 'Unknown commit error',
              })
              ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
              const activeScene = sceneRef.current
              if (activeScene) {
                await clearSelectedTarget(activeScene, selectedTarget, true)
                purgeIfcEditOverlays(activeScene, 'commit_exception_cleanup')
                activeScene.renderer.render(activeScene.scene, activeScene.camera as import('three').PerspectiveCamera)
                selectedTargetRef.current = {
                  ...selectedTarget,
                  object: undefined,
                }
                syncTransformSelectionState(selectedTargetRef.current, 'queued_commit_exception_target')
              }
              ifcMoveDirtyRef.current = false
              logIfcMove('commit_exception', {
                modelId: selectedTarget.modelId,
                localId: selectedTarget.localId,
                error: error instanceof Error ? error.message : String(error),
              })
              showIfcEditFeedback('error', 'IFC 이동 커밋 중 예외가 발생했습니다. 원본 상태로 복원했습니다.')
              console.warn('[editor] IFC 이동 커밋 실패', {
                localId: selectedTarget.hitLocalId,
                error,
              })
            } finally {
              ifcCommitInFlightRef.current = false
              lastDragStartPosition = null
              if (queuedSessionId) {
                dispatchTransformRuntimeAction(
                  { type: 'CLEANUP', transformSessionId: queuedSessionId },
                  'runQueuedIfcCommit_cleanup',
                )
                if (activeDragSessionId === queuedSessionId) activeDragSessionId = null
              }
            }
          }
          if (selectedTarget.source === 'library') {
            const libraryObject = selectedTarget.object as LibraryObject3D
            const preset = getLibraryPresetFromObject(libraryObject)
            if (preset) {
              onLibraryElementChangeRef.current?.(preset.id, {
                position: {
                  x: libraryObject.position.x,
                  y: libraryObject.position.y,
                  z: libraryObject.position.z,
                },
                rotation: {
                  x: libraryObject.rotation.x,
                  y: libraryObject.rotation.y,
                  z: libraryObject.rotation.z,
                },
                scale: {
                  x: libraryObject.scale.x,
                  y: libraryObject.scale.y,
                  z: libraryObject.scale.z,
                },
              })
              logIfcMove('transform_commit', {
                source: 'library',
                presetId: preset.id,
                position: {
                  x: libraryObject.position.x,
                  y: libraryObject.position.y,
                  z: libraryObject.position.z,
                },
                rotation: {
                  x: libraryObject.rotation.x,
                  y: libraryObject.rotation.y,
                  z: libraryObject.rotation.z,
                },
                scale: {
                  x: libraryObject.scale.x,
                  y: libraryObject.scale.y,
                  z: libraryObject.scale.z,
                },
              })
              if (queuedSessionId) {
                dispatchTransformRuntimeAction(
                  {
                    type: 'COMMIT_SUCCESS',
                    transformSessionId: queuedSessionId,
                    targetId: resolveTargetOwnerId(selectedTarget) ?? 0,
                  },
                  'runQueuedLibraryCommit_success',
                )
              }
            }
            if (queuedSessionId) {
              dispatchTransformRuntimeAction(
                { type: 'CLEANUP', transformSessionId: queuedSessionId },
                'runQueuedLibraryCommit_cleanup',
              )
              if (activeDragSessionId === queuedSessionId) activeDragSessionId = null
            }
          }
          if (selectedTarget.object) {
            emitCoordinates(selectedTarget.object.position)
            return
          }
          emitCoordinates(world.camera.three.position)
        }
        const scheduleIfcCommit = (
          reason: string,
          delayMs = IFC_COMMIT_QUEUE_DELAY_MS,
          transformSessionId: string | null = null,
        ) => {
          clearPendingIfcCommit('reschedule')
          pendingIfcCommitToken += 1
          const token = pendingIfcCommitToken
          pendingCommitSessionByToken.set(token, transformSessionId)
          logIfcMove('commit_queue_schedule', { reason, token, delayMs, transformSessionId })
          if (delayMs <= 0) {
            logIfcMove('commit_queue_execute_immediate', { token, reason, transformSessionId })
            void runQueuedIfcCommit(token)
            return
          }
          pendingIfcCommitTimer = window.setTimeout(() => {
            pendingIfcCommitTimer = null
            const requestIdle = (window as Window & {
              requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
            }).requestIdleCallback
            if (typeof requestIdle === 'function') {
              logIfcMove('commit_queue_idle_schedule', { token })
              requestIdle(() => { void runQueuedIfcCommit(token) }, { timeout: 5000 })
              return
            }
            void runQueuedIfcCommit(token)
          }, delayMs)
        }
        const forceRecoverTransformDragging = (reason: string) => {
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          if (!transformState.dragging) return false
          const selectedTarget = selectedTargetRef.current
          const selectedObject = selectedTarget?.object
          transformControls.detach()
          if (selectedObject && isObjectInSceneGraph(selectedObject as Object3D)) {
            transformControls.attach(selectedObject as Object3D)
            transformControls.visible = true
            transformControls.enabled = true
          } else {
            if (selectedTarget) {
              logIfcMove('transform_attach_skip_detached', {
                reason: `forceRecover:${reason}`,
                source: selectedTarget.source,
                hasObject: Boolean(selectedObject),
              })
            }
            transformControls.visible = false
            transformControls.enabled = false
          }
          const recoveredState = transformControls as unknown as { dragging?: boolean }
          isTransformDragging = false
          if (world.camera.controls) {
            ;(world.camera.controls as unknown as { enabled: boolean }).enabled = true
          }
          logIfcMove('transform_dragging_force_recover', {
            reason,
            selectedSource: selectedTarget?.source ?? null,
            hasSelectedObject: Boolean(selectedObject),
            axisBefore: transformState.axis ?? null,
            draggingBefore: true,
            draggingAfter: Boolean(recoveredState.dragging),
          })
          if (activeDragSessionId) {
            dispatchTransformRuntimeAction(
              { type: 'CANCEL_TRANSFORM', reason: `force_recover:${reason}` },
              'transform_force_recover_cancel',
            )
            dispatchTransformRuntimeAction(
              { type: 'CLEANUP', transformSessionId: activeDragSessionId },
              'transform_force_recover_cleanup',
            )
            activeDragSessionId = null
          }
          return true
        }
        const resetTransformInteractionState = (reason: string) => {
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          if (transformState.dragging) {
            forceRecoverTransformDragging(`reset:${reason}`)
          }
          isTransformDragging = false
          isTransformPointerActive = false
          transformPointerActiveSince = 0
          lastTransformAxis = null
          if (world.camera.controls) {
            ;(world.camera.controls as unknown as { enabled: boolean }).enabled = true
          }
          logIfcMove('transform_interaction_state_reset', {
            reason,
            draggingOnControl: Boolean(transformState.dragging),
            axis: transformState.axis ?? null,
          })
        }
        resetTransformInteractionRef.current = resetTransformInteractionState
        ;(transformControls as unknown as {
          addEventListener: (type: 'mouseDown' | 'mouseUp', listener: () => void) => void
        }).addEventListener('mouseDown', () => {
          lastInteractionAt = performance.now()
          isTransformPointerActive = true
          transformPointerActiveSince = performance.now()
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          lastTransformAxis = transformState.axis ?? null
          logIfcMove('transform_mouse_down', {
            dragging: Boolean(transformState.dragging),
            axis: lastTransformAxis,
            isTransformPointerActive,
            pointerActiveMs: 0,
            commitInFlight: ifcCommitInFlightRef.current,
            movePhase: ifcMoveLifecycleRef.current.phase,
          })
          const selectedTarget = selectedTargetRef.current
          if (selectedTarget?.source === 'ifc' && selectedTarget.object) {
            logIfcMove('drag_pointer_down', {
              modelId: selectedTarget.modelId,
              localId: selectedTarget.localId,
              hitLocalId: selectedTarget.hitLocalId,
            })
            selectedTarget.object.updateMatrixWorld(true)
            ;(selectedTarget.object.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
              Array.from(selectedTarget.object.matrixWorld.elements)
          }
        })
        ;(transformControls as unknown as {
          addEventListener: (type: 'mouseDown' | 'mouseUp', listener: () => void) => void
        }).addEventListener('mouseUp', () => {
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          lastTransformAxis = transformState.axis ?? null
          logIfcMove('transform_mouse_up', {
            dragging: Boolean(transformState.dragging),
            axis: lastTransformAxis,
            isTransformPointerActive,
            pointerActiveMs: transformPointerActiveSince > 0
              ? Number((performance.now() - transformPointerActiveSince).toFixed(1))
              : 0,
            commitInFlight: ifcCommitInFlightRef.current,
            movePhase: ifcMoveLifecycleRef.current.phase,
          })
          isTransformPointerActive = false
          transformPointerActiveSince = 0
          lastTransformAxis = null
          logIfcMove('transform_pointer_state_reset', { reason: 'mouseUp' })
        })
        handleGlobalPointerUp = (event) => {
          lastInteractionAt = performance.now()
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          lastTransformAxis = transformState.axis ?? null
          logIfcMove('window_pointer_up', {
            pointerType: event.pointerType,
            button: event.button,
            buttons: event.buttons,
            dragging: Boolean(transformState.dragging),
            axis: lastTransformAxis,
            isTransformPointerActive,
            commitInFlight: ifcCommitInFlightRef.current,
            movePhase: ifcMoveLifecycleRef.current.phase,
          })
          if (transformState.dragging) {
            const recovered = forceRecoverTransformDragging('window_pointerup_dragging_true')
            logIfcMove('transform_dragging_force_release_on_pointerup', {
              recovered,
              axis: transformState.axis ?? null,
            })
          }
          if (!isTransformPointerActive) return
          isTransformPointerActive = false
          transformPointerActiveSince = 0
          lastTransformAxis = null
          logIfcMove('transform_pointer_state_reset', { reason: 'window_pointerup' })
        }
        handleWindowBlur = () => {
          lastInteractionAt = performance.now()
          const currentTarget = selectedTargetRef.current
          if (currentTarget?.source === 'ifc' && !isTransformDragging && ifcMoveDirtyRef.current) {
            void flushActiveIfcCommit(currentTarget, 'window_blur')
          } else if (currentTarget?.source === 'ifc' && !isTransformDragging) {
            logIfcMove('window_blur_flush_skip_clean', {
              modelId: currentTarget.modelId,
              localId: currentTarget.localId,
              ifcMoveDirty: ifcMoveDirtyRef.current,
            })
          }
          if (currentTarget?.source === 'ifc') {
            logIfcMove('window_blur_save_flush_skip_active_ifc_selection', {
              modelId: currentTarget.modelId,
              localId: currentTarget.localId,
              hitLocalId: currentTarget.hitLocalId,
            })
          } else {
            const activeScene = sceneRef.current
            const isDocumentHidden = typeof document !== 'undefined'
              ? document.visibilityState === 'hidden'
              : true
            if (activeScene && isDocumentHidden) {
              void flushPendingIfcSaveSync(activeScene, 'window_blur_no_selection_hidden')
            } else {
              if (activeScene) {
                logIfcMove('window_blur_skip_save_visible_document', {
                  visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
                })
              } else {
                flushPendingIfcSave('window_blur', 0)
              }
            }
          }
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          lastTransformAxis = transformState.axis ?? null
          logIfcMove('window_blur', {
            dragging: Boolean(transformState.dragging),
            axis: lastTransformAxis,
            isTransformPointerActive,
            commitInFlight: ifcCommitInFlightRef.current,
            movePhase: ifcMoveLifecycleRef.current.phase,
          })
          if (transformState.dragging) {
            const recovered = forceRecoverTransformDragging('window_blur_dragging_true')
            logIfcMove('transform_dragging_force_release_on_blur', {
              recovered,
              axis: transformState.axis ?? null,
            })
          }
          if (!isTransformPointerActive) return
          isTransformPointerActive = false
          transformPointerActiveSince = 0
          lastTransformAxis = null
          logIfcMove('transform_pointer_state_reset', { reason: 'window_blur' })
        }
        window.addEventListener('pointerup', handleGlobalPointerUp, true)
        window.addEventListener('pointercancel', handleGlobalPointerUp, true)
        window.addEventListener('blur', handleWindowBlur)
        ;(transformControls as unknown as {
          addEventListener: (type: 'dragging-changed', listener: (event: { value: boolean }) => void) => void
        }).addEventListener('dragging-changed', (event) => {
          isTransformDragging = event.value
          const transformState = transformControls as unknown as { axis?: string | null }
          lastTransformAxis = transformState.axis ?? null
          logIfcMove('transform_dragging_changed', {
            value: event.value,
            axis: lastTransformAxis,
            isTransformPointerActive,
            commitInFlight: ifcCommitInFlightRef.current,
            movePhase: ifcMoveLifecycleRef.current.phase,
          })
          if (world.camera.controls) {
            ;(world.camera.controls as unknown as { enabled: boolean }).enabled = !event.value
          }
          if (event.value) {
            clearPendingIfcCommit('new_drag_start')
            if (transformPointerActiveSince <= 0) transformPointerActiveSince = performance.now()
            const selectedTarget = selectedTargetRef.current
            const ownerId = resolveTargetOwnerId(selectedTarget)
            if (Number.isFinite(ownerId)) {
              activeDragSessionId = createTransformSessionId()
              dispatchTransformRuntimeAction(
                {
                  type: 'START_DRAG',
                  targetId: ownerId as number,
                  transformSessionId: activeDragSessionId,
                },
                'dragging_changed_true',
              )
            } else {
              activeDragSessionId = null
            }
            if (selectedTarget?.source === 'ifc') {
              const dragObject = selectedTarget.object as Object3D | undefined
              if (dragObject) {
                lastDragStartPosition = {
                  x: dragObject.position.x,
                  y: dragObject.position.y,
                  z: dragObject.position.z,
                }
                dragObject.updateMatrixWorld(true)
                ;(dragObject.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
                  Array.from(dragObject.matrixWorld.elements)
              } else {
                lastDragStartPosition = null
              }
              ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
                type: 'start_drag',
                targetKey: getIfcMoveTargetKey(selectedTarget.modelId, selectedTarget.localId),
              })
              logIfcMove('drag_start', {
                modelId: selectedTarget.modelId,
                localId: selectedTarget.localId,
                hitLocalId: selectedTarget.hitLocalId,
                startPosition: lastDragStartPosition,
              })
            }
            return
          }
          isTransformPointerActive = false
          transformPointerActiveSince = 0
          lastTransformAxis = null
          const dragEndTarget = selectedTargetRef.current
          const dragObject = dragEndTarget?.object as Object3D | undefined
          const dragEndPosition = dragObject
            ? { x: dragObject.position.x, y: dragObject.position.y, z: dragObject.position.z }
            : null
          const dragDeltaRaw = (lastDragStartPosition && dragEndPosition)
            ? {
                x: dragEndPosition.x - lastDragStartPosition.x,
                y: dragEndPosition.y - lastDragStartPosition.y,
                z: dragEndPosition.z - lastDragStartPosition.z,
              }
            : null
          const dragDelta = dragDeltaRaw
            ? {
                x: Number(dragDeltaRaw.x.toFixed(4)),
                y: Number(dragDeltaRaw.y.toFixed(4)),
                z: Number(dragDeltaRaw.z.toFixed(4)),
              }
            : null
          logIfcMove('transform_pointer_state_reset', { reason: 'dragging_changed_false' })
          logIfcMove('drag_end', {
            endPosition: dragEndPosition,
            deltaRaw: dragDeltaRaw,
            delta: dragDelta,
          })
          traceIfcMove('drag_end_enter', {
            marker: IFC_MOVE_BUILD_MARKER,
            selectedSource: selectedTargetRef.current?.source ?? null,
            hasDragObject: Boolean(dragObject),
            hasDragDelta: Boolean(dragDelta),
          })
          const selectedTarget = selectedTargetRef.current
          logIfcMove('drag_end_selection_snapshot', {
            source: selectedTarget?.source ?? null,
            modelId: selectedTarget?.source === 'ifc' ? selectedTarget.modelId : null,
            localId: selectedTarget?.source === 'ifc' ? selectedTarget.localId : null,
            hitLocalId: selectedTarget?.source === 'ifc' ? selectedTarget.hitLocalId : null,
            hasObject: selectedTarget?.source === 'ifc' ? Boolean(selectedTarget.object) : null,
            commitInFlight: ifcCommitInFlightRef.current,
          })
          if (selectedTarget?.source === 'ifc') {
            if (selectedTarget.object) emitCoordinates(selectedTarget.object.position)
            if (selectedTarget.object && activeDragSessionId) {
              dispatchTransformRuntimeAction(
                {
                  type: 'UPDATE_DELTA',
                  transformSessionId: activeDragSessionId,
                  delta: {
                    position: {
                      x: dragDeltaRaw?.x ?? 0,
                      y: dragDeltaRaw?.y ?? 0,
                      z: dragDeltaRaw?.z ?? 0,
                    },
                    rotation: {
                      x: selectedTarget.object.rotation.x,
                      y: selectedTarget.object.rotation.y,
                      z: selectedTarget.object.rotation.z,
                    },
                    scale: {
                      x: selectedTarget.object.scale.x,
                      y: selectedTarget.object.scale.y,
                      z: selectedTarget.object.scale.z,
                    },
                  },
                },
                'drag_end_ifc_delta',
              )
            }
            const hasMovementDelta = dragDeltaRaw
            const hasMovement = hasMovementDelta != null
              && (
                Math.abs(hasMovementDelta.x) > 1e-6
                || Math.abs(hasMovementDelta.y) > 1e-6
                || Math.abs(hasMovementDelta.z) > 1e-6
              )
            let hasTransformDelta = false
            if (selectedTarget.object) {
              selectedTarget.object.updateMatrixWorld(true)
              const currentWorldMatrix = selectedTarget.object.matrixWorld.clone()
              const previousElements = (selectedTarget.object.userData as { ifcEditProxyWorldMatrix?: number[] })
                .ifcEditProxyWorldMatrix
              if (Array.isArray(previousElements) && previousElements.length === 16) {
                const previousWorldMatrix = new THREE.Matrix4().fromArray(previousElements)
                const deltaMatrix = currentWorldMatrix.clone().multiply(previousWorldMatrix.clone().invert())
                hasTransformDelta = !hasIdentityMatrixDelta(deltaMatrix.elements)
              }
            }
            if (!hasMovement && !hasTransformDelta) {
              ifcMoveDirtyRef.current = false
              if (activeDragSessionId) {
                dispatchTransformRuntimeAction(
                  { type: 'CLEANUP', transformSessionId: activeDragSessionId },
                  'drag_end_ifc_noop_cleanup',
                )
                activeDragSessionId = null
              }
              logIfcMove('drag_end_noop_skip_commit', {
                modelId: selectedTarget.modelId,
                localId: selectedTarget.localId,
                hitLocalId: selectedTarget.hitLocalId,
                deltaRaw: dragDeltaRaw,
                deltaRounded: dragDelta,
                hasTransformDelta: false,
              })
              return
            }
            ifcMoveDirtyRef.current = true
            lastIfcDragEndAt = performance.now()
            logIfcMove('drag_end_schedule_commit', {
              modelId: selectedTarget.modelId,
              localId: selectedTarget.localId,
              hitLocalId: selectedTarget.hitLocalId,
              deltaRaw: dragDeltaRaw,
              deltaRounded: dragDelta,
              hasTransformDelta,
              note: 'commit scheduled immediately after drag end',
            })
            if (activeDragSessionId) {
              dispatchTransformRuntimeAction(
                { type: 'REQUEST_COMMIT', transformSessionId: activeDragSessionId },
                'drag_end_ifc_request_commit',
              )
            }
            scheduleIfcCommit('drag_end_ifc', 0, activeDragSessionId)
            return
          }
          if (selectedTarget?.source === 'library' && selectedTarget.object && activeDragSessionId) {
            dispatchTransformRuntimeAction(
              {
                type: 'UPDATE_DELTA',
                transformSessionId: activeDragSessionId,
                delta: {
                  position: {
                    x: dragDeltaRaw?.x ?? 0,
                    y: dragDeltaRaw?.y ?? 0,
                    z: dragDeltaRaw?.z ?? 0,
                  },
                  rotation: {
                    x: selectedTarget.object.rotation.x,
                    y: selectedTarget.object.rotation.y,
                    z: selectedTarget.object.rotation.z,
                  },
                  scale: {
                    x: selectedTarget.object.scale.x,
                    y: selectedTarget.object.scale.y,
                    z: selectedTarget.object.scale.z,
                  },
                },
              },
              'drag_end_library_delta',
            )
            dispatchTransformRuntimeAction(
              { type: 'REQUEST_COMMIT', transformSessionId: activeDragSessionId },
              'drag_end_library_request_commit',
            )
          }
          scheduleIfcCommit('drag_end_library', 0, activeDragSessionId)
        })
        const thatOpenRaycaster = components.get(OBC.Raycasters).get(world)
        const hider = components.get(OBC.Hider)

        sceneRef.current = {
          three: THREE,
          scene: world.scene.three,
          camera: world.camera.three,
          renderer: world.renderer.three,
          fragments,
          hider,
          raycaster: thatOpenRaycaster,
          transformControls,
          contentGroup,
          ifcEditGroup,
          ifcObject: fragmentModel.object,
          modelId,
          worldUnitsPerMm,
          worldCamera: world.camera,
          cameraControls: world.camera.controls,
        }
        presetGroupRef.current = presetGroup
        positionPresetGroupBesideIfc(THREE, fragmentModel.object, presetGroup, worldUnitsPerMm)
        const renderer = world.renderer.three
        pointerDownDom = renderer.domElement
        const camera = world.camera.three

        handlePointerDown = async (event: PointerEvent) => {
          lastInteractionAt = performance.now()
          const transformStateNow = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          if (isTransformDragging && (transformStateNow.axis ?? null) == null) {
            const recovered = forceRecoverTransformDragging('pointer_down_dragging_with_null_axis')
            isTransformDragging = false
            isTransformPointerActive = false
            transformPointerActiveSince = 0
            lastTransformAxis = null
            if (world.camera.controls) {
              ;(world.camera.controls as unknown as { enabled: boolean }).enabled = true
            }
            logIfcMove('pick_transform_dragging_force_release', {
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
              recovered,
              draggingStateOnControls: Boolean(transformStateNow.dragging),
              axis: transformStateNow.axis ?? null,
              reason: 'pointer_down_dragging_with_null_axis',
            })
          }
          if (isTransformDragging && !isTransformPointerActive) {
            const recovered = forceRecoverTransformDragging('pointer_down_dragging_without_pointer_active')
            isTransformDragging = false
            transformPointerActiveSince = 0
            lastTransformAxis = null
            if (world.camera.controls) {
              ;(world.camera.controls as unknown as { enabled: boolean }).enabled = true
            }
            logIfcMove('pick_transform_dragging_force_release', {
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
              recovered,
              draggingStateOnControls: Boolean(transformStateNow.dragging),
              axis: transformStateNow.axis ?? null,
            })
          }
          if (isTransformDragging && !transformStateNow.dragging) {
            const recovered = forceRecoverTransformDragging('pointer_down_stale_dragging_flag')
            isTransformDragging = false
            isTransformPointerActive = false
            transformPointerActiveSince = 0
            lastTransformAxis = null
            logIfcMove('pick_transform_dragging_stale_recovered', {
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
              recovered,
              axis: transformStateNow.axis ?? null,
            })
          }
          if (isTransformDragging) {
            logIfcMove('pick_skipped_while_transform_dragging', {
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
              axis: lastTransformAxis,
            })
            return
          }
          const pickSequence = ++pointerPickSequence
          const isStalePick = () => disposed || pickSequence !== pointerPickSequence
          if (disposed) return
          container.focus()
          const transformStateAtDown = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          const currentAxis = transformStateAtDown.axis ?? lastTransformAxis
          const pointerActiveMs = isTransformPointerActive && transformPointerActiveSince > 0
            ? performance.now() - transformPointerActiveSince
            : 0
          logIfcMove('pick_pointer_down', {
            pickSequence,
            pointerType: event.pointerType,
            button: event.button,
            buttons: event.buttons,
            clientX: event.clientX,
            clientY: event.clientY,
            transformDragging: Boolean(transformStateAtDown.dragging),
            axis: currentAxis ?? null,
            isTransformPointerActive,
            pointerActiveMs: Number(pointerActiveMs.toFixed(1)),
            commitInFlight: ifcCommitInFlightRef.current,
            movePhase: ifcMoveLifecycleRef.current.phase,
            selectedSource: selectedTargetRef.current?.source ?? null,
          })
          const bounds = renderer.domElement.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            logIfcMove('pick_pointer_down_outside_bounds', {
              pickSequence,
              bounds: {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
              },
              clientX: event.clientX,
              clientY: event.clientY,
            })
            return
          }

          const normalizedMouse = new THREE.Vector2(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
          )
          const screenMouse = new THREE.Vector2(event.clientX, event.clientY)
          const raycaster = new THREE.Raycaster()
          raycaster.setFromCamera(normalizedMouse, camera)
          const wasTransformActive = transformControls.visible && transformControls.enabled
          const transformState = transformControls as unknown as { dragging?: boolean; axis?: string | null }
          if (wasTransformActive) {
            const helperHits = raycaster.intersectObject(transformHelper, true)
            const axisHit = helperHits.find((hit) => {
              let cursor: Object3D | null = hit.object
              while (cursor && cursor !== transformHelper) {
                if (TRANSFORM_GIZMO_AXIS_NAMES.has((cursor.name ?? '').toUpperCase())) return true
                cursor = cursor.parent
              }
              return false
            })
            if (axisHit) {
              isTransformPointerActive = true
              if (transformPointerActiveSince <= 0) transformPointerActiveSince = performance.now()
              logIfcMove('pick_blocked_by_transform_helper_hit', {
                pickSequence,
                helperDistance: axisHit.distance,
                selectedSource: selectedTargetRef.current?.source ?? null,
                axis: (transformControls as unknown as { axis?: string | null }).axis ?? null,
                action: 'skip_scene_pick_keep_transform_interaction',
              })
              return
            }
          }
          if (ifcCommitInFlightRef.current) {
            logIfcMove('pick_commit_in_flight_non_blocking', {
              pickSequence,
              commitInFlight: true,
              movePhase: ifcMoveLifecycleRef.current.phase,
              selectedSource: selectedTargetRef.current?.source ?? null,
            })
          }
          if (wasTransformActive && isTransformPointerActive && !transformState.dragging) {
            const recovered = forceRecoverTransformDragging('pointer_active_not_dragging_at_pick')
            isTransformPointerActive = false
            transformPointerActiveSince = 0
            lastTransformAxis = null
            logIfcMove('pick_transform_pointer_non_dragging_recovered', {
              pickSequence,
              dragging: false,
              wasTransformActive,
              pointerActiveMs: Number(pointerActiveMs.toFixed(1)),
              axis: currentAxis ?? null,
              recovered,
              action: 'recover_and_continue_pick',
            })
          }
          // TransformControls의 invisible picker 오브젝트가 raycaster에 잡혀 false positive가 발생하므로
          // isTransformHelperHit 체크를 제거하고 TransformControls 자체 mouseDown 이벤트 기반의
          // isTransformPointerActive로 기즈모 클릭 여부를 일원화한다.
          // (canvas → container 이벤트 버블링 순서상 mouseDown은 항상 먼저 설정된다)
          if (transformState.dragging) {
            logIfcMove('pick_blocked_by_transform_dragging', {
              dragging: true,
              wasTransformActive,
              isTransformPointerActive,
              action: 'blocked_active_drag',
              pickSequence,
            })
            return
          }
          const ifcEditHit = raycaster.intersectObjects(ifcEditGroup.children, true)[0]
          const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
          logIfcMove('pick_candidates', {
            pickSequence,
            hasIfcEditHit: Boolean(ifcEditHit),
            ifcEditDistance: typeof (ifcEditHit as unknown as { distance?: unknown } | undefined)?.distance === 'number'
              ? (ifcEditHit as unknown as { distance: number }).distance
              : null,
            hasLibraryHit: Boolean(libraryHit),
            libraryDistance: typeof (libraryHit as unknown as { distance?: unknown } | undefined)?.distance === 'number'
              ? (libraryHit as unknown as { distance: number }).distance
              : null,
            selectedSource: selectedTargetRef.current?.source ?? null,
          })
          let pendingIfcSelectionRestore: { modelId: string; localIds: number[] } | null = null
          const consumePendingIfcSelectionRestore = async (
            nextModelId?: string,
            nextHiddenLocalIds: number[] = [],
            reason = 'selection_switch_atomic_restore',
          ) => {
            if (!pendingIfcSelectionRestore) return
            const pending = pendingIfcSelectionRestore
            pendingIfcSelectionRestore = null
            const blockSet = new Set(
              pending.modelId === nextModelId
                ? nextHiddenLocalIds.filter(Number.isFinite)
                : [],
            )
            const restoreIds = pending.localIds.filter((localId) => !blockSet.has(localId))
            if (restoreIds.length === 0) {
              logIfcMove('selection_switch_atomic_restore_skip', {
                reason,
                modelId: pending.modelId,
                pendingLocalIds: pending.localIds,
                blockedLocalIds: Array.from(blockSet),
              })
              return
            }
            const activeScene = sceneRef.current
            if (!activeScene) return
            await applyIfcSelectionVisibility(activeScene, {
              modelId: pending.modelId,
              localIds: restoreIds,
              mode: 'model',
              keepModelVisibleInProxy: true,
              reason,
            })
            logIfcMove('selection_switch_atomic_restore_apply', {
              reason,
              modelId: pending.modelId,
              restoreLocalIds: restoreIds,
              blockedLocalIds: Array.from(blockSet),
            })
          }
          // 이전 선택을 해제한다. 동일 객체/로컬ID이면 아무 처리도 하지 않는다.
          const clearPreviousSelection = async (
            nextObject?: Object3D,
            nextIfcLocalId?: number,
            options: {
              skipOverlayPurge?: boolean
              skipPendingSaveSync?: boolean
            } = {},
          ) => {
            const currentTarget = selectedTargetRef.current
            // sceneRef.current는 loadIfc 완료 후 등록된 핸들러 내부이므로 항상 유효하다.
            const activeScene = sceneRef.current
            if (!currentTarget || !activeScene) return
            if (nextObject && currentTarget.object === nextObject) return
            if (currentTarget.source === 'ifc' && currentTarget.hitLocalId === nextIfcLocalId) return
            const isEmptyPick = !Number.isFinite(nextIfcLocalId)
            const shouldPreserveMovedIfcProxy = currentTarget.source === 'ifc'
              && (
                Boolean(currentTarget.keepModelHiddenAfterCommit)
                || isMovedIfcProxyObject(currentTarget.object)
              )
            const shouldLightweightClearHiddenIfc = (
              currentTarget.source === 'ifc'
              && isEmptyPick
              && shouldPreserveMovedIfcProxy
            )
            if (shouldLightweightClearHiddenIfc) {
              clearPendingIfcCommit('selection_switch_empty_keep_hidden')
              activeScene.transformControls.detach()
              activeScene.transformControls.visible = false
              activeScene.transformControls.enabled = false
              ifcMoveDirtyRef.current = false
              selectedTargetRef.current = null
              syncTransformSelectionState(null, 'pick_empty_keep_hidden')
              logIfcMove('selection_switch_empty_keep_hidden_lightweight_clear', {
                modelId: currentTarget.modelId,
                localId: currentTarget.localId,
                hitLocalId: currentTarget.hitLocalId,
                keptProxyObject: Boolean(currentTarget.object),
                skippedSave: true,
                skippedRestore: true,
                skippedOverlayPurge: true,
              })
              return
            }
            let deferFinalizeClearAfterSave = false
            let deferredFinalizeTarget: Extract<Selected3DTarget, { source: 'ifc' }> | null = null
            logIfcMove('selection_switch_clear_previous', {
              fromSource: currentTarget.source,
              fromModelId: currentTarget.source === 'ifc' ? currentTarget.modelId : null,
              fromLocalId: currentTarget.source === 'ifc' ? currentTarget.localId : null,
              fromHitLocalId: currentTarget.source === 'ifc' ? currentTarget.hitLocalId : null,
              fromHasObject: currentTarget.source === 'ifc' ? Boolean(currentTarget.object) : true,
              fromKeepModelHiddenAfterCommit: currentTarget.source === 'ifc'
                ? Boolean(currentTarget.keepModelHiddenAfterCommit)
                : null,
              nextIfcLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
            })
            clearPendingIfcCommit('selection_switch')
            if (currentTarget.source === 'ifc') {
              if (ifcCommitInFlightRef.current) {
                await waitForCommitInFlightToSettle('selection_switch_precheck')
              }
              const switchStartedAt = performance.now()
              const shouldFlushCommit = ifcMoveDirtyRef.current || ifcCommitInFlightRef.current
              logIfcMove('selection_switch_commit_decision', {
                shouldFlushCommit,
                ifcMoveDirty: ifcMoveDirtyRef.current,
                commitInFlight: ifcCommitInFlightRef.current,
                fromLocalId: currentTarget.localId,
                toLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
              })
              if (shouldFlushCommit) {
                await flushActiveIfcCommit(currentTarget, 'selection_switch', {
                  keepProxyVisibleAfterCommit: true,
                })
              } else {
                logIfcMove('selection_switch_commit_skip_clean', {
                  fromLocalId: currentTarget.localId,
                })
              }
              logIfcMove('selection_switch_commit_timing', {
                elapsedMs: Number((performance.now() - switchStartedAt).toFixed(1)),
                fromLocalId: currentTarget.localId,
              })
              if (isEmptyPick) {
                const shouldForceSyncBeforeClear = Boolean(currentTarget.keepModelHiddenAfterCommit)
                if (shouldForceSyncBeforeClear) {
                  // keepModelHidden=true + empty pick 에서 선저장 await(200~300ms)은 플래시/멈칫을 유발한다.
                  // 프록시는 잠시 유지한 채 즉시 clear하고, 저장 완료 후 원본 복구+프록시 제거를 수행한다.
                  deferFinalizeClearAfterSave = true
                  deferredFinalizeTarget = {
                    ...currentTarget,
                    object: currentTarget.object,
                    keepModelHiddenAfterCommit: true,
                    visibilityRestoredAtCommit: false,
                  }
                  logIfcMove('selection_switch_force_sync_defer_post_clear_keep_hidden', {
                    modelId: currentTarget.modelId,
                    localId: currentTarget.localId,
                    hitLocalId: currentTarget.hitLocalId,
                  })
                } else {
                  // keepModelHidden=false 케이스는 반응성을 위해 pending save를 유지한다.
                  logIfcMove('selection_switch_force_sync_skip_empty_pick_keep_pending', {
                    modelId: currentTarget.modelId,
                    localId: currentTarget.localId,
                    hitLocalId: currentTarget.hitLocalId,
                  })
                }
              } else if (options.skipPendingSaveSync) {
                logIfcMove('selection_switch_force_sync_skip_existing_proxy_pick', {
                  modelId: currentTarget.modelId,
                  localId: currentTarget.localId,
                  hitLocalId: currentTarget.hitLocalId,
                  nextIfcLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
                })
              } else {
                const didForceSyncSave = await flushPendingIfcSaveSync(
                  activeScene,
                  'selection_switch_pre_clear',
                )
                if (didForceSyncSave) {
                  currentTarget.keepModelHiddenAfterCommit = false
                  // force-sync save는 persistence만 보장한다. 가시성 복구는 clearSelectedTarget에서 수행해야 한다.
                  currentTarget.visibilityRestoredAtCommit = false
                  if (currentTarget.object) {
                    ;(currentTarget.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit = false
                  }
                  logIfcMove('selection_switch_force_sync_saved', {
                    modelId: currentTarget.modelId,
                    localId: currentTarget.localId,
                    hitLocalId: currentTarget.hitLocalId,
                  })
                }
              }
            }
            const shouldDeferIfcRestore = currentTarget.source === 'ifc'
              && Number.isFinite(nextIfcLocalId)
              && !shouldPreserveMovedIfcProxy
            const clearStartedAt = performance.now()
            if (shouldDeferIfcRestore && currentTarget.source === 'ifc') {
              const deferredLocalIds = Array.from(new Set<number>(
                (
                  (currentTarget.object as IfcEditableObject3D | undefined)?.userData?.ifcEditTarget?.localIds
                  ?? [currentTarget.hitLocalId, currentTarget.localId]
                ).filter(Number.isFinite),
              ))
              pendingIfcSelectionRestore = {
                modelId: currentTarget.modelId,
                localIds: deferredLocalIds,
              }
              await clearSelectedTarget(
                activeScene,
                currentTarget,
                true,
                false,
                true,
              )
              logIfcMove('selection_switch_atomic_defer_restore', {
                modelId: currentTarget.modelId,
                deferredLocalIds,
                nextIfcLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
              })
            } else {
              if (deferFinalizeClearAfterSave && currentTarget.source === 'ifc') {
                await clearSelectedTarget(
                  activeScene,
                  currentTarget,
                  false,
                  false,
                  true,
                )
                logIfcMove('selection_switch_clear_defer_finalize_keep_hidden', {
                  modelId: currentTarget.modelId,
                  localId: currentTarget.localId,
                  hitLocalId: currentTarget.hitLocalId,
                })
              } else {
              const restoreVisibilityOnClear = currentTarget.source === 'ifc'
                ? !shouldPreserveMovedIfcProxy && !currentTarget.keepModelHiddenAfterCommit
                : true
              await clearSelectedTarget(
                activeScene,
                currentTarget,
                currentTarget.source === 'ifc' && !shouldPreserveMovedIfcProxy,
                restoreVisibilityOnClear,
                currentTarget.source === 'ifc' && shouldPreserveMovedIfcProxy,
              )
              }
            }
            logIfcMove('selection_switch_clear_timing', {
              elapsedMs: Number((performance.now() - clearStartedAt).toFixed(1)),
              fromSource: currentTarget.source,
              fromLocalId: currentTarget.source === 'ifc' ? currentTarget.localId : null,
            })
            // alias localId 차이로 남을 수 있는 고아 프록시를 함께 정리한다.
            if (options.skipOverlayPurge) {
              logIfcMove('selection_switch_overlay_purge_skipped', {
                reason: 'existing_proxy_pick',
                fromSource: currentTarget.source,
                nextIfcLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
              })
            } else {
              purgeIfcEditOverlays(activeScene, 'selection_switch_clear_previous')
            }
            await rehideMovedIfcProxyRegistry(activeScene, 'selection_switch_clear_previous', { forceRender: false })
            selectedTargetRef.current = null
            syncTransformSelectionState(null, 'selection_switch_clear_previous')
            if (deferFinalizeClearAfterSave && deferredFinalizeTarget) {
              const finalizeTarget = deferredFinalizeTarget
              const runFinalize = async () => {
                const didForceSyncSave = await flushPendingIfcSaveSync(
                  activeScene,
                  'selection_switch_post_clear_empty_pick_keep_hidden',
                )
                if (!didForceSyncSave) return
                const targetForRestore: Extract<Selected3DTarget, { source: 'ifc' }> = {
                  ...finalizeTarget,
                  keepModelHiddenAfterCommit: false,
                  visibilityRestoredAtCommit: false,
                }
                if (targetForRestore.object) {
                  ;(targetForRestore.object as IfcEditableObject3D).userData.ifcKeepModelHiddenAfterCommit = false
                }
                await clearSelectedTarget(
                  activeScene,
                  targetForRestore,
                  true,
                  true,
                )
                purgeIfcEditOverlays(activeScene, 'selection_switch_post_clear_finalize_keep_hidden')
                activeScene.renderer.render(activeScene.scene, activeScene.camera as import('three').PerspectiveCamera)
                logIfcMove('selection_switch_force_sync_saved_post_clear_keep_hidden', {
                  modelId: targetForRestore.modelId,
                  localId: targetForRestore.localId,
                  hitLocalId: targetForRestore.hitLocalId,
                })
              }
              void runFinalize()
            }
          }

          const clickedIfcProxy = ifcEditHit?.object
            ? findIfcEditableRoot(ifcEditHit.object, ifcEditGroup)
            : null
          const clickedIfcEditTarget = clickedIfcProxy?.userData?.ifcEditTarget
          if (clickedIfcProxy && clickedIfcEditTarget) {
            const hitLocalId = Number.isFinite(clickedIfcEditTarget.hitLocalId)
              ? clickedIfcEditTarget.hitLocalId
              : clickedIfcEditTarget.localId
            const proxyLocalIds = Array.from(new Set<number>(
              (
                clickedIfcEditTarget.localIds
                ?? [clickedIfcEditTarget.hitLocalId, clickedIfcEditTarget.localId]
              ).filter(Number.isFinite),
            ))
            const selectedElement = clickedIfcEditTarget.element
            await clearPreviousSelection(clickedIfcProxy, hitLocalId, {
              skipOverlayPurge: true,
              skipPendingSaveSync: true,
            })
            if (isStalePick()) {
              await consumePendingIfcSelectionRestore(
                undefined,
                [],
                'selection_switch_atomic_restore_stale_after_existing_proxy_clear',
              )
              logIfcMove('pick_discarded_stale_after_existing_proxy_clear', {
                pickSequence,
                hitLocalId,
              })
              return
            }
            const activeScene = sceneRef.current
            if (!activeScene) return
            const keepModelHiddenAfterCommit = typeof clickedIfcProxy.userData.ifcKeepModelHiddenAfterCommit === 'boolean'
              ? clickedIfcProxy.userData.ifcKeepModelHiddenAfterCommit
              : true
            const nextTarget: Extract<Selected3DTarget, { source: 'ifc' }> = {
              source: 'ifc',
              modelId: clickedIfcEditTarget.modelId,
              localId: clickedIfcEditTarget.localId,
              hitLocalId,
              hitItemId: clickedIfcEditTarget.hitItemId,
              object: clickedIfcProxy,
              keepModelHiddenAfterCommit,
              selectedSignature: getElementDimensionSignature(selectedElement),
              selectedColorSignature: getElementColorSignature(selectedElement),
              selectedMaterialSignature: getElementMaterialSignature(selectedElement),
            }
            clickedIfcProxy.visible = true
            await applyIfcSelectionVisibility(activeScene, {
              modelId: clickedIfcEditTarget.modelId,
              localIds: proxyLocalIds.length > 0 ? proxyLocalIds : [hitLocalId].filter(Number.isFinite),
              proxyObject: clickedIfcProxy,
              mode: 'proxy',
              proxyOpacity: 1,
              reason: 'pick_existing_proxy',
              forceRender: false,
            })
            await consumePendingIfcSelectionRestore(
              clickedIfcEditTarget.modelId,
              proxyLocalIds,
              'selection_switch_atomic_restore_pick_existing_proxy',
            )
            await rehideMovedIfcProxyRegistry(activeScene, 'pick_existing_proxy', { forceRender: false })
            transformControls.attach(clickedIfcProxy)
            transformControls.visible = true
            transformControls.enabled = true
            clickedIfcProxy.updateMatrixWorld(true)
            ;(clickedIfcProxy.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
              Array.from(clickedIfcProxy.matrixWorld.elements)
            selectedTargetRef.current = nextTarget
            syncTransformSelectionState(nextTarget, 'pick_existing_ifc_proxy_attach_success', { attachGizmo: true })
            ifcMoveLifecycleRef.current = {
              phase: 'idle',
              targetKey: null,
              lastError: null,
            }
            logIfcMove('pick_existing_proxy_attached', {
              modelId: clickedIfcEditTarget.modelId,
              localId: clickedIfcEditTarget.localId,
              hitLocalId,
              localIds: proxyLocalIds,
              keepModelHiddenAfterCommit,
            })
            onIfcElementSelectRef.current?.(selectedElement)
            emitCoordinates(clickedIfcProxy.position)
            return
          }

          const runIfcRaycast = async () => {
            const fragmentPick = await fragments.raycast({
              camera,
              mouse: screenMouse,
              dom: renderer.domElement,
            })
            const fastPick = await thatOpenRaycaster.castRay({ position: normalizedMouse })
            const fastPickScreen = !fastPick
              ? await thatOpenRaycaster.castRay({ position: screenMouse })
              : null
            const fastPickIfc = fastPick as IfcRaycastPick | null
            const fastPickScreenIfc = fastPickScreen as IfcRaycastPick | null
            const ifcPick = fragmentPick ?? fastPickIfc
            const resolvedIfcPick = ifcPick ?? fastPickScreenIfc
            return {
              fragmentPick,
              fastPick,
              fastPickScreen,
              fastPickIfc,
              fastPickScreenIfc,
              resolvedIfcPick,
            }
          }

          let {
            fragmentPick,
            fastPick,
            fastPickScreen,
            fastPickIfc,
            fastPickScreenIfc,
            resolvedIfcPick,
          } = await runIfcRaycast()

          const activeIfcProxy = (
            selectedTargetRef.current?.source === 'ifc'
              ? selectedTargetRef.current.object
              : null
          ) as Object3D | null
          if (!resolvedIfcPick && activeIfcProxy) {
            const wasProxyVisible = activeIfcProxy.visible
            const wasTransformVisible = transformControls.visible
            activeIfcProxy.visible = false
            transformControls.visible = false
            try {
              ;({
                fragmentPick,
                fastPick,
                fastPickScreen,
                fastPickIfc,
                fastPickScreenIfc,
                resolvedIfcPick,
              } = await runIfcRaycast())
            } finally {
              activeIfcProxy.visible = wasProxyVisible
              transformControls.visible = wasTransformVisible
            }
            logIfcMove('pick_ifc_raycast_retry_without_proxy', {
              pickSequence,
              hadInitialHit: false,
              hasRetryHit: Boolean(resolvedIfcPick),
              retryFragmentLocalId: typeof fragmentPick?.localId === 'number' ? fragmentPick.localId : null,
              retryFastPickNdcLocalId: typeof fastPickIfc?.localId === 'number' ? fastPickIfc.localId : null,
              retryFastPickScreenLocalId: typeof fastPickScreenIfc?.localId === 'number' ? fastPickScreenIfc.localId : null,
            })
          }
          logIfcMove('pick_ifc_raycast_status', {
            pickSequence,
            hasFragmentPick: Boolean(fragmentPick),
            hasFastPickNdc: Boolean(fastPick),
            hasFastPickScreen: Boolean(fastPickScreen),
            fragmentLocalId: typeof fragmentPick?.localId === 'number' ? fragmentPick.localId : null,
            fastPickNdcLocalId: typeof fastPickIfc?.localId === 'number'
              ? fastPickIfc.localId
              : null,
            fastPickScreenLocalId: typeof fastPickScreenIfc?.localId === 'number'
              ? fastPickScreenIfc.localId
              : null,
          })
          if (resolvedIfcPick?.fragments?.modelId && typeof resolvedIfcPick.localId === 'number') {
            const ifcDistance = typeof resolvedIfcPick.distance === 'number' ? resolvedIfcPick.distance : Number.POSITIVE_INFINITY
            const libraryDistance = typeof (libraryHit as unknown as { distance?: unknown } | undefined)?.distance === 'number'
              ? (libraryHit as unknown as { distance: number }).distance
              : Number.POSITIVE_INFINITY
            const isDeletedIfcPick = deletedIfcLocalIdSetRef.current.has(resolvedIfcPick.localId)
            if (!isDeletedIfcPick && (!libraryHit || ifcDistance <= libraryDistance)) {
              logIfcMove('pick_floor_object', {
                pickSequence,
                source: 'ifc',
                hitLocalId: resolvedIfcPick.localId,
                ifcDistance,
                libraryDistance,
              })
              const rawPickedModelId = resolvedIfcPick.fragments.modelId
              const pickedModelId = normalizeRootModelId(rawPickedModelId, sceneRef.current?.modelId ?? rawPickedModelId)
              await clearPreviousSelection(undefined, resolvedIfcPick.localId)
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_clear',
                )
                logIfcMove('pick_discarded_stale_after_clear', { pickSequence, hitLocalId: resolvedIfcPick.localId })
                return
              }
              const element = await getIfcElementFromFragments(fragments, {
                modelId: pickedModelId,
                localId: resolvedIfcPick.localId,
              }, ifcPsetMetricsRef.current)
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_element_fetch',
                )
                logIfcMove('pick_discarded_stale_after_element_fetch', { pickSequence, hitLocalId: resolvedIfcPick.localId })
                return
              }
              const selectedLocalId = resolvedIfcPick.localId
              const selectedExpressId = typeof element?.expressId === 'number' ? element.expressId : selectedLocalId
              const baseSelectedElement = element ?? (resolvedIfcPick.object
                ? normalizeIfcElement(resolvedIfcPick.object, `${pickedModelId}:${resolvedIfcPick.localId}`)
                : {
                    id: `${pickedModelId}:${resolvedIfcPick.localId}`,
                    name: 'IFC Element',
                    ifcClass: 'IfcElement',
                    category: 'Element',
                    source: 'ifc',
                    expressId: selectedExpressId,
                    properties: {},
                  })
              const selectedElement = baseSelectedElement
              const nextTarget: Extract<Selected3DTarget, { source: 'ifc' }> = {
                source: 'ifc',
                modelId: pickedModelId,
                localId: selectedLocalId,
                hitLocalId: resolvedIfcPick.localId,
                hitItemId: Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : undefined,
                selectedSignature: getElementDimensionSignature(selectedElement),
                selectedColorSignature: getElementColorSignature(selectedElement),
                selectedMaterialSignature: getElementMaterialSignature(selectedElement),
              }
              const activeScene = sceneRef.current
              const rawItemMappedLocalIds = Number.isFinite(resolvedIfcPick.itemId) && activeScene
                ? await resolveLocalIdsFromItemIds(activeScene, pickedModelId, [resolvedIfcPick.itemId as number])
                : []
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_item_map',
                )
                logIfcMove('pick_discarded_stale_after_item_map', { pickSequence, hitLocalId: resolvedIfcPick.localId })
                return
              }
              const itemMappedLocalIds = sanitizeMappedLocalIds(
                'pick',
                pickedModelId,
                resolvedIfcPick.localId,
                rawItemMappedLocalIds,
              )
              const proxyLocalIds = resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
                hitLocalId: resolvedIfcPick.localId,
                localId: selectedLocalId,
                expressId: selectedExpressId,
                itemMappedLocalIds,
              })
              registerCanonicalIds(selectedExpressId, proxyLocalIds)
              const editability = activeScene
                ? await resolveEditableIfcTargets(activeScene, pickedModelId, proxyLocalIds)
                : null
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_editability',
                )
                logIfcMove('pick_discarded_stale_after_editability', { pickSequence, hitLocalId: resolvedIfcPick.localId })
                return
              }
              const requiredEditableIds = itemMappedLocalIds.length > 0 ? itemMappedLocalIds : proxyLocalIds
              if (!editability || !editability.modelId || editability.editableLocalIds.length === 0) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_non_editable',
                )
                logIfcMove('pick_blocked_non_editable', {
                  modelId: pickedModelId,
                  rawPickedModelId,
                  hitLocalId: resolvedIfcPick.localId,
                  localId: selectedLocalId,
                  candidateLocalIds: proxyLocalIds,
                  modelIdsTried: editability?.modelIdsTried ?? [],
                })
                selectedTargetRef.current = nextTarget
                syncTransformSelectionState(nextTarget, 'pick_non_editable', { attachGizmo: false })
                transformControls.detach()
                transformControls.visible = false
                transformControls.enabled = false
                showIfcEditFeedback('error', '선택한 IFC 요소는 현재 이동 편집을 지원하지 않습니다.')
                onIfcElementSelectRef.current?.(selectedElement)
                emitCoordinates(world.camera.three.position)
                return
              }
              if (!containsAllIds(editability.editableLocalIds, requiredEditableIds)) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_partial_coverage',
                )
                logIfcMove('pick_blocked_partial_coverage', {
                  modelId: pickedModelId,
                  hitLocalId: resolvedIfcPick.localId,
                  requiredEditableIds,
                  editableLocalIds: editability.editableLocalIds,
                })
                selectedTargetRef.current = nextTarget
                syncTransformSelectionState(nextTarget, 'pick_partial_coverage', { attachGizmo: false })
                transformControls.detach()
                transformControls.visible = false
                transformControls.enabled = false
                showIfcEditFeedback('error', '선택한 IFC 요소는 일부만 편집 가능하여 이동을 차단했습니다.')
                onIfcElementSelectRef.current?.(selectedElement)
                emitCoordinates(world.camera.three.position)
                return
              }
              nextTarget.modelId = editability.modelId
              const existingMovedProxyRecord = activeScene
                ? findMovedIfcProxyRecord(activeScene, editability.modelId, editability.editableLocalIds)
                : null
              const editableObject = existingMovedProxyRecord?.object ?? await attachIfcTransformProxy(
                THREE,
                fragments,
                hider,
                transformControls,
                ifcEditGroup,
                editability.modelId,
                editability.editableLocalIds,
                resolvedIfcPick.localId,
                Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : undefined,
                selectedElement,
              )
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_attach',
                )
                logIfcMove('pick_discarded_stale_after_attach', { pickSequence, hitLocalId: resolvedIfcPick.localId })
                if (editableObject && !existingMovedProxyRecord) {
                  editableObject.parent?.remove(editableObject)
                  disposeObjectMaterials(THREE, editableObject)
                }
                return
              }
              logIfcMove('pick_attach_proxy_request', {
                modelId: editability.modelId,
                hitLocalId: resolvedIfcPick.localId,
                proxyLocalIds,
                itemMappedLocalIds,
                editableLocalIds: editability.editableLocalIds,
              })
              if (!editableObject) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_attach_failed',
                )
                logIfcMove('pick_blocked_proxy_attach_failed', {
                  modelId: editability.modelId,
                  hitLocalId: resolvedIfcPick.localId,
                  editableLocalIds: editability.editableLocalIds,
                })
                selectedTargetRef.current = nextTarget
                syncTransformSelectionState(nextTarget, 'pick_attach_failed', { attachGizmo: false })
                transformControls.detach()
                transformControls.visible = false
                transformControls.enabled = false
                showIfcEditFeedback('error', '선택한 IFC 요소의 편집 프록시 생성에 실패했습니다.')
                onIfcElementSelectRef.current?.(selectedElement)
                emitCoordinates(world.camera.three.position)
                return
              }
              nextTarget.selectedSignature = getElementDimensionSignature(selectedElement)
              nextTarget.selectedColorSignature = getElementColorSignature(selectedElement)
              nextTarget.selectedMaterialSignature = getElementMaterialSignature(selectedElement)
              nextTarget.object = editableObject ?? undefined
              if (existingMovedProxyRecord && editableObject) {
                transformControls.attach(editableObject)
                transformControls.visible = true
                transformControls.enabled = true
              }
              await applyIfcSelectionVisibility(sceneRef.current as ThatOpenSceneState, {
                modelId: editability.modelId,
                localIds: editability.editableLocalIds.length > 0
                  ? editability.editableLocalIds
                  : [resolvedIfcPick.localId].filter(Number.isFinite),
                proxyObject: editableObject,
                mode: 'proxy',
                proxyOpacity: 1,
                reason: 'pick_new_proxy',
                forceRender: false,
              })
              const activeSceneForNewProxyPick = sceneRef.current
              if (activeSceneForNewProxyPick) {
                await reapplyPendingUnpersistedIfcColors(
                  activeSceneForNewProxyPick,
                  'pick_new_proxy',
                  normalizeRootModelId(editability.modelId, activeSceneForNewProxyPick.modelId),
                )
              }
              await consumePendingIfcSelectionRestore(
                editability.modelId,
                editability.editableLocalIds,
                'selection_switch_atomic_restore_pick_new_proxy',
              )
              const activeSceneForRegistryRehide = sceneRef.current
              if (activeSceneForRegistryRehide) {
                await rehideMovedIfcProxyRegistry(activeSceneForRegistryRehide, 'pick_new_proxy', { forceRender: false })
              }
              const activeSceneAfterNewProxyPick = sceneRef.current
              if (activeSceneAfterNewProxyPick) {
                activeSceneAfterNewProxyPick.renderer.render(
                  activeSceneAfterNewProxyPick.scene,
                  activeSceneAfterNewProxyPick.camera as import('three').PerspectiveCamera,
                )
              }
              editableObject.updateMatrixWorld(true)
              ;(editableObject.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
                Array.from(editableObject.matrixWorld.elements)
              logIfcMove('pick_editable_attached', {
                modelId: editability.modelId,
                hitLocalId: resolvedIfcPick.localId,
                editableLocalIds: editability.editableLocalIds,
              })
              selectedTargetRef.current = nextTarget
              syncTransformSelectionState(nextTarget, 'pick_ifc_attach_success', { attachGizmo: true })
              ifcMoveLifecycleRef.current = {
                phase: 'idle',
                targetKey: null,
                lastError: null,
              }
              onIfcElementSelectRef.current?.(selectedElement)
              emitCoordinates(editableObject.position)
              return
            }
          }

          // NOTE:
          // 프록시(ifcEditGroup) 히트를 선택 fallback으로 사용하면 프록시가 클릭을 가로채
          // 다른 요소 선택 전환이 막히는 사례가 있어 fallback 경로를 비활성화한다.

          if (libraryHit?.object) {
            const libraryRoot = findLibraryRoot(libraryHit.object, presetGroup) ?? (libraryHit.object as LibraryObject3D)
            await clearPreviousSelection(libraryRoot)
            await consumePendingIfcSelectionRestore(
              undefined,
              [],
              'selection_switch_atomic_restore_library_pick',
            )
            const libraryElement = getLibraryElementInfo(libraryRoot) ?? normalizeIfcElement(libraryRoot, 'library-preset')
            selectedTargetRef.current = {
              source: 'library',
              object: libraryRoot,
              selectedSignature: getElementDimensionSignature(libraryElement),
              selectedColorSignature: getElementColorSignature(libraryElement),
              selectedMaterialSignature: getElementMaterialSignature(libraryElement),
            }
            syncTransformSelectionState(selectedTargetRef.current, 'pick_library_attach_success', { attachGizmo: true })
            transformControls.attach(libraryRoot)
            transformControls.visible = true
            transformControls.enabled = true
            onIfcElementSelectRef.current?.(libraryElement)
            emitCoordinates(libraryRoot.position)
            return
          }

          logIfcMove('pick_no_hit', {
            pickSequence,
            hadSelection: Boolean(selectedTargetRef.current),
            selectedSource: selectedTargetRef.current?.source ?? null,
            ifcEditGroupChildCount: ifcEditGroup.children.length,
            presetGroupChildCount: presetGroup.children.length,
          })
          await clearPreviousSelection()
          await consumePendingIfcSelectionRestore(
            undefined,
            [],
            'selection_switch_atomic_restore_empty_pick',
          )
          selectedTargetRef.current = null
          syncTransformSelectionState(null, 'pick_empty')
          onIfcElementSelectRef.current?.(null)
          emitCoordinates(world.camera.three.position)
        }
        pointerDownDom.addEventListener('pointerdown', handlePointerDown, true)

        handleKeyDown = async (event: KeyboardEvent) => {
          const isDeleteKey =
            event.key === 'Delete' ||
            event.key === 'Backspace' ||
            event.key === 'Del' ||
            event.code === 'Delete' ||
            event.code === 'Backspace'
          if (!isDeleteKey) return

          const target = event.target
          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            (target instanceof HTMLElement && target.isContentEditable)
          ) {
            return
          }

          const selectedTarget = selectedTargetRef.current
          if (!selectedTarget) return
          event.preventDefault()
          event.stopPropagation()
          await deleteSelectedTarget()
        }
        window.addEventListener('keydown', handleKeyDown, true)

        await fragments.core.update(true)
        // 최초 로드 시에는 고정 패딩으로 맞추고, 이후 줌 반영은 zoomScale effect에서 처리한다.
        fitObjectWithPadding(THREE, world.camera.three, world.camera.controls, fragmentModel.object, 1.55)
        // 파싱된 IFC 층 목록을 상위 컴포넌트로 전달한다.
        if (storeysWithElements.length > 0) onStoreysLoadRef.current?.(storeysWithElements)
        setStatus('ready')
      } catch (error) {
        if (disposed) return
        console.error('[editor] IFC load failed', { ifcUrl, error })
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'IFC model load failed.')
      }
    }

    void loadIfc()

    return () => {
      disposed = true
      if (pendingIfcCommitTimer) {
        window.clearTimeout(pendingIfcCommitTimer)
        pendingIfcCommitTimer = null
      }
      if (handlePointerDown && pointerDownDom) {
        pointerDownDom.removeEventListener('pointerdown', handlePointerDown, true)
      }
      if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown, true)
      if (handleGlobalPointerUp) {
        window.removeEventListener('pointerup', handleGlobalPointerUp, true)
        window.removeEventListener('pointercancel', handleGlobalPointerUp, true)
      }
      if (handleWindowBlur) window.removeEventListener('blur', handleWindowBlur)
      if (cameraControlsWithEvents && cameraControlsChangeListener) {
        cameraControlsWithEvents.removeEventListener?.('change', cameraControlsChangeListener)
      }
      try {
        components?.dispose()
      } catch {
        // ThatOpen can throw during renderer cleanup if React has already detached the canvas container.
      }
      sceneRef.current = null
      presetGroupRef.current = null
      resetTransformInteractionRef.current = null
      ifcPsetMetricsRef.current = { byId: {}, byName: {} }
      elementIdsByStoreyRef.current = new Map()
      canonicalIdMapRef.current = createEmptyIfcCanonicalIdMap()
      selectedTargetRef.current = null
      syncTransformSelectionState(null, 'scene_dispose')
      dispatchTransformRuntimeAction(
        { type: 'CANCEL_TRANSFORM', reason: 'scene_disposed' },
        'scene_dispose',
      )
      dispatchTransformRuntimeAction({ type: 'CLEANUP' }, 'scene_dispose_cleanup')
    }
  }, [
    commitIfcProxyTransformToModel,
    createTransformSessionId,
    deleteSelectedTarget,
    dispatchTransformRuntimeAction,
    findMovedIfcProxyRecord,
    flushPendingIfcSave,
    flushPendingIfcSaveSync,
    ifcUrl,
    isMovedIfcProxyObject,
    logIfcMove,
    purgeIfcEditOverlays,
    projectId,
    reapplyPendingUnpersistedIfcColors,
    rehideMovedIfcProxyRegistry,
    resolveEditableIfcTargets,
    resolveLocalIdsFromItemIds,
    resolveTargetOwnerId,
    registerCanonicalIds,
    sanitizeMappedLocalIds,
    showIfcEditFeedback,
    syncTransformSelectionState,
    transformRuntimeStateRef,
  ])

  // 활성 층 또는 겹쳐보기 층 변경 시 가시성을 갱신한다.
  // activeStoreyExpressId가 null이면 전체 표시한다.
  const applyLibraryVisibilityByStorey = useCallback(() => {
    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) return

    const overlaySet = new Set<number>(((overlayIfcStoreyExpressIds ?? []).filter(Number.isFinite) as number[]))
    const setLibraryObjectOpacity = (object: LibraryObject3D, opacity: number) => {
      const clampedOpacity = Math.min(Math.max(opacity, 0), 1)
      object.traverse((child) => {
        if (!(child instanceof sceneState.three.Mesh)) return
        const applyMaterialOpacity = (entry: unknown) => {
          if (!entry || typeof entry !== 'object') return
          const material = entry as {
            opacity?: number
            transparent?: boolean
            depthWrite?: boolean
            needsUpdate?: boolean
          }
          const nextTransparent = clampedOpacity < 1
          const nextDepthWrite = clampedOpacity >= 1
          const hasChanged =
            material.opacity !== clampedOpacity ||
            material.transparent !== nextTransparent ||
            material.depthWrite !== nextDepthWrite
          if (!hasChanged) return
          material.opacity = clampedOpacity
          material.transparent = nextTransparent
          material.depthWrite = nextDepthWrite
          material.needsUpdate = true
        }
        const meshMaterial = (child as { material?: unknown }).material
        if (Array.isArray(meshMaterial)) {
          meshMaterial.forEach((entry) => applyMaterialOpacity(entry))
          return
        }
        applyMaterialOpacity(meshMaterial)
      })
    }
    const isLibraryVisibleForStorey = (storeyExpressId: number | null) => {
      if (activeStoreyExpressId == null) return true
      if (storeyExpressId == null) return true
      if (storeyExpressId === activeStoreyExpressId) return true
      return overlaySet.has(storeyExpressId)
    }

    const selectedLibraryId = selectedTargetRef.current?.source === 'library'
      ? getLibraryPresetFromObject(selectedTargetRef.current.object as LibraryObject3D)?.id
      : null
    let shouldClearLibrarySelection = false

    presetGroup.children.forEach((child) => {
      const libraryObject = child as LibraryObject3D
      const preset = getLibraryPresetFromObject(libraryObject)
      if (!preset) {
        libraryObject.visible = true
        return
      }
      const normalizedStoreyId = Number.isFinite(preset.storeyExpressId) ? Number(preset.storeyExpressId) : null
      const isVisible = isLibraryVisibleForStorey(normalizedStoreyId)
      let opacity = 1
      if (
        isVisible &&
        normalizedStoreyId != null &&
        overlaySet.has(normalizedStoreyId) &&
        (activeStoreyExpressId == null || normalizedStoreyId !== activeStoreyExpressId)
      ) {
        const rawTransparency = overlayIfcStoreyOpacityByExpressId?.[normalizedStoreyId] ?? 0.35
        const clampedTransparency = Math.min(Math.max(rawTransparency, 0), 1)
        opacity = 1 - clampedTransparency
      }
      libraryObject.visible = isVisible
      setLibraryObjectOpacity(libraryObject, opacity)
      if (!isVisible && selectedLibraryId && preset.id === selectedLibraryId) {
        shouldClearLibrarySelection = true
      }
    })

    if (shouldClearLibrarySelection && selectedTargetRef.current?.source === 'library') {
      const isTransformLocked = isRuntimeTransformLocked()
      if (isTransformLocked) return
      sceneState.transformControls.detach()
      sceneState.transformControls.visible = false
      sceneState.transformControls.enabled = false
      selectedTargetRef.current = null
      syncTransformSelectionState(null, 'storey_visibility_clear_hidden_library')
      onIfcElementSelectRef.current?.(null)
    }
  }, [
    activeStoreyExpressId,
    overlayIfcStoreyExpressIds,
    overlayIfcStoreyOpacityByExpressId,
    isRuntimeTransformLocked,
    syncTransformSelectionState,
  ])

  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    const storeyMap = elementIdsByStoreyRef.current
    if (storeyMap.size === 0) return
    const overlayIdsNormalized = Array.from(new Set(
      (overlayIfcStoreyExpressIds ?? []).filter(Number.isFinite),
    )).sort((a, b) => a - b)
    const overlayOpacitySignature = overlayIdsNormalized
      .map((storeyId) => `${storeyId}:${Number((overlayIfcStoreyOpacityByExpressId?.[storeyId] ?? 0.35).toFixed(4))}`)
      .join(',')
    const deletedIfcIds = Array.from(new Set(
      ifcElementChanges
        .filter((change) => change.deleted)
        .flatMap((change) => {
          const ids: number[] = []
          if (Number.isFinite(change.localId)) ids.push(change.localId as number)
          ;(change.localIds ?? []).forEach((id) => {
            if (Number.isFinite(id)) ids.push(id)
          })
          if (
            !Number.isFinite(change.localId) &&
            (!change.localIds || change.localIds.length === 0) &&
            Number.isFinite(change.expressId)
          ) {
            // legacy fallback: localId 정보가 없는 오래된 change만 expressId를 사용한다.
            ids.push(change.expressId)
          }
          return ids
        }),
    )).sort((a, b) => a - b)
    const deletedIfcIdSignature = deletedIfcIds.join(',')
    const libraryStoreySignature = libraryElements
      .map((preset) => `${preset.id}:${Number.isFinite(preset.storeyExpressId) ? Number(preset.storeyExpressId) : 'none'}`)
      .sort()
      .join(',')
    const visibilitySignature = [
      activeStoreyExpressId == null ? 'all' : String(activeStoreyExpressId),
      overlayIdsNormalized.join(','),
      overlayOpacitySignature,
      deletedIfcIdSignature,
      libraryStoreySignature,
    ].join('|')
    if (storeyVisibilitySignatureRef.current === visibilitySignature) {
      logIfcMove('storey_visibility_effect_skip_same_signature', {
        visibilitySignature,
      })
      return
    }
    storeyVisibilitySignatureRef.current = visibilitySignature
    logIfcMove('storey_visibility_effect_apply', {
      visibilitySignature,
      activeStoreyExpressId: activeStoreyExpressId ?? null,
      overlayCount: overlayIdsNormalized.length,
      storeyCount: storeyMap.size,
    })

    applyLibraryVisibilityByStorey()

    // 층 전환 시 현재 선택 요소가 활성 층에 없으면 선택을 해제한다.
    let selectedTarget = selectedTargetRef.current
    const isTransformLocked = isRuntimeTransformLocked()
    const deletedIfcIdSet = new Set<number>(deletedIfcIds)
    const movedIfcHideIdSet = getMovedIfcProxyHideLocalIds()
    if (
      selectedTarget?.source === 'ifc' &&
      Number.isFinite(selectedTarget.localId) &&
      deletedIfcIdSet.has(selectedTarget.localId)
    ) {
      if (!isTransformLocked) {
        void clearSelectedTarget(sceneState, selectedTarget, selectedTarget.source === 'ifc')
        selectedTargetRef.current = null
        syncTransformSelectionState(null, 'storey_visibility_deleted_target_clear')
        selectedTarget = null
        onIfcElementSelectRef.current?.(null)
      }
    }
    if (selectedTarget?.source === 'ifc' && activeStoreyExpressId != null) {
      const activeIds = storeyMap.get(activeStoreyExpressId) ?? new Set<number>()
      // 층 파서의 elementLocalIds는 raycast localId(hitLocalId) 기준이다.
      // expressId(localId)와 다를 수 있으므로 hitLocalId를 우선 사용한다.
      const selId = Number.isFinite(selectedTarget.hitLocalId)
        ? selectedTarget.hitLocalId
        : selectedTarget.localId
      if (typeof selId === 'number' && !activeIds.has(selId)) {
        if (!isTransformLocked) {
          void clearSelectedTarget(sceneState, selectedTarget, selectedTarget.source === 'ifc')
          selectedTargetRef.current = null
          syncTransformSelectionState(null, 'storey_visibility_out_of_scope_clear')
          onIfcElementSelectRef.current?.(null)
        }
      }
    }

    const allIds = new Set<number>()
    storeyMap.forEach((ids) => ids.forEach((id) => allIds.add(id)))
    const deletedIdsInModel = new Set<number>()
    deletedIfcIds.forEach((id) => {
      if (allIds.has(id)) deletedIdsInModel.add(id)
    })
    const movedHiddenIdsInModel = new Set<number>()
    movedIfcHideIdSet.forEach((id) => {
      if (allIds.has(id)) movedHiddenIdsInModel.add(id)
    })
    const forcedHiddenIdsInModel = new Set<number>([
      ...Array.from(deletedIdsInModel),
      ...Array.from(movedHiddenIdsInModel),
    ])

    const resolveFragmentsModel = () => {
      const modelList = sceneState.fragments.core.models.list as Map<string, unknown>
      const directModel = modelList.get(sceneState.modelId)
      const fallbackModel = directModel ?? Array.from(modelList.values())[0]
      return fallbackModel as {
        setOpacity?: (localIds: number[] | undefined, opacity: number) => Promise<void> | void
        resetOpacity?: (localIds: number[] | undefined) => Promise<void> | void
      } | undefined
    }

    // 투명도 적용 순서를 보장하기 위해 Promise를 반환한다. (void 사용 시 race condition 발생)
    const excludeMovedIfcIds = (ids: Set<number>) => (
      new Set(Array.from(ids).filter((id) => !movedIfcHideIdSet.has(id)))
    )

    const applyOpacityByIds = (ids: Set<number>, opacity: number): Promise<void> => {
      const targetIds = excludeMovedIfcIds(ids)
      if (targetIds.size === 0) return Promise.resolve()
      const clampedOpacity = Math.min(Math.max(opacity, 0), 1)
      const idList = Array.from(targetIds)
      const model = resolveFragmentsModel()
      if (model?.setOpacity) {
        return Promise.resolve(model.setOpacity(idList, clampedOpacity)).catch(() => undefined)
      }
      return sceneState.fragments.highlight({
        // 원본 재질/색상은 유지하고 투명도만 겹쳐 적용한다.
        color: new sceneState.three.Color('#FFFFFF'),
        opacity: clampedOpacity,
        transparent: clampedOpacity < 1,
        renderedFaces: 1,
        preserveOriginalMaterial: true,
        depthWrite: clampedOpacity >= 1,
      }, {
        [sceneState.modelId]: targetIds,
      }).catch(() => undefined)
    }

    const resetOpacityByIds = (ids: Set<number>): Promise<void> => {
      const targetIds = excludeMovedIfcIds(ids)
      if (targetIds.size === 0) return Promise.resolve()
      const idList = Array.from(targetIds)
      const model = resolveFragmentsModel()
      if (model?.resetOpacity) {
        return Promise.resolve(model.resetOpacity(idList)).catch(() => undefined)
      }
      return sceneState.fragments.resetHighlight({
        [sceneState.modelId]: targetIds,
      }).catch(() => undefined)
    }

    // 비동기 작업을 순차적으로 실행해 투명도가 의도된 순서대로 적용되도록 한다.
    let cancelled = false
    void (async () => {
      if (activeStoreyExpressId == null) {
        // 전체 표시
        const visibleAllIds = new Set<number>()
        allIds.forEach((id) => {
          if (!forcedHiddenIdsInModel.has(id)) visibleAllIds.add(id)
        })
        await sceneState.hider.set(false, { [sceneState.modelId]: forcedHiddenIdsInModel })
        traceIfcMove('storey_visibility_hider_set_start', {
          scope: 'all',
          visibleCount: visibleAllIds.size,
          forcedHiddenCount: forcedHiddenIdsInModel.size,
        })
        await sceneState.hider.set(true, { [sceneState.modelId]: visibleAllIds })
        traceIfcMove('storey_visibility_hider_set_done', {
          scope: 'all',
          visibleCount: visibleAllIds.size,
        })
        // 이전 highlight 누적을 초기화해 투명도 재적용이 누락되지 않도록 한다.
        await resetOpacityByIds(allIds)
        if (cancelled) return
        // 활성 층이 없어도 overlay 지정된 층은 투명도를 반영한다.
        if (overlayIdsNormalized.length === 0) {
          await rehideMovedIfcProxyRegistry(sceneState, 'storey_visibility_all', { forceRender: false })
          return
        }
        for (const storeyId of overlayIdsNormalized) {
          if (cancelled) return
          const ids = storeyMap.get(storeyId)
          if (!ids || ids.size === 0) continue
          const rawTransparency = overlayIfcStoreyOpacityByExpressId?.[storeyId] ?? 0.35
          const clampedTransparency = Math.min(Math.max(rawTransparency, 0), 1)
          const effectiveOpacity = 1 - clampedTransparency
          await applyOpacityByIds(ids, effectiveOpacity)
        }
        await rehideMovedIfcProxyRegistry(sceneState, 'storey_visibility_all_overlay', { forceRender: false })
        return
      }

      // 활성 층 요소 수집
      const activeIds = new Set<number>()
      storeyMap.get(activeStoreyExpressId)?.forEach((id) => activeIds.add(id))
      const visibleIds = new Set<number>(activeIds)

      // 겹쳐보기 층 요소 추가
      overlayIdsNormalized.forEach((storeyId) => {
        storeyMap.get(storeyId)?.forEach((id) => visibleIds.add(id))
      })
      forcedHiddenIdsInModel.forEach((id) => visibleIds.delete(id))

      const hiddenIds = new Set<number>(forcedHiddenIdsInModel)
      allIds.forEach((id) => { if (!visibleIds.has(id)) hiddenIds.add(id) })

      traceIfcMove('storey_visibility_hider_set_start', {
        scope: 'partial_hidden',
        hiddenCount: hiddenIds.size,
        forcedHiddenCount: forcedHiddenIdsInModel.size,
      })
      await sceneState.hider.set(false, { [sceneState.modelId]: hiddenIds })
      traceIfcMove('storey_visibility_hider_set_done', {
        scope: 'partial_hidden',
        hiddenCount: hiddenIds.size,
      })
      if (cancelled) return
      traceIfcMove('storey_visibility_hider_set_start', {
        scope: 'partial_visible',
        visibleCount: visibleIds.size,
      })
      await sceneState.hider.set(true, { [sceneState.modelId]: visibleIds })
      traceIfcMove('storey_visibility_hider_set_done', {
        scope: 'partial_visible',
        visibleCount: visibleIds.size,
      })
      if (cancelled) return

      // 기존 투명도 오버레이를 초기화한 뒤, 현재 상태를 재적용한다.
      await resetOpacityByIds(allIds)
      if (cancelled) return

      // 겹쳐보기 층은 "투명도" 기준으로 적용한다.
      // 예) UI 100% 투명도 => 실제 opacity 0 (완전 투명)
      if (overlayIdsNormalized.length === 0) {
        await rehideMovedIfcProxyRegistry(sceneState, 'storey_visibility_partial', { forceRender: false })
        return
      }
      for (const storeyId of overlayIdsNormalized) {
        if (cancelled) return
        if (storeyId === activeStoreyExpressId) continue
        const ids = storeyMap.get(storeyId)
        if (!ids || ids.size === 0) continue
        const rawTransparency = overlayIfcStoreyOpacityByExpressId?.[storeyId] ?? 0.35
        const clampedTransparency = Math.min(Math.max(rawTransparency, 0), 1)
        const effectiveOpacity = 1 - clampedTransparency
        await applyOpacityByIds(ids, effectiveOpacity)
      }
      await rehideMovedIfcProxyRegistry(sceneState, 'storey_visibility_partial_overlay', { forceRender: false })
    })()

    return () => {
      cancelled = true
    }
  }, [
    activeStoreyExpressId,
    applyLibraryVisibilityByStorey,
    ifcElementChanges,
    isRuntimeTransformLocked,
    libraryElements,
    logIfcMove,
    getMovedIfcProxyHideLocalIds,
    overlayIfcStoreyExpressIds,
    overlayIfcStoreyOpacityByExpressId,
    rehideMovedIfcProxyRegistry,
    syncTransformSelectionState,
  ])

  useEffect(() => {
    if (ifcElementSelectionRequestToken <= 0) return
    if (requestedIfcElementLocalId == null) return
    if (deletedIfcLocalIdSetRef.current.has(requestedIfcElementLocalId)) return
    const sceneState = sceneRef.current
    if (!sceneState) return
    let isCancelled = false

        const selectRequestedIfcElement = async () => {
          try {
            const runtimeState = transformRuntimeStateRef.current
            if (isRuntimeTransformLocked()) {
              logIfcMove('requested_select_ifc_deferred_transform_active', {
                requestedIfcElementLocalId,
                phase: runtimeState.phase,
              })
              return
            }
            const currentTarget = selectedTargetRef.current
            if (currentTarget?.source === 'ifc' && currentTarget.hitLocalId === requestedIfcElementLocalId) return

            if (currentTarget) {
              const preserveMovedIfcProxy = currentTarget.source === 'ifc'
                && (
                  Boolean(currentTarget.keepModelHiddenAfterCommit)
                  || isMovedIfcProxyObject(currentTarget.object)
                )
              await clearSelectedTarget(
                sceneState,
                currentTarget,
                currentTarget.source === 'ifc' && !preserveMovedIfcProxy,
                currentTarget.source === 'ifc' ? !preserveMovedIfcProxy : true,
                currentTarget.source === 'ifc' && preserveMovedIfcProxy,
              )
              purgeIfcEditOverlays(sceneState, 'requested_select_clear_previous')
              if (isCancelled) return
              selectedTargetRef.current = null
              syncTransformSelectionState(null, 'requested_select_clear_previous')
              await rehideMovedIfcProxyRegistry(sceneState, 'requested_select_clear_previous', { forceRender: false })
            }

        const fetchedElement = await getIfcElementFromFragments(
          sceneState.fragments,
          { modelId: sceneState.modelId, localId: requestedIfcElementLocalId },
          ifcPsetMetricsRef.current,
        )
        if (isCancelled) return

        const selectedLocalId = requestedIfcElementLocalId
        const selectedExpressId = typeof fetchedElement?.expressId === 'number'
          ? fetchedElement.expressId
          : requestedIfcElementLocalId
        const selectedElement = fetchedElement ?? {
          id: `${sceneState.modelId}:${requestedIfcElementLocalId}`,
          name: `요소 ${requestedIfcElementLocalId}`,
          ifcClass: 'IfcElement',
          category: 'Element',
          source: 'ifc' as const,
          expressId: selectedExpressId,
          properties: {},
        }

        const proxyLocalIds = resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
          hitLocalId: requestedIfcElementLocalId,
          localId: selectedLocalId,
          expressId: selectedExpressId,
        })
        registerCanonicalIds(selectedExpressId, proxyLocalIds)
        const editability = await resolveEditableIfcTargets(sceneState, sceneState.modelId, proxyLocalIds)
        if (!editability || !editability.modelId || editability.editableLocalIds.length === 0) {
          selectedTargetRef.current = {
            source: 'ifc',
            modelId: sceneState.modelId,
            localId: selectedLocalId,
            hitLocalId: requestedIfcElementLocalId,
            object: undefined,
            selectedSignature: getElementDimensionSignature(selectedElement),
            selectedColorSignature: getElementColorSignature(selectedElement),
            selectedMaterialSignature: getElementMaterialSignature(selectedElement),
          }
          syncTransformSelectionState(selectedTargetRef.current, 'requested_select_non_editable', { attachGizmo: false })
          sceneState.transformControls.detach()
          sceneState.transformControls.visible = false
          sceneState.transformControls.enabled = false
          showIfcEditFeedback('error', '선택한 IFC 요소는 현재 이동 편집을 지원하지 않습니다.')
          onIfcElementSelectRef.current?.(selectedElement)
          onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(sceneState.camera.position))
          return
        }
        const existingMovedProxyRecord = findMovedIfcProxyRecord(sceneState, editability.modelId, editability.editableLocalIds)
        const editableObject = existingMovedProxyRecord?.object ?? await attachIfcTransformProxy(
          sceneState.three,
          sceneState.fragments,
          sceneState.hider,
          sceneState.transformControls,
          sceneState.ifcEditGroup,
          editability.modelId,
          editability.editableLocalIds,
          requestedIfcElementLocalId,
          undefined,
          selectedElement,
        )
        if (isCancelled) return

        const resolvedHitLocalId = (editableObject as IfcEditableObject3D | undefined)?.userData?.ifcEditTarget?.hitLocalId
        const nextTarget: Extract<Selected3DTarget, { source: 'ifc' }> = {
          source: 'ifc',
          modelId: editability.modelId,
          localId: selectedLocalId,
          hitLocalId: Number.isFinite(resolvedHitLocalId) ? (resolvedHitLocalId as number) : requestedIfcElementLocalId,
          object: editableObject ?? undefined,
          selectedSignature: getElementDimensionSignature(selectedElement),
          selectedColorSignature: getElementColorSignature(selectedElement),
          selectedMaterialSignature: getElementMaterialSignature(selectedElement),
        }
        if (editableObject) {
          if (existingMovedProxyRecord) {
            sceneState.transformControls.attach(editableObject)
            sceneState.transformControls.visible = true
            sceneState.transformControls.enabled = true
          }
          await applyIfcSelectionVisibility(sceneState, {
            modelId: editability.modelId,
            localIds: editability.editableLocalIds.length > 0
              ? editability.editableLocalIds
              : [requestedIfcElementLocalId].filter(Number.isFinite),
            proxyObject: editableObject,
            mode: 'proxy',
            proxyOpacity: 1,
            reason: 'requested_select_proxy',
            forceRender: false,
          })
          await reapplyPendingUnpersistedIfcColors(
            sceneState,
            'requested_select_proxy',
            normalizeRootModelId(editability.modelId, sceneState.modelId),
          )
          await rehideMovedIfcProxyRegistry(sceneState, 'requested_select_proxy', { forceRender: false })
          sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
        }
        selectedTargetRef.current = nextTarget
        syncTransformSelectionState(nextTarget, 'requested_select_ifc_success', { attachGizmo: Boolean(editableObject) })
        onIfcElementSelectRef.current?.(selectedElement)
        if (editableObject) {
          onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(editableObject.position))
          return
        }
        onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(sceneState.camera.position))
      } catch (error) {
        console.warn('[editor] 계층구조 IFC 요소 선택 적용 실패', {
          requestedIfcElementLocalId,
          error,
        })
      }
    }

    void selectRequestedIfcElement()
    return () => {
      isCancelled = true
    }
  }, [
    ifcElementSelectionRequestToken,
    findMovedIfcProxyRecord,
    isMovedIfcProxyObject,
    purgeIfcEditOverlays,
    reapplyPendingUnpersistedIfcColors,
    rehideMovedIfcProxyRegistry,
    registerCanonicalIds,
    logIfcMove,
    isRuntimeTransformLocked,
    requestedIfcElementLocalId,
    resolveEditableIfcTargets,
    showIfcEditFeedback,
    syncTransformSelectionState,
    transformRuntimeStateRef,
  ])

  useEffect(() => {
    if (libraryElementSelectionRequestToken <= 0) return
    if (!requestedLibraryElementId) return
    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) return
    let isCancelled = false

    const selectRequestedLibraryElement = async () => {
      try {
        const runtimeState = transformRuntimeStateRef.current
        if (isRuntimeTransformLocked()) {
          logIfcMove('requested_select_library_deferred_transform_active', {
            requestedLibraryElementId,
            phase: runtimeState.phase,
          })
          return
        }
        const currentTarget = selectedTargetRef.current
        if (currentTarget?.source === 'library') {
          const selectedPreset = getLibraryPresetFromObject(currentTarget.object as LibraryObject3D)
          if (selectedPreset?.id === requestedLibraryElementId) return
        }

        if (currentTarget) {
          const preserveMovedIfcProxy = currentTarget.source === 'ifc'
            && (
              Boolean(currentTarget.keepModelHiddenAfterCommit)
              || isMovedIfcProxyObject(currentTarget.object)
            )
          await clearSelectedTarget(
            sceneState,
            currentTarget,
            currentTarget.source === 'ifc' && !preserveMovedIfcProxy,
            currentTarget.source === 'ifc' ? !preserveMovedIfcProxy : true,
            currentTarget.source === 'ifc' && preserveMovedIfcProxy,
          )
          purgeIfcEditOverlays(sceneState, 'requested_library_select_clear_previous')
          if (isCancelled) return
          selectedTargetRef.current = null
          syncTransformSelectionState(null, 'requested_library_select_clear_previous')
          await rehideMovedIfcProxyRegistry(sceneState, 'requested_library_select_clear_previous', { forceRender: false })
        }

        const libraryRoot = presetGroup.children.find((child) => {
          const preset = getLibraryPresetFromObject(child as LibraryObject3D)
          return preset?.id === requestedLibraryElementId
        }) as LibraryObject3D | undefined
        if (!libraryRoot) return

        const libraryElement = getLibraryElementInfo(libraryRoot) ?? normalizeIfcElement(libraryRoot, 'library-preset')
        const nextTarget: Extract<Selected3DTarget, { source: 'library' }> = {
          source: 'library',
          object: libraryRoot,
          selectedSignature: getElementDimensionSignature(libraryElement),
          selectedColorSignature: getElementColorSignature(libraryElement),
          selectedMaterialSignature: getElementMaterialSignature(libraryElement),
        }
        selectedTargetRef.current = nextTarget
        syncTransformSelectionState(nextTarget, 'requested_select_library_success', { attachGizmo: true })
        sceneState.transformControls.attach(libraryRoot)
        sceneState.transformControls.visible = true
        sceneState.transformControls.enabled = true
        onIfcElementSelectRef.current?.(libraryElement)
        onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(libraryRoot.position))
      } catch (error) {
        console.warn('[editor] 계층구조 라이브러리 요소 선택 적용 실패', {
          requestedLibraryElementId,
          error,
        })
      }
    }

    void selectRequestedLibraryElement()
    return () => {
      isCancelled = true
    }
  }, [
    libraryElementSelectionRequestToken,
    logIfcMove,
    isRuntimeTransformLocked,
    isMovedIfcProxyObject,
    purgeIfcEditOverlays,
    rehideMovedIfcProxyRegistry,
    requestedLibraryElementId,
    syncTransformSelectionState,
    transformRuntimeStateRef,
  ])

  useEffect(() => {
    if (deleteRequestToken <= 0) return
    void deleteSelectedTarget()
  }, [deleteRequestToken, deleteSelectedTarget])

  useEffect(() => {
    const nextDeletedLocalIds = new Set<number>()
    ifcElementChanges.forEach((change) => {
      if (!change.deleted) return
      if (Number.isFinite(change.localId)) nextDeletedLocalIds.add(change.localId as number)
      ;(change.localIds ?? []).forEach((id) => {
        if (Number.isFinite(id)) nextDeletedLocalIds.add(id)
      })
      if (
        !Number.isFinite(change.localId) &&
        (!change.localIds || change.localIds.length === 0) &&
        Number.isFinite(change.expressId)
      ) {
        // legacy fallback: localId 정보가 없는 오래된 change만 expressId를 사용한다.
        nextDeletedLocalIds.add(change.expressId)
      }
    })
    deletedIfcLocalIdSetRef.current = nextDeletedLocalIds
  }, [ifcElementChanges])

  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return

    ifcElementChanges.forEach((change) => {
      if (!Number.isFinite(change.expressId)) return
      const localIds = (
        (change.localIds ?? []).filter(Number.isFinite) as number[]
      )
      if (Number.isFinite(change.localId)) localIds.push(change.localId as number)
      if (
        localIds.length === 0 &&
        Number.isFinite(change.expressId)
      ) {
        // legacy fallback: localId 정보가 없는 오래된 change만 expressId를 사용한다.
        localIds.push(change.expressId)
      }
      if (change.deleted) {
        void applyIfcSelectionVisibility(sceneState, {
          modelId: sceneState.modelId,
          localIds: Array.from(new Set(localIds)),
          mode: 'proxy',
          reason: 'apply_ifc_change_deleted',
        })
        return
      }

      const displayColor = change.color ?? (change.material ? getMaterialDefaultColor(change.material) : undefined)
      if (displayColor) {
        const localId = localIds[0]
        if (!Number.isFinite(localId)) return
        void applyIfcItemColor(sceneState.three, sceneState.fragments, {
          source: 'ifc',
          modelId: sceneState.modelId,
          localId,
          hitLocalId: localId,
        }, displayColor).catch(() => undefined)
      }
    })
  }, [ifcElementChanges])

  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    const padding = 1.55 / Math.max(zoomScale, 0.1)
    fitObjectWithPadding(sceneState.three, sceneState.camera, sceneState.cameraControls, sceneState.ifcObject, padding)
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [zoomScale])

  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    const target = selectedTargetRef.current
    if (!target) return
    const currentColorSignature = getElementColorSignature(selectedIfcElement)
    if (target.selectedColorSignature === currentColorSignature) return
    target.selectedColorSignature = currentColorSignature

    if (target.source === 'library') {
      applyObjectColor(sceneState.three, target.object, selectedIfcElement?.color)
      if (selectedIfcElement?.color) {
        updateLibraryPresetData(target.object, { color: selectedIfcElement.color })
        const preset = getLibraryPresetFromObject(target.object as LibraryObject3D)
        if (preset) onLibraryElementChangeRef.current?.(preset.id, { color: selectedIfcElement.color })
      }
      return
    }

    if (target.object) {
      applyObjectColor(sceneState.three, target.object, selectedIfcElement?.color)
      void applyIfcItemColor(sceneState.three, sceneState.fragments, target, selectedIfcElement?.color).catch(() => undefined)
      const editable = target.object as IfcEditableObject3D
      const editTarget = editable.userData.ifcEditTarget
      const element = editTarget?.element
      if (editTarget && element && selectedIfcElement?.color) {
        editable.userData.ifcEditTarget = {
          ...editTarget,
          element: {
            ...element,
            color: selectedIfcElement.color,
            properties: {
              ...element.properties,
              Color: selectedIfcElement.color,
            },
          },
        }
      }
      return
    }

    void applyIfcItemColor(sceneState.three, sceneState.fragments, target, selectedIfcElement?.color).catch(() => undefined)
  }, [selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement?.material) return
    const currentMaterialSignature = getElementMaterialSignature(selectedIfcElement)
    if (target.selectedMaterialSignature === currentMaterialSignature) return
    target.selectedMaterialSignature = currentMaterialSignature

    if (target.source === 'library') {
      applyObjectMaterial(sceneState.three, target.object ?? null, selectedIfcElement.material, selectedIfcElement.color)
      updateLibraryPresetData(target.object, {
        material: selectedIfcElement.material,
        color: selectedIfcElement.color,
      })
      const preset = getLibraryPresetFromObject(target.object as LibraryObject3D)
      if (preset) {
        onLibraryElementChangeRef.current?.(preset.id, {
          material: selectedIfcElement.material,
          color: selectedIfcElement.color,
        })
      }
      applyLibraryVisibilityByStorey()
      sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
      return
    }

    applyObjectMaterial(sceneState.three, target.object ?? null, selectedIfcElement.material, selectedIfcElement.color)
    if (target.source === 'ifc' && target.object) {
      const editable = target.object as IfcEditableObject3D
      const editTarget = editable.userData.ifcEditTarget
      const element = editTarget?.element
      if (editTarget && element) {
        editable.userData.ifcEditTarget = {
          ...editTarget,
          element: {
            ...element,
            material: selectedIfcElement.material,
            color: selectedIfcElement.color,
            properties: {
              ...element.properties,
              Material: selectedIfcElement.material,
              Color: selectedIfcElement.color ?? element.color ?? '-',
            },
          },
        }
      }
    }
  }, [applyLibraryVisibilityByStorey, selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement) return
    const currentSignature = getElementDimensionSignature(selectedIfcElement)
    if (target.selectedSignature === currentSignature) return
    target.selectedSignature = currentSignature

    const { three: THREE } = sceneState
    if (target.source === 'library') {
      const libraryObject = target.object as LibraryObject3D
      const fallbackSize = new THREE.Vector3()
      new THREE.Box3().setFromObject(target.object).getSize(fallbackSize)
      const baseWorldSize = libraryObject.userData?.libraryBaseWorldSize ?? {
        x: fallbackSize.x || 1,
        y: fallbackSize.y || 1,
        z: fallbackSize.z || 1,
      }
      const nextScaleX = selectedIfcElement.lengthMm
        ? (selectedIfcElement.lengthMm * sceneState.worldUnitsPerMm) / baseWorldSize.x
        : target.object.scale.x
      const nextScaleY = selectedIfcElement.heightMm
        ? (selectedIfcElement.heightMm * sceneState.worldUnitsPerMm) / baseWorldSize.y
        : target.object.scale.y
      const nextScaleZ = selectedIfcElement.thicknessMm
        ? (selectedIfcElement.thicknessMm * sceneState.worldUnitsPerMm) / baseWorldSize.z
        : target.object.scale.z
      target.object.scale.set(nextScaleX, nextScaleY, nextScaleZ)
      updateLibraryPresetData(target.object, {
        lengthMm: selectedIfcElement.lengthMm,
        heightMm: selectedIfcElement.heightMm,
        thicknessMm: selectedIfcElement.thicknessMm,
      })
      const preset = getLibraryPresetFromObject(libraryObject)
      if (preset) {
        onLibraryElementChangeRef.current?.(preset.id, {
          lengthMm: selectedIfcElement.lengthMm,
          heightMm: selectedIfcElement.heightMm,
          thicknessMm: selectedIfcElement.thicknessMm,
        })
      }
      return
    }

    if (target.source !== 'ifc' || !target.object) return

    // lengthMm/heightMm/thicknessMm 중 일부만 파싱된 경우,
    // 없는 축은 현재 오브젝트의 바운딩 박스 크기로 fallback한다.
    const editable = target.object as IfcEditableObject3D
    const currentWorldSize = new THREE.Vector3()
    new THREE.Box3().setFromObject(target.object).getSize(currentWorldSize)
    const storedBaseWorldSize = editable.userData.ifcEditBaseWorldSize
    const baseWorldSize = storedBaseWorldSize ?? {
      x: currentWorldSize.x / Math.max(Math.abs(target.object.scale.x), 1e-6) || currentWorldSize.x || 1,
      y: currentWorldSize.y / Math.max(Math.abs(target.object.scale.y), 1e-6) || currentWorldSize.y || 1,
      z: currentWorldSize.z / Math.max(Math.abs(target.object.scale.z), 1e-6) || currentWorldSize.z || 1,
    }
    editable.userData.ifcEditBaseWorldSize = baseWorldSize
    const nextScaleX = selectedIfcElement.lengthMm
      ? (selectedIfcElement.lengthMm * sceneState.worldUnitsPerMm) / baseWorldSize.x
      : target.object.scale.x
    const nextScaleY = selectedIfcElement.heightMm
      ? (selectedIfcElement.heightMm * sceneState.worldUnitsPerMm) / baseWorldSize.y
      : target.object.scale.y
    const nextScaleZ = selectedIfcElement.thicknessMm
      ? (selectedIfcElement.thicknessMm * sceneState.worldUnitsPerMm) / baseWorldSize.z
      : target.object.scale.z
    if (![nextScaleX, nextScaleY, nextScaleZ].every((value) => Number.isFinite(value) && value > 0)) return

    const ifcLocalIds = (editable.userData.ifcEditTarget?.localIds ?? []).filter(Number.isFinite)
    void applyIfcSelectionVisibility(sceneState, {
      modelId: target.modelId,
      localIds: ifcLocalIds.length > 0 ? ifcLocalIds : [target.hitLocalId],
      proxyObject: target.object,
      mode: 'proxy',
      proxyOpacity: 1,
      reason: 'dimension_edit_sync_proxy',
    })

    target.object.scale.set(nextScaleX, nextScaleY, nextScaleZ)
    target.object.updateMatrixWorld(true)

    const editTarget = editable.userData.ifcEditTarget
    const element = editTarget?.element
    if (editTarget && element) {
      editable.userData.ifcEditTarget = {
        ...editTarget,
        element: {
          ...element,
          lengthMm: selectedIfcElement.lengthMm,
          heightMm: selectedIfcElement.heightMm,
          thicknessMm: selectedIfcElement.thicknessMm,
          properties: {
            ...element.properties,
            Length: selectedIfcElement.lengthMm ?? '-',
            Height: selectedIfcElement.heightMm ?? '-',
            Thickness: selectedIfcElement.thicknessMm ?? '-',
          },
        },
      }
    }
  }, [selectedIfcElement?.lengthMm, selectedIfcElement?.heightMm, selectedIfcElement?.thicknessMm, selectedIfcElement])

  useEffect(() => {
    rotationLockedRef.current = isRotationLocked
    const sceneState = sceneRef.current
    if (!sceneState) return

    const controls = sceneState.cameraControls
    if (!controls) return
    controls.azimuthRotateSpeed = isRotationLocked ? 0 : 1
    controls.polarRotateSpeed = isRotationLocked ? 0 : 1
  }, [isRotationLocked])

  // TransformControls 모드(이동/회전/크기) 변경 반영
  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    resetTransformInteractionRef.current?.(`transform_mode_change:${transformMode}`)
    sceneState.transformControls.setMode(transformMode)
    const selectedTarget = selectedTargetRef.current
    const selectedObject = selectedTarget?.source === 'library'
      ? selectedTarget.object
      : selectedTarget?.source === 'ifc'
        ? selectedTarget.object
        : undefined
    if (selectedObject && (selectedObject as Object3D).parent) {
      sceneState.transformControls.attach(selectedObject as Object3D)
      sceneState.transformControls.visible = true
      sceneState.transformControls.enabled = true
      logIfcMove('transform_mode_rebind', {
        transformMode,
        source: selectedTarget?.source ?? null,
        hasSelectedObject: true,
      })
      return
    }
    sceneState.transformControls.detach()
    sceneState.transformControls.visible = false
    sceneState.transformControls.enabled = false
    logIfcMove('transform_mode_rebind', {
      transformMode,
      source: selectedTarget?.source ?? null,
      hasSelectedObject: false,
    })
  }, [logIfcMove, transformMode])

  useEffect(() => {
    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) return

    const { three: THREE } = sceneState
    logIfcMove('library_sync_start', {
      source: 'ifc',
      presetCount: libraryElements.length,
      existingScenePresetCount: presetGroup.children.length,
      presetIds: libraryElements.map((preset) => preset.id),
    })
    const selectedLibraryPreset =
      selectedTargetRef.current?.source === 'library'
        ? getLibraryPresetFromObject(selectedTargetRef.current.object as LibraryObject3D)
        : undefined
    presetGroup.children.forEach((child) => {
      disposeObjectMaterials(THREE, child)
    })
    presetGroup.clear()

    libraryElements.forEach((preset, index) => {
      const presetMesh = createPresetMesh(THREE, preset, index, sceneState.worldUnitsPerMm)
      presetGroup.add(presetMesh)
    })
    logIfcMove('library_sync_rebuild_done', {
      source: 'ifc',
      scenePresetCount: presetGroup.children.length,
      scenePresetIds: presetGroup.children.map((child) => (
        getLibraryPresetFromObject(child as LibraryObject3D)?.id ?? child.name ?? '(unknown)'
      )),
    })
    if (!presetGroup.userData.libraryPositioned) {
      positionPresetGroupBesideIfc(THREE, sceneState.ifcObject, presetGroup, sceneState.worldUnitsPerMm)
      presetGroup.userData.libraryPositioned = true
    }
    if (selectedLibraryPreset) {
      const nextRoot = presetGroup.children.find((child) => {
        const preset = getLibraryPresetFromObject(child as LibraryObject3D)
        return preset?.id === selectedLibraryPreset.id
      }) as LibraryObject3D | undefined
      if (nextRoot) {
        const libraryElement = getLibraryElementInfo(nextRoot)
        selectedTargetRef.current = {
          source: 'library',
          object: nextRoot,
          selectedSignature: getElementDimensionSignature(libraryElement),
          selectedColorSignature: getElementColorSignature(libraryElement),
          selectedMaterialSignature: getElementMaterialSignature(libraryElement),
        }
        syncTransformSelectionState(selectedTargetRef.current, 'library_sync_reselect', { attachGizmo: true })
        sceneState.transformControls.attach(nextRoot)
        sceneState.transformControls.visible = true
        sceneState.transformControls.enabled = true
      } else {
        selectedTargetRef.current = null
        syncTransformSelectionState(null, 'library_sync_reselect_miss')
      }
    }
    // 라이브러리 목록 재구성 직후 현재 층/겹쳐보기 규칙을 다시 반영한다.
    // (재구성 과정에서 child.visible 기본값이 true로 초기화되는 타이밍 이슈 보정)
    applyLibraryVisibilityByStorey()
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [applyLibraryVisibilityByStorey, libraryElements, logIfcMove, syncTransformSelectionState])

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#F0F2F9]">
      <div ref={containerRef} tabIndex={0} className="h-full w-full outline-none" />

      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-6 text-center backdrop-blur-sm">
          {status === 'loading' ? (
            <p className="text-[13px] font-black text-[#3B45B3]">IFC 모델을 불러오는 중입니다.</p>
          ) : (
            <div>
              <p className="text-[13px] font-black text-[#991B1B]">IFC 모델을 표시하지 못했습니다.</p>
              <p className="mt-2 text-[11px] font-medium text-[#6B7A99]">{errorMessage}</p>
            </div>
          )}
        </div>
      )}

      {ifcEditFeedback && (
        <div
          className={`pointer-events-none absolute bottom-5 left-5 z-50 rounded-lg border px-3 py-2 text-[12px] font-semibold shadow-lg backdrop-blur ${
            ifcEditFeedback.kind === 'error'
              ? 'border-[#FCA5A5] bg-[#FEF2F2]/95 text-[#991B1B]'
              : 'border-[#93C5FD] bg-[#EFF6FF]/95 text-[#1E3A8A]'
          }`}
        >
          {ifcEditFeedback.text}
        </div>
      )}
    </div>
  )
}
