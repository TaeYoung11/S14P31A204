import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommentPin3DCreatePosition, FloorCommentPin, IfcElementChange, IfcElementInfo } from '../../types'
import type { FloorLayerOverlay } from '../../types'
import { FLOOR_MM_PER_PX } from '../../constants'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import { buildFloorPlan3DGroup } from '../../utils/floorPlanTo3D'
import { captureCanvasWithBackground } from '../../utils/canvasPreviewCapture'
import { captureFocusedThreePreview } from '../../utils/threePreviewCapture'
import type { ThreeDLibraryDropRequest, ThreeDLibraryPreset } from './threeDLibrary.types'
import { getFloorPlanElementInfo, isSelectableThreeDComponent } from './threeDSelection.utils'
import {
  allowsCtrlWheelZoom,
  isDeleteTool,
  isSelectionInteractionTool,
  isSelectionTool,
} from './threeDInteraction.utils'
import { normalizeSnapIntervalMm, toRotationSnapRadians } from '../../utils/threeDSnap.utils'
import { disposeObject3DResources, findGroupRootFromObject } from './threeDCanvasObject.utils'
import { mergeSelectionByKey } from './threeDSelectionCollection.utils'
import ThreeDMarqueeOverlay from './ThreeDMarqueeOverlay'
import { resolveLibraryDropPositionPatch } from './threeDLibraryDrop.utils'
import { applyTransformSnap, type TransformSnapControl } from './threeDTransformSnap.utils'
import { applyScaleSnapByMm } from './threeDScaleSnap.utils'
import { createGableRoofGeometry } from './threeDRoofGeometry.utils'
import {
  buildFloorDataStableSignature,
  getFloorSelectionPriority,
  preserveSelectedFloorObjects,
  remapFloorSelectionEntries,
  SELECTION_ID_LIKE_PROPERTY_KEYS,
  syncFloorGroupInPlace,
  type FloorHitCandidate,
  type FloorPlanMultiSelectionEntry,
} from './floorPlan3DSceneSync'
import {
  appendUniqueSelectionByKey,
  isPointerInsideBounds,
  isScreenPointInsideRect,
  toNormalizedMouse,
  toScreenRectFromPointers,
  type ScreenRect,
} from './threeDPointerSelection.utils'
import {
  createPresetMesh,
  findLibraryRoot,
  formatLibraryPresetDimensions,
  getLibraryElementInfo,
  getLibraryScaleDimensionPatch,
  getLibraryPresetFromObject,
  updateLibraryPresetData,
  type LibraryObject3D,
} from './thatopen/ifcLibraryMesh'
import { applyObjectColor, applyObjectMaterial, PROJECT_WORLD_UNITS_PER_MM } from './thatopen/ifcMaterials'
import { disposeObjectMaterials, ensureLibraryPresetOutsideIfc, positionPresetGroupBesideIfc } from './thatopen/ifcSceneHelpers'
import { resolveThreeDPinMarkerHit, syncThreeDPinMarkers } from './threeDPinMarkers'

interface FloorPlan3DCanvasProps {
  data: FloorPlan3DData
  overlayLayers?: FloorLayerOverlay[]
  libraryElements?: ThreeDLibraryPreset[]
  commentPins?: FloorCommentPin[]
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  currentUserId?: string | null
  onPinClick?: (id: string) => void
  onPinCreate?: (x: number, y: number, content?: string, threeDPosition?: CommentPin3DCreatePosition) => void
  onPinDelete?: (id: string) => void
  deletingPinId?: string | null
  selectedIfcElement?: IfcElementInfo | null
  preferredSelectedElementId?: string | null
  deleteRequestToken?: number
  isRotationLocked?: boolean
  transformMode?: 'translate' | 'rotate' | 'scale'
  selectedTool?: string
  onLibraryElementChange?: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete?: (id: string) => void
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onIfcElementTransformCommit?: (
    element: IfcElementInfo,
    patch: Omit<IfcElementChange, 'expressId'>,
  ) => void
  libraryDropRequest?: ThreeDLibraryDropRequest | null
  onResolveLibraryDrop?: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  transformSnapEnabled?: boolean
  transformSnapIntervalMm?: number
  isEditingLocked?: boolean
  onPreviewCapture?: (imageUrl: string) => void
}

type ThreeModule = typeof import('three')
type OrbitControlsInstance = import('three/examples/jsm/controls/OrbitControls.js').OrbitControls

type TransformControlsInstance =
  import('three/examples/jsm/controls/TransformControls.js').TransformControls

const PRESET_MOVE_DEBUG = import.meta.env.DEV || import.meta.env.VITE_3D_MOVE_DEBUG === 'true'

const logRoofDebug = (..._args: unknown[]) => {}

const logSelectionDebug = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return
  console.log('[3d-select][FloorPlan3DCanvas]', ...args)
}

/**
 * 2D 평면도 데이터를 Three.js로 즉시 3D 변환하여 표시하는 캔버스.
 * ThatOpen/IFC 없이 순수 Three.js + OrbitControls를 사용한다.
 * 360도 회전, 줌, 패닝을 지원한다.
 * 라이브러리 프리셋 추가 및 TransformControls를 통한 이동을 지원한다.
 */
export function FloorPlan3DCanvas({
  data,
  overlayLayers = [],
  selectedTool = 'selection',
  libraryElements,
  commentPins = [],
  isCollaborationMode = false,
  selectedPinId = null,
  currentUserId = null,
  onPinClick,
  onPinCreate,
  onPinDelete,
  deletingPinId = null,
  selectedIfcElement,
  preferredSelectedElementId = null,
  deleteRequestToken = 0,
  isRotationLocked = false,
  transformMode = 'translate',
  onLibraryElementChange,
  onLibraryElementDelete,
  onIfcElementSelect,
  onIfcElementTransformCommit,
  libraryDropRequest,
  onResolveLibraryDrop,
  cameraViewPresetCommand,
  transformSnapEnabled = true,
  transformSnapIntervalMm = 100,
  isEditingLocked = false,
  onPreviewCapture,
}: FloorPlan3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 렌더 루프/비동기 초기화에서 최신 data를 참조하기 위한 ref 캐시
  const dataRef = useRef(data)
  const overlayLayersRef = useRef(overlayLayers)
  const threeRef = useRef<ThreeModule | null>(null)
  const sceneRef = useRef<import('three').Scene | null>(null)
  const cameraRef = useRef<import('three').PerspectiveCamera | null>(null)
  const rendererRef = useRef<import('three').WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControlsInstance | null>(null)
  const transformControlsRef = useRef<TransformControlsInstance | null>(null)
  const floorGroupRef = useRef<import('three').Group | null>(null)
  const pinMarkerGroupRef = useRef<import('three').Group | null>(null)
  const presetGroupRef = useRef<import('three').Group | null>(null)
  const commentPinsRef = useRef(commentPins)
  const selectedPinIdRef = useRef(selectedPinId)
  const currentUserIdRef = useRef(currentUserId)
  const isCollaborationModeRef = useRef(isCollaborationMode)
  const deletingPinIdRef = useRef(deletingPinId)
  const selectedPresetRef = useRef<LibraryObject3D | null>(null)
  const selectedFloorObjectRef = useRef<import('three').Object3D | null>(null)
  const selectedToolRef = useRef(selectedTool)
  const animationFrameIdRef = useRef(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const handledLibraryDropTokenRef = useRef(0)
  const handledCameraPresetTokenRef = useRef(0)
  const transformModeRef = useRef<'translate' | 'rotate' | 'scale'>(transformMode)
  const rotationLockedRef = useRef(isRotationLocked)
  const isEditingLockedRef = useRef(isEditingLocked)
  const transformSnapEnabledRef = useRef(transformSnapEnabled)
  const transformSnapIntervalMmRef = useRef(transformSnapIntervalMm)
  const isShiftSnapRef = useRef(false)
  const selectedEntriesRef = useRef<FloorPlanMultiSelectionEntry[]>([])
  const multiAnchorRef = useRef<import('three').Object3D | null>(null)
  const multiDragSnapshotRef = useRef<{
    anchorStart: import('three').Vector3
    memberWorldByKey: Map<string, import('three').Vector3>
  } | null>(null)
  const floorDataStableSignatureRef = useRef<string | null>(null)
  const pendingLocalFloorTransformEchoRef = useRef<{
    stableSignature: string | null
    expiresAt: number
  } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const onLibraryElementChangeRef = useRef(onLibraryElementChange)
  const onLibraryElementDeleteRef = useRef(onLibraryElementDelete)
  const onIfcElementSelectRef = useRef(onIfcElementSelect)
  const onIfcElementTransformCommitRef = useRef(onIfcElementTransformCommit)
  const onPinClickRef = useRef(onPinClick)
  const onPinCreateRef = useRef(onPinCreate)
  const onPinDeleteRef = useRef(onPinDelete)
  const onPreviewCaptureRef = useRef(onPreviewCapture)

  useEffect(() => { onLibraryElementChangeRef.current = onLibraryElementChange }, [onLibraryElementChange])
  useEffect(() => { onLibraryElementDeleteRef.current = onLibraryElementDelete }, [onLibraryElementDelete])
  useEffect(() => { onIfcElementSelectRef.current = onIfcElementSelect }, [onIfcElementSelect])
  useEffect(() => { onIfcElementTransformCommitRef.current = onIfcElementTransformCommit }, [onIfcElementTransformCommit])
  useEffect(() => { onPinClickRef.current = onPinClick }, [onPinClick])
  useEffect(() => { onPinCreateRef.current = onPinCreate }, [onPinCreate])
  useEffect(() => { onPinDeleteRef.current = onPinDelete }, [onPinDelete])
  useEffect(() => { onPreviewCaptureRef.current = onPreviewCapture }, [onPreviewCapture])
  useEffect(() => { rotationLockedRef.current = isRotationLocked }, [isRotationLocked])
  useEffect(() => { transformModeRef.current = transformMode }, [transformMode])
  useEffect(() => { selectedToolRef.current = selectedTool }, [selectedTool])
  useEffect(() => { transformSnapEnabledRef.current = transformSnapEnabled }, [transformSnapEnabled])
  useEffect(() => { transformSnapIntervalMmRef.current = transformSnapIntervalMm }, [transformSnapIntervalMm])
  useEffect(() => { commentPinsRef.current = commentPins }, [commentPins])
  useEffect(() => { selectedPinIdRef.current = selectedPinId }, [selectedPinId])
  useEffect(() => { currentUserIdRef.current = currentUserId }, [currentUserId])
  useEffect(() => { isCollaborationModeRef.current = isCollaborationMode }, [isCollaborationMode])
  useEffect(() => { deletingPinIdRef.current = deletingPinId }, [deletingPinId])
  useEffect(() => { overlayLayersRef.current = overlayLayers }, [overlayLayers])

  const markPendingLocalFloorTransformEcho = useCallback(() => {
    if (transformModeRef.current !== 'translate') return
    pendingLocalFloorTransformEchoRef.current = {
      stableSignature: floorDataStableSignatureRef.current,
      expiresAt: performance.now() + 1500,
    }
  }, [])

  const refreshSelectedFloorElementMetadata = useCallback(() => {
    const nextEntries = selectedEntriesRef.current.map((entry) => {
      if (entry.source !== 'floor') return entry
      const nextElement = getFloorPlanElementInfo(entry.object)
      return nextElement ? { ...entry, element: nextElement } : entry
    })
    selectedEntriesRef.current = nextEntries
    const primary = nextEntries[nextEntries.length - 1]
    if (primary?.source === 'floor') {
      onIfcElementSelectRef.current?.(primary.element)
    }
  }, [])

  const syncOrbitPanBinding = useCallback(() => {
    const controls = controlsRef.current as OrbitControlsInstance & {
      mouseButtons?: { LEFT?: number; MIDDLE?: number; RIGHT?: number }
    } | null
    const THREE = threeRef.current
    if (!controls?.mouseButtons || !THREE) return
    controls.mouseButtons.LEFT = selectedToolRef.current === 'hand' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN
  }, [])

  /**
   * 현재 도구 모드와 스냅 상태를 TransformControls에 동기화한다.
   * 로컬 3D는 월드 단위를 meter(0.001 per mm)로 고정해 계산한다.
   */
  const syncTransformSnap = useCallback(() => {
    const tc = transformControlsRef.current as TransformControlsInstance | null
    if (!tc) return
    applyTransformSnap({
      control: tc as TransformSnapControl,
      transformMode: transformModeRef.current,
      snapEnabled: transformSnapEnabledRef.current,
      snapIntervalMm: transformSnapIntervalMmRef.current,
      isShiftSnap: isShiftSnapRef.current,
      worldUnitsPerMm: PROJECT_WORLD_UNITS_PER_MM,
    })
  }, [])

  const captureFocusedPreview = useCallback((): string | null => {
    const THREE = threeRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    const controls = controlsRef.current
    if (!THREE || !scene || !camera || !renderer || !controls) return null

    const focusObjects: import('three').Object3D[] = []
    if (floorGroupRef.current?.children.length) focusObjects.push(floorGroupRef.current)
    if (presetGroupRef.current?.children.length) focusObjects.push(presetGroupRef.current)
    return captureFocusedThreePreview({
      THREE,
      scene,
      camera,
      renderer,
      controls,
      focusObjects,
    })
  }, [])

  const updateTransformSelection = useCallback(() => {
    const THREE = threeRef.current
    const scene = sceneRef.current
    const tc = transformControlsRef.current
    if (!THREE || !scene || !tc) return

    const entries = selectedEntriesRef.current
    if (entries.length === 0) {
      tc.detach()
      tc.visible = false
      tc.enabled = false
      if (multiAnchorRef.current) {
        scene.remove(multiAnchorRef.current)
      }
      multiAnchorRef.current = null
      selectedPresetRef.current = null
      onIfcElementSelectRef.current?.(null)
      return
    }

    const primary = entries[entries.length - 1]
    selectedPresetRef.current = primary.source === 'library' ? (primary.object as LibraryObject3D) : null
    onIfcElementSelectRef.current?.(primary.element)

    if (entries.length === 1) {
      if (isEditingLockedRef.current) {
        tc.detach()
        tc.attach(primary.object)
        tc.visible = true
        tc.enabled = false
        if (multiAnchorRef.current) {
          scene.remove(multiAnchorRef.current)
        }
        multiAnchorRef.current = null
        return
      }
      tc.detach()
      tc.attach(primary.object)
      tc.visible = true
      tc.enabled = true
      if (multiAnchorRef.current) {
        scene.remove(multiAnchorRef.current)
      }
      multiAnchorRef.current = null
      return
    }

    if (multiAnchorRef.current) {
      scene.remove(multiAnchorRef.current)
    }
    if (isEditingLockedRef.current) {
      const lockedAnchor = new THREE.Object3D()
      const lockedCenter = new THREE.Vector3()
      const lockedWorldPosition = new THREE.Vector3()
      entries.forEach((entry) => {
        entry.object.getWorldPosition(lockedWorldPosition)
        lockedCenter.add(lockedWorldPosition)
      })
      lockedCenter.multiplyScalar(1 / entries.length)
      lockedAnchor.position.copy(lockedCenter)
      scene.add(lockedAnchor)
      multiAnchorRef.current = lockedAnchor

      tc.detach()
      tc.attach(lockedAnchor)
      tc.visible = true
      tc.enabled = false
      return
    }
    const anchor = new THREE.Object3D()
    const center = new THREE.Vector3()
    const worldPosition = new THREE.Vector3()
    entries.forEach((entry) => {
      entry.object.getWorldPosition(worldPosition)
      center.add(worldPosition)
    })
    center.multiplyScalar(1 / entries.length)
    anchor.position.copy(center)
    scene.add(anchor)
    multiAnchorRef.current = anchor

    tc.detach()
    tc.attach(anchor)
    tc.visible = true
    tc.enabled = true
  }, [])

  const matchesTargetSelection = useCallback(
    (element: IfcElementInfo, targetIds: Set<string>, targetGlobalId: string | null) => {
      if (targetIds.has(element.id)) return true
      if (element.globalId && targetIds.has(element.globalId)) return true
      if (targetGlobalId && element.globalId === targetGlobalId) return true
      const properties = element.properties ?? {}
      for (const key of SELECTION_ID_LIKE_PROPERTY_KEYS) {
        const value = properties[key]
        if (typeof value === 'string' && targetIds.has(value)) return true
      }
      return false
    },
    [],
  )

  useEffect(() => {
    isEditingLockedRef.current = isEditingLocked
    updateTransformSelection()
  }, [isEditingLocked, updateTransformSelection])

  const logPresetMove = useCallback((event: string, payload?: Record<string, unknown>) => {
    const runtimeDebugEnabled = (() => {
      if (typeof window === 'undefined') return false
      try {
        const search = new URLSearchParams(window.location.search)
        if (search.get('local3dDebug') === '1' || search.get('local3dDebug') === 'true') return true
        if (window.localStorage?.getItem('local3dDebug') === '1') return true
        const runtimeFlag = (window as Window & { __LOCAL3D_PRESET_DEBUG__?: boolean }).__LOCAL3D_PRESET_DEBUG__
        return runtimeFlag === true
      } catch {
        return false
      }
    })()
    const shouldTrace = PRESET_MOVE_DEBUG || runtimeDebugEnabled
    if (!shouldTrace) return
    if (payload) {
      console.log(`[LOCAL3D_PRESET] ${event}`, payload)
      return
    }
    console.log(`[LOCAL3D_PRESET] ${event}`)
  }, [])

  const clearTransformSelection = useCallback(() => {
    const targetTc = transformControlsRef.current
    if (!targetTc) return
    const selectedPreset = selectedPresetRef.current
    logPresetMove('selection_clear', {
      presetId: selectedPreset ? getLibraryPresetFromObject(selectedPreset)?.id ?? null : null,
    })
    targetTc.detach()
    targetTc.visible = false
    targetTc.enabled = false
    selectedPresetRef.current = null
    selectedFloorObjectRef.current = null
    selectedEntriesRef.current = []
    onIfcElementSelectRef.current?.(null)
  }, [logPresetMove])

  useEffect(() => {
    const THREE = threeRef.current
    const markerGroup = pinMarkerGroupRef.current
    if (!THREE || !markerGroup) return
    syncThreeDPinMarkers(THREE, markerGroup, isCollaborationMode ? commentPins : [], {
      selectedPinId,
      currentUserId,
      deletingPinId,
      worldUnitsPerMm: PROJECT_WORLD_UNITS_PER_MM,
    })
  }, [commentPins, currentUserId, deletingPinId, isCollaborationMode, selectedPinId])

  /** 현재 선택된 엔트리(라이브러리/평면도)를 씬에서 제거하고 상태를 초기화한다. */
  const deleteSelectedEntry = useCallback(() => {
    if (isEditingLockedRef.current) return
    const THREE = threeRef.current
    const tc = transformControlsRef.current
    if (!THREE || !tc) return

    const selectedEntry = selectedEntriesRef.current[selectedEntriesRef.current.length - 1]
    if (!selectedEntry) return
    const selected = selectedEntry.object

    tc.detach()
    tc.visible = false
    tc.enabled = false
    selected.parent?.remove(selected)
    disposeObjectMaterials(THREE, selected)
    selectedEntriesRef.current = selectedEntriesRef.current.filter((entry) => entry.object !== selected)
    if (selectedPresetRef.current === selected) {
      selectedPresetRef.current = null
    }
    updateTransformSelection()
    if (selectedEntry.source === 'library') {
      const preset = getLibraryPresetFromObject(selected as LibraryObject3D)
      if (preset) onLibraryElementDeleteRef.current?.(preset.id)
    }
  }, [updateTransformSelection])

  /**
   * rooms/walls 변경 시 씬 전체를 재생성하지 않고 floor 그룹만 교체한다.
   * - 렌더러/카메라/컨트롤은 재사용
   * - 그룹 교체 전 기존 geometry/material을 반드시 dispose
   */
  const rebuildFloorGroup = useCallback(() => {
    const THREE = threeRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!THREE || !scene || !camera || !controls) return

    const previousFloorGroup = floorGroupRef.current
    const previousSelectionEntries = selectedEntriesRef.current
    const hadSelectedFloorEntry = previousSelectionEntries.some((entry) => entry.source === 'floor')
    const shouldFitCameraToFloor = !previousFloorGroup || !hadSelectedFloorEntry

    const nextFloorGroup = buildFloorPlan3DGroup(THREE, dataRef.current, overlayLayersRef.current)

    if (previousFloorGroup) {
      syncFloorGroupInPlace(previousFloorGroup, nextFloorGroup, (object) =>
        disposeObject3DResources(object))
      floorGroupRef.current = previousFloorGroup

      if (hadSelectedFloorEntry) {
        const previousSelectedObjects = previousSelectionEntries.map((entry) => entry.object)
        const remappedSelectionEntries = remapFloorSelectionEntries(previousSelectionEntries, previousFloorGroup)
        const didSelectionObjectChange =
          remappedSelectionEntries.length !== previousSelectionEntries.length ||
          remappedSelectionEntries.some((entry, index) => entry.object !== previousSelectedObjects[index])
        selectedEntriesRef.current = remappedSelectionEntries
        if (didSelectionObjectChange) {
          updateTransformSelection()
        } else {
          const primary = remappedSelectionEntries[remappedSelectionEntries.length - 1]
          if (primary) onIfcElementSelectRef.current?.(primary.element)
        }
      }

      disposeObject3DResources(nextFloorGroup)
      if (shouldFitCameraToFloor) {
        const box = new THREE.Box3().setFromObject(previousFloorGroup)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const maxSize = Math.max(size.x, size.y, size.z, 1)

        camera.position.set(
          center.x + maxSize * 1.6,
          center.y + maxSize * 1.0,
          center.z + maxSize * 1.6,
        )
        camera.near = 0.01
        camera.far = maxSize * 30
        camera.updateProjectionMatrix()
        controls.target.copy(center)
        controls.update()
      }
      return
    }

    const nextSelectionEntries = hadSelectedFloorEntry
      ? preserveSelectedFloorObjects(previousSelectionEntries, nextFloorGroup, (object) =>
        disposeObject3DResources(object))
      : []

    if (previousFloorGroup) {
      scene.remove(previousFloorGroup)
      disposeObject3DResources(previousFloorGroup)
    }

    floorGroupRef.current = nextFloorGroup
    scene.add(nextFloorGroup)

    if (hadSelectedFloorEntry) {
      selectedEntriesRef.current = nextSelectionEntries.length > 0
        ? nextSelectionEntries
        : remapFloorSelectionEntries(previousSelectionEntries, nextFloorGroup)
      updateTransformSelection()
    }

    if (!shouldFitCameraToFloor) return

    const box = new THREE.Box3().setFromObject(nextFloorGroup)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const maxSize = Math.max(size.x, size.y, size.z, 1)

    camera.position.set(
      center.x + maxSize * 1.6,
      center.y + maxSize * 1.0,
      center.z + maxSize * 1.6,
    )
    camera.near = 0.01
    camera.far = maxSize * 30
    camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.update()
  }, [updateTransformSelection])

  // 외부 data 변경을 감지해 floor 그룹만 재구성한다.
  useEffect(() => {
    const nextStableSignature = buildFloorDataStableSignature(data, overlayLayers)
    const pendingEcho = pendingLocalFloorTransformEchoRef.current
    const canConsumeTransformEcho =
      Boolean(floorGroupRef.current) &&
      pendingEcho !== null &&
      pendingEcho.expiresAt >= performance.now() &&
      pendingEcho.stableSignature === floorDataStableSignatureRef.current &&
      pendingEcho.stableSignature === nextStableSignature

    dataRef.current = data
    overlayLayersRef.current = overlayLayers
    floorDataStableSignatureRef.current = nextStableSignature

    if (canConsumeTransformEcho) {
      pendingLocalFloorTransformEchoRef.current = null
      refreshSelectedFloorElementMetadata()
      return
    }

    pendingLocalFloorTransformEchoRef.current = null
    rebuildFloorGroup()
  }, [data, overlayLayers, rebuildFloorGroup, refreshSelectedFloorElementMetadata])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 탭 전환/언마운트 직후 늦게 도착한 async 초기화 결과를 무시하기 위한 취소 플래그
    let cancelled = false
    // cleanup 클로저가 참조할 수 있도록 외부 스코프에 선언한다 (ThatOpenIfcCanvas와 동일 패턴)
    let handlePointerDown: ((event: PointerEvent) => void) | null = null
    let handleDoubleClick: ((event: MouseEvent) => void) | null = null
    let handlePointerMove: ((event: PointerEvent) => void) | null = null
    let handlePointerUp: ((event: PointerEvent) => void) | null = null
    let handleHandCursorDown: ((event: PointerEvent) => void) | null = null
    let handleHandCursorUp: ((event: PointerEvent) => void) | null = null
    let handleKeyDown: ((event: KeyboardEvent) => void) | null = null
    let handleKeyUp: ((event: KeyboardEvent) => void) | null = null
    let handleWheel: ((event: WheelEvent) => void) | null = null

    void (async () => {
      const [THREE, { OrbitControls }, { TransformControls }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/controls/TransformControls.js'),
      ])
      if (cancelled) return
      threeRef.current = THREE

      // ── 씬 초기화 ──
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#f0f2f9')
      sceneRef.current = scene

      const camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / Math.max(container.clientHeight, 1),
        0.01,
        100000,
      )
      cameraRef.current = camera

      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
      renderer.setClearColor('#f0f2f9', 1)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(container.clientWidth, container.clientHeight)
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer
      const syncCanvasCursor = () => {
        renderer.domElement.style.cursor = selectedToolRef.current === 'hand' ? 'grab' : 'default'
      }
      syncCanvasCursor()

      // ── 조명 ──
      scene.add(new THREE.AmbientLight('#ffffff', 0.65))
      const dirLight = new THREE.DirectionalLight('#ffffff', 0.85)
      dirLight.position.set(5, 10, 5)
      scene.add(dirLight)
      const fillLight = new THREE.DirectionalLight('#dde8ff', 0.3)
      fillLight.position.set(-5, 5, -5)
      scene.add(fillLight)

      // ── OrbitControls ──
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.06
      controls.minDistance = 0.3
      controls.maxDistance = 500
      const orbitControls = controls as OrbitControlsInstance & { enableRotate?: boolean }
      orbitControls.enableRotate = !rotationLockedRef.current
      controlsRef.current = controls
      syncOrbitPanBinding()
      syncCanvasCursor()

      // ── 라이브러리 프리셋 그룹 ──
      const presetGroup = new THREE.Group()
      presetGroup.name = 'library-presets'
      scene.add(presetGroup)
      presetGroupRef.current = presetGroup

      const pinMarkerGroup = new THREE.Group()
      pinMarkerGroup.name = 'comment-pins'
      scene.add(pinMarkerGroup)
      pinMarkerGroupRef.current = pinMarkerGroup
      syncThreeDPinMarkers(THREE, pinMarkerGroup, isCollaborationModeRef.current ? commentPinsRef.current : [], {
        selectedPinId: selectedPinIdRef.current,
        currentUserId: currentUserIdRef.current,
        deletingPinId: deletingPinIdRef.current,
        worldUnitsPerMm: PROJECT_WORLD_UNITS_PER_MM,
      })

      // ── TransformControls (프리셋 이동용) ──
      const tc = new TransformControls(camera, renderer.domElement)
      tc.setMode('translate')
      // Move 기즈모 동작을 명시적으로 고정한다.
      const tcConfig = tc as unknown as {
        setSpace?: (space: 'world' | 'local') => void
        showX?: boolean
        showY?: boolean
        showZ?: boolean
      }
      tcConfig.setSpace?.('world')
      tcConfig.showX = true
      tcConfig.showY = true
      tcConfig.showZ = true
      tc.visible = false
      tc.enabled = false
      const tcHelper = tc.getHelper()
      scene.add(tcHelper)
      transformControlsRef.current = tc
      syncTransformSnap()

      const projectToScreen = (object: import('three').Object3D) => {
        const world = new THREE.Vector3()
        object.getWorldPosition(world)
        world.project(camera)
        const bounds = renderer.domElement.getBoundingClientRect()
        return {
          x: ((world.x + 1) * 0.5) * bounds.width + bounds.left,
          y: ((-world.y + 1) * 0.5) * bounds.height + bounds.top,
        }
      }

      const commitSelection = (entries: FloorPlanMultiSelectionEntry[]) => {
        selectedEntriesRef.current = entries
        updateTransformSelection()
      }

      const upsertSelection = (entry: FloorPlanMultiSelectionEntry, append: boolean) => {
        const previous = selectedEntriesRef.current
        if (!append) {
          commitSelection([entry])
          return
        }
        commitSelection(appendUniqueSelectionByKey(previous, entry, (selected) => selected.key))
      }

      const collectMarqueeEntries = (rect: ScreenRect) => {
        const entries: FloorPlanMultiSelectionEntry[] = []
        presetGroup.children.forEach((child) => {
          const root = child as LibraryObject3D
          const element = getLibraryElementInfo(root)
          if (!element || !isSelectableThreeDComponent(element)) return
          const point = projectToScreen(root)
          if (!isScreenPointInsideRect(point, rect)) return
          entries.push({
            key: `library:${element.id}`,
            object: root,
            source: 'library',
            element,
          })
        })
        floorGroupRef.current?.children.forEach((child) => {
          const element = getFloorPlanElementInfo(child)
          if (!element || !isSelectableThreeDComponent(element)) return
          const point = projectToScreen(child)
          if (!isScreenPointInsideRect(point, rect)) return
          entries.push({
            key: `floor:${element.id}`,
            object: child,
            source: 'floor',
            element,
          })
        })
        return entries
      }

      const createCommentPinAtWorldPoint = (point: import('three').Vector3) => {
        const cameraPosition = camera.position
        const threeDPosition: CommentPin3DCreatePosition = {
          worldX: point.x / PROJECT_WORLD_UNITS_PER_MM,
          worldY: point.z / PROJECT_WORLD_UNITS_PER_MM,
          worldZ: point.y / PROJECT_WORLD_UNITS_PER_MM,
          cameraX: cameraPosition.x / PROJECT_WORLD_UNITS_PER_MM,
          cameraY: cameraPosition.z / PROJECT_WORLD_UNITS_PER_MM,
          cameraZ: cameraPosition.y / PROJECT_WORLD_UNITS_PER_MM,
        }
        onPinCreateRef.current?.(
          threeDPosition.worldX / FLOOR_MM_PER_PX,
          threeDPosition.worldY / FLOOR_MM_PER_PX,
          undefined,
          threeDPosition,
        )
      }

      // 드래그 중 OrbitControls 비활성화 + 다중 선택 그룹 이동
      const createCommentPinFromPointer = (event: MouseEvent) => {
        if (!isCollaborationModeRef.current) return
        const bounds = renderer.domElement.getBoundingClientRect()
        if (!isPointerInsideBounds(bounds, event.clientX, event.clientY)) return

        const normalizedMouse = toNormalizedMouse(THREE, bounds, event.clientX, event.clientY)
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(normalizedMouse, camera)
        const pinHits = pinMarkerGroupRef.current
          ? raycaster.intersectObjects(pinMarkerGroupRef.current.children, true)
          : []
        if (resolveThreeDPinMarkerHit(pinHits)) return

        const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
        const floorHit = floorGroupRef.current
          ? raycaster.intersectObjects(floorGroupRef.current.children, true)[0]
          : undefined
        const collaborationHit = [libraryHit, floorHit]
          .filter((hit): hit is import('three').Intersection => Boolean(hit))
          .sort((a, b) => a.distance - b.distance)[0]
        if (!collaborationHit?.point) return
        event.preventDefault()
        event.stopPropagation()
        createCommentPinAtWorldPoint(collaborationHit.point)
      }

      ;(tc as unknown as {
        addEventListener: (type: 'dragging-changed' | 'mouseDown' | 'objectChange', listener: (e?: { value: boolean }) => void) => void
      }).addEventListener('mouseDown', () => {
        const entries = selectedEntriesRef.current
        const anchor = multiAnchorRef.current
        if (entries.length <= 1 || !anchor || transformModeRef.current !== 'translate') return
        const anchorStart = anchor.position.clone()
        const memberWorldByKey = new Map<string, import('three').Vector3>()
        const worldPosition = new THREE.Vector3()
        entries.forEach((entry) => {
          entry.object.getWorldPosition(worldPosition)
          memberWorldByKey.set(entry.key, worldPosition.clone())
        })
        multiDragSnapshotRef.current = { anchorStart, memberWorldByKey }
      })
      ;(tc as unknown as {
        addEventListener: (type: 'dragging-changed' | 'mouseDown' | 'objectChange', listener: (e?: { value: boolean }) => void) => void
      }).addEventListener('objectChange', () => {
        const isTransformSnapActive = transformSnapEnabledRef.current || isShiftSnapRef.current
        const selectedEntries = selectedEntriesRef.current
        const axis = (tc as unknown as { axis?: string | null }).axis
        const shouldSnapAxis = (token: 'X' | 'Y' | 'Z') => (!axis || axis.includes(token))

        if (isTransformSnapActive && selectedEntries.length === 1) {
          if (transformModeRef.current === 'translate') {
            const intervalWorld = normalizeSnapIntervalMm(transformSnapIntervalMmRef.current) * PROJECT_WORLD_UNITS_PER_MM
            if (intervalWorld > 0) {
              const targetObject = selectedEntries[0].object
              const snappedWorldPosition = new THREE.Vector3()
              targetObject.getWorldPosition(snappedWorldPosition)
              if (shouldSnapAxis('X')) snappedWorldPosition.x = Math.round(snappedWorldPosition.x / intervalWorld) * intervalWorld
              if (shouldSnapAxis('Y')) snappedWorldPosition.y = Math.round(snappedWorldPosition.y / intervalWorld) * intervalWorld
              if (shouldSnapAxis('Z')) snappedWorldPosition.z = Math.round(snappedWorldPosition.z / intervalWorld) * intervalWorld
              if (targetObject.parent) {
                const snappedLocalPosition = snappedWorldPosition.clone()
                targetObject.parent.worldToLocal(snappedLocalPosition)
                targetObject.position.copy(snappedLocalPosition)
              } else {
                targetObject.position.copy(snappedWorldPosition)
              }
            }
          } else if (transformModeRef.current === 'rotate') {
            const snapStep = toRotationSnapRadians(transformSnapIntervalMmRef.current)
            if (snapStep > 0) {
              const targetObject = selectedEntries[0].object
              if (shouldSnapAxis('X')) targetObject.rotation.x = Math.round(targetObject.rotation.x / snapStep) * snapStep
              if (shouldSnapAxis('Y')) targetObject.rotation.y = Math.round(targetObject.rotation.y / snapStep) * snapStep
              if (shouldSnapAxis('Z')) targetObject.rotation.z = Math.round(targetObject.rotation.z / snapStep) * snapStep
            }
          }
        }

        const isScaleSnapActive =
          transformModeRef.current === 'scale' &&
          isTransformSnapActive
        if (isScaleSnapActive) {
          if (selectedEntries.length === 1) {
            applyScaleSnapByMm(
              THREE,
              selectedEntries[0].object,
              transformSnapIntervalMmRef.current,
              PROJECT_WORLD_UNITS_PER_MM,
              axis,
            )
          }
        }

        const snapshot = multiDragSnapshotRef.current
        const anchor = multiAnchorRef.current
        const entries = selectedEntriesRef.current
        if (!snapshot || !anchor || entries.length <= 1 || transformModeRef.current !== 'translate') return
        const worldDelta = anchor.position.clone().sub(snapshot.anchorStart)
        entries.forEach((entry) => {
          const startWorld = snapshot.memberWorldByKey.get(entry.key)
          if (!startWorld) return
          const nextWorld = startWorld.clone().add(worldDelta)
          if (entry.object.parent) {
            const nextLocal = nextWorld.clone()
            entry.object.parent.worldToLocal(nextLocal)
            entry.object.position.copy(nextLocal)
          } else {
            entry.object.position.copy(nextWorld)
          }
        })
      })
      let isTransformDragging = false
      ;(tc as unknown as {
        addEventListener: (type: 'dragging-changed' | 'mouseDown' | 'objectChange', listener: (e: { value: boolean }) => void) => void
      }).addEventListener('dragging-changed', (event) => {
        isTransformDragging = event.value
        ;(controls as unknown as { enabled: boolean }).enabled = !event.value
        if (event.value) return

        const entries = selectedEntriesRef.current
        if (entries.length > 1) {
          entries.forEach((entry) => {
            if (entry.source === 'floor') {
              const floorElement = getFloorPlanElementInfo(entry.object)
              if (!floorElement) return
              markPendingLocalFloorTransformEcho()
              onIfcElementTransformCommitRef.current?.(entry.element, {
                positionX: floorElement.positionX,
                positionY: floorElement.positionY,
                positionZ: floorElement.positionZ,
                rotationX: floorElement.rotationX,
                rotationY: floorElement.rotationY,
                rotationZ: floorElement.rotationZ,
                lengthMm: floorElement.lengthMm,
                heightMm: floorElement.heightMm,
                thicknessMm: floorElement.thicknessMm,
                startMm: floorElement.startMm,
                endMm: floorElement.endMm,
              })
              entry.element = floorElement
              return
            }
            const libraryObject = entry.object as LibraryObject3D
            const preset = getLibraryPresetFromObject(libraryObject)
            if (!preset) return
            const patch: Partial<ThreeDLibraryPreset> = {
              position: { x: libraryObject.position.x, y: libraryObject.position.y, z: libraryObject.position.z },
              rotation: { x: libraryObject.rotation.x, y: libraryObject.rotation.y, z: libraryObject.rotation.z },
              scale: { x: libraryObject.scale.x, y: libraryObject.scale.y, z: libraryObject.scale.z },
            }
            onLibraryElementChangeRef.current?.(preset.id, patch)
          })
          multiDragSnapshotRef.current = null
          return
        }

        const primary = entries[entries.length - 1]
        if (!primary) return

        if (primary.source === 'floor') {
          const floorElement = getFloorPlanElementInfo(primary.object)
          if (floorElement) {
            markPendingLocalFloorTransformEcho()
            onIfcElementTransformCommitRef.current?.(primary.element, {
              positionX: floorElement.positionX,
              positionY: floorElement.positionY,
              positionZ: floorElement.positionZ,
              rotationX: floorElement.rotationX,
              rotationY: floorElement.rotationY,
              rotationZ: floorElement.rotationZ,
              lengthMm: floorElement.lengthMm,
              heightMm: floorElement.heightMm,
              thicknessMm: floorElement.thicknessMm,
              startMm: floorElement.startMm,
              endMm: floorElement.endMm,
            })
            primary.element = floorElement
            onIfcElementSelectRef.current?.(floorElement)
          }
          multiDragSnapshotRef.current = null
          return
        }

        const selected = primary.object as LibraryObject3D
        const preset = getLibraryPresetFromObject(selected)
        if (!preset) return

        const patch: Partial<ThreeDLibraryPreset> = {
          position: { x: selected.position.x, y: selected.position.y, z: selected.position.z },
          rotation: { x: selected.rotation.x, y: selected.rotation.y, z: selected.rotation.z },
          scale: { x: selected.scale.x, y: selected.scale.y, z: selected.scale.z },
        }
        if (transformModeRef.current === 'scale') {
          const scalePatch = getLibraryScaleDimensionPatch(selected)
          if (scalePatch) {
            patch.lengthMm = scalePatch.lengthMm
            patch.heightMm = scalePatch.heightMm
            patch.thicknessMm = scalePatch.thicknessMm
            updateLibraryPresetData(selected, scalePatch)
            onIfcElementSelectRef.current?.(getLibraryElementInfo(selected))
          }
        }
        onLibraryElementChangeRef.current?.(preset.id, patch)
      })

      // ── 선택/마퀴 ──
      handlePointerDown = (event: PointerEvent) => {
        if (cancelled) return
        if (event.button !== 0) return
        const isDeleteMode = isDeleteTool(selectedToolRef.current)
        const isSelectionMode = isSelectionTool(selectedToolRef.current)
        const isEditLocked = isEditingLockedRef.current
        const isDeleteEnabled = isDeleteMode && !isEditLocked
        const wasTransformActive = tc.visible && tc.enabled
        const isSelectionEnabledTool =
          isSelectionInteractionTool(selectedToolRef.current) ||
          selectedToolRef.current === 'hand' ||
          selectedToolRef.current === 'rotate' ||
          selectedToolRef.current === 'scale'
        logSelectionDebug('pointerdown:start', {
          tool: selectedToolRef.current,
          isDeleteMode,
          isDeleteEnabled,
          isSelectionMode,
          wasTransformActive,
          isCollaborationMode: isCollaborationModeRef.current,
          isEditingLocked: isEditLocked,
          shiftKey: event.shiftKey,
          clientX: event.clientX,
          clientY: event.clientY,
        })
        if (!isCollaborationModeRef.current && !isSelectionEnabledTool && !wasTransformActive) {
          logSelectionDebug('pointerdown:skip-not-selection-tool', {
            tool: selectedToolRef.current,
          })
          return
        }
        const bounds = renderer.domElement.getBoundingClientRect()
        if (!isPointerInsideBounds(bounds, event.clientX, event.clientY)) {
          logSelectionDebug('pointerdown:skip-outside-canvas', {
            clientX: event.clientX,
            clientY: event.clientY,
            bounds: {
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
            },
          })
          return
        }

        const normalizedMouse = toNormalizedMouse(THREE, bounds, event.clientX, event.clientY)
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(normalizedMouse, camera)
        const pinHits = pinMarkerGroupRef.current
          ? raycaster.intersectObjects(pinMarkerGroupRef.current.children, true)
          : []
        const pinMarkerHit = resolveThreeDPinMarkerHit(pinHits)
        if (pinMarkerHit) {
          logSelectionDebug('pointerdown:pin-hit', {
            pinId: pinMarkerHit.pinId,
            action: pinMarkerHit.action,
            deletingPinId: deletingPinIdRef.current,
          })
          if (pinMarkerHit.action === 'delete') {
            if (deletingPinIdRef.current === pinMarkerHit.pinId) return
            syncCanvasCursor()
            onPinDeleteRef.current?.(pinMarkerHit.pinId)
            return
          }
          onPinClickRef.current?.(pinMarkerHit.pinId)
          return
        }
        const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
        const floorHits = floorGroupRef.current
          ? raycaster.intersectObjects(floorGroupRef.current.children, true)
          : []
        const floorHitCandidates: FloorHitCandidate[] = floorHits
          .map((hit) => {
            if (!floorGroupRef.current) return null
            const root = findGroupRootFromObject(hit.object, floorGroupRef.current)
            if (!root) return null
            const element = getFloorPlanElementInfo(root)
            if (!element || !isSelectableThreeDComponent(element)) return null
            return {
              distance: hit.distance,
              root,
              element,
            } satisfies FloorHitCandidate
          })
          .filter((candidate): candidate is FloorHitCandidate => Boolean(candidate))
        floorHitCandidates.sort((left, right) => {
          const priorityDiff = getFloorSelectionPriority(left.element) - getFloorSelectionPriority(right.element)
          if (priorityDiff !== 0) return priorityDiff
          return left.distance - right.distance
        })
        const bestFloorHit = floorHitCandidates[0] ?? null
        logSelectionDebug('pointerdown:ray-hits', {
          libraryHitDistance: libraryHit?.distance ?? null,
          floorHitDistance: bestFloorHit?.distance ?? null,
          libraryHitObject: libraryHit?.object?.name ?? libraryHit?.object?.type ?? null,
          floorHitObject: bestFloorHit?.root?.name ?? bestFloorHit?.root?.type ?? null,
          floorHitCategory: bestFloorHit?.element?.category ?? null,
          floorHitIfcClass: bestFloorHit?.element?.ifcClass ?? null,
        })
        if (isCollaborationModeRef.current) {
          const collaborationHit = [libraryHit, floorHits[0]]
            .filter((hit): hit is import('three').Intersection => Boolean(hit))
            .sort((a, b) => a.distance - b.distance)[0]
          if (collaborationHit?.point) createCommentPinAtWorldPoint(collaborationHit.point)
          logSelectionDebug('pointerdown:collaboration-mode-hit', {
            hasHitPoint: Boolean(collaborationHit?.point),
            hitDistance: collaborationHit?.distance ?? null,
          })
          return
        }
        if (isEditLocked) {
          logSelectionDebug('pointerdown:editing-locked-selection-only')
        }

        const libraryDistance = typeof (libraryHit as { distance?: unknown } | undefined)?.distance === 'number'
          ? (libraryHit as { distance: number }).distance
          : Number.POSITIVE_INFINITY
        const floorDistance = bestFloorHit?.distance ?? Number.POSITIVE_INFINITY

        // TC의 pointerDown은 hover로 남은 axis가 있으면 planeIntersect 성공 여부와 무관하게
        // dragging=true를 설정한다(TC 소스의 구조적 결함). isTransformDragging=true라도
        // 실제로 다른 오브젝트를 클릭한 경우는 TC drag를 취소하고 재선택을 허용한다.
        if (isTransformDragging) {
          const tcObj = (tc as unknown as { object: import('three').Object3D | undefined }).object
          if (tcObj === multiAnchorRef.current) return
          let isDifferentObject = false
          if (libraryHit?.object && libraryDistance <= floorDistance) {
            const hitRoot = findLibraryRoot(libraryHit.object, presetGroup) ?? libraryHit.object
            isDifferentObject = hitRoot !== tcObj
          } else if (bestFloorHit) {
            isDifferentObject = bestFloorHit.root !== tcObj
          }
          if (!isDifferentObject) return
          ;(tc as unknown as { dragging: boolean }).dragging = false
        }

        const isAppend = isSelectionMode && event.shiftKey
        if (libraryHit?.object && libraryDistance <= floorDistance) {
          const root = findLibraryRoot(libraryHit.object, presetGroup) ?? (libraryHit.object as LibraryObject3D)
          const elementInfo = getLibraryElementInfo(root)
          if (!elementInfo || !isSelectableThreeDComponent(elementInfo)) {
            logSelectionDebug('pointerdown:library-hit-not-selectable', {
              elementId: elementInfo?.id ?? null,
              ifcClass: elementInfo?.ifcClass ?? null,
              category: elementInfo?.category ?? null,
            })
            return
          }
          const nextEntry: FloorPlanMultiSelectionEntry = {
            key: `library:${elementInfo.id}`,
            object: root,
            source: 'library',
            element: elementInfo,
          }
          if (isDeleteEnabled) {
            commitSelection([nextEntry])
            deleteSelectedEntry()
            return
          }
          upsertSelection(nextEntry, isAppend)
          return
        }

        if (bestFloorHit) {
          const root = bestFloorHit.root
          const elementInfo = bestFloorHit.element
          if (isDeleteEnabled) {
            commitSelection([{
              key: `floor:${elementInfo.id}`,
              object: root,
              source: 'floor',
              element: elementInfo,
            }])
            deleteSelectedEntry()
            return
          }
          upsertSelection({
            key: `floor:${elementInfo.id}`,
            object: root,
            source: 'floor',
            element: elementInfo,
          }, isAppend)
          return
        }

        if (!isAppend && !isDeleteEnabled) {
          commitSelection([])
          logSelectionDebug('pointerdown:clear-selection-no-hit')
          return
        }

        const startX = event.clientX
        const startY = event.clientY
        let isMarqueeActive = false
        const activateMarquee = () => {
          if (isMarqueeActive) return
          isMarqueeActive = true
          ;(controls as unknown as { enabled: boolean }).enabled = false
        }

        handlePointerMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return
          const dx = moveEvent.clientX - startX
          const dy = moveEvent.clientY - startY
          if (!isMarqueeActive && Math.hypot(dx, dy) >= 4) activateMarquee()
          if (!isMarqueeActive) return
          const left = Math.min(startX, moveEvent.clientX) - bounds.left
          const top = Math.min(startY, moveEvent.clientY) - bounds.top
          const width = Math.abs(moveEvent.clientX - startX)
          const height = Math.abs(moveEvent.clientY - startY)
          setMarqueeRect({ left, top, width, height })
        }
        handlePointerUp = (upEvent: PointerEvent) => {
          if (upEvent.pointerId !== event.pointerId) return
          if (handlePointerMove) window.removeEventListener('pointermove', handlePointerMove, true)
          if (handlePointerUp) window.removeEventListener('pointerup', handlePointerUp, true)
          handlePointerMove = null
          handlePointerUp = null

          if (!isMarqueeActive) {
            setMarqueeRect(null)
            return
          }

          const rect = toScreenRectFromPointers(startX, startY, upEvent.clientX, upEvent.clientY)
          const marqueeEntries = collectMarqueeEntries(rect)
          if (isAppend) {
            commitSelection(mergeSelectionByKey(
              selectedEntriesRef.current,
              marqueeEntries,
              (entry) => entry.key,
            ))
          } else {
            commitSelection(marqueeEntries)
          }
          setMarqueeRect(null)
          ;(controls as unknown as { enabled: boolean }).enabled = true
        }

        window.addEventListener('pointermove', handlePointerMove, true)
        window.addEventListener('pointerup', handlePointerUp, true)
      }
      container.addEventListener('pointerdown', handlePointerDown)
      handleDoubleClick = createCommentPinFromPointer
      renderer.domElement.addEventListener('dblclick', handleDoubleClick, true)

      handleHandCursorDown = (event: PointerEvent) => {
        if (event.button === 1) {
          renderer.domElement.style.cursor = 'grabbing'
          return
        }
        if (event.button !== 0 || selectedToolRef.current !== 'hand') return
        renderer.domElement.style.cursor = 'grabbing'
      }
      handleHandCursorUp = () => {
        syncCanvasCursor()
      }
      renderer.domElement.addEventListener('pointerdown', handleHandCursorDown, true)
      window.addEventListener('pointerup', handleHandCursorUp, true)

      // Ctrl/Cmd + 휠에서만 줌이 동작하도록 기본 휠 입력을 제한한다.
      handleWheel = (event: WheelEvent) => {
        if (allowsCtrlWheelZoom(event)) return
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      renderer.domElement.addEventListener('wheel', handleWheel, { passive: false, capture: true })

      handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Shift') {
          if (!isShiftSnapRef.current) {
            isShiftSnapRef.current = true
            syncTransformSnap()
          }
        }
      }
      handleKeyUp = (event: KeyboardEvent) => {
        if (event.key !== 'Shift') return
        if (!isShiftSnapRef.current) return
        isShiftSnapRef.current = false
        syncTransformSnap()
      }
      window.addEventListener('keydown', handleKeyDown, true)
      window.addEventListener('keyup', handleKeyUp, true)

      rebuildFloorGroup()

      // ── 렌더 루프 ──
      const animate = () => {
        if (cancelled) return
        animationFrameIdRef.current = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
      }
      animate()

      // ── 리사이즈 대응 ──
      resizeObserverRef.current = new ResizeObserver(() => {
        if (!container || cancelled) return
        camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1)
        camera.updateProjectionMatrix()
        renderer.setSize(container.clientWidth, container.clientHeight)
      })
      resizeObserverRef.current.observe(container)
    })()

    return () => {
      cancelled = true
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      if (handlePointerDown) container.removeEventListener('pointerdown', handlePointerDown)
      if (handleDoubleClick && rendererRef.current?.domElement) {
        rendererRef.current.domElement.removeEventListener('dblclick', handleDoubleClick, true)
      }
      if (handlePointerMove) window.removeEventListener('pointermove', handlePointerMove, true)
      if (handlePointerUp) window.removeEventListener('pointerup', handlePointerUp, true)
      if (handleHandCursorDown && rendererRef.current?.domElement) {
        rendererRef.current.domElement.removeEventListener('pointerdown', handleHandCursorDown, true)
      }
      if (handleHandCursorUp) window.removeEventListener('pointerup', handleHandCursorUp, true)
      if (handleWheel && rendererRef.current?.domElement) {
        rendererRef.current.domElement.removeEventListener('wheel', handleWheel, true)
      }
      if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown, true)
      if (handleKeyUp) window.removeEventListener('keyup', handleKeyUp, true)

      controlsRef.current?.dispose()
      controlsRef.current = null

      ;(transformControlsRef.current as unknown as { dispose?: () => void })?.dispose?.()
      transformControlsRef.current = null
      selectedPresetRef.current = null
      selectedEntriesRef.current = []
      multiDragSnapshotRef.current = null
      setMarqueeRect(null)
      if (multiAnchorRef.current) {
        sceneRef.current?.remove(multiAnchorRef.current)
      }
      multiAnchorRef.current = null

      if (threeRef.current) {
        if (floorGroupRef.current) {
          disposeObject3DResources(floorGroupRef.current)
          sceneRef.current?.remove(floorGroupRef.current)
        }
        if (presetGroupRef.current) {
          disposeObjectMaterials(threeRef.current, presetGroupRef.current)
          sceneRef.current?.remove(presetGroupRef.current)
        }
        if (pinMarkerGroupRef.current) {
          disposeObject3DResources(pinMarkerGroupRef.current)
          sceneRef.current?.remove(pinMarkerGroupRef.current)
        }
      }
      floorGroupRef.current = null
      pinMarkerGroupRef.current = null
      presetGroupRef.current = null

      const renderer = rendererRef.current
      if (renderer) {
        // renderLists/context를 선제 해제해 반복 진입 시 WebGL 메모리 점유를 낮춘다.
        ;(renderer as import('three').WebGLRenderer & {
          renderLists?: { dispose?: () => void }
        }).renderLists?.dispose?.()
        renderer.forceContextLoss()
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      threeRef.current = null
    }
  }, [
    rebuildFloorGroup,
    deleteSelectedEntry,
    markPendingLocalFloorTransformEcho,
    syncOrbitPanBinding,
    syncTransformSnap,
    updateTransformSelection,
  ])

  useEffect(() => {
    syncOrbitPanBinding()
  }, [selectedTool, syncOrbitPanBinding])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.domElement.style.cursor = selectedTool === 'hand' ? 'grab' : 'default'
  }, [selectedTool])

  // libraryElements 변경 시 presetGroup을 재구성한다.
  useEffect(() => {
    const THREE = threeRef.current
    const presetGroup = presetGroupRef.current
    const tc = transformControlsRef.current
    if (!THREE || !presetGroup) return

    const elements = libraryElements ?? []
    const existingChildren = presetGroup.children as unknown as LibraryObject3D[]

    // 구조 변경 없이 위치/회전/스케일만 달라진 경우 in-place 업데이트로 깜빡임을 방지한다.
    const canUpdateInPlace =
      existingChildren.length === elements.length &&
      elements.length > 0 &&
      elements.every((preset, i) => {
        const existing = getLibraryPresetFromObject(existingChildren[i])
        return (
          existing?.id === preset.id &&
          existing?.type === preset.type &&
          existing?.material === preset.material &&
          existing?.color === preset.color &&
          existing?.lengthMm === preset.lengthMm &&
          existing?.heightMm === preset.heightMm &&
          existing?.thicknessMm === preset.thicknessMm &&
          existing?.roofShape === preset.roofShape
        )
      })

    if (canUpdateInPlace) {
      elements.forEach((preset, i) => {
        const mesh = existingChildren[i] as import('three').Object3D
        if (preset.position) mesh.position.set(preset.position.x, preset.position.y, preset.position.z)
        if (preset.rotation) mesh.rotation.set(preset.rotation.x, preset.rotation.y, preset.rotation.z)
        if (preset.scale) mesh.scale.set(preset.scale.x, preset.scale.y, preset.scale.z)
        if (mesh.userData) mesh.userData.libraryPreset = preset
      })
      return
    }

    logPresetMove('library_sync_start', {
      presetCount: libraryElements?.length ?? 0,
      existingScenePresetCount: presetGroup.children.length,
      presetIds: (libraryElements ?? []).map((preset) => preset.id),
    })

    // 변경 전 선택된 프리셋 ID를 보존해 재구성 후 재선택한다.
    const previousSelectedId = selectedPresetRef.current
      ? getLibraryPresetFromObject(selectedPresetRef.current)?.id
      : undefined
    const previousSelectedLibraryPresetIds = selectedEntriesRef.current
      .filter((entry) => entry.source === 'library')
      .map((entry) => getLibraryPresetFromObject(entry.object as LibraryObject3D)?.id)
      .filter((id): id is string => Boolean(id))
    const previousSelectedFloorEntries = selectedEntriesRef.current.filter((entry) => entry.source === 'floor')

    // TransformControls를 먼저 분리해 dangling reference를 방지한다.
    if (tc) clearTransformSelection()
    selectedPresetRef.current = null

    presetGroup.children.forEach((child) => disposeObjectMaterials(THREE, child))
    presetGroup.clear()

    if (!libraryElements?.length) {
      selectedEntriesRef.current = previousSelectedFloorEntries
      updateTransformSelection()
      if (previousSelectedFloorEntries.length === 0) {
        onIfcElementSelectRef.current?.(null)
      }
      return
    }

    libraryElements.forEach((preset, index) => {
      const mesh = createPresetMesh(THREE, preset, index)
      // 저장된 position이 있으면 복원한다
      if (preset.position) {
        mesh.position.set(preset.position.x, preset.position.y, preset.position.z)
      }
      presetGroup.add(mesh)
      if (!preset.position && floorGroupRef.current) {
        ensureLibraryPresetOutsideIfc(THREE, floorGroupRef.current, mesh)
      }
    })
    logPresetMove('library_sync_rebuild_done', {
      scenePresetCount: presetGroup.children.length,
      scenePresetIds: presetGroup.children.map((child) => (
        getLibraryPresetFromObject(child as LibraryObject3D)?.id ?? child.name ?? '(unknown)'
      )),
    })

    // floor 그룹이 준비된 경우에만 자동 배치한다.
    if (floorGroupRef.current && !presetGroup.userData.libraryPositioned) {
      positionPresetGroupBesideIfc(THREE, floorGroupRef.current, presetGroup)
      presetGroup.userData.libraryPositioned = true
    }

    // 이전에 선택된 프리셋이 있으면 새 mesh에서 찾아 TransformControls를 재연결한다.
    if (previousSelectedId && tc) {
      const nextRoot = presetGroup.children.find(
        (child) => getLibraryPresetFromObject(child as LibraryObject3D)?.id === previousSelectedId,
      ) as LibraryObject3D | undefined
      if (nextRoot) {
        selectedPresetRef.current = nextRoot
        const remappedLibraryEntries: FloorPlanMultiSelectionEntry[] = []
        previousSelectedLibraryPresetIds.forEach((presetId) => {
          const mappedRoot = presetGroup.children.find(
            (child) => getLibraryPresetFromObject(child as LibraryObject3D)?.id === presetId,
          ) as LibraryObject3D | undefined
          if (!mappedRoot) return
          const element = getLibraryElementInfo(mappedRoot)
          if (!element) return
          remappedLibraryEntries.push({
            key: `library:${element.id}`,
            object: mappedRoot,
            source: 'library',
            element,
          })
        })
        selectedEntriesRef.current = [...previousSelectedFloorEntries, ...remappedLibraryEntries]
        updateTransformSelection()
      } else {
        selectedEntriesRef.current = previousSelectedFloorEntries
        updateTransformSelection()
        if (previousSelectedFloorEntries.length === 0) {
          onIfcElementSelectRef.current?.(null)
        }
      }
    } else if (previousSelectedLibraryPresetIds.length > 0) {
      const remappedLibraryEntries: FloorPlanMultiSelectionEntry[] = []
      previousSelectedLibraryPresetIds.forEach((presetId) => {
        const mappedRoot = presetGroup.children.find(
          (child) => getLibraryPresetFromObject(child as LibraryObject3D)?.id === presetId,
        ) as LibraryObject3D | undefined
        if (!mappedRoot) return
        const element = getLibraryElementInfo(mappedRoot)
        if (!element) return
        remappedLibraryEntries.push({
          key: `library:${element.id}`,
          object: mappedRoot,
          source: 'library',
          element,
        })
      })
      selectedEntriesRef.current = [...previousSelectedFloorEntries, ...remappedLibraryEntries]
      updateTransformSelection()
    }
  }, [clearTransformSelection, libraryElements, logPresetMove, updateTransformSelection])

  useEffect(() => {
    if (!cameraViewPresetCommand) return
    if (cameraViewPresetCommand.token <= handledCameraPresetTokenRef.current) return
    handledCameraPresetTokenRef.current = cameraViewPresetCommand.token

    const THREE = threeRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const focusObject = selectedPresetRef.current ?? floorGroupRef.current
    if (!THREE || !camera || !controls || !renderer || !scene || !focusObject) return

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
    if (cameraViewPresetCommand.preset === 'top') {
      camera.position.set(center.x, center.y + distance, center.z + 0.001)
      camera.up.set(0, 0, -1)
    } else if (cameraViewPresetCommand.preset === 'front') {
      camera.position.set(center.x, center.y + distance * 0.15, center.z + distance)
      camera.up.set(0, 1, 0)
    } else if (cameraViewPresetCommand.preset === 'side') {
      camera.position.set(center.x + distance, center.y + distance * 0.15, center.z)
      camera.up.set(0, 1, 0)
    } else {
      camera.position.set(center.x + distance, center.y + distance * 0.65, center.z + distance)
      camera.up.set(0, 1, 0)
    }

    controls.target.copy(center)
    controls.update()
    renderer.render(scene, camera)
  }, [cameraViewPresetCommand])

  // deleteRequestToken 증가 시 현재 선택된 엔트리(라이브러리/평면도)를 삭제한다.
  useEffect(() => {
    if (deleteRequestToken <= 0) return
    deleteSelectedEntry()
  }, [deleteRequestToken, deleteSelectedEntry])

  useEffect(() => {
    const preferredId = preferredSelectedElementId?.trim() || null
    const fallbackSelectedId = selectedIfcElement?.id?.trim() || null
    const targetIds = new Set<string>()
    if (preferredId) {
      targetIds.add(preferredId)
    } else if (fallbackSelectedId) {
      targetIds.add(fallbackSelectedId)
    }
    if (targetIds.size === 0) return

    const targetGlobalId = preferredId ? null : (selectedIfcElement?.globalId ?? null)
    const selectedEntry = selectedEntriesRef.current[selectedEntriesRef.current.length - 1]
    if (selectedEntry && matchesTargetSelection(selectedEntry.element, targetIds, targetGlobalId)) return

    const floorGroup = floorGroupRef.current
    const presetGroup = presetGroupRef.current
    if (!floorGroup && !presetGroup) return

    let nextEntry: FloorPlanMultiSelectionEntry | null = null

    if (floorGroup) {
      floorGroup.children.some((child) => {
        const element = getFloorPlanElementInfo(child)
        if (!element || !isSelectableThreeDComponent(element)) return false
        if (!matchesTargetSelection(element, targetIds, targetGlobalId)) return false
        nextEntry = {
          key: `floor:${element.id}`,
          object: child,
          source: 'floor',
          element,
        }
        return true
      })
    }

    if (!nextEntry && presetGroup) {
      presetGroup.children.some((child) => {
        const root = findLibraryRoot(child as import('three').Object3D, presetGroup)
        if (!root) return false
        const element = getLibraryElementInfo(root)
        if (!element || !matchesTargetSelection(element, targetIds, targetGlobalId)) return false
        nextEntry = {
          key: `library:${element.id}`,
          object: root,
          source: 'library',
          element,
        }
        return true
      })
    }

    if (!nextEntry) return
    selectedEntriesRef.current = [nextEntry]
    updateTransformSelection()
  }, [matchesTargetSelection, preferredSelectedElementId, selectedIfcElement, updateTransformSelection])

  useEffect(() => {
    const preferredId = preferredSelectedElementId?.trim() || null
    if (selectedIfcElement || preferredId) return
    if (selectedEntriesRef.current.length === 0 && !selectedPresetRef.current && !multiAnchorRef.current) return
    selectedEntriesRef.current = []
    selectedPresetRef.current = null
    updateTransformSelection()
  }, [preferredSelectedElementId, selectedIfcElement, updateTransformSelection])

  useEffect(() => {
    const THREE = threeRef.current
    if (!THREE || !selectedIfcElement) return
    const selectedEntry = selectedEntriesRef.current[selectedEntriesRef.current.length - 1]
    if (!selectedEntry) return
    if (
      selectedIfcElement.category.toLowerCase() === 'roof' ||
      selectedIfcElement.ifcClass.toLowerCase() === 'ifcroof'
    ) {
      logRoofDebug('selectedIfcElement effect', {
        selectedEntrySource: selectedEntry.source,
        selectedEntryId: selectedEntry.element.id,
        selectedIfcElement: {
          id: selectedIfcElement.id,
          source: selectedIfcElement.source,
          roofShape: selectedIfcElement.roofShape,
          name: selectedIfcElement.name,
        },
      })
    }
    if (selectedEntry.element.id !== selectedIfcElement.id) return

    if (selectedEntry.source === 'library') {
      const selected = selectedEntry.object as LibraryObject3D
      const selectedPreset = getLibraryPresetFromObject(selected)
      if (
        selectedPreset?.type === 'roof' &&
        (selectedIfcElement.roofShape === 'flat' || selectedIfcElement.roofShape === 'gable') &&
        selectedPreset.roofShape !== selectedIfcElement.roofShape
      ) {
        logRoofDebug('apply roofShape to selected preset', {
          presetId: selectedPreset.id,
          prevRoofShape: selectedPreset.roofShape,
          nextRoofShape: selectedIfcElement.roofShape,
        })
        // 상태 반영 전에도 현재 선택 객체의 메타를 즉시 갱신해
        // 속성 패널 값이 이전 roofShape로 되돌아가지 않도록 한다.
        updateLibraryPresetData(selected, { roofShape: selectedIfcElement.roofShape })
        onIfcElementSelectRef.current?.(getLibraryElementInfo(selected))
        onLibraryElementChangeRef.current?.(selectedPreset.id, { roofShape: selectedIfcElement.roofShape })
        return
      }

      const fallbackSize = new THREE.Vector3()
      new THREE.Box3().setFromObject(selected).getSize(fallbackSize)
      const baseWorldSize = selected.userData?.libraryBaseWorldSize ?? {
        x: fallbackSize.x || 1,
        y: fallbackSize.y || 1,
        z: fallbackSize.z || 1,
      }

      const nextScaleX = selectedIfcElement.lengthMm ? (selectedIfcElement.lengthMm * 0.001) / baseWorldSize.x : selected.scale.x
      const nextScaleY = selectedIfcElement.heightMm ? (selectedIfcElement.heightMm * 0.001) / baseWorldSize.y : selected.scale.y
      const nextScaleZ = selectedIfcElement.thicknessMm ? (selectedIfcElement.thicknessMm * 0.001) / baseWorldSize.z : selected.scale.z
      if (![nextScaleX, nextScaleY, nextScaleZ].every((value) => Number.isFinite(value) && value > 0)) return
      selected.scale.set(nextScaleX, nextScaleY, nextScaleZ)
      selected.updateMatrixWorld(true)
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
      updateLibraryPresetData(selected, libraryPatch)
      if (selectedPreset) onLibraryElementChangeRef.current?.(selectedPreset.id, libraryPatch)
      const nextLibraryElement = getLibraryElementInfo(selected)
      if (nextLibraryElement) selectedEntry.element = nextLibraryElement

      if (
        Number.isFinite(selectedIfcElement.positionX) &&
        Number.isFinite(selectedIfcElement.positionY) &&
        Number.isFinite(selectedIfcElement.positionZ)
      ) {
        selected.position.set(
          selectedIfcElement.positionX as number,
          selectedIfcElement.positionY as number,
          selectedIfcElement.positionZ as number,
        )
      }

      if (
        Number.isFinite(selectedIfcElement.rotationX) &&
        Number.isFinite(selectedIfcElement.rotationY) &&
        Number.isFinite(selectedIfcElement.rotationZ)
      ) {
        selected.rotation.set(
          ((selectedIfcElement.rotationX as number) * Math.PI) / 180,
          ((selectedIfcElement.rotationY as number) * Math.PI) / 180,
          ((selectedIfcElement.rotationZ as number) * Math.PI) / 180,
        )
      }
      return
    }

    const selected = selectedEntry.object
    const isRoofElement =
      selectedIfcElement.category.toLowerCase() === 'roof' ||
      selectedIfcElement.ifcClass.toLowerCase() === 'ifcroof'
    const nextRoofShape = selectedIfcElement.roofShape
    const floorBaseWorldSize = (
      selected.userData as { floorPlanBaseWorldSize?: { x: number; y: number; z: number } }
    ).floorPlanBaseWorldSize
    if (selectedIfcElement.material) {
      applyObjectMaterial(THREE, selected, selectedIfcElement.material, selectedIfcElement.color)
    } else if (selectedIfcElement.color) {
      applyObjectColor(THREE, selected, selectedIfcElement.color)
    }

    const fallbackSize = new THREE.Vector3()
    new THREE.Box3().setFromObject(selected).getSize(fallbackSize)
    const baseWorldSize = floorBaseWorldSize ?? {
      x: fallbackSize.x || 1,
      y: fallbackSize.y || 1,
      z: fallbackSize.z || 1,
    }

    const shouldBakeRoofGeometry = isRoofElement && (nextRoofShape === 'flat' || nextRoofShape === 'gable')
    if (shouldBakeRoofGeometry) {
      // 지붕은 geometry 자체를 mm 기준으로 재생성하므로 scale은 1로 유지한다.
      selected.scale.set(1, 1, 1)
      const length = (selectedIfcElement.lengthMm ?? Math.round(baseWorldSize.x / PROJECT_WORLD_UNITS_PER_MM)) * PROJECT_WORLD_UNITS_PER_MM
      const height = (selectedIfcElement.heightMm ?? Math.round(baseWorldSize.y / PROJECT_WORLD_UNITS_PER_MM)) * PROJECT_WORLD_UNITS_PER_MM
      const thickness = (selectedIfcElement.thicknessMm ?? Math.round(baseWorldSize.z / PROJECT_WORLD_UNITS_PER_MM)) * PROJECT_WORLD_UNITS_PER_MM
      const nextGeometry = nextRoofShape === 'gable'
        ? createGableRoofGeometry(THREE, { length, height, thickness })
        : new THREE.BoxGeometry(length, Math.max(height, 1e-4), thickness)
      selected.traverse((child) => {
        if (!(child as { isMesh?: boolean }).isMesh) return
        const meshChild = child as import('three').Mesh
        meshChild.geometry.dispose()
        meshChild.geometry = nextGeometry.clone()
      })
      const userData = selected.userData as {
        floorPlanElement?: {
          roofShape?: 'flat' | 'gable'
          properties?: Record<string, unknown>
        }
      }
      const floorPlanElement = userData.floorPlanElement
      if (floorPlanElement) {
        selected.userData.floorPlanElement = {
          ...floorPlanElement,
          roofShape: nextRoofShape,
          properties: {
            ...(floorPlanElement.properties ?? {}),
            RoofShape: nextRoofShape,
          },
        }
      }
    } else {
      const nextScaleX = selectedIfcElement.lengthMm ? (selectedIfcElement.lengthMm * 0.001) / baseWorldSize.x : selected.scale.x
      const nextScaleY = selectedIfcElement.heightMm ? (selectedIfcElement.heightMm * 0.001) / baseWorldSize.y : selected.scale.y
      const nextScaleZ = selectedIfcElement.thicknessMm ? (selectedIfcElement.thicknessMm * 0.001) / baseWorldSize.z : selected.scale.z
      selected.scale.set(nextScaleX, nextScaleY, nextScaleZ)
    }

    if (
      Number.isFinite(selectedIfcElement.positionX) &&
      Number.isFinite(selectedIfcElement.positionY) &&
      Number.isFinite(selectedIfcElement.positionZ)
    ) {
      selected.position.set(
        selectedIfcElement.positionX as number,
        selectedIfcElement.positionY as number,
        selectedIfcElement.positionZ as number,
      )
    }

    if (
      Number.isFinite(selectedIfcElement.rotationX) &&
      Number.isFinite(selectedIfcElement.rotationY) &&
      Number.isFinite(selectedIfcElement.rotationZ)
    ) {
      selected.rotation.set(
        ((selectedIfcElement.rotationX as number) * Math.PI) / 180,
        ((selectedIfcElement.rotationY as number) * Math.PI) / 180,
        ((selectedIfcElement.rotationZ as number) * Math.PI) / 180,
      )
    }

    const nextFloorElement = getFloorPlanElementInfo(selected)
    if (nextFloorElement) {
      selectedEntry.element = nextFloorElement
      onIfcElementSelectRef.current?.(nextFloorElement)
    }
  }, [
    selectedIfcElement?.lengthMm,
    selectedIfcElement?.heightMm,
    selectedIfcElement?.thicknessMm,
    selectedIfcElement?.positionX,
    selectedIfcElement?.positionY,
    selectedIfcElement?.positionZ,
    selectedIfcElement?.rotationX,
    selectedIfcElement?.rotationY,
    selectedIfcElement?.rotationZ,
    selectedIfcElement,
  ])

  useEffect(() => {
    if (!libraryDropRequest) return
    if (libraryDropRequest.token <= handledLibraryDropTokenRef.current) return
    handledLibraryDropTokenRef.current = libraryDropRequest.token
    if (isEditingLockedRef.current) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const THREE = threeRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    const floorGroup = floorGroupRef.current
    const presetGroup = presetGroupRef.current
    if (!THREE || !camera || !renderer) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const bounds = renderer.domElement.getBoundingClientRect()
    const isInsideCanvas =
      libraryDropRequest.clientX >= bounds.left &&
      libraryDropRequest.clientX <= bounds.right &&
      libraryDropRequest.clientY >= bounds.top &&
      libraryDropRequest.clientY <= bounds.bottom
    if (!isInsideCanvas) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const normalizedMouse = toNormalizedMouse(
      THREE,
      bounds,
      libraryDropRequest.clientX,
      libraryDropRequest.clientY,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(normalizedMouse, camera)

    const floorHit = floorGroup ? raycaster.intersectObjects(floorGroup.children, true)[0] : undefined
    const hitPoint = floorHit?.point

    const toPresetLocal = (worldPoint: import('three').Vector3) => {
      if (!presetGroup) return worldPoint
      return presetGroup.worldToLocal(worldPoint.clone())
    }
    const positionPatch = resolveLibraryDropPositionPatch({
      THREE,
      raycaster,
      hitPoint,
      toLocal: toPresetLocal,
    })

    onResolveLibraryDrop?.(libraryDropRequest.token, positionPatch)
  }, [libraryDropRequest, onResolveLibraryDrop])

  // TransformControls 모드(이동/회전/크기) 및 회전 스냅 반영
  useEffect(() => {
    const tc = transformControlsRef.current
    if (!tc) return
    tc.setMode(transformMode)
    syncTransformSnap()
  }, [transformMode, syncTransformSnap])

  useEffect(() => {
    syncTransformSnap()
  }, [transformSnapEnabled, transformSnapIntervalMm, syncTransformSnap])

  useEffect(() => {
    if (!onPreviewCapture || !rendererRef.current || !sceneRef.current || !cameraRef.current) return

    const timerId = window.setTimeout(() => {
      const renderer = rendererRef.current
      const scene = sceneRef.current
      const camera = cameraRef.current
      if (!renderer || !scene || !camera) return

      try {
        const focusedPreview = captureFocusedPreview()
        if (focusedPreview) {
          onPreviewCaptureRef.current?.(focusedPreview)
          return
        }
        renderer.render(scene, camera)
        onPreviewCaptureRef.current?.(captureCanvasWithBackground(renderer.domElement, {
          backgroundColor: '#f0f2f9',
          quality: 0.92,
        }))
      } catch {
        // 캔버스 캡처 실패는 카드 썸네일 fallback으로 처리한다.
      }
    }, 450)

    return () => window.clearTimeout(timerId)
  }, [
    cameraViewPresetCommand,
    data,
    captureFocusedPreview,
    onPreviewCapture,
  ])

  useEffect(() => {
    rotationLockedRef.current = isRotationLocked
    const controls = controlsRef.current
    if (!controls) return
    const orbitControls = controls as OrbitControlsInstance & { enableRotate?: boolean }
    orbitControls.enableRotate = !isRotationLocked
  }, [isRotationLocked])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
      />
      <ThreeDMarqueeOverlay rect={marqueeRect} />
    </div>
  )
}
