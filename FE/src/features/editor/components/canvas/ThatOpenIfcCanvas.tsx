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
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Object3D } from 'three'
import type {
  CommentPin3DCreatePosition,
  FloorCommentPin,
  IfcElementChange,
  IfcElementInfo,
} from '../../types'
import { FLOOR_MM_PER_PX } from '../../constants'
import { patchIfcTextForMaterialDefaults } from '../../services/ifcChange.service'
import type { ThreeDLibraryDropRequest, ThreeDLibraryPreset } from './threeDLibrary.types'
import {
  PRESETS,
} from './threeDLibraryPresets'
import {
  applyIfcLibraryManifestToPresets,
  loadIfcLibraryManifest,
  toIfcLibraryAssetUrl,
  type IfcLibraryManifest,
} from './threeDLibraryManifest'
import { resolveThreeDPinMarkerHit, syncThreeDPinMarkers } from './threeDPinMarkers'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import {
  applyObjectColor,
  applyObjectMaterial,
  getMaterialDefaultColor,
  PROJECT_WORLD_UNITS_PER_MM,
  type ThreeModule,
} from './thatopen/ifcMaterials'
import {
  createIfcAssetPresetPlaceholder,
  createIfcAssetPresetMesh,
  createPresetMesh,
  cloneMaterialsForLibraryInstance,
  findLibraryRoot,
  formatLibraryPresetDimensions,
  getLibraryElementInfo,
  getLibraryPresetFromObject,
  getLibraryScaleDimensionPatch,
  refreshIfcAssetPresetMeshLayout,
  updateLibraryPresetData,
  type LibraryObject3D,
} from './thatopen/ifcLibraryMesh'
import { resolveLibraryDropPositionPatch } from './threeDLibraryDrop.utils'
import { toNormalizedMouse } from './threeDPointerSelection.utils'
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
  getTransformAxisVisibility,
  getIfcMoveTargetKey,
  hasIdentityMatrixDelta,
  nextIfcMoveLifecycleState,
  getRuntimeIfcModelId,
  fetchIfcText,
  fitObjectWithPadding,
  setCameraClipping,
  disposeObjectMaterials,
  clearSelectedTarget,
  ensureLibraryPresetOutsideIfc,
  positionPresetGroupBesideIfc,
  inferWorldUnitsPerMm,
  getObjectSizeMm,
  toDisplayCoordinates,
  applyInitialIfcMaterialStyles,
  applyIfcItemColor,
  attachIfcTransformProxy,
  createEmptyIfcCanonicalIdMap,
  findIfcEditableRoot,
  resolveEditorMaterialFromColor,
  resolveIfcCanonicalLocalIds,
  toIfcRotationAxisAngle,
} from './thatopen/ifcSceneHelpers'
import { runIfcMoveWorkflowRegressionCases } from './thatopen/ifcMoveWorkflow.regression'
import { useTransformRuntimeMachine } from './thatopen/useTransformRuntimeMachine'
import {
  isPendingCommitSession,
  isStalePendingCommitSession,
  isTransformOwnerMismatch,
  isTransformSessionLocked,
} from './thatopen/transformSessionGuards'
import {
  detachAndHideObjectTree,
  getLibraryAssetCacheKey,
  hasRenderableObject,
  isObjectInSceneGraph,
  setIfcAssetPlaceholderPending,
  shouldUseIfcAssetForPreset,
  toLibraryAssetModelId,
  translateIfcLibraryAssetPlacements,
} from './thatopen/ifcLibraryAssetHelpers'

/** ThatOpenIfcCanvas 컴포넌트 props */
interface ThatOpenIfcCanvasProps {
  /** 로드할 IFC 파일 URL (presigned URL 또는 mock 경로) */
  ifcUrl: string
  /** 현재 프로젝트 ID. 씬 내 모델 ID 생성에 사용된다. */
  projectId?: string | null
  /** 씬에 배치된 라이브러리 프리셋 목록 */
  libraryElements: ThreeDLibraryPreset[]
  /** 3D 코멘트 핀 목록. 현재 IFC 편집 안정화를 위해 prop 계약만 유지한다. */
  commentPins?: FloorCommentPin[]
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  currentUserId?: string | null
  onPinClick?: (id: string) => void
  onPinCreate?: (x: number, y: number, content?: string, threeDPosition?: CommentPin3DCreatePosition) => void
  onPinDelete?: (id: string) => void
  deletingPinId?: string | null
  /** IFC 요소 변경 이력 (색상·재질·삭제 등) */
  ifcElementChanges: IfcElementChange[]
  /** 증가할 때마다 현재 선택 요소를 삭제하는 트리거 토큰 */
  deleteRequestToken?: number
  /** 카메라 회전 잠금 여부 */
  isRotationLocked: boolean
  isGridVisible?: boolean
  /** 현재 줌 스케일 (1.0 = 100%) */
  zoomScale: number
  /** 현재 선택된 IFC 요소 */
  selectedIfcElement?: IfcElementInfo | null
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onIfcElementDelete?: (element: IfcElementInfo) => void
  onSelectWallForChat?: (wallId: string) => void
  onIfcElementTransformCommit?: (
    element: IfcElementInfo,
    patch: Omit<IfcElementChange, 'expressId'>,
  ) => void
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
  /** 상위 3D 툴 상태. IFC 캔버스는 transformMode를 기준으로 동작한다. */
  selectedTool?: string
  libraryDropRequest?: ThreeDLibraryDropRequest | null
  onResolveLibraryDrop?: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  transformSnapEnabled?: boolean
  transformSnapIntervalMm?: number
  isEditingLocked?: boolean
}

type PreservedCameraState = {
  projectId: string | null
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number } | null
  up: { x: number; y: number; z: number }
  zoom?: number
}

const isFiniteVectorRecord = (value: { x: number; y: number; z: number } | null | undefined) =>
  Boolean(value)
  && Number.isFinite(value?.x)
  && Number.isFinite(value?.y)
  && Number.isFinite(value?.z)

const captureCameraState = (
  sceneState: ThatOpenSceneState,
  projectId: string | null | undefined,
): PreservedCameraState | null => {
  const camera = sceneState.camera
  const controls = sceneState.cameraControls as typeof sceneState.cameraControls & {
    target?: { x: number; y: number; z: number }
    getTarget?: (target: import('three').Vector3) => import('three').Vector3
  }
  let target: PreservedCameraState['target'] = null
  try {
    if (controls?.getTarget) {
      const targetVector = new sceneState.three.Vector3()
      controls.getTarget(targetVector)
      target = { x: targetVector.x, y: targetVector.y, z: targetVector.z }
    } else if (controls?.target) {
      target = {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      }
    }
  } catch {
    target = null
  }

  const state: PreservedCameraState = {
    projectId: projectId ?? null,
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    target,
    up: {
      x: camera.up.x,
      y: camera.up.y,
      z: camera.up.z,
    },
    zoom: 'zoom' in camera && typeof camera.zoom === 'number' ? camera.zoom : undefined,
  }
  if (!isFiniteVectorRecord(state.position) || !isFiniteVectorRecord(state.up)) return null
  if (state.target !== null && !isFiniteVectorRecord(state.target)) state.target = null
  return state
}

const restoreCameraState = async (
  sceneState: ThatOpenSceneState,
  state: PreservedCameraState,
) => {
  const camera = sceneState.camera
  camera.position.set(state.position.x, state.position.y, state.position.z)
  camera.up.set(state.up.x, state.up.y, state.up.z)
  if (state.zoom !== undefined && 'zoom' in camera) {
    camera.zoom = state.zoom
  }

  const controls = sceneState.cameraControls as typeof sceneState.cameraControls & {
    target?: import('three').Vector3
    update?: () => void
  }
  if (state.target && controls?.setLookAt) {
    await controls.setLookAt(
      state.position.x,
      state.position.y,
      state.position.z,
      state.target.x,
      state.target.y,
      state.target.z,
      false,
    )
  } else if (state.target) {
    camera.lookAt(state.target.x, state.target.y, state.target.z)
    controls?.target?.set(state.target.x, state.target.y, state.target.z)
    controls?.update?.()
  }
  camera.updateProjectionMatrix?.()
}

const syncTransformControlAxisVisibility = (
  transformControls: object,
  target: Selected3DTarget | null | undefined,
  transformMode: string,
) => {
  const controls = transformControls as {
    showX?: boolean
    showY?: boolean
    showZ?: boolean
    setSpace?: (space: 'world' | 'local') => void
  }
  const visibility = getTransformAxisVisibility(target?.source, transformMode)
  controls.showX = visibility.showX
  controls.showY = visibility.showY
  controls.showZ = visibility.showZ
  if (target?.source === 'ifc' && (transformMode === 'translate' || transformMode === 'rotate')) {
    controls.setSpace?.('world')
  }
}

const isIfcSpaceElementInfo = (
  element: IfcElementInfo | null | undefined,
): element is IfcElementInfo => {
  if (!element) return false
  return element.ifcClass.toLowerCase() === 'ifcspace' ||
    element.category.toLowerCase() === 'space'
}

interface LoadedFragmentModel {
  object: Object3D
  useCamera: (camera: unknown) => void
}

type LoadedLibraryFragmentModel = LoadedFragmentModel & {
  getItemsIdsWithGeometry?: () => Promise<number[]>
  getLocalIds?: () => Promise<number[]>
}

type FragmentModelWithRaycast = LoadedFragmentModel & {
  modelId: string
  raycast?: (data: {
    camera: import('three').PerspectiveCamera | import('three').OrthographicCamera
    mouse: import('three').Vector2
    dom: HTMLCanvasElement
    snappingClasses?: unknown[]
  }) => Promise<IfcRaycastPick | null>
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

type DeferredIfcProxyCleanupRecord = {
  token: number
  target: Extract<Selected3DTarget, { source: 'ifc' }>
  object: IfcEditableObject3D
  modelId: string
  localIds: number[]
  restoreModelVisibility: boolean
  reason: string
  scheduledAt: number
}

type DeferredHierarchySelectionRequest =
  | { kind: 'ifc'; token: number; localId: number }
  | { kind: 'library'; token: number; id: string }

type ComponentsModule = typeof import('@thatopen/components')
type TransformControlsModule = typeof import('three/examples/jsm/controls/TransformControls.js')
type DisposableThreeResource = { dispose?: () => void }
type IfcRaycastPick = {
  fragments?: { modelId: string }
  localId?: number
  itemId?: number
  object?: Object3D
  point?: import('three').Vector3
  distance?: number
} | null

const IFC_MOVE_DEBUG = import.meta.env.VITE_3D_MOVE_DEBUG === 'true'
const IFC_MOVE_ALWAYS_TRACE_EVENTS = new Set<string>([
  'pick_blocked_by_transform_helper_hit',
  'drag_start',
  'transform_dragging_force_release_on_pointerup',
  'drag_end',
  'drag_end_schedule_commit',
  'commit_start',
  'commit_apply_changes_done',
  'commit_success',
  'transform_mode_rebind',
])

const IFC_AUTO_SAVE_ON_MOVE = false
const IFC_SAVE_DEBOUNCE_MS = 1200
const IFC_SAVE_MAX_POSTPONE_MS = 6000
const IFC_COMMIT_QUEUE_DELAY_MS = 0
const IFC_COMMIT_QUIET_WINDOW_MS = 0
const IFC_COMMIT_INFLIGHT_RETRY_MS = 250
const IFC_COMMIT_INFLIGHT_STALE_RECOVERY_MS = 1500
const IFC_COMMIT_INFLIGHT_TIMEOUT_MS = 35_000
const SPACE_TRANSFORM_DEDUP_LIMIT = 128
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
const traceIfcMove = (_event: string, _payload?: Record<string, unknown>) => {}
const IFC_MOVE_BUILD_MARKER = 'ifc-move-debug-build-2026-05-11-09'
const rememberBoundedSetValue = (set: Set<string>, value: string, limit: number) => {
  set.add(value)
  if (set.size <= limit) return
  const oldest = set.keys().next().value
  if (oldest !== undefined) set.delete(oldest)
}
const TRANSFORM_GIZMO_AXIS_NAMES = new Set([
  'X', 'Y', 'Z', 'E',
  'XY', 'YZ', 'XZ',
  'XYZ', 'XYZE',
])

const disposeMaybeThreeResource = (resource: unknown) => {
  if (Array.isArray(resource)) {
    resource.forEach(disposeMaybeThreeResource)
    return
  }
  ;(resource as DisposableThreeResource | undefined)?.dispose?.()
}

const removeDuplicateSceneGridHelpers = (scene: Object3D) => {
  const gridHelpers: Object3D[] = []
  scene.traverse((child) => {
    if (child.type === 'GridHelper') gridHelpers.push(child)
  })
  if (gridHelpers.length <= 1) return

  gridHelpers.slice(0, -1).forEach((gridHelper) => {
    gridHelper.parent?.remove(gridHelper)
    const disposableGrid = gridHelper as Object3D & {
      geometry?: DisposableThreeResource
      material?: DisposableThreeResource | DisposableThreeResource[]
    }
    disposableGrid.geometry?.dispose?.()
    disposeMaybeThreeResource(disposableGrid.material)
  })
}

const getElementTransformSignature = (element?: IfcElementInfo | null) => {
  if (!element) return ''
  return [
    element.positionX,
    element.positionY,
    element.positionZ,
    element.rotationX,
    element.rotationY,
    element.rotationZ,
  ].map((value) => (
    Number.isFinite(value) ? Number((value as number).toFixed(6)) : 'null'
  )).join('|')
}

const getElementShapeSignature = (element?: IfcElementInfo | null) => (
  [element?.id ?? '', element?.roofShape ?? ''].join(':')
)

const updateTransformControlsIfSupported = (transformControls: unknown) => {
  const controls = transformControls as {
    update?: () => void
    updateMatrixWorld?: (force?: boolean) => void
  } | null
  if (typeof controls?.update === 'function') {
    controls.update()
    return
  }
  if (typeof controls?.updateMatrixWorld === 'function') {
    controls.updateMatrixWorld(true)
  }
}

export default function ThatOpenIfcCanvas({
  ifcUrl,
  projectId,
  libraryElements,
  commentPins = [],
  isCollaborationMode = false,
  selectedPinId = null,
  currentUserId = null,
  onPinClick,
  onPinCreate,
  onPinDelete,
  deletingPinId = null,
  ifcElementChanges,
  deleteRequestToken = 0,
  isRotationLocked,
  isGridVisible = false,
  zoomScale,
  selectedIfcElement,
  onIfcElementSelect,
  onIfcElementDelete,
  onSelectWallForChat,
  onIfcElementTransformCommit,
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
  libraryDropRequest,
  onResolveLibraryDrop,
  cameraViewPresetCommand,
  isEditingLocked = false,
}: ThatOpenIfcCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ifcLibraryManifest, setIfcLibraryManifest] = useState<IfcLibraryManifest | null>(null)
  const sceneRef = useRef<ThatOpenSceneState | null>(null)
  const presetGroupRef = useRef<import('three').Group | null>(null)
  const libraryAssetBytesCacheRef = useRef<Map<string, Promise<Uint8Array | null>>>(new Map())
  const libraryAssetObjectCacheRef = useRef<Map<string, Promise<Object3D | null>>>(new Map())
  const libraryAssetSyncTokenRef = useRef(0)
  const libraryAssetSyncQueueRef = useRef<Promise<void>>(Promise.resolve())
  const libraryAssetModelIdsRef = useRef<Set<string>>(new Set())
  const pinMarkerGroupRef = useRef<import('three').Group | null>(null)
  const floorGridRef = useRef<Object3D | null>(null)
  const commentPinsRef = useRef(commentPins)
  const selectedPinIdRef = useRef(selectedPinId)
  const currentUserIdRef = useRef(currentUserId)
  const isCollaborationModeRef = useRef(isCollaborationMode)
  const deletingPinIdRef = useRef(deletingPinId)
  const isGridVisibleRef = useRef(isGridVisible)
  const transformModeRef = useRef(transformMode)
  const onPinClickRef = useRef(onPinClick)
  const onPinCreateRef = useRef(onPinCreate)
  const onPinDeleteRef = useRef(onPinDelete)
  const rotationLockedRef = useRef(isRotationLocked)
  const onIfcElementSelectRef = useRef(onIfcElementSelect)
  const onIfcElementDeleteRef = useRef(onIfcElementDelete)
  const onIfcElementTransformCommitRef = useRef(onIfcElementTransformCommit)
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
  const handledCameraPresetTokenRef = useRef(0)
  const preservedCameraStateRef = useRef<PreservedCameraState | null>(null)
  const handledLibraryDropTokenRef = useRef(0)
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
  const deferredIfcProxyCleanupRecordsRef = useRef<Map<number, DeferredIfcProxyCleanupRecord>>(new Map())
  const deferredIfcProxyCleanupTokenRef = useRef(0)
  const deletedIfcLocalIdSetRef = useRef<Set<number>>(new Set())
  const deferredHierarchySelectionRef = useRef<DeferredHierarchySelectionRequest | null>(null)
  const deferredHierarchySelectionTimerRef = useRef<number | null>(null)
  const handledIfcSelectionRequestTokenRef = useRef(0)
  const handledLibrarySelectionRequestTokenRef = useRef(0)
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
  // 첫 IFC 로드가 완료된 이후의 재로드(편집 결과로 새 revision이 들어오는 경우 등)에서는
  // 흰색 로딩 오버레이가 깜빡이지 않도록 추적한다.
  const [hasEverBeenReady, setHasEverBeenReady] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [ifcEditFeedback, setIfcEditFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [wallContextMenu, setWallContextMenu] = useState<{
    wallId: string
    label: string
    x: number
    y: number
  } | null>(null)

  const resolveSelectedWallForChat = useCallback(() => {
    const target = selectedTargetRef.current
    if (target?.source !== 'ifc') return null

    const proxyElement = target.object
      ? (target.object as IfcEditableObject3D).userData.ifcEditTarget?.element
      : undefined
    const metricElement = ifcPsetMetricsRef.current.byId[target.localId]
      ?? ifcPsetMetricsRef.current.byId[target.hitLocalId]
    const element = proxyElement ?? metricElement ?? selectedIfcElement ?? null
    const ifcClass = String(element?.ifcClass ?? '')
    if (!ifcClass.toLowerCase().includes('wall')) return null

    const wallId = element?.globalId ?? String(target.localId)
    const label = element?.name?.trim() || `IfcWall ${target.localId}`
    return { wallId, label }
  }, [selectedIfcElement])

  const handleIfcContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!onSelectWallForChat || isCollaborationModeRef.current) {
      setWallContextMenu(null)
      return
    }

    const x = event.clientX
    const y = event.clientY
    const openWhenSelectionReady = (attempt = 0) => {
      const wall = resolveSelectedWallForChat()
      if (!wall) {
        if (attempt < 4) {
          window.setTimeout(() => openWhenSelectionReady(attempt + 1), 80)
          return
        }
        setWallContextMenu(null)
        return
      }
      setWallContextMenu({ ...wall, x, y })
    }
    window.setTimeout(openWhenSelectionReady, 80)
  }, [onSelectWallForChat, resolveSelectedWallForChat])

  useEffect(() => {
    if (!wallContextMenu) return
    const close = () => setWallContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [wallContextMenu])
  const [hierarchySelectionRetryTick, setHierarchySelectionRetryTick] = useState(0)
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
  }, [isIfcMoveDebugEnabled])
  const cancelDeferredIfcProxyCleanupForObject = useCallback((
    object: IfcEditableObject3D,
    reason: string,
  ) => {
    const cancelled: DeferredIfcProxyCleanupRecord[] = []
    deferredIfcProxyCleanupRecordsRef.current.forEach((record, token) => {
      if (record.object !== object) return
      deferredIfcProxyCleanupRecordsRef.current.delete(token)
      cancelled.push(record)
    })
    cancelled.forEach((record) => {
      logIfcMove('pick_ifc_previous_proxy_cleanup_deferred_cancelled', {
        reason,
        token: record.token,
        modelId: record.modelId,
        localId: record.target.localId,
        hitLocalId: record.target.hitLocalId,
        localIds: record.localIds,
        restoreModelVisibility: record.restoreModelVisibility,
      })
    })
  }, [logIfcMove])
  const scheduleDeferredIfcProxyCleanup = useCallback((
    target: Extract<Selected3DTarget, { source: 'ifc' }>,
    localIds: number[],
    options: {
      reason: string
      restoreModelVisibility: boolean
      pickSequence?: number
      nextModelId?: string
      nextHitLocalId?: number
    },
  ) => {
    const object = target.object as IfcEditableObject3D | undefined
    if (!object) return
    const token = ++deferredIfcProxyCleanupTokenRef.current
    const record: DeferredIfcProxyCleanupRecord = {
      token,
      target,
      object,
      modelId: target.modelId,
      localIds: Array.from(new Set<number>(localIds.filter(Number.isFinite))),
      restoreModelVisibility: options.restoreModelVisibility,
      reason: options.reason,
      scheduledAt: performance.now(),
    }
    deferredIfcProxyCleanupRecordsRef.current.set(token, record)
    logIfcMove('pick_ifc_previous_restore_deferred', {
      reason: options.reason,
      token,
      pickSequence: options.pickSequence,
      previousModelId: target.modelId,
      previousLocalId: target.localId,
      previousHitLocalId: target.hitLocalId,
      deferredLocalIds: record.localIds,
      restoreModelVisibility: record.restoreModelVisibility,
      nextModelId: options.nextModelId ?? null,
      nextHitLocalId: options.nextHitLocalId ?? null,
    })

    const runCleanup = async () => {
      const currentRecord = deferredIfcProxyCleanupRecordsRef.current.get(token)
      if (!currentRecord) return
      const currentSelection = selectedTargetRef.current
      if (currentSelection?.source === 'ifc' && currentSelection.object === currentRecord.object) {
        deferredIfcProxyCleanupRecordsRef.current.delete(token)
        logIfcMove('pick_ifc_previous_proxy_cleanup_deferred_cancelled', {
          reason: `${options.reason}:reselected_before_cleanup`,
          token,
          modelId: currentRecord.modelId,
          localId: currentRecord.target.localId,
          hitLocalId: currentRecord.target.hitLocalId,
          localIds: currentRecord.localIds,
          restoreModelVisibility: currentRecord.restoreModelVisibility,
        })
        return
      }
      const activeScene = sceneRef.current
      if (!activeScene) {
        deferredIfcProxyCleanupRecordsRef.current.delete(token)
        logIfcMove('pick_ifc_previous_proxy_cleanup_deferred_cancelled', {
          reason: `${options.reason}:scene_missing`,
          token,
          modelId: currentRecord.modelId,
          localId: currentRecord.target.localId,
          hitLocalId: currentRecord.target.hitLocalId,
          localIds: currentRecord.localIds,
          restoreModelVisibility: currentRecord.restoreModelVisibility,
        })
        return
      }

      // 프록시를 visibility 복원보다 먼저 제거해 core render 시 원본+프록시가 동시에
      // 보이는 프레임(깜빡임)이 생기지 않도록 한다.
      currentRecord.object.parent?.remove(currentRecord.object)
      disposeObjectMaterials(activeScene.three, currentRecord.object)
      if (currentRecord.restoreModelVisibility && currentRecord.localIds.length > 0) {
        await applyIfcSelectionVisibility(activeScene, {
          modelId: currentRecord.modelId,
          localIds: currentRecord.localIds,
          proxyObject: currentRecord.object,
          mode: 'model',
          keepModelVisibleInProxy: true,
          reason: `${options.reason}_deferred_cleanup_restore`,
          forceRender: false,
          skipCoreUpdate: true,
        })
      }
      deferredIfcProxyCleanupRecordsRef.current.delete(token)
      activeScene.renderer.render(
        activeScene.scene,
        activeScene.camera as import('three').PerspectiveCamera,
      )
      logIfcMove('pick_ifc_previous_proxy_cleanup_deferred_done', {
        reason: options.reason,
        token,
        modelId: currentRecord.modelId,
        localId: currentRecord.target.localId,
        hitLocalId: currentRecord.target.hitLocalId,
        localIds: currentRecord.localIds,
        restoreModelVisibility: currentRecord.restoreModelVisibility,
        elapsedMs: Number((performance.now() - currentRecord.scheduledAt).toFixed(1)),
      })
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void runCleanup()
        })
      })
      return
    }
    globalThis.setTimeout(() => {
      void runCleanup()
    }, 32)
  }, [logIfcMove])
  const resetIfcLocalRevisionState = useCallback((reason: string) => {
    const movedProxyCount = movedIfcProxyRegistryRef.current.size
    const pendingColorRootCount = pendingUnpersistedIfcColorByRootRef.current.size
    const pendingSaveModelId = pendingIfcSaveModelIdRef.current
    const pendingSaveReason = pendingIfcSaveReasonRef.current
    const deferredSaveModelId = deferredSaveModelIdRef.current
    movedIfcProxyRegistryRef.current.clear()
    pendingUnpersistedIfcColorByRootRef.current.clear()
    pendingIfcSaveModelIdRef.current = null
    pendingIfcSaveReasonRef.current = null
    deferredSaveModelIdRef.current = null
    deferredSavePostponeCountRef.current = 0
    deferredSaveScheduledAtRef.current = 0
    ifcMoveDirtyRef.current = false
    ifcMoveLifecycleRef.current = {
      phase: 'idle',
      targetKey: null,
      lastError: null,
    }
    logIfcMove('revision_state_reset', {
      reason,
      movedProxyCount,
      pendingColorRootCount,
      pendingSaveModelId,
      pendingSaveReason,
      deferredSaveModelId,
    })
  }, [logIfcMove])
  const scheduleDeferredHierarchySelectionFlush = useCallback((reason: string) => {
    if (!deferredHierarchySelectionRef.current) return
    if (typeof window === 'undefined') {
      setHierarchySelectionRetryTick((prev) => prev + 1)
      return
    }
    if (deferredHierarchySelectionTimerRef.current !== null) {
      window.clearTimeout(deferredHierarchySelectionTimerRef.current)
    }
    deferredHierarchySelectionTimerRef.current = window.setTimeout(() => {
      deferredHierarchySelectionTimerRef.current = null
      logIfcMove('requested_select_deferred_retry', {
        reason,
        pendingKind: deferredHierarchySelectionRef.current?.kind ?? null,
      })
      setHierarchySelectionRetryTick((prev) => prev + 1)
    }, 0)
  }, [logIfcMove])
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
    const wasLocked = ['dragging', 'commit', 'cleanup'].includes(payload.prevPhase)
    const isLocked = ['dragging', 'commit', 'cleanup'].includes(payload.nextPhase)
    if (wasLocked && !isLocked) {
      scheduleDeferredHierarchySelectionFlush('transform_runtime_unlocked')
    }
  }, [logIfcMove, scheduleDeferredHierarchySelectionFlush])
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
  const safeIfcFragmentRaycast = useCallback(async (
    sceneState: ThatOpenSceneState,
    data: Parameters<NonNullable<FragmentModelWithRaycast['raycast']>>[0],
    reason: string,
  ): Promise<IfcRaycastPick | null> => {
    const model = (sceneState.fragments.core.models.list as Map<string, unknown>).get(sceneState.modelId) as
      FragmentModelWithRaycast | undefined
    if (!model?.raycast) return null
    try {
      const result = await model.raycast(data)
      const pickedModelId = result?.fragments?.modelId
      if (pickedModelId && normalizeRootModelId(pickedModelId, sceneState.modelId) !== sceneState.modelId) {
        logIfcMove('pick_ifc_raycast_ignored_non_primary_model', {
          reason,
          pickedModelId,
          primaryModelId: sceneState.modelId,
        })
        return null
      }
      return result
    } catch (error) {
      console.warn('[editor] IFC 메인 모델 raycast 실패', {
        reason,
        modelId: sceneState.modelId,
        error,
      })
      return null
    }
  }, [logIfcMove])
  const disposeLibraryAssetModel = useCallback(async (
    sceneState: ThatOpenSceneState,
    modelId: string,
    reason: string,
  ) => {
    if (!modelId || modelId === sceneState.modelId) return
    const modelList = sceneState.fragments.core.models.list as Map<string, unknown>
    if (!modelList.has(modelId)) {
      libraryAssetModelIdsRef.current.delete(modelId)
      return
    }
    const core = sceneState.fragments.core as import('@thatopen/fragments').FragmentsModels & {
      disposeModel?: (targetModelId: string) => Promise<void> | void
    }
    const model = modelList.get(modelId) as {
      object?: Object3D
      dispose?: () => Promise<void> | void
    } | undefined
    detachAndHideObjectTree(model?.object)
    try {
      if (typeof core.disposeModel === 'function') {
        await Promise.resolve(core.disposeModel(modelId))
      } else {
        await Promise.resolve(model?.dispose?.())
      }
      logIfcMove('library_asset_model_disposed', { modelId, reason })
    } catch (error) {
      console.warn('[editor] IFC 라이브러리 에셋 fragments 모델 폐기 실패', {
        modelId,
        reason,
        error,
      })
    } finally {
      libraryAssetModelIdsRef.current.delete(modelId)
    }
  }, [logIfcMove])
  const disposeLoadedLibraryAssetModels = useCallback(async (
    sceneState: ThatOpenSceneState,
    reason: string,
    keepModelIds: Set<string> = new Set(),
  ) => {
    const modelIds = Array.from(libraryAssetModelIdsRef.current)
      .filter((modelId) => !keepModelIds.has(modelId))
    if (modelIds.length === 0) return
    await Promise.all(modelIds.map((modelId) => disposeLibraryAssetModel(sceneState, modelId, reason)))
  }, [disposeLibraryAssetModel])
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
  const findMovedIfcProxyRecordByCandidateIds = useCallback((
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
  const findMovedIfcProxyRecord = useCallback((
    sceneState: ThatOpenSceneState,
    modelId: string,
    localIds: number[],
  ) => (
    findMovedIfcProxyRecordByCandidateIds(sceneState, modelId, localIds)
  ), [findMovedIfcProxyRecordByCandidateIds])
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
    options: { forceRender?: boolean; resetHighlight?: boolean; skipCoreUpdate?: boolean } = {},
  ) => {
    const shouldResetHighlight = options.resetHighlight ?? true
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
    const processedVisibilityKeys = new Set<string>()
    for (const record of records) {
      record.object.visible = true
      const relatedModelIds = allModelIds.filter((candidateId) => (
        normalizeRootModelId(candidateId, record.rootModelId) === record.rootModelId
      ))
      const modelIds = relatedModelIds.length > 0 ? relatedModelIds : [record.modelId]
      for (const modelId of modelIds) {
        const normalizedHideLocalIds = Array.from(new Set(record.hideLocalIds.filter(Number.isFinite))).sort((a, b) => a - b)
        const visibilityKey = `${modelId}:${normalizedHideLocalIds.join(',')}`
        if (processedVisibilityKeys.has(visibilityKey)) {
          logIfcMove('moved_proxy_registry_rehide_skip_duplicate', {
            reason,
            key: record.key,
            modelId,
            hideLocalIds: normalizedHideLocalIds,
          })
          continue
        }
        processedVisibilityKeys.add(visibilityKey)
        try {
          await applyIfcSelectionVisibility(sceneState, {
            modelId,
            localIds: normalizedHideLocalIds,
            proxyObject: record.object,
            mode: 'proxy',
            proxyOpacity: 1,
            reason: `registry_rehide:${reason}`,
            persistModelHidden: true,
            skipProxyOpacityUpdate: true,
            skipCoreUpdate: options.skipCoreUpdate ?? true,
            forceRender: false,
          })
          if (shouldResetHighlight) {
            const model = (sceneState.fragments.core.models.list as Map<string, unknown>).get(modelId) as {
              resetOpacity?: (localIds: number[] | undefined) => Promise<void> | void
            } | undefined
            logIfcMove('moved_proxy_registry_highlight_reset_start', {
              reason,
              key: record.key,
              modelId,
              hideLocalIds: normalizedHideLocalIds,
            })
            await Promise.resolve(model?.resetOpacity?.(normalizedHideLocalIds)).catch((error) => {
              logIfcMove('moved_proxy_registry_highlight_reset_failed', {
                reason,
                key: record.key,
                modelId,
                method: 'resetOpacity',
                error: error instanceof Error ? error.message : String(error),
              })
            })
            await sceneState.fragments.resetHighlight({
              [modelId]: new Set(normalizedHideLocalIds),
            }).catch((error) => {
              logIfcMove('moved_proxy_registry_highlight_reset_failed', {
                reason,
                key: record.key,
                modelId,
                method: 'resetHighlight',
                error: error instanceof Error ? error.message : String(error),
              })
            })
          }
        } catch (error) {
          logIfcMove('moved_proxy_registry_rehide_failed', {
            reason,
            key: record.key,
            modelId,
            hideLocalIds: normalizedHideLocalIds,
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
      resetHighlight: shouldResetHighlight,
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
  const constrainMappedLocalIdsToSelectedElement = useCallback((
    context: string,
    modelId: string,
    hitLocalId: number | undefined,
    selectedExpressIdRaw: number | string | undefined,
    mappedLocalIds: number[],
  ) => {
    const normalized = Array.from(new Set(mappedLocalIds.filter(Number.isFinite)))
    if (normalized.length === 0) return normalized

    const selectedExpressId = Number(selectedExpressIdRaw)
    if (!Number.isFinite(selectedExpressId)) {
      return normalized
    }

    const filtered = normalized.filter((localId) => {
      if (Number.isFinite(hitLocalId) && localId === hitLocalId) return true
      const mappedExpressId =
        canonicalIdMapRef.current.expressIdByLocalId.get(localId) ??
        ifcPsetMetricsRef.current.byId[localId]?.expressId
      return Number(mappedExpressId) === selectedExpressId
    })
    if (filtered.length === normalized.length) return normalized
    logIfcMove(`${context}_item_mapping_constrained_to_selected`, {
      modelId,
      hitLocalId: Number.isFinite(hitLocalId) ? hitLocalId : null,
      selectedExpressId,
      mappedLocalIds: normalized,
      keptLocalIds: filtered,
    })
    return filtered
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
    const sanitizedItemMappedLocalIds = sanitizeMappedLocalIds(
      'commit',
      normalizedTargetModelId,
      target.hitLocalId,
      rawItemMappedLocalIds,
    )
    const itemMappedLocalIds = constrainMappedLocalIdsToSelectedElement(
      'commit',
      normalizedTargetModelId,
      target.hitLocalId,
      editTarget?.element?.expressId ?? target.localId,
      sanitizedItemMappedLocalIds,
    )
    const canonicalCandidateLocalIds = resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
      hitLocalId: target.hitLocalId,
      localId: target.localId,
      expressId: Number.isFinite(Number(editTarget?.element?.expressId))
        ? Number(editTarget?.element?.expressId)
        : undefined,
      proxyLocalIds,
      itemMappedLocalIds,
    })
    const moveScopeLocalIds = Array.from(new Set<number>((
      itemMappedLocalIds.length > 0
        ? itemMappedLocalIds
        : proxyLocalIds.length > 0
          ? proxyLocalIds
          : [target.hitLocalId, target.localId]
    ).filter(Number.isFinite)))
    logIfcMove('commit_candidates_resolved', {
      targetKey,
      proxyLocalIds,
      itemMappedLocalIds,
      candidateLocalIds: canonicalCandidateLocalIds,
      moveScopeLocalIds,
      deltaPosition: { x: deltaPosition.x, y: deltaPosition.y, z: deltaPosition.z },
    })
    if (moveScopeLocalIds.length === 0) {
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, {
        type: 'commit_failure',
        targetKey,
        message: 'No canonical localIds resolved',
      })
      logIfcMove('commit_failure', { targetKey, reason: 'No canonical localIds resolved' })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }

    const editability = await resolveEditableIfcTargets(sceneState, normalizedTargetModelId, moveScopeLocalIds)
    logIfcMove('commit_editability_resolved', {
      targetKey,
      candidateLocalIds: canonicalCandidateLocalIds,
      moveScopeLocalIds,
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
        candidateLocalIds: canonicalCandidateLocalIds,
        moveScopeLocalIds,
      })
      logIfcMove('commit_failure', {
        targetKey,
        reason: 'No editable IFC elements found',
        candidateLocalIds: canonicalCandidateLocalIds,
        moveScopeLocalIds,
        modelIdsTried: editability?.modelIdsTried ?? [],
      })
      ifcMoveLifecycleRef.current = nextIfcMoveLifecycleState(ifcMoveLifecycleRef.current, { type: 'cleanup_done' })
      return
    }
    const requiredLocalIds = moveScopeLocalIds
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
      ...editability.editableLocalIds,
      ...moveScopeLocalIds,
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
            persistModelHidden: true,
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
    constrainMappedLocalIdsToSelectedElement,
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
    onIfcElementTransformCommitRef.current = onIfcElementTransformCommit
  }, [onIfcElementTransformCommit])

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

  useEffect(() => { commentPinsRef.current = commentPins }, [commentPins])
  useEffect(() => { selectedPinIdRef.current = selectedPinId }, [selectedPinId])
  useEffect(() => { currentUserIdRef.current = currentUserId }, [currentUserId])
  useEffect(() => { isCollaborationModeRef.current = isCollaborationMode }, [isCollaborationMode])
  useEffect(() => { deletingPinIdRef.current = deletingPinId }, [deletingPinId])
  useEffect(() => {
    isGridVisibleRef.current = isGridVisible
    const grid = floorGridRef.current
    if (!grid) return
    grid.visible = isGridVisible
    const sceneState = sceneRef.current
    sceneState?.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [isGridVisible])
  useEffect(() => { transformModeRef.current = transformMode }, [transformMode])
  useEffect(() => { onPinClickRef.current = onPinClick }, [onPinClick])
  useEffect(() => { onPinCreateRef.current = onPinCreate }, [onPinCreate])
  useEffect(() => { onPinDeleteRef.current = onPinDelete }, [onPinDelete])
  useEffect(() => {
    const sceneState = sceneRef.current
    const markerGroup = pinMarkerGroupRef.current
    if (!sceneState || !markerGroup) return
    syncThreeDPinMarkers(sceneState.three, markerGroup, commentPins, {
      selectedPinId,
      currentUserId,
      deletingPinId,
      worldUnitsPerMm: sceneState.worldUnitsPerMm,
    })
  }, [commentPins, currentUserId, deletingPinId, selectedPinId])

  useEffect(() => () => {
    if (typeof window === 'undefined') return
    if (!feedbackTimeoutRef.current) return
    window.clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = null
  }, [])
  useEffect(() => {
    storeyVisibilitySignatureRef.current = null
  }, [ifcUrl, projectId])
  useEffect(() => {
    let active = true
    void loadIfcLibraryManifest().then((manifest) => {
      if (active) setIfcLibraryManifest(manifest)
    })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    libraryAssetBytesCacheRef.current.clear()
    libraryAssetSyncTokenRef.current += 1
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
        let handleDoubleClick: ((event: MouseEvent) => void) | null = null
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
    let cameraControlsRestListener: (() => void) | null = null
    let cameraControlsWithEvents:
      | {
          addEventListener?: (type: 'change' | 'rest', listener: () => void) => void
          removeEventListener?: (type: 'change' | 'rest', listener: () => void) => void
        }
      | null = null
    let isTransformDragging = false

    const loadIfc = async () => {
      if (!ifcUrl) return
      const cameraStateToRestore = preservedCameraStateRef.current?.projectId === (projectId ?? null)
        ? preservedCameraStateRef.current
        : null
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
        if (!cameraStateToRestore) {
          await world.camera.controls?.setLookAt(8, 6, 8, 0, 0, 0)
        }
        if (world.camera.controls) {
          world.camera.controls.azimuthRotateSpeed = rotationLockedRef.current ? 0 : 1
          world.camera.controls.polarRotateSpeed = rotationLockedRef.current ? 0 : 1
        }
        const emitCoordinates = (position: { x: number; y: number; z: number }) => {
          onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(position))
        }
        emitCoordinates(world.camera.three.position)
        cameraControlsWithEvents = world.camera.controls as unknown as {
          addEventListener?: (type: 'change' | 'rest', listener: () => void) => void
          removeEventListener?: (type: 'change' | 'rest', listener: () => void) => void
        } | null
        cameraControlsChangeListener = () => {
          const selectedTarget = selectedTargetRef.current
          if (selectedTarget?.object) return
          emitCoordinates(world.camera.three.position)
        }
        cameraControlsRestListener = () => {
          if (disposed) return
          if (isTransformDragging) return
          if (movedIfcProxyRegistryRef.current.size === 0) return
          const activeScene = sceneRef.current
          if (!activeScene) return
          void rehideMovedIfcProxyRegistry(activeScene, 'camera_rest', {
            forceRender: false,
            resetHighlight: false,
          })
        }
        cameraControlsWithEvents?.addEventListener?.('change', cameraControlsChangeListener)
        cameraControlsWithEvents?.addEventListener?.('rest', cameraControlsRestListener)

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

        const pinMarkerGroup = new THREE.Group()
        pinMarkerGroup.name = 'comment-pins'

        const fragmentModel = model as unknown as LoadedFragmentModel
        fragmentModel.useCamera(world.camera.three)
        applyInitialIfcMaterialStyles(THREE, fragmentModel.object)
        const worldUnitsPerMm = inferWorldUnitsPerMm(THREE, fragmentModel.object)
        contentGroup.add(fragmentModel.object)
        contentGroup.add(presetGroup)
        contentGroup.add(pinMarkerGroup)
        pinMarkerGroupRef.current = pinMarkerGroup
        syncThreeDPinMarkers(THREE, pinMarkerGroup, isCollaborationModeRef.current ? commentPinsRef.current : [], {
          selectedPinId: selectedPinIdRef.current,
          currentUserId: currentUserIdRef.current,
          deletingPinId: deletingPinIdRef.current,
          worldUnitsPerMm,
        })

        const ifcEditGroup = new THREE.Group()
        ifcEditGroup.name = 'ifc-edit-overlays'
        contentGroup.add(ifcEditGroup)

        const transformControls = new transformControlsModule.TransformControls(
          world.camera.three,
          world.renderer.three.domElement,
        )
        transformControls.setMode('translate')
        syncTransformControlAxisVisibility(transformControls, null, 'translate')
        transformControls.visible = false
        transformControls.enabled = false
        const transformHelper = transformControls.getHelper()
        world.scene.three.add(transformHelper)
        let isTransformPointerActive = false
        let transformPointerActiveSince = 0
        let lastTransformAxis: string | null = null
        let lastDragStartPosition: { x: number; y: number; z: number } | null = null
        let lastDragStartWorldPosition: { x: number; y: number; z: number } | null = null
        let lastDragStartWorldQuaternion: { x: number; y: number; z: number; w: number } | null = null
        let activeDragSessionId: string | null = null
        const emittedTransformSessionIds = new Set<string>()
        const emittedTransformTargetKeys = new Set<string>()
        const emitTranslateTransformCommitFromDragEnd = (
          target: Extract<Selected3DTarget, { source: 'ifc' }>,
          _reason: string,
        ): boolean => {
          if (transformModeRef.current !== 'translate') return false
          const activeScene = sceneRef.current
          const editable = target.object as IfcEditableObject3D | undefined
          const element = editable?.userData.ifcEditTarget?.element
          if (!activeScene || !editable || !element) return false
          if (!lastDragStartWorldPosition || activeScene.worldUnitsPerMm <= 0) return false

          const worldPosition = new activeScene.three.Vector3()
          editable.getWorldPosition(worldPosition)
          const translationMm = {
            x: (worldPosition.x - lastDragStartWorldPosition.x) / activeScene.worldUnitsPerMm,
            y: (lastDragStartWorldPosition.z - worldPosition.z) / activeScene.worldUnitsPerMm,
            z: (worldPosition.y - lastDragStartWorldPosition.y) / activeScene.worldUnitsPerMm,
          }
          const hasTranslation =
            Math.abs(translationMm.x) > 1e-6 ||
            Math.abs(translationMm.y) > 1e-6 ||
            Math.abs(translationMm.z) > 1e-6
          if (!hasTranslation) return false

          const sessionId = activeDragSessionId
          const targetKey = getIfcMoveTargetKey(target.modelId, target.localId)
          if (sessionId && emittedTransformSessionIds.has(sessionId)) return false
          if (emittedTransformTargetKeys.has(targetKey)) return false
          if (sessionId) {
            rememberBoundedSetValue(emittedTransformSessionIds, sessionId, SPACE_TRANSFORM_DEDUP_LIMIT)
          }
          rememberBoundedSetValue(emittedTransformTargetKeys, targetKey, SPACE_TRANSFORM_DEDUP_LIMIT)

          const patch = {
            positionX: worldPosition.x,
            positionY: worldPosition.y,
            positionZ: worldPosition.z,
            translationMm,
          }
          onIfcElementTransformCommitRef.current?.(element, patch)
          return true
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
          syncTransformControlAxisVisibility(
            activeScene.transformControls,
            target,
            transformModeRef.current,
          )
          if (object && isObjectInSceneGraph(activeScene.scene, object)) {
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
            if (rebound && isObjectInSceneGraph(activeScene.scene, rebound)) {
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
        const waitForCommitInFlightToSettle = async (reason: string, timeoutMs = 1800) => {
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
              const stuckLatencyMs = lastIfcDragEndAt > 0
                ? performance.now() - lastIfcDragEndAt
                : 0
              if (stuckLatencyMs > IFC_COMMIT_INFLIGHT_STALE_RECOVERY_MS) {
                logIfcMove('commit_wait_recover_stale_local_inflight', {
                  reason,
                  elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
                  stuckLatencyMs,
                  recoveryMs: IFC_COMMIT_INFLIGHT_STALE_RECOVERY_MS,
                  movePhase: ifcMoveLifecycleRef.current.phase,
                })
                ifcCommitInFlightRef.current = false
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
            lastDragStartWorldPosition = null
            lastDragStartWorldQuaternion = null
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
              // This flag guards the local proxy commit, not a BE/worker ack. If it gets stale,
              // recover quickly so the moved proxy is committed before selection cleanup can restore it.
              const stuckLatencyMs = lastIfcDragEndAt > 0
                ? performance.now() - lastIfcDragEndAt
                : 0
              if (stuckLatencyMs > IFC_COMMIT_INFLIGHT_TIMEOUT_MS) {
                logIfcMove('commit_queue_timeout_inflight', {
                  token,
                  modelId: selectedTarget.modelId,
                  localId: selectedTarget.localId,
                  stuckLatencyMs,
                  timeoutMs: IFC_COMMIT_INFLIGHT_TIMEOUT_MS,
                })
                pendingIfcCommitTimer = null
                if (queuedSessionId) {
                  dispatchTransformRuntimeAction(
                    {
                      type: 'COMMIT_FAIL',
                      transformSessionId: queuedSessionId,
                      message: 'Previous IFC commit is still in flight.',
                    },
                    'runQueuedIfcCommit_inflight_timeout',
                  )
                  dispatchTransformRuntimeAction(
                    { type: 'CLEANUP', transformSessionId: queuedSessionId },
                    'runQueuedIfcCommit_inflight_timeout_cleanup',
                  )
                  if (activeDragSessionId === queuedSessionId) activeDragSessionId = null
                }
                pendingCommitSessionByToken.delete(token)
                showIfcEditFeedback('error', '이전 3D 편집 저장이 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.')
                return
              } else if (stuckLatencyMs > IFC_COMMIT_INFLIGHT_STALE_RECOVERY_MS) {
                logIfcMove('commit_queue_recover_stale_local_inflight', {
                  token,
                  modelId: selectedTarget.modelId,
                  localId: selectedTarget.localId,
                  stuckLatencyMs,
                  recoveryMs: IFC_COMMIT_INFLIGHT_STALE_RECOVERY_MS,
                  movePhase: ifcMoveLifecycleRef.current.phase,
                })
                ifcCommitInFlightRef.current = false
              } else {
                logIfcMove('commit_queue_defer_inflight', {
                  token,
                  modelId: selectedTarget.modelId,
                  localId: selectedTarget.localId,
                  stuckLatencyMs,
                  retryMs: IFC_COMMIT_INFLIGHT_RETRY_MS,
                })
                pendingIfcCommitTimer = window.setTimeout(() => {
                  pendingIfcCommitTimer = null
                  void runQueuedIfcCommit(token)
                }, IFC_COMMIT_INFLIGHT_RETRY_MS)
                return
              }
            }
            ifcCommitInFlightRef.current = true
            try {
              const activeScene = sceneRef.current
              if (activeScene) {
                const editable = selectedTarget.object as IfcEditableObject3D
                const editTarget = editable.userData.ifcEditTarget
                const transformCommit = (() => {
                  const element = editTarget?.element
                  if (!element) return null
                  const worldPosition = new activeScene.three.Vector3()
                  const worldQuaternion = new activeScene.three.Quaternion()
                  const worldEuler = new activeScene.three.Euler()
                  editable.getWorldPosition(worldPosition)
                  editable.getWorldQuaternion(worldQuaternion)
                  worldEuler.setFromQuaternion(worldQuaternion, 'XYZ')
                  const currentTransformMode = transformModeRef.current
                  const previousWorldMatrixElements = (editable.userData as { ifcEditProxyWorldMatrix?: number[] })
                    .ifcEditProxyWorldMatrix
                  const deltaTransform = (() => {
                    if (!Array.isArray(previousWorldMatrixElements) || previousWorldMatrixElements.length !== 16) return null
                    editable.updateMatrixWorld(true)
                    const previousWorldMatrix = new activeScene.three.Matrix4().fromArray(previousWorldMatrixElements)
                    const deltaMatrix = editable.matrixWorld.clone().multiply(previousWorldMatrix.clone().invert())
                    if (hasIdentityMatrixDelta(deltaMatrix.elements)) return null
                    const deltaPosition = new activeScene.three.Vector3()
                    const deltaQuaternion = new activeScene.three.Quaternion()
                    const deltaScale = new activeScene.three.Vector3()
                    deltaMatrix.decompose(deltaPosition, deltaQuaternion, deltaScale)
                    const deltaEuler = new activeScene.three.Euler().setFromQuaternion(deltaQuaternion, 'XYZ')
                    return {
                      position: deltaPosition,
                      rotation: deltaEuler,
                      quaternion: deltaQuaternion,
                      scale: deltaScale,
                    }
                  })()
                  const sizeMm = currentTransformMode === 'scale'
                    ? getObjectSizeMm(activeScene.three, editable, activeScene.worldUnitsPerMm)
                    : null
                  const rotationX = (worldEuler.x * 180) / Math.PI
                  const rotationY = (worldEuler.y * 180) / Math.PI
                  const rotationZ = (worldEuler.z * 180) / Math.PI
                  const fallbackDeltaQuaternion = lastDragStartWorldQuaternion
                    ? worldQuaternion.clone().multiply(
                        new activeScene.three.Quaternion(
                          lastDragStartWorldQuaternion.x,
                          lastDragStartWorldQuaternion.y,
                          lastDragStartWorldQuaternion.z,
                          lastDragStartWorldQuaternion.w,
                        ).invert(),
                      )
                    : undefined
                  const persistedRotationAxisAngle = currentTransformMode === 'rotate'
                    ? toIfcRotationAxisAngle(deltaTransform?.quaternion ?? fallbackDeltaQuaternion)
                    : null
                  const persistedRotationDegrees = {}
                  const translationMm = lastDragStartWorldPosition && activeScene.worldUnitsPerMm > 0
                    ? {
                        x: (worldPosition.x - lastDragStartWorldPosition.x) / activeScene.worldUnitsPerMm,
                        y: (lastDragStartWorldPosition.z - worldPosition.z) / activeScene.worldUnitsPerMm,
                        z: (worldPosition.y - lastDragStartWorldPosition.y) / activeScene.worldUnitsPerMm,
                      }
                    : deltaTransform && activeScene.worldUnitsPerMm > 0
                    ? {
                        x: deltaTransform.position.x / activeScene.worldUnitsPerMm,
                        y: -deltaTransform.position.z / activeScene.worldUnitsPerMm,
                        z: deltaTransform.position.y / activeScene.worldUnitsPerMm,
                      }
                    : undefined
                  const dimensionPatch = currentTransformMode === 'scale'
                    ? {
                        lengthMm: sizeMm?.lengthMm ?? element.lengthMm,
                        heightMm: sizeMm?.heightMm ?? element.heightMm,
                        thicknessMm: sizeMm?.thicknessMm ?? element.thicknessMm,
                      }
                    : {}
                  return {
                    element,
                    patch: {
                      ...dimensionPatch,
                      positionX: worldPosition.x,
                      positionY: worldPosition.y,
                      positionZ: worldPosition.z,
                      translationMm,
                      ...(currentTransformMode === 'translate'
                        ? {}
                        : {
                            rotationX,
                            rotationY,
                            rotationZ,
                            rotationDegrees: persistedRotationDegrees,
                            rotationAxisAngle: persistedRotationAxisAngle ?? undefined,
                          }),
                    },
                  }
                })()
                const transformCommitTargetKey =
                  transformCommit && selectedTarget.source === 'ifc'
                    ? getIfcMoveTargetKey(selectedTarget.modelId, selectedTarget.localId)
                    : null
                let didEmitTransformCommit = Boolean(
                  queuedSessionId &&
                  emittedTransformSessionIds.has(queuedSessionId),
                ) || Boolean(
                  transformCommitTargetKey &&
                  emittedTransformTargetKeys.has(transformCommitTargetKey),
                )
                const emitTransformCommit = (_reason: string) => {
                  if (!transformCommit || didEmitTransformCommit) return
                  didEmitTransformCommit = true
                  if (queuedSessionId) {
                    rememberBoundedSetValue(emittedTransformSessionIds, queuedSessionId, SPACE_TRANSFORM_DEDUP_LIMIT)
                  }
                  if (transformCommitTargetKey) {
                    rememberBoundedSetValue(
                      emittedTransformTargetKeys,
                      transformCommitTargetKey,
                      SPACE_TRANSFORM_DEDUP_LIMIT,
                    )
                  }
                  onIfcElementTransformCommitRef.current?.(transformCommit.element, transformCommit.patch)
                }
                if (
                  transformModeRef.current === 'translate' &&
                  transformCommit
                ) {
                  // 로컬 IFC commit(commitIfcProxyTransformToModel)이 실패하면
                  // lastError가 세팅돼 after_local_commit emit이 차단된다.
                  // 그러면 워크스페이스/BE/worker로 가는 patch도 함께 유실되어
                  // 사용자 입장에서는 이동 후 history가 남지 않는 증상이 발생한다.
                  // IfcSpace에 대해서만 pre-commit emit을 보호하던 분기를
                  // 모든 translate 대상으로 확장해 wall/door/window 등도 동일하게
                  // 로컬 commit 실패와 무관하게 publish가 보장되도록 한다.
                  emitTransformCommit(
                    isIfcSpaceElementInfo(transformCommit.element)
                      ? 'space_translate_before_local_commit'
                      : 'translate_before_local_commit',
                  )
                }
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
                  if (transformCommit) {
                    emitTransformCommit('after_local_commit')
                  }
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
              lastDragStartWorldPosition = null
              lastDragStartWorldQuaternion = null
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
              const libraryElement = getLibraryElementInfo(libraryObject)
              const patch: Partial<ThreeDLibraryPreset> = {
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
              }
              if (transformModeRef.current === 'scale') {
                const scalePatch = getLibraryScaleDimensionPatch(
                  libraryObject,
                  sceneRef.current?.worldUnitsPerMm ?? PROJECT_WORLD_UNITS_PER_MM,
                )
                if (scalePatch) {
                  patch.lengthMm = scalePatch.lengthMm
                  patch.heightMm = scalePatch.heightMm
                  patch.thicknessMm = scalePatch.thicknessMm
                  updateLibraryPresetData(libraryObject, scalePatch)
                }
              }
              onLibraryElementChangeRef.current?.(preset.id, patch)
              if (libraryElement) {
                const nextLibraryElement = getLibraryElementInfo(libraryObject) ?? libraryElement
                selectedTarget.selectedTransformSignature = getElementTransformSignature(nextLibraryElement)
                selectedTarget.selectedSignature = getElementDimensionSignature(nextLibraryElement)
                onIfcElementSelectRef.current?.(nextLibraryElement)
              }
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
          syncTransformControlAxisVisibility(transformControls, selectedTarget, transformModeRef.current)
          if (selectedObject && isObjectInSceneGraph(world.scene.three, selectedObject as Object3D)) {
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
                emittedTransformTargetKeys.delete(getIfcMoveTargetKey(selectedTarget.modelId, selectedTarget.localId))
                lastDragStartPosition = {
                  x: dragObject.position.x,
                  y: dragObject.position.y,
                  z: dragObject.position.z,
                }
                dragObject.updateMatrixWorld(true)
                const startWorldPosition = new THREE.Vector3()
                const startWorldQuaternion = new THREE.Quaternion()
                dragObject.getWorldPosition(startWorldPosition)
                dragObject.getWorldQuaternion(startWorldQuaternion)
                lastDragStartWorldPosition = {
                  x: startWorldPosition.x,
                  y: startWorldPosition.y,
                  z: startWorldPosition.z,
                }
                lastDragStartWorldQuaternion = {
                  x: startWorldQuaternion.x,
                  y: startWorldQuaternion.y,
                  z: startWorldQuaternion.z,
                  w: startWorldQuaternion.w,
                }
                ;(dragObject.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
                  Array.from(dragObject.matrixWorld.elements)
              } else {
                lastDragStartPosition = null
                lastDragStartWorldPosition = null
                lastDragStartWorldQuaternion = null
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
            const didEmitTranslateTransformCommit = emitTranslateTransformCommitFromDragEnd(
              selectedTarget,
              'drag_end_translate',
            )
            logIfcMove('drag_end_schedule_commit', {
              modelId: selectedTarget.modelId,
              localId: selectedTarget.localId,
              hitLocalId: selectedTarget.hitLocalId,
              deltaRaw: dragDeltaRaw,
              deltaRounded: dragDelta,
              hasTransformDelta,
              didEmitTranslateTransformCommit,
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

        const nextSceneState: ThatOpenSceneState = {
          three: THREE,
          scene: world.scene.three,
          camera: world.camera.three,
          renderer: world.renderer.three,
          fragments,
          ifcLoader,
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
        sceneRef.current = nextSceneState
        presetGroupRef.current = presetGroup
        positionPresetGroupBesideIfc(THREE, fragmentModel.object, presetGroup, worldUnitsPerMm)
        const renderer = world.renderer.three
        pointerDownDom = renderer.domElement
        const camera = world.camera.three

        const createCommentPinAtWorldPoint = (point: import('three').Vector3) => {
          const cameraPosition = camera.position
          const threeDPosition: CommentPin3DCreatePosition = {
            worldX: point.x / worldUnitsPerMm,
            worldY: point.z / worldUnitsPerMm,
            worldZ: point.y / worldUnitsPerMm,
            cameraX: cameraPosition.x / worldUnitsPerMm,
            cameraY: cameraPosition.z / worldUnitsPerMm,
            cameraZ: cameraPosition.y / worldUnitsPerMm,
          }
          onPinCreateRef.current?.(
            threeDPosition.worldX / FLOOR_MM_PER_PX,
            threeDPosition.worldY / FLOOR_MM_PER_PX,
            undefined,
            threeDPosition,
          )
        }

        const createCommentPinFromPointer = async (event: MouseEvent) => {
          if (!isCollaborationModeRef.current) return
          const bounds = renderer.domElement.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            return
          }

          const normalizedMouse = new THREE.Vector2(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
          )
          const screenMouse = new THREE.Vector2(event.clientX, event.clientY)
          const raycaster = new THREE.Raycaster()
          raycaster.setFromCamera(normalizedMouse, camera)
          const pinHits = pinMarkerGroupRef.current
            ? raycaster.intersectObjects(pinMarkerGroupRef.current.children, true)
            : []
          if (resolveThreeDPinMarkerHit(pinHits)) return

          const ifcEditHit = raycaster.intersectObjects(ifcEditGroup.children, true)[0]
          const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
          type WithPoint = { point?: import('three').Vector3; distance?: number }
          const fragmentRaycastRaw = await fragments.raycast({ camera, mouse: screenMouse, dom: renderer.domElement }) as WithPoint | null
          const castRayRaw = fragmentRaycastRaw?.point
            ? null
            : await thatOpenRaycaster.castRay({ position: normalizedMouse }) as WithPoint | null
          const ifcRaw = fragmentRaycastRaw ?? castRayRaw
          const ifcModelHit = ifcRaw?.point
            ? { point: ifcRaw.point, distance: ifcRaw.distance ?? Number.POSITIVE_INFINITY }
            : null
          const collaborationHit = [libraryHit, ifcEditHit, ifcModelHit]
            .filter((hit): hit is { point: import('three').Vector3; distance: number } => Boolean(hit?.point))
            .sort((a, b) => a.distance - b.distance)[0]
          if (!collaborationHit?.point) return
          event.preventDefault()
          event.stopPropagation()
          createCommentPinAtWorldPoint(collaborationHit.point)
        }

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
              const activeAxis = (transformControls as unknown as { axis?: string | null }).axis ?? currentAxis ?? null
              if (activeAxis || transformState.dragging || isTransformPointerActive) {
                isTransformPointerActive = true
                if (transformPointerActiveSince <= 0) transformPointerActiveSince = performance.now()
                logIfcMove('pick_blocked_by_transform_helper_hit', {
                  pickSequence,
                  helperDistance: axisHit.distance,
                  selectedSource: selectedTargetRef.current?.source ?? null,
                  axis: activeAxis,
                  action: 'skip_scene_pick_keep_transform_interaction',
                })
                return
              }
              logIfcMove('pick_ignored_transform_helper_false_positive', {
                pickSequence,
                helperDistance: axisHit.distance,
                selectedSource: selectedTargetRef.current?.source ?? null,
                axis: activeAxis,
                action: 'continue_scene_pick',
              })
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
          const isVisibleInHierarchy = (object: Object3D) => {
            let cursor: Object3D | null = object
            while (cursor) {
              if (!cursor.visible) return false
              cursor = (cursor.parent ?? null) as Object3D | null
            }
            return true
          }
          const getSafeRaycastTargets = (objects: Object3D[] | undefined) => {
            const targets: Object3D[] = []
            objects?.forEach((root) => {
              root.traverse((child) => {
                if (!isVisibleInHierarchy(child)) return
                const candidate = child as Object3D & {
                  geometry?: {
                    getAttribute?: (name: string) => {
                      array?: unknown
                      count?: number
                      data?: { array?: unknown }
                    } | undefined
                  }
                }
                const position = candidate.geometry?.getAttribute?.('position')
                const positionArray = position?.array ?? position?.data?.array
                if (!position || !positionArray || !Number.isFinite(position.count) || (position.count ?? 0) <= 0) return
                targets.push(child)
              })
            })
            return targets
          }
          const getSafeRayHits = (objects: Object3D[] | undefined, reason: string) => {
            if (!objects || objects.length === 0) return []
            const raycastTargets = getSafeRaycastTargets(objects)
            if (raycastTargets.length === 0) return []
            try {
              return raycaster.intersectObjects(raycastTargets, false)
            } catch (error) {
              console.warn('[editor] 3D 선택 raycast 실패', { reason, error })
              return []
            }
          }
          const getFirstRayHit = (objects: Object3D[] | undefined, reason: string) =>
            getSafeRayHits(objects, reason)[0]
          const getFirstLibraryHit = () => {
            const directHit = getFirstRayHit(presetGroup.children as Object3D[] | undefined, 'library')
            if (directHit) return directHit

            const boxHits = presetGroup.children
              .filter((child) => child.visible)
              .map((child) => {
                const box = (() => {
                  try {
                    return new THREE.Box3().setFromObject(child)
                  } catch (error) {
                    console.warn('[editor] 3D 선택 바운딩 박스 계산 실패', { reason: 'library', error })
                    return null
                  }
                })()
                if (!box) return null
                if (box.isEmpty()) return null
                const point = raycaster.ray.intersectBox(box, new THREE.Vector3())
                if (!point) return null
                return {
                  object: child,
                  point,
                  distance: raycaster.ray.origin.distanceTo(point),
                } as import('three').Intersection
              })
              .filter((hit): hit is import('three').Intersection => Boolean(hit))
              .sort((a, b) => a.distance - b.distance)
            return boxHits[0]
          }
          const pinHits = getSafeRayHits(pinMarkerGroupRef.current?.children as Object3D[] | undefined, 'pin')
          const pinMarkerHit = resolveThreeDPinMarkerHit(pinHits)
          if (pinMarkerHit) {
            if (pinMarkerHit.action === 'delete') {
              if (deletingPinIdRef.current === pinMarkerHit.pinId) return
              renderer.domElement.style.cursor = 'default'
              onPinDeleteRef.current?.(pinMarkerHit.pinId)
              return
            }
            onPinClickRef.current?.(pinMarkerHit.pinId)
            return
          }

          const ifcEditHit = getFirstRayHit(ifcEditGroup.children as Object3D[] | undefined, 'ifc_edit')
          const libraryHit = getFirstLibraryHit()

          if (isCollaborationModeRef.current) {
            const createCommentPinAtWorldPoint = (point: import('three').Vector3) => {
              const cameraPosition = camera.position
              const threeDPosition: CommentPin3DCreatePosition = {
                worldX: point.x / worldUnitsPerMm,
                worldY: point.z / worldUnitsPerMm,
                worldZ: point.y / worldUnitsPerMm,
                cameraX: cameraPosition.x / worldUnitsPerMm,
                cameraY: cameraPosition.z / worldUnitsPerMm,
                cameraZ: cameraPosition.y / worldUnitsPerMm,
              }
              onPinCreateRef.current?.(
                threeDPosition.worldX / FLOOR_MM_PER_PX,
                threeDPosition.worldY / FLOOR_MM_PER_PX,
                undefined,
                threeDPosition,
              )
            }
            // fragmentModel.object는 InterleavedBuffer 기반이라 표준 raycaster를 쓸 수 없다.
            // ThatOpen API가 런타임에 Three.js Intersection(point 포함)을 반환하므로 직접 추출한다.
            type WithPoint = { point?: import('three').Vector3; distance?: number }
            const activeSceneForRaycast = sceneRef.current
            const fragmentRaycastRaw = activeSceneForRaycast
              ? await safeIfcFragmentRaycast(
                activeSceneForRaycast,
                { camera, mouse: screenMouse, dom: renderer.domElement },
                'collaboration_pin',
              ) as WithPoint | null
              : null
            const castRayRaw = fragmentRaycastRaw?.point
              ? null
              : await thatOpenRaycaster.castRay({ position: normalizedMouse }).catch((error) => {
                console.warn('[editor] IFC 보조 raycast 실패', { reason: 'collaboration_pin', error })
                return null
              }) as WithPoint | null
            const ifcRaw = fragmentRaycastRaw ?? castRayRaw
            const ifcModelHit = ifcRaw?.point
              ? { point: ifcRaw.point, distance: ifcRaw.distance ?? Number.POSITIVE_INFINITY }
              : null
            const collaborationHit = [libraryHit, ifcEditHit, ifcModelHit]
              .filter((hit): hit is import('three').Intersection => Boolean(hit?.point))
              .sort((a, b) => a.distance - b.distance)[0]
            if (collaborationHit?.point) createCommentPinAtWorldPoint(collaborationHit.point)
            return
          }

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
            options: { skipCoreUpdate?: boolean } = {},
          ) => {
            if (!pendingIfcSelectionRestore) return
            const pending = pendingIfcSelectionRestore
            pendingIfcSelectionRestore = null
            const activeScene = sceneRef.current
            const pendingRootModelId = activeScene
              ? normalizeRootModelId(pending.modelId, activeScene.modelId)
              : pending.modelId
            const nextRootModelId = activeScene && nextModelId
              ? normalizeRootModelId(nextModelId, activeScene.modelId)
              : nextModelId
            const blockedByNextSelection = pendingRootModelId === nextRootModelId
              ? Array.from(new Set(nextHiddenLocalIds.filter(Number.isFinite)))
              : []
            const blockedByMovedRegistry = Array.from(new Set(
              Array.from(movedIfcProxyRegistryRef.current.values())
                .filter((record) => record.rootModelId === pendingRootModelId)
                .flatMap((record) => record.hideLocalIds)
                .filter(Number.isFinite),
            ))
            const blockSet = new Set(
              [...blockedByNextSelection, ...blockedByMovedRegistry],
            )
            const restoreIds = pending.localIds.filter((localId) => !blockSet.has(localId))
            if (restoreIds.length === 0) {
              logIfcMove('selection_switch_atomic_restore_skip', {
                reason,
                modelId: pending.modelId,
                pendingLocalIds: pending.localIds,
                blockedLocalIds: Array.from(blockSet),
                blockedByNextSelection,
                blockedByMovedRegistry,
              })
              return
            }
            if (!activeScene) return
            await applyIfcSelectionVisibility(activeScene, {
              modelId: pending.modelId,
              localIds: restoreIds,
              mode: 'model',
              keepModelVisibleInProxy: true,
              reason,
              skipCoreUpdate: options.skipCoreUpdate,
              forceRender: false,
            })
            logIfcMove('selection_switch_atomic_restore_apply', {
              reason,
              modelId: pending.modelId,
              restoreLocalIds: restoreIds,
              blockedLocalIds: Array.from(blockSet),
              blockedByNextSelection,
              blockedByMovedRegistry,
            })
          }
          // 이전 선택을 해제한다. 동일 객체/로컬ID이면 아무 처리도 하지 않는다.
          const clearPreviousSelection = async (
            nextObject?: Object3D,
            nextIfcLocalId?: number,
            options: {
              skipOverlayPurge?: boolean
              skipPendingSaveSync?: boolean
              skipTransformDetach?: boolean
              skipRegistryRehide?: boolean
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
            const shouldPreserveMovedProxyForAtomicSwap = currentTarget.source === 'ifc'
              && Number.isFinite(nextIfcLocalId)
              && shouldPreserveMovedIfcProxy
              && options.skipTransformDetach === true
            if (shouldPreserveMovedProxyForAtomicSwap) {
              logIfcMove('selection_switch_atomic_preserve_moved_proxy', {
                modelId: currentTarget.modelId,
                localId: currentTarget.localId,
                hitLocalId: currentTarget.hitLocalId,
                nextIfcLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
                skippedTransformDetach: true,
                skippedRestore: true,
              })
            } else if (shouldDeferIfcRestore && currentTarget.source === 'ifc') {
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
            if (options.skipRegistryRehide) {
              logIfcMove('selection_switch_registry_rehide_skipped', {
                reason: 'atomic_swap_prepare',
                fromSource: currentTarget.source,
                nextIfcLocalId: Number.isFinite(nextIfcLocalId) ? nextIfcLocalId : null,
              })
            } else {
              await rehideMovedIfcProxyRegistry(activeScene, 'selection_switch_clear_previous', { forceRender: false })
            }
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

          const attachExistingIfcProxySelection = async (
            clickedIfcProxy: IfcEditableObject3D,
            params: {
              localIds?: number[]
              selectedElement?: IfcElementInfo
              reason: string
              nextIfcLocalId?: number
            },
          ) => {
            const clickedIfcEditTarget = clickedIfcProxy.userData?.ifcEditTarget
            if (!clickedIfcEditTarget) return false
            cancelDeferredIfcProxyCleanupForObject(clickedIfcProxy, params.reason)
            const hitLocalId = Number.isFinite(clickedIfcEditTarget.hitLocalId)
              ? clickedIfcEditTarget.hitLocalId
              : clickedIfcEditTarget.localId
            const proxyLocalIds = Array.from(new Set<number>(
              (
                params.localIds
                ?? clickedIfcEditTarget.localIds
                ?? [clickedIfcEditTarget.hitLocalId, clickedIfcEditTarget.localId]
              ).filter(Number.isFinite),
            ))
            const selectedElement = params.selectedElement ?? clickedIfcEditTarget.element
            const currentTarget = selectedTargetRef.current
            const activeSceneBeforeClear = sceneRef.current
            if (
              activeSceneBeforeClear &&
              currentTarget?.source === 'ifc' &&
              currentTarget.object === clickedIfcProxy
            ) {
              const keepModelHiddenAfterCommit = typeof clickedIfcProxy.userData.ifcKeepModelHiddenAfterCommit === 'boolean'
                ? clickedIfcProxy.userData.ifcKeepModelHiddenAfterCommit
                : currentTarget.keepModelHiddenAfterCommit
              const nextTarget: Extract<Selected3DTarget, { source: 'ifc' }> = {
                ...currentTarget,
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
              syncTransformControlAxisVisibility(transformControls, nextTarget, transformModeRef.current)
              transformControls.attach(clickedIfcProxy)
              transformControls.visible = true
              transformControls.enabled = true
              clickedIfcProxy.updateMatrixWorld(true)
              ;(clickedIfcProxy.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
                Array.from(clickedIfcProxy.matrixWorld.elements)
              selectedTargetRef.current = nextTarget
              syncTransformSelectionState(nextTarget, `${params.reason}_same_proxy`, { attachGizmo: true })
              activeSceneBeforeClear.renderer.render(
                activeSceneBeforeClear.scene,
                activeSceneBeforeClear.camera as import('three').PerspectiveCamera,
              )
              logIfcMove('pick_existing_proxy_fast_path', {
                modelId: clickedIfcEditTarget.modelId,
                localId: clickedIfcEditTarget.localId,
                hitLocalId,
                localIds: proxyLocalIds,
                reason: params.reason,
              })
              onIfcElementSelectRef.current?.(selectedElement)
              emitCoordinates(clickedIfcProxy.position)
              return true
            }
            await clearPreviousSelection(clickedIfcProxy, params.nextIfcLocalId ?? hitLocalId, {
              skipOverlayPurge: true,
              skipPendingSaveSync: true,
              skipRegistryRehide: true,
              skipTransformDetach: true,
            })
            if (isStalePick()) {
              await consumePendingIfcSelectionRestore(
                undefined,
                [],
                `selection_switch_atomic_restore_stale_after_${params.reason}`,
              )
              logIfcMove('pick_discarded_stale_after_existing_proxy_clear', {
                pickSequence,
                hitLocalId,
                reason: params.reason,
              })
              return true
            }
            const activeScene = sceneRef.current
            if (!activeScene) return true
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
              reason: params.reason,
              forceRender: false,
            })
            await consumePendingIfcSelectionRestore(
              clickedIfcEditTarget.modelId,
              proxyLocalIds,
              `selection_switch_atomic_restore_${params.reason}`,
            )
            await rehideMovedIfcProxyRegistry(activeScene, params.reason, { forceRender: false })
            syncTransformControlAxisVisibility(transformControls, nextTarget, transformModeRef.current)
            transformControls.attach(clickedIfcProxy)
            transformControls.visible = true
            transformControls.enabled = true
            clickedIfcProxy.updateMatrixWorld(true)
            ;(clickedIfcProxy.userData as { ifcEditProxyWorldMatrix?: number[] }).ifcEditProxyWorldMatrix =
              Array.from(clickedIfcProxy.matrixWorld.elements)
            selectedTargetRef.current = nextTarget
            syncTransformSelectionState(nextTarget, `${params.reason}_attach_success`, { attachGizmo: true })
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
              reason: params.reason,
            })
            onIfcElementSelectRef.current?.(selectedElement)
            emitCoordinates(clickedIfcProxy.position)
            return true
          }

          const clickedIfcProxy = ifcEditHit?.object
            ? findIfcEditableRoot(ifcEditHit.object, ifcEditGroup)
            : null
          if (clickedIfcProxy?.userData?.ifcEditTarget) {
            const didAttachExistingProxy = await attachExistingIfcProxySelection(clickedIfcProxy, {
              reason: 'pick_existing_proxy',
            })
            if (didAttachExistingProxy) return
          }

          const runIfcRaycast = async () => {
            const activeSceneForRaycast = sceneRef.current
            const fragmentPick = activeSceneForRaycast
              ? await safeIfcFragmentRaycast(
                activeSceneForRaycast,
                { camera, mouse: screenMouse, dom: renderer.domElement },
                'pick',
              )
              : null
            const fastPick = await thatOpenRaycaster.castRay({ position: normalizedMouse }).catch((error) => {
              console.warn('[editor] IFC 보조 raycast 실패', { reason: 'pick_ndc', error })
              return null
            })
            const fastPickScreen = !fastPick
              ? await thatOpenRaycaster.castRay({ position: screenMouse }).catch((error) => {
                console.warn('[editor] IFC 보조 raycast 실패', { reason: 'pick_screen', error })
                return null
              })
              : null
            const primaryModelId = activeSceneForRaycast?.modelId ?? sceneRef.current?.modelId
            const filterPrimaryIfcPick = (pick: IfcRaycastPick | null) => {
              const pickedModelId = pick?.fragments?.modelId
              if (!pickedModelId || !primaryModelId) return pick
              return normalizeRootModelId(pickedModelId, primaryModelId) === primaryModelId ? pick : null
            }
            const fastPickIfc = filterPrimaryIfcPick(fastPick as IfcRaycastPick | null)
            const fastPickScreenIfc = filterPrimaryIfcPick(fastPickScreen as IfcRaycastPick | null)
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
              const activeSceneForMovedProxyLookup = sceneRef.current
              const movedProxyItemMappedLocalIds = Number.isFinite(resolvedIfcPick.itemId) && activeSceneForMovedProxyLookup
                ? await resolveLocalIdsFromItemIds(activeSceneForMovedProxyLookup, pickedModelId, [resolvedIfcPick.itemId as number])
                : []
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_moved_proxy_lookup',
                )
                logIfcMove('pick_discarded_stale_after_moved_proxy_lookup', {
                  pickSequence,
                  hitLocalId: resolvedIfcPick.localId,
                })
                return
              }
              const movedProxyCandidateLocalIds = Array.from(new Set<number>(
                [
                  resolvedIfcPick.localId,
                  ...movedProxyItemMappedLocalIds,
                  ...resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
                    hitLocalId: resolvedIfcPick.localId,
                    localId: resolvedIfcPick.localId,
                    itemMappedLocalIds: movedProxyItemMappedLocalIds,
                  }),
                ].filter((value): value is number => Number.isFinite(value)),
              ))
              const currentSelectedTarget = selectedTargetRef.current
              const currentSelectedProxy = currentSelectedTarget?.source === 'ifc'
                ? currentSelectedTarget.object as IfcEditableObject3D | undefined
                : undefined
              const currentSelectedEditTarget = currentSelectedProxy?.userData?.ifcEditTarget
              const currentMovedProxyRecord = activeSceneForMovedProxyLookup && currentSelectedProxy && isMovedIfcProxyObject(currentSelectedProxy)
                ? Array.from(movedIfcProxyRegistryRef.current.values()).find((record) => (
                  record.object === currentSelectedProxy
                  && normalizeRootModelId(rawPickedModelId, activeSceneForMovedProxyLookup.modelId) === record.rootModelId
                )) ?? null
                : null
              const movedProxyCandidateIdSet = new Set(movedProxyCandidateLocalIds)
              const hitMatchesCurrentMovedProxyLocalIds = Boolean(
                currentMovedProxyRecord?.hideLocalIds.some((localId) => movedProxyCandidateIdSet.has(localId)),
              )
              const hitMatchesCurrentMovedProxyItemId = Boolean(
                Number.isFinite(resolvedIfcPick.itemId)
                && Number.isFinite(currentSelectedEditTarget?.hitItemId)
                && resolvedIfcPick.itemId === currentSelectedEditTarget?.hitItemId
              )
              const currentMovedProxyMatchBy = hitMatchesCurrentMovedProxyLocalIds
                ? 'localId'
                : hitMatchesCurrentMovedProxyItemId
                  ? 'itemId'
                  : null
              if (
                currentSelectedTarget?.source === 'ifc'
                && currentSelectedProxy
                && currentMovedProxyRecord
                && currentMovedProxyMatchBy == null
              ) {
                logIfcMove('pick_current_moved_proxy_fragment_noop_rejected', {
                  pickSequence,
                  rawPickedModelId,
                  pickedModelId,
                  hitLocalId: resolvedIfcPick.localId,
                  hitItemId: Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : null,
                  candidateLocalIds: movedProxyCandidateLocalIds,
                  registryKey: currentMovedProxyRecord.key,
                  registryLocalIds: currentMovedProxyRecord.hideLocalIds,
                  reason: 'candidate_ids_do_not_match_current_proxy',
                })
              }
              if (
                currentSelectedTarget?.source === 'ifc'
                && currentSelectedProxy
                && currentMovedProxyRecord
                && currentMovedProxyMatchBy
              ) {
                currentSelectedProxy.visible = true
                const attachedObject = (transformControls as unknown as { object?: Object3D | null }).object
                const isAlreadyAttached = attachedObject === currentSelectedProxy
                  && transformControls.visible
                  && transformControls.enabled
                if (isAlreadyAttached) {
                  logIfcMove('pick_current_moved_proxy_fragment_noop', {
                    pickSequence,
                    rawPickedModelId,
                    pickedModelId,
                    hitLocalId: resolvedIfcPick.localId,
                    hitItemId: Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : null,
                    candidateLocalIds: movedProxyCandidateLocalIds,
                    matchBy: currentMovedProxyMatchBy,
                    registryKey: currentMovedProxyRecord.key,
                    registryLocalIds: currentMovedProxyRecord.hideLocalIds,
                  })
                } else {
                  syncTransformControlAxisVisibility(transformControls, currentSelectedTarget, transformModeRef.current)
                  transformControls.attach(currentSelectedProxy)
                  transformControls.visible = true
                  transformControls.enabled = true
                  selectedTargetRef.current = currentSelectedTarget
                  syncTransformSelectionState(
                    currentSelectedTarget,
                    'pick_current_moved_proxy_fragment_reattach',
                    { attachGizmo: true },
                  )
                  logIfcMove('pick_current_moved_proxy_fragment_reattach', {
                    pickSequence,
                    rawPickedModelId,
                    pickedModelId,
                    hitLocalId: resolvedIfcPick.localId,
                    hitItemId: Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : null,
                    candidateLocalIds: movedProxyCandidateLocalIds,
                    matchBy: currentMovedProxyMatchBy,
                    registryKey: currentMovedProxyRecord.key,
                    registryLocalIds: currentMovedProxyRecord.hideLocalIds,
                  })
                }
                emitCoordinates(currentSelectedProxy.position)
                return
              }
              const movedProxyRecord = activeSceneForMovedProxyLookup
                ? findMovedIfcProxyRecordByCandidateIds(
                  activeSceneForMovedProxyLookup,
                  pickedModelId,
                  movedProxyCandidateLocalIds,
                )
                : null
              if (movedProxyRecord) {
                logIfcMove('pick_fragment_redirect_moved_proxy', {
                  pickSequence,
                  rawPickedModelId,
                  pickedModelId,
                  hitLocalId: resolvedIfcPick.localId,
                  hitItemId: Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : null,
                  candidateLocalIds: movedProxyCandidateLocalIds,
                  registryKey: movedProxyRecord.key,
                  registryLocalIds: movedProxyRecord.hideLocalIds,
                })
                const didAttachMovedProxy = await attachExistingIfcProxySelection(movedProxyRecord.object, {
                  localIds: movedProxyRecord.hideLocalIds,
                  selectedElement: movedProxyRecord.element,
                  reason: 'pick_fragment_moved_proxy',
                  nextIfcLocalId: resolvedIfcPick.localId,
                })
                if (didAttachMovedProxy) return
              }
              logIfcMove('pick_ifc_prepare_start', {
                pickSequence,
                rawPickedModelId,
                pickedModelId,
                hitLocalId: resolvedIfcPick.localId,
                hitItemId: Number.isFinite(resolvedIfcPick.itemId) ? resolvedIfcPick.itemId : null,
              })
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
              const sanitizedItemMappedLocalIds = sanitizeMappedLocalIds(
                'pick',
                pickedModelId,
                resolvedIfcPick.localId,
                rawItemMappedLocalIds,
              )
              const itemMappedLocalIds = constrainMappedLocalIdsToSelectedElement(
                'pick',
                pickedModelId,
                resolvedIfcPick.localId,
                selectedExpressId,
                sanitizedItemMappedLocalIds,
              )
              const proxyLocalIds = resolveIfcCanonicalLocalIds(canonicalIdMapRef.current, {
                hitLocalId: resolvedIfcPick.localId,
                localId: selectedLocalId,
                expressId: selectedExpressId,
                itemMappedLocalIds,
              })
              const moveScopeLocalIds = Array.from(new Set<number>((
                itemMappedLocalIds.length > 0
                  ? itemMappedLocalIds
                  : [resolvedIfcPick.localId, selectedLocalId]
              ).filter(Number.isFinite)))
              registerCanonicalIds(selectedExpressId, moveScopeLocalIds)
              const editability = activeScene
                ? await resolveEditableIfcTargets(activeScene, pickedModelId, moveScopeLocalIds)
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
              const requiredEditableIds = moveScopeLocalIds
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
                  moveScopeLocalIds,
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
              if (!containsAllIds(editability.editableLocalIds, requiredEditableIds) && editability.editableLocalIds.length === 0) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_partial_coverage',
                )
                logIfcMove('pick_blocked_partial_coverage', {
                  modelId: pickedModelId,
                  hitLocalId: resolvedIfcPick.localId,
                  requiredEditableIds,
                  moveScopeLocalIds,
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
              if (!containsAllIds(editability.editableLocalIds, requiredEditableIds)) {
                logIfcMove('pick_partial_coverage_continue_with_editable_subset', {
                  modelId: pickedModelId,
                  hitLocalId: resolvedIfcPick.localId,
                  requiredEditableIds,
                  moveScopeLocalIds,
                  editableLocalIds: editability.editableLocalIds,
                })
              }
              logIfcMove('pick_ifc_prepare_done', {
                pickSequence,
                modelId: editability.modelId,
                hitLocalId: resolvedIfcPick.localId,
                proxyLocalIds,
                moveScopeLocalIds,
                itemMappedLocalIds,
                editableLocalIds: editability.editableLocalIds,
              })
              nextTarget.modelId = editability.modelId
              const existingMovedProxyRecord = activeScene
                ? findMovedIfcProxyRecord(activeScene, editability.modelId, editability.editableLocalIds)
                : null
              logIfcMove('pick_ifc_atomic_swap_start', {
                pickSequence,
                modelId: editability.modelId,
                hitLocalId: resolvedIfcPick.localId,
                existingMovedProxy: Boolean(existingMovedProxyRecord),
              })
              const currentTargetBeforeSwap = selectedTargetRef.current
              const previousIfcTargetForCleanup =
                currentTargetBeforeSwap?.source === 'ifc' &&
                currentTargetBeforeSwap.object &&
                currentTargetBeforeSwap.hitLocalId !== resolvedIfcPick.localId
                  ? currentTargetBeforeSwap
                  : null
              const previousIfcTargetWasMovedProxy = previousIfcTargetForCleanup
                ? isMovedIfcProxyObject(previousIfcTargetForCleanup.object)
                : false
              const previousDeferredLocalIds = previousIfcTargetForCleanup
                ? Array.from(new Set<number>(
                  (
                    (previousIfcTargetForCleanup.object as IfcEditableObject3D | undefined)?.userData?.ifcEditTarget?.localIds
                    ?? [previousIfcTargetForCleanup.hitLocalId, previousIfcTargetForCleanup.localId]
                  ).filter(Number.isFinite),
                ))
                : []
              const previousMovedProxyRecord = previousIfcTargetForCleanup && activeScene
                ? findMovedIfcProxyRecord(activeScene, previousIfcTargetForCleanup.modelId, previousDeferredLocalIds)
                : null
              const shouldRestorePreviousIfcModel = Boolean(
                previousIfcTargetForCleanup &&
                !previousIfcTargetForCleanup.keepModelHiddenAfterCommit &&
                !previousIfcTargetWasMovedProxy &&
                !previousMovedProxyRecord,
              )
              logIfcMove('pick_ifc_previous_target_decision', {
                pickSequence,
                hasPreviousIfcTarget: Boolean(previousIfcTargetForCleanup),
                previousModelId: previousIfcTargetForCleanup?.modelId ?? null,
                previousLocalId: previousIfcTargetForCleanup?.localId ?? null,
                previousHitLocalId: previousIfcTargetForCleanup?.hitLocalId ?? null,
                previousKeepModelHiddenAfterCommit: previousIfcTargetForCleanup
                  ? Boolean(previousIfcTargetForCleanup.keepModelHiddenAfterCommit)
                  : null,
                previousIsMovedProxy: previousIfcTargetWasMovedProxy,
                previousHasMovedRegistryRecord: Boolean(previousMovedProxyRecord),
                previousRestoreModelVisibility: shouldRestorePreviousIfcModel,
                previousCleanupDeferred: Boolean(previousIfcTargetForCleanup),
                ifcMoveDirty: ifcMoveDirtyRef.current,
                ifcCommitInFlight: ifcCommitInFlightRef.current,
                nextModelId: editability.modelId,
                nextHitLocalId: resolvedIfcPick.localId,
              })
              if (previousIfcTargetForCleanup) {
                logIfcMove('pick_ifc_previous_proxy_kept_until_swap', {
                  pickSequence,
                  previousModelId: previousIfcTargetForCleanup.modelId,
                  previousLocalId: previousIfcTargetForCleanup.localId,
                  previousHitLocalId: previousIfcTargetForCleanup.hitLocalId,
                  deferredLocalIds: previousDeferredLocalIds,
                  keepModelHiddenAfterCommit: Boolean(previousIfcTargetForCleanup.keepModelHiddenAfterCommit),
                  isMovedProxy: previousIfcTargetWasMovedProxy,
                  hasMovedRegistryRecord: Boolean(previousMovedProxyRecord),
                  restoreModelVisibility: shouldRestorePreviousIfcModel,
                  cleanupDeferred: true,
                })
                if (!shouldRestorePreviousIfcModel) {
                  logIfcMove('pick_ifc_skip_previous_restore_moved_registry', {
                    pickSequence,
                    previousModelId: previousIfcTargetForCleanup.modelId,
                    previousLocalId: previousIfcTargetForCleanup.localId,
                    previousHitLocalId: previousIfcTargetForCleanup.hitLocalId,
                    deferredLocalIds: previousDeferredLocalIds,
                    registryKey: previousMovedProxyRecord?.key ?? null,
                    keepModelHiddenAfterCommit: Boolean(previousIfcTargetForCleanup.keepModelHiddenAfterCommit),
                    isMovedProxy: previousIfcTargetWasMovedProxy,
                  })
                }
                logIfcMove('pick_ifc_previous_restore_decision', {
                  pickSequence,
                  previousModelId: previousIfcTargetForCleanup.modelId,
                  previousLocalId: previousIfcTargetForCleanup.localId,
                  previousHitLocalId: previousIfcTargetForCleanup.hitLocalId,
                  deferredLocalIds: previousDeferredLocalIds,
                  keepModelHiddenAfterCommit: Boolean(previousIfcTargetForCleanup.keepModelHiddenAfterCommit),
                  isMovedProxy: previousIfcTargetWasMovedProxy,
                  hasMovedRegistryRecord: Boolean(previousMovedProxyRecord),
                  restoreModelVisibility: shouldRestorePreviousIfcModel,
                  cleanupDeferred: true,
                })
                logIfcMove('pick_ifc_defer_previous_proxy_cleanup', {
                  pickSequence,
                  previousModelId: previousIfcTargetForCleanup.modelId,
                  previousLocalId: previousIfcTargetForCleanup.localId,
                  previousHitLocalId: previousIfcTargetForCleanup.hitLocalId,
                  deferredLocalIds: previousDeferredLocalIds,
                  restoreModelVisibility: shouldRestorePreviousIfcModel,
                  nextModelId: editability.modelId,
                  nextHitLocalId: resolvedIfcPick.localId,
                })
              } else if (currentTargetBeforeSwap) {
                await clearPreviousSelection(undefined, resolvedIfcPick.localId, {
                  skipOverlayPurge: true,
                  skipRegistryRehide: true,
                  skipTransformDetach: true,
                })
              }
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_atomic_clear',
                )
                logIfcMove('pick_ifc_atomic_swap_stale', {
                  pickSequence,
                  hitLocalId: resolvedIfcPick.localId,
                  stage: 'after_atomic_clear',
                })
                return
              }
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
                {
                  deferVisibility: true,
                  deferTransformAttach: true,
                },
              )
              if (isStalePick()) {
                await consumePendingIfcSelectionRestore(
                  undefined,
                  [],
                  'selection_switch_atomic_restore_stale_after_attach',
                )
                logIfcMove('pick_ifc_atomic_swap_stale', {
                  pickSequence,
                  hitLocalId: resolvedIfcPick.localId,
                  stage: 'after_attach',
                })
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
              editableObject.visible = true
              await applyIfcSelectionVisibility(sceneRef.current as ThatOpenSceneState, {
                modelId: editability.modelId,
                localIds: editability.editableLocalIds.length > 0
                  ? editability.editableLocalIds
                  : [resolvedIfcPick.localId].filter(Number.isFinite),
                proxyObject: editableObject,
                mode: 'proxy',
                proxyOpacity: 1,
                reason: 'pick_new_proxy',
                skipCoreUpdate: true,
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
                { skipCoreUpdate: true },
              )
              const activeSceneForRegistryRehide = sceneRef.current
              if (activeSceneForRegistryRehide) {
                await rehideMovedIfcProxyRegistry(activeSceneForRegistryRehide, 'pick_new_proxy', {
                  forceRender: false,
                  skipCoreUpdate: true,
                })
              }
              syncTransformControlAxisVisibility(transformControls, nextTarget, transformModeRef.current)
              transformControls.attach(editableObject)
              transformControls.visible = true
              transformControls.enabled = true
              const activeSceneAfterNewProxyPick = sceneRef.current
              if (activeSceneAfterNewProxyPick) {
                const fragmentsCore = activeSceneAfterNewProxyPick.fragments.core as {
                  update?: (force?: boolean) => Promise<void> | void
                }
                if (typeof fragmentsCore.update === 'function') {
                  logIfcMove('pick_ifc_transaction_core_update_start', {
                    pickSequence,
                    modelId: editability.modelId,
                    hitLocalId: resolvedIfcPick.localId,
                  })
                  await Promise.resolve(fragmentsCore.update(true)).catch((error) => {
                    logIfcMove('pick_ifc_transaction_core_update_failed', {
                      pickSequence,
                      modelId: editability.modelId,
                      hitLocalId: resolvedIfcPick.localId,
                      error: error instanceof Error ? error.message : String(error),
                    })
                  })
                  logIfcMove('pick_ifc_transaction_core_update_done', {
                    pickSequence,
                    modelId: editability.modelId,
                    hitLocalId: resolvedIfcPick.localId,
                  })
                }
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
              if (
                previousIfcTargetForCleanup &&
                previousIfcTargetForCleanup.object &&
                previousIfcTargetForCleanup.object !== editableObject &&
                shouldRestorePreviousIfcModel
              ) {
                scheduleDeferredIfcProxyCleanup(previousIfcTargetForCleanup, previousDeferredLocalIds, {
                  reason: 'pick_ifc_previous_proxy',
                  restoreModelVisibility: true,
                  pickSequence,
                  nextModelId: editability.modelId,
                  nextHitLocalId: resolvedIfcPick.localId,
                })
              }
              ifcMoveLifecycleRef.current = {
                phase: 'idle',
                targetKey: null,
                lastError: null,
              }
              logIfcMove('pick_ifc_atomic_swap_done', {
                pickSequence,
                modelId: editability.modelId,
                hitLocalId: resolvedIfcPick.localId,
                editableLocalIds: editability.editableLocalIds,
                reusedMovedProxy: Boolean(existingMovedProxyRecord),
              })
              logIfcMove('pick_ifc_emit_selection', {
                pickSequence,
                modelId: editability.modelId,
                localId: selectedElement.expressId ?? selectedLocalId,
                hitLocalId: resolvedIfcPick.localId,
                selectedId: selectedElement.id,
                selectedName: selectedElement.name,
                hasObject: Boolean(editableObject),
              })
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
              selectedTransformSignature: getElementTransformSignature(libraryElement),
            }
            syncTransformSelectionState(selectedTargetRef.current, 'pick_library_attach_success', { attachGizmo: true })
            syncTransformControlAxisVisibility(transformControls, selectedTargetRef.current, transformModeRef.current)
            if (isObjectInSceneGraph(world.scene.three, libraryRoot)) {
              transformControls.attach(libraryRoot)
              transformControls.visible = true
              transformControls.enabled = true
            } else {
              transformControls.detach()
              transformControls.visible = false
              transformControls.enabled = false
            }
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
        handleDoubleClick = (event: MouseEvent) => {
          void createCommentPinFromPointer(event)
        }
        pointerDownDom.addEventListener('dblclick', handleDoubleClick, true)

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
        resetIfcLocalRevisionState('ifc_revision_load_success')
        // fragments.core.update 가 끝난 시점에 web-ifc 메시가 실제로 채워지므로,
        // 이 시점에서 모델 박스를 측정하고 그 floor 위치에 그리드를 깐다.
        const fragmentBox = new THREE.Box3().setFromObject(fragmentModel.object)
        const fragmentSize = new THREE.Vector3()
        const fragmentCenter = new THREE.Vector3()
        if (!fragmentBox.isEmpty()) {
          fragmentBox.getSize(fragmentSize)
          fragmentBox.getCenter(fragmentCenter)
        } else {
          fragmentSize.set(1, 1, 1)
          fragmentCenter.set(0, 0, 0)
        }
        // 카메라 시야 안에서 가장자리가 보이지 않도록 충분히 크게 깔되 셀 크기는 일정하게 유지한다.
        const gridFootprint = Math.max(fragmentSize.x, fragmentSize.z, 1)
        const gridSize = Math.max(gridFootprint * 20, 60)
        const gridDivisions = 100
        const floorGrid = new THREE.GridHelper(gridSize, gridDivisions, 0x9aa3c7, 0xd9ddee)
        floorGrid.name = 'ifc-floor-grid'
        floorGrid.position.set(
          fragmentCenter.x,
          (fragmentBox.isEmpty() ? 0 : fragmentBox.min.y) + 0.01,
          fragmentCenter.z,
        )
        floorGrid.visible = isGridVisibleRef.current
        floorGrid.userData.ignoreRaycast = true
        floorGrid.raycast = () => undefined
        contentGroup.add(floorGrid)
        removeDuplicateSceneGridHelpers(world.scene.three)
        floorGridRef.current = floorGrid
        onIfcElementSelectRef.current?.(null)
        // 최초 로드 시에는 고정 패딩으로 맞추고, 이후 줌 반영은 zoomScale effect에서 처리한다.
        if (cameraStateToRestore) {
          const box = new THREE.Box3().setFromObject(fragmentModel.object)
          const size = new THREE.Vector3()
          box.getSize(size)
          setCameraClipping(world.camera.three, Math.max(size.x, size.y, size.z, 1))
          await restoreCameraState(nextSceneState, cameraStateToRestore)
          world.renderer.three.render(world.scene.three, world.camera.three)
        } else {
          fitObjectWithPadding(THREE, world.camera.three, world.camera.controls, fragmentModel.object, 1.55)
          world.renderer.three.render(world.scene.three, world.camera.three)
        }
        // 파싱된 IFC 층 목록을 상위 컴포넌트로 전달한다.
        onStoreysLoadRef.current?.(storeysWithElements)
        setHasEverBeenReady(true)
        setStatus('ready')
      } catch (error) {
        if (disposed) return
        console.error('[editor] IFC load failed', { ifcUrl, error })
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'IFC model load failed.')
      }
    }

    void loadIfc()
    const deferredIfcProxyCleanupRecords = deferredIfcProxyCleanupRecordsRef.current
    const libraryAssetModelIds = libraryAssetModelIdsRef.current

    return () => {
      const cameraState = sceneRef.current
        ? captureCameraState(sceneRef.current, projectId)
        : null
      if (cameraState) {
        preservedCameraStateRef.current = cameraState
      }
      disposed = true
      if (pendingIfcCommitTimer) {
        window.clearTimeout(pendingIfcCommitTimer)
        pendingIfcCommitTimer = null
      }
      if (handlePointerDown && pointerDownDom) {
        pointerDownDom.removeEventListener('pointerdown', handlePointerDown, true)
      }
      if (handleDoubleClick && pointerDownDom) {
        pointerDownDom.removeEventListener('dblclick', handleDoubleClick, true)
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
      if (cameraControlsWithEvents && cameraControlsRestListener) {
        cameraControlsWithEvents.removeEventListener?.('rest', cameraControlsRestListener)
      }
      try {
        components?.dispose()
      } catch {
        // ThatOpen can throw during renderer cleanup if React has already detached the canvas container.
      }
      sceneRef.current = null
      presetGroupRef.current = null
      libraryAssetModelIds.clear()
      pinMarkerGroupRef.current = null
      floorGridRef.current = null
      resetTransformInteractionRef.current = null
      if (deferredHierarchySelectionTimerRef.current !== null) {
        window.clearTimeout(deferredHierarchySelectionTimerRef.current)
        deferredHierarchySelectionTimerRef.current = null
      }
      deferredHierarchySelectionRef.current = null
      handledIfcSelectionRequestTokenRef.current = 0
      handledLibrarySelectionRequestTokenRef.current = 0
      ifcPsetMetricsRef.current = { byId: {}, byName: {} }
      elementIdsByStoreyRef.current = new Map()
      canonicalIdMapRef.current = createEmptyIfcCanonicalIdMap()
      selectedTargetRef.current = null
      deferredIfcProxyCleanupRecords.clear()
      syncTransformSelectionState(null, 'scene_dispose')
      dispatchTransformRuntimeAction(
        { type: 'CANCEL_TRANSFORM', reason: 'scene_disposed' },
        'scene_dispose',
      )
      dispatchTransformRuntimeAction({ type: 'CLEANUP' }, 'scene_dispose_cleanup')
    }
    // IFC scene setup is intentionally keyed only by the loaded model identity.
    // Runtime handlers above read current values through refs to avoid rebuilding the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ifcUrl, projectId])

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
    if (!libraryDropRequest) return
    if (libraryDropRequest.token <= handledLibraryDropTokenRef.current) return
    handledLibraryDropTokenRef.current = libraryDropRequest.token
    if (isEditingLocked) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const bounds = sceneState.renderer.domElement.getBoundingClientRect()
    const isInsideCanvas =
      libraryDropRequest.clientX >= bounds.left &&
      libraryDropRequest.clientX <= bounds.right &&
      libraryDropRequest.clientY >= bounds.top &&
      libraryDropRequest.clientY <= bounds.bottom
    if (!isInsideCanvas) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const run = async () => {
      const normalizedMouse = toNormalizedMouse(
        sceneState.three,
        bounds,
        libraryDropRequest.clientX,
        libraryDropRequest.clientY,
      )
      const screenMouse = new sceneState.three.Vector2(libraryDropRequest.clientX, libraryDropRequest.clientY)
      const raycaster = new sceneState.three.Raycaster()
      raycaster.setFromCamera(normalizedMouse, sceneState.camera)
      const fragmentHit = await safeIfcFragmentRaycast(
        sceneState,
        {
          camera: sceneState.camera,
          mouse: screenMouse,
          dom: sceneState.renderer.domElement,
        },
        'library_drop',
      )
      const hitPoint = fragmentHit?.point
      const toPresetLocal = (worldPoint: import('three').Vector3) => (
        presetGroup.worldToLocal(worldPoint.clone())
      )
      const positionPatch = resolveLibraryDropPositionPatch({
        THREE: sceneState.three,
        raycaster,
        hitPoint,
        toLocal: toPresetLocal,
      })
      onResolveLibraryDrop?.(libraryDropRequest.token, positionPatch)
    }

    void run().catch((error) => {
      console.warn('[editor] IFC 라이브러리 드롭 위치 계산 실패', {
        token: libraryDropRequest.token,
        error,
      })
      onResolveLibraryDrop?.(libraryDropRequest.token)
    })
  }, [isEditingLocked, libraryDropRequest, onResolveLibraryDrop, safeIfcFragmentRaycast])

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
      const targetIds = ids
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
    const pendingRequest = deferredHierarchySelectionRef.current
    const isDeferredRetry = pendingRequest?.kind === 'ifc'
      && pendingRequest.token === ifcElementSelectionRequestToken
      && pendingRequest.localId === requestedIfcElementLocalId
    if (ifcElementSelectionRequestToken <= handledIfcSelectionRequestTokenRef.current && !isDeferredRetry) return
    const sceneState = sceneRef.current
    if (!sceneState) return
    let isCancelled = false

        const selectRequestedIfcElement = async () => {
          try {
            const runtimeState = transformRuntimeStateRef.current
            if (isRuntimeTransformLocked()) {
              deferredHierarchySelectionRef.current = {
                kind: 'ifc',
                token: ifcElementSelectionRequestToken,
                localId: requestedIfcElementLocalId,
              }
              handledLibrarySelectionRequestTokenRef.current = libraryElementSelectionRequestToken
              logIfcMove('requested_select_ifc_deferred_transform_active', {
                requestedIfcElementLocalId,
                token: ifcElementSelectionRequestToken,
                phase: runtimeState.phase,
              })
              return
            }
            if (isDeferredRetry) {
              deferredHierarchySelectionRef.current = null
            }
            handledIfcSelectionRequestTokenRef.current = ifcElementSelectionRequestToken
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
          {
            deferVisibility: true,
            deferTransformAttach: true,
          },
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
          editableObject.visible = true
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
          syncTransformControlAxisVisibility(sceneState.transformControls, nextTarget, transformModeRef.current)
          sceneState.transformControls.attach(editableObject)
          sceneState.transformControls.visible = true
          sceneState.transformControls.enabled = true
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
    hierarchySelectionRetryTick,
    isMovedIfcProxyObject,
    libraryElementSelectionRequestToken,
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
    const pendingRequest = deferredHierarchySelectionRef.current
    const isDeferredRetry = pendingRequest?.kind === 'library'
      && pendingRequest.token === libraryElementSelectionRequestToken
      && pendingRequest.id === requestedLibraryElementId
    if (libraryElementSelectionRequestToken <= handledLibrarySelectionRequestTokenRef.current && !isDeferredRetry) return
    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) return
    let isCancelled = false

    const selectRequestedLibraryElement = async () => {
      try {
        const runtimeState = transformRuntimeStateRef.current
        if (isRuntimeTransformLocked()) {
          deferredHierarchySelectionRef.current = {
            kind: 'library',
            token: libraryElementSelectionRequestToken,
            id: requestedLibraryElementId,
          }
          handledIfcSelectionRequestTokenRef.current = ifcElementSelectionRequestToken
          logIfcMove('requested_select_library_deferred_transform_active', {
            requestedLibraryElementId,
            token: libraryElementSelectionRequestToken,
            phase: runtimeState.phase,
          })
          return
        }
        if (isDeferredRetry) {
          deferredHierarchySelectionRef.current = null
        }
        handledLibrarySelectionRequestTokenRef.current = libraryElementSelectionRequestToken
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
          selectedTransformSignature: getElementTransformSignature(libraryElement),
        }
        selectedTargetRef.current = nextTarget
        syncTransformSelectionState(nextTarget, 'requested_select_library_success', { attachGizmo: true })
        syncTransformControlAxisVisibility(sceneState.transformControls, nextTarget, transformModeRef.current)
        if (isObjectInSceneGraph(sceneState.scene, libraryRoot)) {
          sceneState.transformControls.attach(libraryRoot)
          sceneState.transformControls.visible = true
          sceneState.transformControls.enabled = true
        } else {
          sceneState.transformControls.detach()
          sceneState.transformControls.visible = false
          sceneState.transformControls.enabled = false
        }
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
    hierarchySelectionRetryTick,
    ifcElementSelectionRequestToken,
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
    if (!cameraViewPresetCommand) return
    if (cameraViewPresetCommand.token <= handledCameraPresetTokenRef.current) return
    handledCameraPresetTokenRef.current = cameraViewPresetCommand.token

    const sceneState = sceneRef.current
    if (!sceneState) return

    const THREE = sceneState.three
    const focusObject = selectedTargetRef.current?.object ?? sceneState.ifcObject
    const box = new THREE.Box3().setFromObject(focusObject)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    if (box.isEmpty()) {
      center.set(0, 0, 0)
      size.set(1, 1, 1)
    } else {
      box.getCenter(center)
      box.getSize(size)
    }

    const maxSize = Math.max(size.x, size.y, size.z, 1)
    const distance = maxSize * 2.2
    const nextPosition = new THREE.Vector3()
    const nextUp = new THREE.Vector3(0, 1, 0)

    if (cameraViewPresetCommand.preset === 'top') {
      nextPosition.set(center.x, center.y + distance, center.z + 0.001)
      nextUp.set(0, 0, -1)
    } else if (cameraViewPresetCommand.preset === 'front') {
      nextPosition.set(center.x, center.y + distance * 0.15, center.z + distance)
    } else if (cameraViewPresetCommand.preset === 'side') {
      nextPosition.set(center.x + distance, center.y + distance * 0.15, center.z)
    } else {
      nextPosition.set(center.x + distance, center.y + distance * 0.65, center.z + distance)
    }

    sceneState.camera.up.copy(nextUp)
    const controls = sceneState.cameraControls as {
      setLookAt?: (
        x: number,
        y: number,
        z: number,
        targetX: number,
        targetY: number,
        targetZ: number,
        enableTransition?: boolean,
      ) => Promise<void> | void
      target?: { copy: (value: import('three').Vector3) => void }
      update?: () => void
    } | null

    if (controls?.setLookAt) {
      void controls.setLookAt(
        nextPosition.x,
        nextPosition.y,
        nextPosition.z,
        center.x,
        center.y,
        center.z,
        true,
      )
    } else {
      sceneState.camera.position.copy(nextPosition)
      sceneState.camera.lookAt(center)
      controls?.target?.copy(center)
      controls?.update?.()
    }

    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [cameraViewPresetCommand])

  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    const target = selectedTargetRef.current
    if (!target) return
    const currentColorSignature = getElementColorSignature(selectedIfcElement)
    if (target.selectedColorSignature === currentColorSignature) return
    logIfcMove('selected_ifc_element_color_effect', {
      targetSource: target.source,
      targetLocalId: target.source === 'ifc' ? target.localId : null,
      targetHitLocalId: target.source === 'ifc' ? target.hitLocalId : null,
      hasObject: Boolean(target.object),
      previousSignature: target.selectedColorSignature ?? null,
      nextSignature: currentColorSignature,
      selectedId: selectedIfcElement?.id ?? null,
      selectedName: selectedIfcElement?.name ?? null,
    })
    target.selectedColorSignature = currentColorSignature

    if (target.source === 'library') {
      applyObjectColor(sceneState.three, target.object, selectedIfcElement?.color)
      if (selectedIfcElement?.color) {
        updateLibraryPresetData(target.object, { color: selectedIfcElement.color })
        const preset = getLibraryPresetFromObject(target.object as LibraryObject3D)
        if (preset) onLibraryElementChangeRef.current?.(preset.id, { color: selectedIfcElement.color })
      }
      applyLibraryVisibilityByStorey()
      sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
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
  }, [applyLibraryVisibilityByStorey, logIfcMove, selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement?.material) return
    const currentMaterialSignature = getElementMaterialSignature(selectedIfcElement)
    if (target.selectedMaterialSignature === currentMaterialSignature) return
    logIfcMove('selected_ifc_element_material_effect', {
      targetSource: target.source,
      targetLocalId: target.source === 'ifc' ? target.localId : null,
      targetHitLocalId: target.source === 'ifc' ? target.hitLocalId : null,
      hasObject: Boolean(target.object),
      previousSignature: target.selectedMaterialSignature ?? null,
      nextSignature: currentMaterialSignature,
      selectedId: selectedIfcElement.id,
      selectedName: selectedIfcElement.name,
    })
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
  }, [applyLibraryVisibilityByStorey, logIfcMove, selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement?.roofShape) return
    const currentShapeSignature = getElementShapeSignature(selectedIfcElement)
    if (target.selectedShapeSignature === currentShapeSignature) return

    if (target.source === 'library') {
      if (selectedIfcElement.source !== 'library') return
      const libraryObject = target.object as LibraryObject3D
      const preset = getLibraryPresetFromObject(libraryObject)
      target.selectedShapeSignature = currentShapeSignature
      if (!preset || preset.roofShape === selectedIfcElement.roofShape) return

      updateLibraryPresetData(libraryObject, { roofShape: selectedIfcElement.roofShape })
      onLibraryElementChangeRef.current?.(preset.id, { roofShape: selectedIfcElement.roofShape })
      applyLibraryVisibilityByStorey()
      sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
      return
    }

    if (target.source === 'ifc' && target.object) {
      target.selectedShapeSignature = currentShapeSignature
      const editable = target.object as IfcEditableObject3D
      const editTarget = editable.userData.ifcEditTarget
      const element = editTarget?.element
      if (!editTarget || !element) return
      editable.userData.ifcEditTarget = {
        ...editTarget,
        element: {
          ...element,
          roofShape: selectedIfcElement.roofShape,
          properties: {
            ...element.properties,
            RoofShape: selectedIfcElement.roofShape,
          },
        },
      }
    }
  }, [applyLibraryVisibilityByStorey, selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || target.source !== 'library' || !selectedIfcElement) return
    if (selectedIfcElement.source !== 'library') return
    const currentTransformSignature = getElementTransformSignature(selectedIfcElement)
    if (target.selectedTransformSignature === currentTransformSignature) return

    const object = target.object as LibraryObject3D
    const { three: THREE } = sceneState
    const nextWorldPosition = new THREE.Vector3()
    object.getWorldPosition(nextWorldPosition)
    if (Number.isFinite(selectedIfcElement.positionX)) nextWorldPosition.x = selectedIfcElement.positionX as number
    if (Number.isFinite(selectedIfcElement.positionY)) nextWorldPosition.y = selectedIfcElement.positionY as number
    if (Number.isFinite(selectedIfcElement.positionZ)) nextWorldPosition.z = selectedIfcElement.positionZ as number

    if (object.parent) {
      object.position.copy(object.parent.worldToLocal(nextWorldPosition.clone()))
    } else {
      object.position.copy(nextWorldPosition)
    }

    const hasRotationPatch = (
      Number.isFinite(selectedIfcElement.rotationX) ||
      Number.isFinite(selectedIfcElement.rotationY) ||
      Number.isFinite(selectedIfcElement.rotationZ)
    )
    if (hasRotationPatch) {
      const currentWorldQuaternion = new THREE.Quaternion()
      object.getWorldQuaternion(currentWorldQuaternion)
      const currentWorldEuler = new THREE.Euler().setFromQuaternion(currentWorldQuaternion, 'XYZ')
      const nextWorldEuler = new THREE.Euler(
        Number.isFinite(selectedIfcElement.rotationX)
          ? ((selectedIfcElement.rotationX as number) * Math.PI) / 180
          : currentWorldEuler.x,
        Number.isFinite(selectedIfcElement.rotationY)
          ? ((selectedIfcElement.rotationY as number) * Math.PI) / 180
          : currentWorldEuler.y,
        Number.isFinite(selectedIfcElement.rotationZ)
          ? ((selectedIfcElement.rotationZ as number) * Math.PI) / 180
          : currentWorldEuler.z,
        'XYZ',
      )
      const nextLocalQuaternion = new THREE.Quaternion().setFromEuler(nextWorldEuler)
      if (object.parent) {
        const parentWorldQuaternion = new THREE.Quaternion()
        object.parent.getWorldQuaternion(parentWorldQuaternion)
        nextLocalQuaternion.premultiply(parentWorldQuaternion.invert())
      }
      object.quaternion.copy(nextLocalQuaternion)
    }

    object.updateMatrixWorld(true)
    updateLibraryPresetData(object, {
      position: {
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
      },
      rotation: {
        x: object.rotation.x,
        y: object.rotation.y,
        z: object.rotation.z,
      },
    })
    const preset = getLibraryPresetFromObject(object)
    if (preset) {
      onLibraryElementChangeRef.current?.(preset.id, {
        position: {
          x: object.position.x,
          y: object.position.y,
          z: object.position.z,
        },
        rotation: {
          x: object.rotation.x,
          y: object.rotation.y,
          z: object.rotation.z,
        },
      })
    }
    target.selectedTransformSignature = currentTransformSignature
    updateTransformControlsIfSupported(sceneState.transformControls)
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement) return
    const currentSignature = getElementDimensionSignature(selectedIfcElement)
    if (target.selectedSignature === currentSignature) return
    logIfcMove('selected_ifc_element_dimension_effect', {
      targetSource: target.source,
      targetLocalId: target.source === 'ifc' ? target.localId : null,
      targetHitLocalId: target.source === 'ifc' ? target.hitLocalId : null,
      hasObject: Boolean(target.object),
      previousSignature: target.selectedSignature ?? null,
      nextSignature: currentSignature,
      selectedId: selectedIfcElement.id,
      selectedName: selectedIfcElement.name,
      lengthMm: selectedIfcElement.lengthMm ?? null,
      heightMm: selectedIfcElement.heightMm ?? null,
      thicknessMm: selectedIfcElement.thicknessMm ?? null,
    })
    target.selectedSignature = currentSignature

    const { three: THREE } = sceneState
    if (target.source === 'library') {
      const libraryObject = target.object as LibraryObject3D
      const preset = getLibraryPresetFromObject(libraryObject)
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
      if (![nextScaleX, nextScaleY, nextScaleZ].every((value) => Number.isFinite(value) && value > 0)) return
      target.object.scale.set(nextScaleX, nextScaleY, nextScaleZ)
      target.object.updateMatrixWorld(true)
      const dimensions = formatLibraryPresetDimensions(
        selectedIfcElement.lengthMm,
        selectedIfcElement.heightMm,
        selectedIfcElement.thicknessMm,
      )
      const libraryPatch: Partial<ThreeDLibraryPreset> = {
        lengthMm: selectedIfcElement.lengthMm,
        heightMm: selectedIfcElement.heightMm,
        thicknessMm: selectedIfcElement.thicknessMm,
        scale: { x: nextScaleX, y: nextScaleY, z: nextScaleZ },
        ...(dimensions ? { dimensions } : {}),
      }
      updateLibraryPresetData(target.object, libraryPatch)
      if (preset) onLibraryElementChangeRef.current?.(preset.id, libraryPatch)
      applyLibraryVisibilityByStorey()
      updateTransformControlsIfSupported(sceneState.transformControls)
      sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
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
  }, [applyLibraryVisibilityByStorey, logIfcMove, selectedIfcElement?.lengthMm, selectedIfcElement?.heightMm, selectedIfcElement?.thicknessMm, selectedIfcElement])

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
    syncTransformControlAxisVisibility(sceneState.transformControls, selectedTarget, transformMode)
    if (isObjectInSceneGraph(sceneState.scene, selectedObject as Object3D | undefined)) {
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

  /**
   * 라이브러리 IFC 원본 파일을 fetch하고 배치 기준점을 보정한 뒤 Uint8Array로 캐시한다.
   * 같은 에셋을 여러 번 배치해도 네트워크 요청과 텍스트 보정은 한 번만 수행한다.
   */
  const loadLibraryAssetBytes = useCallback((preset: ThreeDLibraryPreset): Promise<Uint8Array | null> => {
    const assetIfcUrl = preset.assetIfcUrl?.trim() || toIfcLibraryAssetUrl(preset.assetIfc)
    const cacheKey = getLibraryAssetCacheKey(preset)
    if (!assetIfcUrl || !cacheKey) return Promise.resolve(null)
    const cached = libraryAssetBytesCacheRef.current.get(cacheKey)
    if (cached) return cached

    const loadPromise = (async () => {
      try {
        const response = await fetch(assetIfcUrl, { cache: 'force-cache' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const assetText = await response.text()
        const normalizedAssetText = translateIfcLibraryAssetPlacements(assetText, preset)
        return new TextEncoder().encode(normalizedAssetText)
      } catch (error) {
        console.warn('[editor] IFC 라이브러리 에셋 파일 로드 실패', {
          presetId: preset.id,
          assetIfcUrl,
          error,
        })
        return null
      }
    })()

    libraryAssetBytesCacheRef.current.set(cacheKey, loadPromise)
    return loadPromise
  }, [])

  /**
   * ThatOpen fragments 모델을 직접 씬에 노출하지 않고 Three.js mesh 템플릿으로 변환한다.
   * 템플릿은 숨겨진 fragments 모델을 즉시 폐기한 뒤 clone 가능한 Object3D로 캐시에 보관한다.
   */
  const loadLibraryAssetTemplate = useCallback(async (
    sceneState: ThatOpenSceneState,
    preset: ThreeDLibraryPreset,
  ): Promise<Object3D | null> => {
    const assetIfcUrl = preset.assetIfcUrl?.trim() || toIfcLibraryAssetUrl(preset.assetIfc)
    const cacheKey = getLibraryAssetCacheKey(preset)
    if (!assetIfcUrl || !cacheKey) return null

    const cached = libraryAssetObjectCacheRef.current.get(cacheKey)
    if (cached) return cached

    const loadPromise = (async () => {
      const assetBytes = await loadLibraryAssetBytes(preset)
      if (!assetBytes) return null
      const modelId = toLibraryAssetModelId(preset, `template-${preset.sourceAssetId ?? preset.id}`)

      try {
        const model = await sceneState.ifcLoader.load(
          new Uint8Array(assetBytes),
          true,
          modelId,
          {
            userData: {
              libraryAsset: true,
              sourceAssetId: preset.sourceAssetId ?? preset.id,
              assetIfcUrl,
              instanceId: preset.id,
            },
          },
        )
        const fragmentModel = model as unknown as LoadedLibraryFragmentModel
        detachAndHideObjectTree(fragmentModel.object)
        fragmentModel.useCamera(sceneState.camera)

        const editor = (sceneState.fragments.core as import('@thatopen/fragments').FragmentsModels & {
          editor?: import('@thatopen/fragments').Editor
        }).editor
        const localIds = await (
          fragmentModel.getItemsIdsWithGeometry?.()
          ?? fragmentModel.getLocalIds?.()
          ?? Promise.resolve([])
        )
        const uniqueLocalIds = Array.from(new Set(localIds.filter(Number.isFinite)))
        if (!editor || uniqueLocalIds.length === 0) {
          await disposeLibraryAssetModel(sceneState, modelId, 'library_asset_no_mesh_conversion_source')
          return null
        }

        const assetGroup = new sceneState.three.Group()
        assetGroup.name = `${preset.name} IFC asset mesh template`
        const chunkSize = 80
        for (let start = 0; start < uniqueLocalIds.length; start += chunkSize) {
          const chunk = uniqueLocalIds.slice(start, start + chunkSize)
          const elements = await editor.getElements(modelId, chunk).catch(() => [])
          for (const element of elements) {
            const meshesPromise = (element as { getMeshes?: () => Promise<Object3D | null> }).getMeshes?.()
            const meshes = meshesPromise ? await meshesPromise.catch(() => null) : null
            if (!meshes) continue
            const cloned = meshes.clone(true)
            cloneMaterialsForLibraryInstance(cloned)
            assetGroup.add(cloned)
          }
        }

        await disposeLibraryAssetModel(sceneState, modelId, 'library_asset_converted_to_three_mesh_template')
        return assetGroup.children.length > 0 ? assetGroup : null
      } catch (error) {
        await disposeLibraryAssetModel(sceneState, modelId, 'library_asset_template_error')
        libraryAssetObjectCacheRef.current.delete(cacheKey)
        console.warn('[editor] IFC 라이브러리 에셋 템플릿 생성 실패', {
          presetId: preset.id,
          assetIfcUrl,
          error,
        })
        return null
      }
    })()

    libraryAssetObjectCacheRef.current.set(cacheKey, loadPromise)
    return loadPromise
  }, [disposeLibraryAssetModel, loadLibraryAssetBytes])

  /**
   * 캐시된 IFC 에셋 템플릿에서 씬 배치용 인스턴스를 생성한다.
   * 인스턴스별 재질을 복제해 색상/재질 편집이 다른 배치 객체에 전파되지 않도록 한다.
   */
  const loadLibraryAssetInstance = useCallback(async (
    sceneState: ThatOpenSceneState,
    preset: ThreeDLibraryPreset,
  ): Promise<Object3D | null> => {
    const template = await loadLibraryAssetTemplate(sceneState, preset)
    if (!template) return null
    const instance = template.clone(true)
    cloneMaterialsForLibraryInstance(instance)
    instance.name = `${preset.name} IFC asset mesh clone`
    return instance
  }, [loadLibraryAssetTemplate])

  /**
   * 패널에 노출되는 기본 IFC 에셋을 미리 로드한다.
   * 실제 배치 시 placeholder가 오래 보이는 시간을 줄이기 위한 성능 보조 effect다.
   */
  useEffect(() => {
    const sceneState = sceneRef.current
    if (status !== 'ready' || !sceneState) return

    let cancelled = false
    const preloadPresets = applyIfcLibraryManifestToPresets(PRESETS, ifcLibraryManifest)
      .filter(shouldUseIfcAssetForPreset)

    const preloadAssets = async () => {
      for (const preset of preloadPresets) {
        if (cancelled) return
        await loadLibraryAssetTemplate(sceneState, preset)
      }
    }

    void preloadAssets()
    return () => {
      cancelled = true
    }
  }, [ifcLibraryManifest, loadLibraryAssetTemplate, status])

  /**
   * React 상태의 라이브러리 프리셋 목록을 Three.js 씬과 동기화한다.
   * 먼저 placeholder를 배치하고, 비동기 IFC mesh 변환이 끝나면 같은 index의 실제 에셋으로 교체한다.
   */
  useEffect(() => {
    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) return

    const { three: THREE } = sceneState
    const manifestLibraryElements = applyIfcLibraryManifestToPresets(libraryElements, ifcLibraryManifest)
    const syncToken = libraryAssetSyncTokenRef.current + 1
    libraryAssetSyncTokenRef.current = syncToken
    logIfcMove('library_sync_start', {
      source: 'ifc',
      presetCount: manifestLibraryElements.length,
      existingScenePresetCount: presetGroup.children.length,
      presetIds: manifestLibraryElements.map((preset) => preset.id),
    })
    const selectedLibraryPreset =
      selectedTargetRef.current?.source === 'library'
        ? getLibraryPresetFromObject(selectedTargetRef.current.object as LibraryObject3D)
        : undefined
    const existingChildren = [...presetGroup.children] as LibraryObject3D[]
    const existingChildByPresetId = new Map<string, LibraryObject3D>()
    existingChildren.forEach((child) => {
      const preset = getLibraryPresetFromObject(child)
      if (preset?.id) existingChildByPresetId.set(preset.id, child)
    })
    const preservedChildren = new Set<Object3D>()
    presetGroup.clear()

    manifestLibraryElements.forEach((preset, index) => {
      const shouldUseIfcAsset = shouldUseIfcAssetForPreset(preset)
      const existingChild = existingChildByPresetId.get(preset.id)
      const canReuseLoadedIfcAsset = shouldUseIfcAsset && existingChild?.userData?.ifcAssetLoaded === true
      const presetMesh = canReuseLoadedIfcAsset && existingChild
        ? refreshIfcAssetPresetMeshLayout(
          THREE,
          existingChild as import('three').Group,
          preset,
          index,
          sceneState.worldUnitsPerMm,
        )
        : shouldUseIfcAsset
          ? createIfcAssetPresetPlaceholder(THREE, preset, index, sceneState.worldUnitsPerMm)
          : createPresetMesh(THREE, preset, index, sceneState.worldUnitsPerMm)
      if (shouldUseIfcAsset && !canReuseLoadedIfcAsset) {
        setIfcAssetPlaceholderPending(presetMesh as LibraryObject3D, true)
      }
      if (canReuseLoadedIfcAsset && existingChild) {
        updateLibraryPresetData(existingChild, preset)
        preservedChildren.add(existingChild)
      }
      presetGroup.add(presetMesh)
      if (!preset.position) {
        ensureLibraryPresetOutsideIfc(
          THREE,
          sceneState.ifcObject,
          presetMesh,
          sceneState.worldUnitsPerMm,
        )
      }
    })
    existingChildren.forEach((child) => {
      if (preservedChildren.has(child)) return
      disposeObjectMaterials(THREE, child)
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
          selectedTransformSignature: getElementTransformSignature(libraryElement),
        }
        syncTransformSelectionState(selectedTargetRef.current, 'library_sync_reselect', { attachGizmo: true })
        syncTransformControlAxisVisibility(sceneState.transformControls, selectedTargetRef.current, transformModeRef.current)
        if (isObjectInSceneGraph(sceneState.scene, nextRoot)) {
          sceneState.transformControls.attach(nextRoot)
          sceneState.transformControls.visible = true
          sceneState.transformControls.enabled = true
        } else {
          sceneState.transformControls.detach()
          sceneState.transformControls.visible = false
          sceneState.transformControls.enabled = false
        }
      } else {
        selectedTargetRef.current = null
        syncTransformSelectionState(null, 'library_sync_reselect_miss')
      }
    }
    // 라이브러리 목록 재구성 직후 현재 층/겹쳐보기 규칙을 다시 반영한다.
    // (재구성 과정에서 child.visible 기본값이 true로 초기화되는 타이밍 이슈 보정)
    applyLibraryVisibilityByStorey()
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)

    const assetPresets = manifestLibraryElements
      .map((preset, index) => ({ preset, index }))
      .filter(({ preset }) => shouldUseIfcAssetForPreset(preset))
    if (assetPresets.length === 0) {
      void disposeLoadedLibraryAssetModels(sceneState, 'library_sync_no_assets')
      return
    }

    const runAssetSync = async () => {
      await disposeLoadedLibraryAssetModels(sceneState, 'library_sync_rebuild')
      for (const { preset, index } of assetPresets) {
        if (libraryAssetSyncTokenRef.current !== syncToken || presetGroupRef.current !== presetGroup) return
        const assetModelId = toLibraryAssetModelId(preset, preset.id)
        const existingChild = presetGroup.children[index] as LibraryObject3D | undefined
        const existingPreset = existingChild ? getLibraryPresetFromObject(existingChild) : null
        if (
          existingChild
          && existingPreset?.id === preset.id
          && existingChild.userData?.ifcAssetLoaded === true
        ) {
          continue
        }

        const assetObject = await loadLibraryAssetInstance(sceneState, preset)
        if (!assetObject) {
          const fallbackChild = presetGroup.children[index] as LibraryObject3D | undefined
          const fallbackPreset = fallbackChild ? getLibraryPresetFromObject(fallbackChild) : null
          if (fallbackChild && fallbackPreset?.id === preset.id && fallbackChild.userData?.ifcAssetPlaceholder === true) {
            setIfcAssetPlaceholderPending(fallbackChild, false)
            applyLibraryVisibilityByStorey()
            sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
          }
          continue
        }
        if (libraryAssetSyncTokenRef.current !== syncToken || presetGroupRef.current !== presetGroup) {
          await disposeLibraryAssetModel(sceneState, assetModelId, 'library_sync_stale_asset')
          return
        }
        const currentChild = presetGroup.children[index] as LibraryObject3D | undefined
        const currentPreset = currentChild ? getLibraryPresetFromObject(currentChild) : null
        if (!currentChild || currentPreset?.id !== preset.id) {
          await disposeLibraryAssetModel(sceneState, assetModelId, 'library_sync_replaced_before_asset_ready')
          continue
        }

        const assetMesh = createIfcAssetPresetMesh(
          THREE,
          preset,
          assetObject,
          index,
          sceneState.worldUnitsPerMm,
          false,
        )
        assetMesh.userData = {
          ...assetMesh.userData,
          libraryAssetModelId: assetModelId,
        }
        assetMesh.traverse((child) => {
          ;(child as LibraryObject3D).userData = {
            ...(child as LibraryObject3D).userData,
            libraryAssetModelId: assetModelId,
          }
        })
        if (preset.material) {
          applyObjectMaterial(THREE, assetMesh, preset.material, preset.color, sceneState.materialsManager)
        } else {
          applyObjectColor(THREE, assetMesh, preset.color)
        }
        const isReplacingSelectedLibraryTarget =
          selectedTargetRef.current?.source === 'library' &&
          getLibraryPresetFromObject(selectedTargetRef.current.object as LibraryObject3D)?.id === preset.id
        if (isReplacingSelectedLibraryTarget) {
          sceneState.transformControls.detach()
          sceneState.transformControls.visible = false
          sceneState.transformControls.enabled = false
        }
        disposeObjectMaterials(THREE, currentChild)
        presetGroup.remove(currentChild)
        presetGroup.add(assetMesh)
        const appended = presetGroup.children.pop()
        if (appended) {
          presetGroup.children.splice(index, 0, appended)
        }
        assetMesh.updateMatrixWorld(true)
        await Promise.resolve(sceneState.fragments.core.update(true)).catch((error) => {
          console.warn('[editor] IFC 라이브러리 에셋 렌더 업데이트 실패', {
            presetId: preset.id,
            assetIfc: preset.assetIfc,
            assetIfcUrl: preset.assetIfcUrl,
            error,
          })
        })
        refreshIfcAssetPresetMeshLayout(
          THREE,
          assetMesh,
          preset,
          index,
          sceneState.worldUnitsPerMm,
        )
        if (!preset.position) {
          ensureLibraryPresetOutsideIfc(
            THREE,
            sceneState.ifcObject,
            assetMesh,
            sceneState.worldUnitsPerMm,
          )
        }
        assetMesh.updateMatrixWorld(true)

        if (!hasRenderableObject(THREE, assetMesh)) {
          console.warn('[editor] IFC 라이브러리 에셋이 렌더 가능한 형상이 없어 placeholder로 복구합니다.', {
            presetId: preset.id,
            sourceAssetId: preset.sourceAssetId,
            assetIfc: preset.assetIfc,
            assetIfcUrl: preset.assetIfcUrl,
          })
          presetGroup.remove(assetMesh)
          disposeObjectMaterials(THREE, assetMesh)
          await disposeLibraryAssetModel(sceneState, assetModelId, 'library_asset_not_renderable')
          const placeholder = createIfcAssetPresetPlaceholder(THREE, preset, index, sceneState.worldUnitsPerMm)
          setIfcAssetPlaceholderPending(placeholder as LibraryObject3D, false)
          if (!preset.position) {
            ensureLibraryPresetOutsideIfc(
              THREE,
              sceneState.ifcObject,
              placeholder,
              sceneState.worldUnitsPerMm,
            )
          }
          presetGroup.add(placeholder)
          const placeholderAppended = presetGroup.children.pop()
          if (placeholderAppended) {
            presetGroup.children.splice(index, 0, placeholderAppended)
          }
          if (isReplacingSelectedLibraryTarget) {
            const libraryElement = getLibraryElementInfo(placeholder as LibraryObject3D)
            selectedTargetRef.current = {
              source: 'library',
              object: placeholder,
              selectedSignature: getElementDimensionSignature(libraryElement),
              selectedColorSignature: getElementColorSignature(libraryElement),
              selectedMaterialSignature: getElementMaterialSignature(libraryElement),
              selectedTransformSignature: getElementTransformSignature(libraryElement),
            }
            syncTransformSelectionState(selectedTargetRef.current, 'library_asset_sync_placeholder_restore', {
              attachGizmo: true,
            })
            syncTransformControlAxisVisibility(sceneState.transformControls, selectedTargetRef.current, transformModeRef.current)
            sceneState.transformControls.attach(placeholder)
            sceneState.transformControls.visible = true
            sceneState.transformControls.enabled = true
          }
          continue
        }

        if (selectedTargetRef.current?.source === 'library') {
          const selectedPreset = getLibraryPresetFromObject(selectedTargetRef.current.object as LibraryObject3D)
          if (selectedPreset?.id === preset.id) {
            const libraryElement = getLibraryElementInfo(assetMesh as LibraryObject3D)
            selectedTargetRef.current = {
              source: 'library',
              object: assetMesh,
              selectedSignature: getElementDimensionSignature(libraryElement),
              selectedColorSignature: getElementColorSignature(libraryElement),
              selectedMaterialSignature: getElementMaterialSignature(libraryElement),
              selectedTransformSignature: getElementTransformSignature(libraryElement),
            }
            syncTransformSelectionState(selectedTargetRef.current, 'library_asset_sync_reselect', { attachGizmo: true })
            syncTransformControlAxisVisibility(sceneState.transformControls, selectedTargetRef.current, transformModeRef.current)
            if (isObjectInSceneGraph(sceneState.scene, assetMesh)) {
              sceneState.transformControls.attach(assetMesh)
              sceneState.transformControls.visible = true
              sceneState.transformControls.enabled = true
            } else {
              sceneState.transformControls.detach()
              sceneState.transformControls.visible = false
              sceneState.transformControls.enabled = false
            }
          }
        }
      }
      if (libraryAssetSyncTokenRef.current !== syncToken) return
      applyLibraryVisibilityByStorey()
      sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
      logIfcMove('library_asset_sync_done', {
        source: 'ifc',
        assetPresetCount: assetPresets.length,
        scenePresetCount: presetGroup.children.length,
      })
    }

    const queuedAssetSync = libraryAssetSyncQueueRef.current.catch(() => undefined).then(runAssetSync)
    libraryAssetSyncQueueRef.current = queuedAssetSync.then(() => undefined, () => undefined)
    void queuedAssetSync.catch((error) => {
      console.warn('[editor] IFC 라이브러리 에셋 동기화 실패', { error })
    })
  }, [
    applyLibraryVisibilityByStorey,
    disposeLibraryAssetModel,
    disposeLoadedLibraryAssetModels,
    ifcLibraryManifest,
    libraryElements,
    loadLibraryAssetInstance,
    logIfcMove,
    syncTransformSelectionState,
  ])

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#F0F2F9]" onContextMenu={handleIfcContextMenu}>
      <div ref={containerRef} tabIndex={0} className="h-full w-full outline-none" />

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-6 text-center backdrop-blur-sm">
          <div>
            <p className="text-[13px] font-black text-[#991B1B]">IFC 모델을 표시하지 못했습니다.</p>
            <p className="mt-2 text-[11px] font-medium text-[#6B7A99]">{errorMessage}</p>
          </div>
        </div>
      )}
      {status === 'loading' && !hasEverBeenReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-6 text-center backdrop-blur-sm">
          <p className="text-[13px] font-black text-[#3B45B3]">IFC 모델을 불러오는 중입니다.</p>
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

      {wallContextMenu && (
        <div
          className="fixed z-[9999] min-w-[150px] rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg"
          style={{ top: wallContextMenu.y, left: wallContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <div className="max-w-[220px] truncate border-b border-[#E2E8F0] px-3 py-1.5 text-[11px] font-semibold text-[#64748B]">
            {wallContextMenu.label}
          </div>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-[12px] text-[#1F2937] hover:bg-[#F0F2FF] hover:text-[#3B45B3]"
            onClick={() => {
              onSelectWallForChat?.(wallContextMenu.wallId)
              setWallContextMenu(null)
            }}
          >
            채팅에서 선택
          </button>
        </div>
      )}
    </div>
  )
}
