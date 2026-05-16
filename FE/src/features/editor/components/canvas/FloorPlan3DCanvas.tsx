import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommentPin3DCreatePosition, FloorCommentPin, IfcElementInfo } from '../../types'
import { FLOOR_MM_PER_PX } from '../../constants'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import { buildFloorPlan3DGroup } from '../../utils/floorPlanTo3D'
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
  appendUniqueSelectionByKey,
  isPointerInsideBounds,
  isScreenPointInsideRect,
  toNormalizedMouse,
  toScreenRectFromPointers,
  type ScreenRect,
} from './threeDPointerSelection.utils'
import {
  createPresetMesh,
  getLibraryElementInfo,
  getLibraryScaleDimensionPatch,
  getLibraryPresetFromObject,
  updateLibraryPresetData,
  type LibraryObject3D,
} from './thatopen/ifcLibraryMesh'
import { applyObjectColor, applyObjectMaterial, PROJECT_WORLD_UNITS_PER_MM } from './thatopen/ifcMaterials'
import { disposeObjectMaterials, positionPresetGroupBesideIfc } from './thatopen/ifcSceneHelpers'
import { getThreeDPinMarkerHit, syncThreeDPinMarkers } from './threeDPinMarkers'

interface FloorPlan3DCanvasProps {
  data: FloorPlan3DData
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
  deleteRequestToken?: number
  isRotationLocked?: boolean
  transformMode?: 'translate' | 'rotate' | 'scale'
  selectedTool?: string
  onLibraryElementChange?: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete?: (id: string) => void
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  libraryDropRequest?: ThreeDLibraryDropRequest | null
  onResolveLibraryDrop?: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  transformSnapEnabled?: boolean
  transformSnapIntervalMm?: number
  isEditingLocked?: boolean
}

type ThreeModule = typeof import('three')
type OrbitControlsInstance = import('three/examples/jsm/controls/OrbitControls.js').OrbitControls

type TransformControlsInstance =
  import('three/examples/jsm/controls/TransformControls.js').TransformControls

type MultiSelectionEntry = {
  key: string
  object: import('three').Object3D
  source: 'library' | 'floor'
  element: IfcElementInfo
}

const logRoofDebug = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return
  console.log('[roof-debug][FloorPlan3DCanvas]', ...args)
}

/** 선택 프리셋의 현재 transform을 저장용 patch 형식으로 변환한다. */
const toPresetTransformPatch = (presetObject: LibraryObject3D) => ({
  position: { x: presetObject.position.x, y: presetObject.position.y, z: presetObject.position.z },
  rotation: { x: presetObject.rotation.x, y: presetObject.rotation.y, z: presetObject.rotation.z },
  scale: { x: presetObject.scale.x, y: presetObject.scale.y, z: presetObject.scale.z },
})

/**
 * 2D 평면도 데이터를 Three.js로 즉시 3D 변환하여 표시하는 캔버스.
 * ThatOpen/IFC 없이 순수 Three.js + OrbitControls를 사용한다.
 * 360도 회전, 줌, 패닝을 지원한다.
 * 라이브러리 프리셋 추가 및 TransformControls를 통한 이동을 지원한다.
 */
export function FloorPlan3DCanvas({
  data,
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
  deleteRequestToken = 0,
  isRotationLocked = false,
  transformMode = 'translate',
  selectedTool = 'selection',
  onLibraryElementChange,
  onLibraryElementDelete,
  onIfcElementSelect,
  libraryDropRequest,
  onResolveLibraryDrop,
  cameraViewPresetCommand,
  transformSnapEnabled = true,
  transformSnapIntervalMm = 100,
  isEditingLocked = false,
}: FloorPlan3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 렌더 루프/비동기 초기화에서 최신 data를 참조하기 위한 ref 캐시
  const dataRef = useRef(data)
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
  const selectedToolRef = useRef(selectedTool)
  const rotationLockedRef = useRef(isRotationLocked)
  const isEditingLockedRef = useRef(isEditingLocked)
  const transformSnapEnabledRef = useRef(transformSnapEnabled)
  const transformSnapIntervalMmRef = useRef(transformSnapIntervalMm)
  const isShiftSnapRef = useRef(false)
  const selectedEntriesRef = useRef<MultiSelectionEntry[]>([])
  const multiAnchorRef = useRef<import('three').Object3D | null>(null)
  const multiDragSnapshotRef = useRef<{
    anchorStart: import('three').Vector3
    memberWorldByKey: Map<string, import('three').Vector3>
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
  const onPinClickRef = useRef(onPinClick)
  const onPinCreateRef = useRef(onPinCreate)
  const onPinDeleteRef = useRef(onPinDelete)

  useEffect(() => { onLibraryElementChangeRef.current = onLibraryElementChange }, [onLibraryElementChange])
  useEffect(() => { onLibraryElementDeleteRef.current = onLibraryElementDelete }, [onLibraryElementDelete])
  useEffect(() => { onIfcElementSelectRef.current = onIfcElementSelect }, [onIfcElementSelect])
  useEffect(() => { onPinClickRef.current = onPinClick }, [onPinClick])
  useEffect(() => { onPinCreateRef.current = onPinCreate }, [onPinCreate])
  useEffect(() => { onPinDeleteRef.current = onPinDelete }, [onPinDelete])
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
        tc.visible = false
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
      tc.detach()
      tc.visible = false
      tc.enabled = false
      multiAnchorRef.current = null
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

  useEffect(() => {
    isEditingLockedRef.current = isEditingLocked
    updateTransformSelection()
  }, [isEditingLocked, updateTransformSelection])

  useEffect(() => {
    const THREE = threeRef.current
    const markerGroup = pinMarkerGroupRef.current
    if (!THREE || !markerGroup) return
    syncThreeDPinMarkers(THREE, markerGroup, commentPins, {
      selectedPinId,
      currentUserId,
      deletingPinId,
      worldUnitsPerMm: PROJECT_WORLD_UNITS_PER_MM,
    })
  }, [commentPins, currentUserId, deletingPinId, selectedPinId])

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

    if (floorGroupRef.current) {
      scene.remove(floorGroupRef.current)
      disposeObject3DResources(floorGroupRef.current)
    }

    const nextFloorGroup = buildFloorPlan3DGroup(THREE, dataRef.current)
    floorGroupRef.current = nextFloorGroup
    scene.add(nextFloorGroup)

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
  }, [])

  // 외부 data 변경을 감지해 floor 그룹만 재구성한다.
  useEffect(() => {
    dataRef.current = data
    rebuildFloorGroup()
  }, [data, rebuildFloorGroup])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 탭 전환/언마운트 직후 늦게 도착한 async 초기화 결과를 무시하기 위한 취소 플래그
    let cancelled = false
    // cleanup 클로저가 참조할 수 있도록 외부 스코프에 선언한다 (ThatOpenIfcCanvas와 동일 패턴)
    let handlePointerDown: ((event: PointerEvent) => void) | null = null
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

      const renderer = new THREE.WebGLRenderer({ antialias: true })
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
      syncThreeDPinMarkers(THREE, pinMarkerGroup, commentPinsRef.current, {
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

      const commitSelection = (entries: MultiSelectionEntry[]) => {
        selectedEntriesRef.current = entries
        updateTransformSelection()
      }

      const upsertSelection = (entry: MultiSelectionEntry, append: boolean) => {
        const previous = selectedEntriesRef.current
        if (!append) {
          commitSelection([entry])
          return
        }
        commitSelection(appendUniqueSelectionByKey(previous, entry, (selected) => selected.key))
      }

      const collectMarqueeEntries = (rect: ScreenRect) => {
        const entries: MultiSelectionEntry[] = []
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
      ;(tc as unknown as {
        addEventListener: (type: 'dragging-changed' | 'mouseDown' | 'objectChange', listener: (e: { value: boolean }) => void) => void
      }).addEventListener('dragging-changed', (event) => {
        isTransformDragging = event.value
        ;(controls as unknown as { enabled: boolean }).enabled = !event.value
        if (event.value) return

        const entries = selectedEntriesRef.current
        if (entries.length > 1) {
          entries.forEach((entry) => {
            if (entry.source !== 'library') return
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
        if (!isCollaborationModeRef.current && !isSelectionInteractionTool(selectedToolRef.current)) return
        const bounds = renderer.domElement.getBoundingClientRect()
        if (!isPointerInsideBounds(bounds, event.clientX, event.clientY)) return

        const normalizedMouse = toNormalizedMouse(THREE, bounds, event.clientX, event.clientY)
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(normalizedMouse, camera)
        const pinHit = pinMarkerGroupRef.current
          ? raycaster.intersectObjects(pinMarkerGroupRef.current.children, true)[0]
          : undefined
        const pinMarkerHit = getThreeDPinMarkerHit(pinHit?.object)
        if (pinMarkerHit) {
          if (pinMarkerHit.action === 'delete') {
            if (deletingPinIdRef.current === pinMarkerHit.pinId) return
            onPinDeleteRef.current?.(pinMarkerHit.pinId)
            return
          }
          onPinClickRef.current?.(pinMarkerHit.pinId)
          return
        }
        const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
        const floorHit = floorGroupRef.current
          ? raycaster.intersectObjects(floorGroupRef.current.children, true)[0]
          : undefined
        if (isCollaborationModeRef.current) {
          const collaborationHit = [libraryHit, floorHit]
            .filter((hit): hit is import('three').Intersection => Boolean(hit))
            .sort((a, b) => a.distance - b.distance)[0]
          if (collaborationHit?.point) createCommentPinAtWorldPoint(collaborationHit.point)
          return
        }
        if (isEditingLockedRef.current) return

        const libraryDistance = typeof (libraryHit as { distance?: unknown } | undefined)?.distance === 'number'
          ? (libraryHit as { distance: number }).distance
          : Number.POSITIVE_INFINITY
        const floorDistance = typeof (floorHit as { distance?: unknown } | undefined)?.distance === 'number'
          ? (floorHit as { distance: number }).distance
          : Number.POSITIVE_INFINITY

        const isAppend = isSelectionMode && event.shiftKey
        if (libraryHit?.object && libraryDistance <= floorDistance) {
          const root = findLibraryRoot(libraryHit.object, presetGroup) ?? (libraryHit.object as LibraryObject3D)
          const elementInfo = getLibraryElementInfo(root)
          if (!elementInfo || !isSelectableThreeDComponent(elementInfo)) return
          const nextEntry: MultiSelectionEntry = {
            key: `library:${elementInfo.id}`,
            object: root,
            source: 'library',
            element: elementInfo,
          }
          if (isDeleteMode) {
            commitSelection([nextEntry])
            deleteSelectedEntry()
            return
          }
          upsertSelection(nextEntry, isAppend)
          return
        }

        if (floorHit?.object && floorGroupRef.current) {
          const root = findGroupRootFromObject(floorHit.object, floorGroupRef.current)
          const elementInfo = root ? getFloorPlanElementInfo(root) : null
          if (!root || !elementInfo || !isSelectableThreeDComponent(elementInfo)) return
          if (isDeleteMode) {
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

        if (!isAppend && !isDeleteMode) {
          commitSelection([])
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
  }, [rebuildFloorGroup, deleteSelectedEntry, syncOrbitPanBinding, syncTransformSnap, updateTransformSelection])

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
        const remappedLibraryEntries: MultiSelectionEntry[] = []
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
      const remappedLibraryEntries: MultiSelectionEntry[] = []
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
  }, [libraryElements, updateTransformSelection])

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
      selected.scale.set(nextScaleX, nextScaleY, nextScaleZ)

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
