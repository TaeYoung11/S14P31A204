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
import type { ThreeDLibraryDropRequest, ThreeDLibraryPreset } from './threeDLibrary.types'
import { isSelectableThreeDComponent } from './threeDSelection.utils'
import {
  applyObjectColor,
  applyObjectMaterial,
  getMaterialDefaultColor,
  type MaybeThatOpenMaterialsManager,
  type ThreeModule,
} from './thatopen/ifcMaterials'
import {
  createPresetMesh,
  findLibraryRoot,
  getLibraryElementInfo,
  getLibraryScaleDimensionPatch,
  getLibraryPresetFromObject,
  updateLibraryPresetData,
  type LibraryObject3D,
} from './thatopen/ifcLibraryMesh'
import {
  getIfcElementFromFragments,
  normalizeIfcElement,
  parseBatangDimensionProperties,
  type IfcPsetMetricMaps,
} from './thatopen/ifcPropertyParser'
import {
  type Selected3DTarget,
  type IfcEditableObject3D,
  type ThatOpenSceneState,
  getElementDimensionSignature,
  getElementColorSignature,
  getElementMaterialSignature,
  getRuntimeIfcModelId,
  fetchIfcText,
  fitObjectWithPadding,
  findIfcEditableRoot,
  disposeObjectMaterials,
  clearSelectedTarget,
  positionPresetGroupBesideIfc,
  inferWorldUnitsPerMm,
  getObjectSizeMm,
  toDisplayCoordinates,
  applyInitialIfcMaterialStyles,
  applyIfcItemColor,
  attachIfcTransformProxy,
} from './thatopen/ifcSceneHelpers'
import type { ThreeDCameraViewPresetCommand } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import {
  allowsCtrlWheelZoom,
  isDeleteTool,
  isSelectionInteractionTool,
  isSelectionTool,
} from './threeDInteraction.utils'
import { createGableRoofGeometry } from './threeDRoofGeometry.utils'
import { mergeSelectionByKey } from './threeDSelectionCollection.utils'
import ThreeDMarqueeOverlay from './ThreeDMarqueeOverlay'
import { resolveLibraryDropPositionPatch } from './threeDLibraryDrop.utils'
import { applyTransformSnap, type TransformSnapControl } from './threeDTransformSnap.utils'
import { applyScaleSnapByMm } from './threeDScaleSnap.utils'
import {
  appendUniqueSelectionByKey,
  isPointerInsideBounds,
  isScreenPointInsideRect,
  toNormalizedMouse,
  toScreenRectFromPointers,
  type ScreenRect,
} from './threeDPointerSelection.utils'

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
  /** TransformControls 모드: 이동(translate) / 회전(rotate) / 크기(scale) */
  transformMode?: 'translate' | 'rotate' | 'scale'
  selectedTool?: string
  libraryDropRequest?: ThreeDLibraryDropRequest | null
  onResolveLibraryDrop?: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
  cameraViewPresetCommand?: ThreeDCameraViewPresetCommand
  transformSnapEnabled?: boolean
  transformSnapIntervalMm?: number
  isEditingLocked?: boolean
}

interface LoadedFragmentModel {
  object: Object3D
  useCamera: (camera: unknown) => void
}

type ComponentsModule = typeof import('@thatopen/components')
type TransformControlsModule = typeof import('three/examples/jsm/controls/TransformControls.js')
type IfcRaycastPick = {
  fragments?: { modelId: string }
  localId?: number
  object?: Object3D
  distance?: number
} | null
type MultiSelectedTarget = Extract<Selected3DTarget, { source: 'ifc' | 'library' }>
type ResolvedMultiSelectedTarget = MultiSelectedTarget & { object: Object3D }
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
  transformMode = 'translate',
  selectedTool = 'selection',
  libraryDropRequest,
  onResolveLibraryDrop,
  cameraViewPresetCommand,
  transformSnapEnabled = true,
  transformSnapIntervalMm = 100,
  isEditingLocked = false,
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
  const ifcPsetMetricsRef = useRef<IfcPsetMetricMaps>({ byId: {}, byName: {} })
  const selectedTargetRef = useRef<Selected3DTarget>(null)
  const handledLibraryDropTokenRef = useRef(0)
  const handledCameraPresetTokenRef = useRef(0)
  const transformModeRef = useRef<'translate' | 'rotate' | 'scale'>(transformMode)
  const selectedToolRef = useRef(selectedTool)
  const isEditingLockedRef = useRef(isEditingLocked)
  const transformSnapEnabledRef = useRef(transformSnapEnabled)
  const transformSnapIntervalMmRef = useRef(transformSnapIntervalMm)
  const isShiftSnapRef = useRef(false)
  const defaultLeftMouseActionRef = useRef<unknown>(null)
  const panMouseActionRef = useRef<unknown>(null)
  const cameraMouseButtonsRef = useRef<{ left?: unknown; middle?: unknown; right?: unknown } | null>(null)
  const rendererDomRef = useRef<HTMLCanvasElement | null>(null)
  const prevZoomScaleRef = useRef<number | null>(null)
  const selectedTargetsRef = useRef<MultiSelectedTarget[]>([])
  const multiAnchorRef = useRef<import('three').Object3D | null>(null)
  const multiDragSnapshotRef = useRef<{
    anchorStart: import('three').Vector3
    memberWorldByKey: Map<string, import('three').Vector3>
  } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  /**
   * 현재 도구 모드와 스냅 상태를 TransformControls에 동기화한다.
   * Move/Rotate/Scale이 동일 규칙으로 적용되도록 공통 유틸을 사용한다.
   */
  const syncTransformSnap = useCallback(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    applyTransformSnap({
      control: sceneState.transformControls as TransformSnapControl,
      transformMode: transformModeRef.current,
      snapEnabled: transformSnapEnabledRef.current,
      snapIntervalMm: transformSnapIntervalMmRef.current,
      isShiftSnap: isShiftSnapRef.current,
      worldUnitsPerMm: sceneState.worldUnitsPerMm,
    })
  }, [])

  const getTargetKey = useCallback((target: MultiSelectedTarget) => {
    if (target.source === 'library') {
      const preset = getLibraryPresetFromObject(target.object as LibraryObject3D)
      return `library:${preset?.id ?? target.object.uuid ?? 'unknown'}`
    }
    return `ifc:${target.modelId}:${target.localId}`
  }, [])

  const resolveTargetElement = useCallback((target: MultiSelectedTarget): IfcElementInfo | null => {
    if (target.source === 'library') {
      return getLibraryElementInfo(target.object as LibraryObject3D)
    }
    const editable = target.object as IfcEditableObject3D | undefined
    return editable?.userData.ifcEditTarget?.element ?? null
  }, [])

  const updateSelectionTargets = useCallback(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return
    const THREE = sceneState.three
    const tc = sceneState.transformControls

    const entries = selectedTargetsRef.current.filter(
      (entry): entry is ResolvedMultiSelectedTarget => Boolean(entry.object),
    )
    selectedTargetsRef.current = entries
    if (entries.length === 0) {
      tc.detach()
      tc.visible = false
      tc.enabled = false
      selectedTargetRef.current = null
      if (multiAnchorRef.current) {
        sceneState.contentGroup.remove(multiAnchorRef.current)
      }
      multiAnchorRef.current = null
      onIfcElementSelectRef.current?.(null)
      return
    }

    const primary = entries[entries.length - 1]
    selectedTargetRef.current = primary
    onIfcElementSelectRef.current?.(resolveTargetElement(primary))

    if (entries.length === 1) {
      if (isEditingLockedRef.current) {
        tc.detach()
        tc.visible = false
        tc.enabled = false
        return
      }
      if (multiAnchorRef.current) {
        sceneState.contentGroup.remove(multiAnchorRef.current)
      }
      multiAnchorRef.current = null
      tc.detach()
      tc.attach(primary.object)
      tc.visible = true
      tc.enabled = true
      return
    }

    if (multiAnchorRef.current) {
      sceneState.contentGroup.remove(multiAnchorRef.current)
    }
    if (isEditingLockedRef.current) {
      multiAnchorRef.current = null
      tc.detach()
      tc.visible = false
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
    sceneState.contentGroup.add(anchor)
    multiAnchorRef.current = anchor

    tc.detach()
    tc.attach(anchor)
    tc.visible = true
    tc.enabled = true
  }, [resolveTargetElement])
  const deleteSelectedTarget = useCallback(async () => {
    if (isEditingLockedRef.current) return
    const sceneState = sceneRef.current
    const selectedTarget = selectedTargetRef.current
    if (!sceneState || !selectedTarget) return

    if (selectedTarget.source === 'ifc') {
      const deletedElement = selectedTarget.object
        ? (selectedTarget.object as IfcEditableObject3D).userData.ifcEditTarget?.element
        : ifcPsetMetricsRef.current.byId[selectedTarget.localId]
          ? {
              ...ifcPsetMetricsRef.current.byId[selectedTarget.localId],
              id: String(selectedTarget.localId),
              source: 'ifc' as const,
              properties: {},
            }
          : null
      await sceneState.hider.set(false, {
        [selectedTarget.modelId]: new Set([selectedTarget.hitLocalId]),
      })
      sceneState.transformControls.detach()
      sceneState.transformControls.visible = false
      sceneState.transformControls.enabled = false
      if (selectedTarget.object) {
        selectedTarget.object.parent?.remove(selectedTarget.object)
      }
      selectedTargetsRef.current = selectedTargetsRef.current.filter((entry) => entry !== selectedTarget)
      updateSelectionTargets()
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
      selectedTargetsRef.current = selectedTargetsRef.current.filter((entry) => entry !== selectedTarget)
      updateSelectionTargets()
      onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(sceneState.camera.position))
      if (preset) onLibraryElementDeleteRef.current?.(preset.id)
    }
  }, [updateSelectionTargets])
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
    transformModeRef.current = transformMode
  }, [transformMode])

  useEffect(() => {
    selectedToolRef.current = selectedTool
    const mouseButtons = cameraMouseButtonsRef.current
    if (!mouseButtons) return
    if (defaultLeftMouseActionRef.current === null) defaultLeftMouseActionRef.current = mouseButtons.left
    if (panMouseActionRef.current === null) panMouseActionRef.current = mouseButtons.right
    mouseButtons.left = selectedToolRef.current === 'hand'
      ? panMouseActionRef.current ?? mouseButtons.right
      : defaultLeftMouseActionRef.current ?? mouseButtons.left
    mouseButtons.middle = panMouseActionRef.current ?? mouseButtons.right
    if (rendererDomRef.current) {
      rendererDomRef.current.style.cursor = selectedToolRef.current === 'hand' ? 'grab' : 'default'
    }
  }, [selectedTool])

  useEffect(() => {
    isEditingLockedRef.current = isEditingLocked
    updateSelectionTargets()
  }, [isEditingLocked, updateSelectionTargets])

  useEffect(() => {
    transformSnapEnabledRef.current = transformSnapEnabled
  }, [transformSnapEnabled])

  useEffect(() => {
    transformSnapIntervalMmRef.current = transformSnapIntervalMm
  }, [transformSnapIntervalMm])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let components: import('@thatopen/components').Components | null = null
    let handlePointerDown: ((event: PointerEvent) => void) | null = null
    let handlePointerMove: ((event: PointerEvent) => void) | null = null
    let handlePointerUp: ((event: PointerEvent) => void) | null = null
    let handleHandCursorDown: ((event: PointerEvent) => void) | null = null
    let handleHandCursorUp: ((event: PointerEvent) => void) | null = null
    let handleKeyDown: ((event: KeyboardEvent) => void) | null = null
    let handleKeyUp: ((event: KeyboardEvent) => void) | null = null
    let handleWheel: ((event: WheelEvent) => void) | null = null
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
        rendererDomRef.current = world.renderer.three.domElement

        components.init()
        world.scene.setup()
        world.scene.three.background = null
        await world.camera.controls?.setLookAt(8, 6, 8, 0, 0, 0)
        const syncCanvasCursor = () => {
          if (!rendererDomRef.current) return
          rendererDomRef.current.style.cursor = selectedToolRef.current === 'hand' ? 'grab' : 'default'
        }
        if (world.camera.controls) {
          world.camera.controls.azimuthRotateSpeed = rotationLockedRef.current ? 0 : 1
          world.camera.controls.polarRotateSpeed = rotationLockedRef.current ? 0 : 1
          const mouseButtons = (world.camera.controls as unknown as {
            mouseButtons?: { left?: unknown; middle?: unknown; right?: unknown }
          }).mouseButtons
          if (mouseButtons?.right !== undefined) {
            cameraMouseButtonsRef.current = mouseButtons
            // 3D 패닝 UX: hand 도구에서는 좌클릭=패닝, 그 외는 기존 좌클릭 동작 유지
            defaultLeftMouseActionRef.current = mouseButtons.left
            panMouseActionRef.current = mouseButtons.right
            mouseButtons.left = selectedToolRef.current === 'hand'
              ? panMouseActionRef.current
              : defaultLeftMouseActionRef.current
            // 기존 우클릭 패닝 유지 + 중클릭 패닝 확장
            mouseButtons.middle = panMouseActionRef.current
          }
          syncCanvasCursor()
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
        // unpkg 네트워크 의존 없이 로컬 워커 파일 사용
        fragments.init('/fragments-worker.mjs')

        const ifcLoader = components.get(OBC.IfcLoader)
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: '/',
            absolute: false,
          },
        })
        // @thatopen/components@3.4.x 는 fragments.core.models.materials 경로를 사용한다.
        const materialsManager = (
          fragments.core.models.materials as unknown as MaybeThatOpenMaterialsManager | undefined
        ) ?? undefined

        const ifcText = await fetchIfcText(ifcUrl)
        const modelId = getRuntimeIfcModelId(projectId)
        const patchedIfcText = patchIfcTextForMaterialDefaults(ifcText)
        const data = new TextEncoder().encode(patchedIfcText)
        ifcPsetMetricsRef.current = parseBatangDimensionProperties(patchedIfcText)
        const model = await ifcLoader.load(data, true, modelId)
        if (disposed) return

        const contentGroup = new THREE.Group()
        contentGroup.name = 'ifc-editor-content'
        world.scene.three.add(contentGroup)

        const presetGroup = new THREE.Group()
        presetGroup.name = 'library-presets'

        const fragmentModel = model as unknown as LoadedFragmentModel
        fragmentModel.useCamera(world.camera.three)
        applyInitialIfcMaterialStyles(THREE, fragmentModel.object, materialsManager)
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
        transformControls.setMode(transformModeRef.current)
        // Move 기즈모 동작을 명시적으로 고정한다.
        const tcConfig = transformControls as unknown as {
          setSpace?: (space: 'world' | 'local') => void
          setRotationSnap?: (radians: number | null) => void
          showX?: boolean
          showY?: boolean
          showZ?: boolean
        }
        tcConfig.setSpace?.('world')
        tcConfig.showX = true
        tcConfig.showY = true
        tcConfig.showZ = true
        transformControls.visible = false
        transformControls.enabled = false
        syncTransformSnap()
        const transformHelper = transformControls.getHelper()
        world.scene.three.add(transformHelper)
        let isTransformPointerActive = false
        ;(transformControls as unknown as {
          addEventListener: (type: 'mouseDown' | 'mouseUp', listener: () => void) => void
        }).addEventListener('mouseDown', () => {
          isTransformPointerActive = true
          const entries = selectedTargetsRef.current
          const anchor = multiAnchorRef.current
          if (entries.length <= 1 || !anchor || transformModeRef.current !== 'translate') return
          const anchorStart = anchor.position.clone()
          const memberWorldByKey = new Map<string, import('three').Vector3>()
          const worldPosition = new THREE.Vector3()
          entries.forEach((entry) => {
            if (!entry.object) return
            entry.object.getWorldPosition(worldPosition)
            memberWorldByKey.set(getTargetKey(entry), worldPosition.clone())
          })
          multiDragSnapshotRef.current = { anchorStart, memberWorldByKey }
        })
        ;(transformControls as unknown as {
          addEventListener: (type: 'mouseDown' | 'mouseUp', listener: () => void) => void
        }).addEventListener('mouseUp', () => {
          isTransformPointerActive = false
        })
        ;(transformControls as unknown as {
          addEventListener: (type: 'objectChange', listener: () => void) => void
        }).addEventListener('objectChange', () => {
          const isScaleSnapActive =
            transformModeRef.current === 'scale' &&
            (transformSnapEnabledRef.current || isShiftSnapRef.current)
          if (isScaleSnapActive) {
            const entries = selectedTargetsRef.current
            if (entries.length === 1 && entries[0].object) {
              const axis = (transformControls as unknown as { axis?: string | null }).axis
              applyScaleSnapByMm(
                THREE,
                entries[0].object,
                transformSnapIntervalMmRef.current,
                worldUnitsPerMm,
                axis,
              )
            }
          }

          const snapshot = multiDragSnapshotRef.current
          const anchor = multiAnchorRef.current
          const entries = selectedTargetsRef.current
          if (!snapshot || !anchor || entries.length <= 1 || transformModeRef.current !== 'translate') return
          const worldDelta = anchor.position.clone().sub(snapshot.anchorStart)
          entries.forEach((entry) => {
            if (!entry.object) return
            const startWorld = snapshot.memberWorldByKey.get(getTargetKey(entry))
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
        ;(transformControls as unknown as {
          addEventListener: (type: 'dragging-changed', listener: (event: { value: boolean }) => void) => void
        }).addEventListener('dragging-changed', (event) => {
          if (world.camera.controls) {
            ;(world.camera.controls as unknown as { enabled: boolean }).enabled = !event.value
          }
          if (event.value) return
          const multiEntries = selectedTargetsRef.current
          if (multiEntries.length > 1) {
            multiEntries.forEach((entry) => {
              if (!entry.object) return
              if (entry.source === 'library') {
                const libraryObject = entry.object as LibraryObject3D
                const preset = getLibraryPresetFromObject(libraryObject)
                if (!preset) return
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
                }
                onLibraryElementChangeRef.current?.(preset.id, patch)
                return
              }
              const editable = entry.object as IfcEditableObject3D
              const editTarget = editable.userData.ifcEditTarget
              const element = editTarget?.element
              if (!editTarget || !element) return
              const worldPosition = new THREE.Vector3()
              editable.getWorldPosition(worldPosition)
              const nextElement: IfcElementInfo = {
                ...element,
                positionX: worldPosition.x,
                positionY: worldPosition.y,
                positionZ: worldPosition.z,
                properties: {
                  ...element.properties,
                  PositionX: Number(worldPosition.x.toFixed(3)),
                  PositionY: Number(worldPosition.y.toFixed(3)),
                  PositionZ: Number(worldPosition.z.toFixed(3)),
                },
              }
              editable.userData.ifcEditTarget = { ...editTarget, element: nextElement }
            })
            multiDragSnapshotRef.current = null
            const primary = multiEntries[multiEntries.length - 1]
            if (primary?.object) {
              const worldPosition = new THREE.Vector3()
              primary.object.getWorldPosition(worldPosition)
              emitCoordinates(worldPosition)
            }
            return
          }
          const selectedTarget = selectedTargetRef.current
          if (selectedTarget?.source === 'library') {
            const libraryObject = selectedTarget.object as LibraryObject3D
            const preset = getLibraryPresetFromObject(libraryObject)
            if (preset) {
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
              }
              if (transformModeRef.current === 'scale') {
                const scalePatch = getLibraryScaleDimensionPatch(libraryObject, worldUnitsPerMm)
                if (scalePatch) {
                  patch.lengthMm = scalePatch.lengthMm
                  patch.heightMm = scalePatch.heightMm
                  patch.thicknessMm = scalePatch.thicknessMm
                }
              }
              updateLibraryPresetData(libraryObject, patch)
              onLibraryElementChangeRef.current?.(preset.id, patch)
              onIfcElementSelectRef.current?.(getLibraryElementInfo(libraryObject))
            }
          }
          if (selectedTarget?.source === 'ifc' && selectedTarget.object) {
            const editable = selectedTarget.object as IfcEditableObject3D
            const editTarget = editable.userData.ifcEditTarget
            const element = editTarget?.element
            if (editTarget && element) {
              const worldPosition = new THREE.Vector3()
              const worldQuaternion = new THREE.Quaternion()
              const worldEuler = new THREE.Euler()
              const sizeMm = transformModeRef.current === 'scale'
                ? getObjectSizeMm(THREE, editable, worldUnitsPerMm)
                : null
              editable.getWorldPosition(worldPosition)
              editable.getWorldQuaternion(worldQuaternion)
              worldEuler.setFromQuaternion(worldQuaternion, 'XYZ')
              const nextElement: IfcElementInfo = {
                ...element,
                lengthMm: sizeMm?.lengthMm ?? element.lengthMm,
                heightMm: sizeMm?.heightMm ?? element.heightMm,
                thicknessMm: sizeMm?.thicknessMm ?? element.thicknessMm,
                positionX: worldPosition.x,
                positionY: worldPosition.y,
                positionZ: worldPosition.z,
                rotationX: (worldEuler.x * 180) / Math.PI,
                rotationY: (worldEuler.y * 180) / Math.PI,
                rotationZ: (worldEuler.z * 180) / Math.PI,
                properties: {
                  ...element.properties,
                  PositionX: Number(worldPosition.x.toFixed(3)),
                  PositionY: Number(worldPosition.y.toFixed(3)),
                  PositionZ: Number(worldPosition.z.toFixed(3)),
                  Length: sizeMm?.lengthMm ?? element.lengthMm ?? '-',
                  Height: sizeMm?.heightMm ?? element.heightMm ?? '-',
                  Thickness: sizeMm?.thicknessMm ?? element.thicknessMm ?? '-',
                  RotationX: Number((((worldEuler.x * 180) / Math.PI)).toFixed(2)),
                  RotationY: Number((((worldEuler.y * 180) / Math.PI)).toFixed(2)),
                  RotationZ: Number((((worldEuler.z * 180) / Math.PI)).toFixed(2)),
                },
              }
              editable.userData.ifcEditTarget = { ...editTarget, element: nextElement }
              onIfcElementSelectRef.current?.(nextElement)
            }
          }
          if (selectedTarget?.object) {
            const selectedWorldPosition = new THREE.Vector3()
            selectedTarget.object.getWorldPosition(selectedWorldPosition)
            emitCoordinates(selectedWorldPosition)
            return
          }
          emitCoordinates(world.camera.three.position)
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
          materialsManager,
          worldCamera: world.camera,
          cameraControls: world.camera.controls,
        }
        presetGroupRef.current = presetGroup
        positionPresetGroupBesideIfc(THREE, fragmentModel.object, presetGroup, worldUnitsPerMm)
        const renderer = world.renderer.three
        const camera = world.camera.three

        const commitSelection = (targets: MultiSelectedTarget[]) => {
          selectedTargetsRef.current = targets
          updateSelectionTargets()
        }
        const appendSelection = (target: MultiSelectedTarget) => {
          const previous = selectedTargetsRef.current
          commitSelection(appendUniqueSelectionByKey(previous, target, getTargetKey))
        }
        const projectToScreen = (object: import('three').Object3D) => {
          const worldPosition = new THREE.Vector3()
          object.getWorldPosition(worldPosition)
          worldPosition.project(camera)
          const bounds = renderer.domElement.getBoundingClientRect()
          return {
            x: ((worldPosition.x + 1) * 0.5) * bounds.width + bounds.left,
            y: ((-worldPosition.y + 1) * 0.5) * bounds.height + bounds.top,
          }
        }
        const collectMarqueeTargets = (rect: ScreenRect) => {
          const targets: MultiSelectedTarget[] = []
          presetGroup.children.forEach((child) => {
            const root = child as LibraryObject3D
            const element = getLibraryElementInfo(root)
            if (!element || !isSelectableThreeDComponent(element)) return
            const point = projectToScreen(root)
            if (!isScreenPointInsideRect(point, rect)) return
            targets.push({
              source: 'library',
              object: root,
              selectedSignature: getElementDimensionSignature(element),
              selectedColorSignature: getElementColorSignature(element),
              selectedMaterialSignature: getElementMaterialSignature(element),
            })
          })
          ifcEditGroup.children.forEach((child) => {
            const editable = child as IfcEditableObject3D
            const editTarget = editable.userData.ifcEditTarget
            if (!editTarget || !isSelectableThreeDComponent(editTarget.element)) return
            const point = projectToScreen(editable)
            if (!isScreenPointInsideRect(point, rect)) return
            targets.push({
              source: 'ifc',
              modelId: editTarget.modelId,
              localId: editTarget.localId,
              hitLocalId: editTarget.hitLocalId,
              object: editable,
              selectedSignature: getElementDimensionSignature(editTarget.element),
              selectedColorSignature: getElementColorSignature(editTarget.element),
              selectedMaterialSignature: getElementMaterialSignature(editTarget.element),
            })
          })
          return targets
        }

        handlePointerDown = async (event: PointerEvent) => {
          if (disposed) return
          if (event.button !== 0) return
          const isDeleteMode = isDeleteTool(selectedToolRef.current)
          const isSelectionMode = isSelectionTool(selectedToolRef.current)
          if (isEditingLockedRef.current && isDeleteMode) return
          if (!isSelectionInteractionTool(selectedToolRef.current)) return
          container.focus()
          const bounds = renderer.domElement.getBoundingClientRect()
          if (!isPointerInsideBounds(bounds, event.clientX, event.clientY)) {
            return
          }
          const isAppend = isSelectionMode && event.shiftKey
          const applyDeleteTarget = async (target: MultiSelectedTarget) => {
            selectedTargetRef.current = target
            selectedTargetsRef.current = target.object ? [target] : []
            await deleteSelectedTarget()
          }

          const normalizedMouse = toNormalizedMouse(THREE, bounds, event.clientX, event.clientY)
          const screenMouse = new THREE.Vector2(event.clientX, event.clientY)
          const raycaster = new THREE.Raycaster()
          raycaster.setFromCamera(normalizedMouse, camera)
          const wasTransformActive = transformControls.visible && transformControls.enabled
          const transformState = transformControls as unknown as { dragging?: boolean }
          if (transformState.dragging || (wasTransformActive && isTransformPointerActive)) {
            return
          }
          const ifcEditHit = raycaster.intersectObjects(ifcEditGroup.children, true)[0]
          const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
          // 이전 선택을 해제한다. 동일 객체/로컬ID이면 아무 처리도 하지 않는다.
          const clearPreviousSelection = async (nextObject?: Object3D, nextIfcLocalId?: number) => {
            if (isAppend) return
            const currentTarget = selectedTargetRef.current
            // sceneRef.current는 loadIfc 완료 후 등록된 핸들러 내부이므로 항상 유효하다.
            const activeScene = sceneRef.current
            if (!currentTarget || !activeScene) return
            if (nextObject && currentTarget.object === nextObject) return
            if (currentTarget.source === 'ifc' && currentTarget.hitLocalId === nextIfcLocalId) return
            await clearSelectedTarget(activeScene, currentTarget)
            selectedTargetRef.current = null
          }

          if (ifcEditHit?.object) {
            const editableRoot = findIfcEditableRoot(ifcEditHit.object, ifcEditGroup)
            const editTarget = editableRoot?.userData.ifcEditTarget
            if (editableRoot && editTarget && isSelectableThreeDComponent(editTarget.element)) {
              const editableWorldPosition = new THREE.Vector3()
              const editableWorldQuaternion = new THREE.Quaternion()
              const editableWorldEuler = new THREE.Euler()
              editableRoot.getWorldPosition(editableWorldPosition)
              editableRoot.getWorldQuaternion(editableWorldQuaternion)
              editableWorldEuler.setFromQuaternion(editableWorldQuaternion, 'XYZ')
              const nextElement: IfcElementInfo = {
                ...editTarget.element,
                positionX: editableWorldPosition.x,
                positionY: editableWorldPosition.y,
                positionZ: editableWorldPosition.z,
                rotationX: (editableWorldEuler.x * 180) / Math.PI,
                rotationY: (editableWorldEuler.y * 180) / Math.PI,
                rotationZ: (editableWorldEuler.z * 180) / Math.PI,
                properties: {
                  ...editTarget.element.properties,
                  PositionX: Number(editableWorldPosition.x.toFixed(3)),
                  PositionY: Number(editableWorldPosition.y.toFixed(3)),
                  PositionZ: Number(editableWorldPosition.z.toFixed(3)),
                  RotationX: Number((((editableWorldEuler.x * 180) / Math.PI)).toFixed(2)),
                  RotationY: Number((((editableWorldEuler.y * 180) / Math.PI)).toFixed(2)),
                  RotationZ: Number((((editableWorldEuler.z * 180) / Math.PI)).toFixed(2)),
                },
              }
              await clearPreviousSelection(editableRoot, editTarget.hitLocalId)
              const nextTarget: MultiSelectedTarget = {
                source: 'ifc',
                modelId: editTarget.modelId,
                localId: editTarget.localId,
                hitLocalId: editTarget.hitLocalId,
                object: editableRoot,
                selectedSignature: getElementDimensionSignature(nextElement),
                selectedColorSignature: getElementColorSignature(nextElement),
                selectedMaterialSignature: getElementMaterialSignature(nextElement),
              }
              editableRoot.userData.ifcEditTarget = {
                ...editTarget,
                element: nextElement,
              }
              if (isDeleteMode) {
                await applyDeleteTarget(nextTarget)
              } else if (isAppend) {
                appendSelection(nextTarget)
              } else {
                commitSelection([nextTarget])
              }
              if (!isDeleteMode) emitCoordinates(editableWorldPosition)
              return
            }
          }

          const fragmentPick = await fragments.raycast({
            camera,
            mouse: screenMouse,
            dom: renderer.domElement,
          })
          const fastPick = await thatOpenRaycaster.castRay({ position: normalizedMouse })
          const ifcPick = fragmentPick ?? (fastPick as unknown as IfcRaycastPick)
          if (ifcPick?.fragments?.modelId && typeof ifcPick.localId === 'number') {
            const ifcDistance = typeof ifcPick.distance === 'number' ? ifcPick.distance : Number.POSITIVE_INFINITY
            const libraryDistance = typeof (libraryHit as unknown as { distance?: unknown } | undefined)?.distance === 'number'
              ? (libraryHit as unknown as { distance: number }).distance
              : Number.POSITIVE_INFINITY
            if (!libraryHit || ifcDistance <= libraryDistance) {
              if (!isDeleteMode) {
                await clearPreviousSelection(undefined, ifcPick.localId)
              }
              const element = await getIfcElementFromFragments(fragments, {
                modelId: ifcPick.fragments.modelId,
                localId: ifcPick.localId,
              }, ifcPsetMetricsRef.current)
              const selectedLocalId = typeof element?.expressId === 'number' ? element.expressId : ifcPick.localId
              let selectedElement = element ?? (ifcPick.object
                ? normalizeIfcElement(ifcPick.object, `${ifcPick.fragments.modelId}:${ifcPick.localId}`)
                : {
                    id: `${ifcPick.fragments.modelId}:${ifcPick.localId}`,
                    name: 'IFC Element',
                    ifcClass: 'IfcElement',
                    category: 'Element',
                    source: 'ifc',
                    expressId: selectedLocalId,
                    properties: {},
                  })
              const nextTarget: Extract<Selected3DTarget, { source: 'ifc' }> = {
                source: 'ifc',
                modelId: ifcPick.fragments.modelId,
                localId: selectedLocalId,
                hitLocalId: ifcPick.localId,
                selectedSignature: getElementDimensionSignature(selectedElement),
                selectedColorSignature: getElementColorSignature(selectedElement),
                selectedMaterialSignature: getElementMaterialSignature(selectedElement),
              }
              const pickedObjectSize = getObjectSizeMm(THREE, ifcPick.object, worldUnitsPerMm)
              const editableObject = await attachIfcTransformProxy(
                THREE,
                fragments,
                hider,
                transformControls,
                ifcEditGroup,
                ifcPick.fragments.modelId,
                [selectedLocalId, ifcPick.localId],
                ifcPick.localId,
                selectedElement,
                materialsManager,
              )
              if (editableObject) {
                const editableWorldPosition = new THREE.Vector3()
                const editableWorldQuaternion = new THREE.Quaternion()
                const editableWorldEuler = new THREE.Euler()
                editableObject.getWorldPosition(editableWorldPosition)
                editableObject.getWorldQuaternion(editableWorldQuaternion)
                editableWorldEuler.setFromQuaternion(editableWorldQuaternion, 'XYZ')

                const fallbackSize = pickedObjectSize ?? getObjectSizeMm(THREE, editableObject, worldUnitsPerMm)
                if (fallbackSize) {
                  const nextLength = selectedElement.lengthMm ?? fallbackSize.lengthMm
                  const nextHeight = selectedElement.heightMm ?? fallbackSize.heightMm
                  const nextThickness = selectedElement.thicknessMm ?? fallbackSize.thicknessMm
                  if (
                    selectedElement.lengthMm !== nextLength ||
                    selectedElement.heightMm !== nextHeight ||
                    selectedElement.thicknessMm !== nextThickness
                  ) {
                    selectedElement = {
                      ...selectedElement,
                      lengthMm: nextLength,
                      heightMm: nextHeight,
                      thicknessMm: nextThickness,
                      properties: {
                        ...selectedElement.properties,
                        Length: nextLength,
                        Height: nextHeight,
                        Thickness: nextThickness,
                      },
                    }
                  }
                }
                selectedElement = {
                  ...selectedElement,
                  positionX: editableWorldPosition.x,
                  positionY: editableWorldPosition.y,
                  positionZ: editableWorldPosition.z,
                  rotationX: (editableWorldEuler.x * 180) / Math.PI,
                  rotationY: (editableWorldEuler.y * 180) / Math.PI,
                  rotationZ: (editableWorldEuler.z * 180) / Math.PI,
                  properties: {
                    ...selectedElement.properties,
                    PositionX: Number(editableWorldPosition.x.toFixed(3)),
                    PositionY: Number(editableWorldPosition.y.toFixed(3)),
                    PositionZ: Number(editableWorldPosition.z.toFixed(3)),
                    RotationX: Number((((editableWorldEuler.x * 180) / Math.PI)).toFixed(2)),
                    RotationY: Number((((editableWorldEuler.y * 180) / Math.PI)).toFixed(2)),
                    RotationZ: Number((((editableWorldEuler.z * 180) / Math.PI)).toFixed(2)),
                  },
                }
                editableObject.userData.ifcEditTarget = {
                  ...editableObject.userData.ifcEditTarget,
                  element: selectedElement,
                }
              }
              if (!isSelectableThreeDComponent(selectedElement)) {
                // 선택 허용 대상이 아니면 다른 hit 검사(라이브러리/빈 공간)로 넘어간다.
                // return 하지 않는다.
              } else {
              nextTarget.selectedSignature = getElementDimensionSignature(selectedElement)
              nextTarget.selectedColorSignature = getElementColorSignature(selectedElement)
              nextTarget.selectedMaterialSignature = getElementMaterialSignature(selectedElement)
              nextTarget.object = editableObject ?? undefined
              if (isDeleteMode) {
                await applyDeleteTarget(nextTarget)
              } else if (nextTarget.object) {
                if (isAppend) {
                  appendSelection(nextTarget)
                } else {
                  commitSelection([nextTarget])
                }
              } else if (!isAppend) {
                commitSelection([])
              }
              if (!isDeleteMode) {
                onIfcElementSelectRef.current?.(selectedElement)
                if (editableObject) {
                  const editableWorldPosition = new THREE.Vector3()
                  editableObject.getWorldPosition(editableWorldPosition)
                  emitCoordinates(editableWorldPosition)
                } else {
                  emitCoordinates(world.camera.three.position)
                }
              }
              return
              }
            }
          }

          if (libraryHit?.object) {
            const libraryRoot = findLibraryRoot(libraryHit.object, presetGroup) ?? (libraryHit.object as LibraryObject3D)
            if (!isDeleteMode) {
              await clearPreviousSelection(libraryRoot)
            }
            const libraryElement = getLibraryElementInfo(libraryRoot) ?? normalizeIfcElement(libraryRoot, 'library-preset')
            if (!isSelectableThreeDComponent(libraryElement)) {
              if (!isAppend && !isDeleteMode) {
                commitSelection([])
              }
              if (!isDeleteMode) emitCoordinates(world.camera.three.position)
              return
            }
            const nextTarget: MultiSelectedTarget = {
              source: 'library',
              object: libraryRoot,
              selectedSignature: getElementDimensionSignature(libraryElement),
              selectedColorSignature: getElementColorSignature(libraryElement),
              selectedMaterialSignature: getElementMaterialSignature(libraryElement),
            }
            if (isDeleteMode) {
              await applyDeleteTarget(nextTarget)
            } else if (isAppend) {
              appendSelection(nextTarget)
            } else {
              commitSelection([nextTarget])
            }
            if (!isDeleteMode) {
              const libraryWorldPosition = new THREE.Vector3()
              libraryRoot.getWorldPosition(libraryWorldPosition)
              emitCoordinates(libraryWorldPosition)
            }
            return
          }
          if (!isAppend && !isDeleteMode) {
            await clearPreviousSelection()
            commitSelection([])
            emitCoordinates(world.camera.three.position)
            return
          }

          const startX = event.clientX
          const startY = event.clientY
          let isMarqueeActive = false
          const activateMarquee = () => {
            if (isMarqueeActive) return
            isMarqueeActive = true
            if (world.camera.controls) {
              ;(world.camera.controls as unknown as { enabled: boolean }).enabled = false
            }
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
            const targets = collectMarqueeTargets(rect)
            if (isAppend) {
              commitSelection(mergeSelectionByKey(
                selectedTargetsRef.current,
                targets,
                getTargetKey,
              ))
            } else {
              commitSelection(targets)
            }
            setMarqueeRect(null)
            if (world.camera.controls) {
              ;(world.camera.controls as unknown as { enabled: boolean }).enabled = true
            }
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

        await fragments.core.update(true)
        // 최초 로드 시에는 고정 패딩으로 맞추고, 이후 줌 반영은 zoomScale effect에서 처리한다.
        fitObjectWithPadding(THREE, world.camera.three, world.camera.controls, fragmentModel.object, 1.55)
        setStatus('ready')
      } catch (error) {
        if (disposed) return
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'IFC model load failed.')
      }
    }

    void loadIfc()

    return () => {
      disposed = true
      if (handlePointerDown) container.removeEventListener('pointerdown', handlePointerDown)
      if (handlePointerMove) window.removeEventListener('pointermove', handlePointerMove, true)
      if (handlePointerUp) window.removeEventListener('pointerup', handlePointerUp, true)
      if (handleHandCursorDown && rendererDomRef.current) {
        rendererDomRef.current.removeEventListener('pointerdown', handleHandCursorDown, true)
      }
      if (handleHandCursorUp) window.removeEventListener('pointerup', handleHandCursorUp, true)
      if (handleWheel && rendererDomRef.current) {
        rendererDomRef.current.removeEventListener('wheel', handleWheel, true)
      }
      if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown, true)
      if (handleKeyUp) window.removeEventListener('keyup', handleKeyUp, true)
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
      ifcPsetMetricsRef.current = { byId: {}, byName: {} }
      selectedTargetRef.current = null
      selectedTargetsRef.current = []
      multiDragSnapshotRef.current = null
      setMarqueeRect(null)
      multiAnchorRef.current = null
      cameraMouseButtonsRef.current = null
      rendererDomRef.current = null
      prevZoomScaleRef.current = null
    }
  }, [deleteSelectedTarget, getTargetKey, ifcUrl, projectId, syncTransformSnap, updateSelectionTargets])

  useEffect(() => {
    if (deleteRequestToken <= 0) return
    void deleteSelectedTarget()
  }, [deleteRequestToken, deleteSelectedTarget])

  useEffect(() => {
    const sceneState = sceneRef.current
    if (!sceneState) return

    ifcElementChanges.forEach((change) => {
      if (!Number.isFinite(change.expressId)) return
      const localId = change.expressId
      if (change.deleted) {
        void sceneState.hider.set(false, {
          [sceneState.modelId]: new Set([localId]),
        })
        return
      }

      const displayColor = change.color ?? (change.material ? getMaterialDefaultColor(change.material) : undefined)
      if (displayColor) {
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
    const safeZoom = Math.max(zoomScale, 0.1)
    const prevZoom = prevZoomScaleRef.current
    if (prevZoom === null || !Number.isFinite(prevZoom) || prevZoom <= 0) {
      prevZoomScaleRef.current = safeZoom
      return
    }
    const ratio = prevZoom / safeZoom
    prevZoomScaleRef.current = safeZoom
    if (Math.abs(ratio - 1) < 1e-4) return

    const THREE = sceneState.three
    const camera = sceneState.camera as import('three').PerspectiveCamera
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
      target?: {
        x: number
        y: number
        z: number
        copy?: (v: import('three').Vector3) => void
      }
      update?: () => void
    } | null
    const target = controls?.target
      ? new THREE.Vector3(controls.target.x, controls.target.y, controls.target.z)
      : new THREE.Vector3(0, 0, 0)
    const offset = camera.position.clone().sub(target)
    if (offset.lengthSq() < 1e-8) return
    const nextPosition = target.clone().add(offset.multiplyScalar(ratio))

    if (controls?.setLookAt) {
      void controls.setLookAt(
        nextPosition.x,
        nextPosition.y,
        nextPosition.z,
        target.x,
        target.y,
        target.z,
        false,
      )
    } else {
      camera.position.copy(nextPosition)
      camera.lookAt(target)
      controls?.target?.copy?.(target)
      controls?.update?.()
    }
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
      target?: { copy: (v: import('three').Vector3) => void }
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

    // ifc 타겟의 경우 object가 undefined일 수 있으므로 null coalescing으로 처리한다.
    applyObjectMaterial(
      sceneState.three,
      target.object ?? null,
      selectedIfcElement.material,
      selectedIfcElement.color,
      sceneState.materialsManager,
    )
    if (target.source === 'library') {
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
      return
    }

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
  }, [selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !target.object || !selectedIfcElement) return
    const nextRoofShape = selectedIfcElement.roofShape
    if (nextRoofShape !== 'flat' && nextRoofShape !== 'gable') return

    if (target.source === 'library') {
      const libraryObject = target.object as LibraryObject3D
      const preset = getLibraryPresetFromObject(libraryObject)
      if (!preset || preset.type !== 'roof') return
      if (preset.roofShape === nextRoofShape) return

      updateLibraryPresetData(libraryObject, { roofShape: nextRoofShape })
      onLibraryElementChangeRef.current?.(preset.id, { roofShape: nextRoofShape })
      onIfcElementSelectRef.current?.(getLibraryElementInfo(libraryObject))
      return
    }

    if (target.source !== 'ifc') return
    const isRoofElement =
      selectedIfcElement.category.toLowerCase() === 'roof' ||
      selectedIfcElement.ifcClass.toLowerCase() === 'ifcroof'
    if (!isRoofElement) return

    const THREE = sceneState.three
    const length = (selectedIfcElement.lengthMm ?? 7000) * sceneState.worldUnitsPerMm
    const height = (selectedIfcElement.heightMm ?? 1200) * sceneState.worldUnitsPerMm
    const thickness = (selectedIfcElement.thicknessMm ?? 6000) * sceneState.worldUnitsPerMm

    const nextGeometry = nextRoofShape === 'gable'
      ? createGableRoofGeometry(THREE, { length, height, thickness })
      : new THREE.BoxGeometry(length, Math.max(height, 1e-4), thickness)

    target.object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      child.geometry = nextGeometry.clone()
    })

    const editable = target.object as IfcEditableObject3D
    const editTarget = editable.userData.ifcEditTarget
    const element = editTarget?.element
    if (editTarget && element) {
      editable.userData.ifcEditTarget = {
        ...editTarget,
        element: {
          ...element,
          roofShape: nextRoofShape,
          properties: {
            ...element.properties,
            RoofShape: nextRoofShape,
          },
        },
      }
    }
  }, [selectedIfcElement?.roofShape, selectedIfcElement?.lengthMm, selectedIfcElement?.heightMm, selectedIfcElement?.thicknessMm, selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement) return
    const currentSignature = getElementDimensionSignature(selectedIfcElement)
    if (target.selectedSignature === currentSignature) return
    target.selectedSignature = currentSignature
    if (target.source === 'ifc') {
      const isRoofElement =
        selectedIfcElement.category.toLowerCase() === 'roof' ||
        selectedIfcElement.ifcClass.toLowerCase() === 'ifcroof'
      if (isRoofElement && (selectedIfcElement.roofShape === 'flat' || selectedIfcElement.roofShape === 'gable')) return
    }

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

    const length = selectedIfcElement.lengthMm ? selectedIfcElement.lengthMm * sceneState.worldUnitsPerMm : undefined
    const height = selectedIfcElement.heightMm ? selectedIfcElement.heightMm * sceneState.worldUnitsPerMm : undefined
    const thickness = selectedIfcElement.thicknessMm ? selectedIfcElement.thicknessMm * sceneState.worldUnitsPerMm : undefined
    if (!length || !height || !thickness) return

    void sceneState.hider.set(false, {
      [target.modelId]: new Set([target.hitLocalId]),
    })

    const editable = target.object as IfcEditableObject3D
    // Scale 기즈모 결과를 geometry에 베이크한 뒤 scale을 1로 되돌려 배율 중복을 방지한다.
    editable.scale.set(1, 1, 1)
    target.object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      child.geometry = new THREE.BoxGeometry(length, height, thickness)
    })

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
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !target.object) return
    if (!selectedIfcElement) return
    if (
      !Number.isFinite(selectedIfcElement.positionX) ||
      !Number.isFinite(selectedIfcElement.positionY) ||
      !Number.isFinite(selectedIfcElement.positionZ)
    ) {
      return
    }

    const nextX = selectedIfcElement.positionX as number
    const nextY = selectedIfcElement.positionY as number
    const nextZ = selectedIfcElement.positionZ as number
    const transformObject = target.object as LibraryObject3D
    const THREE = sceneState.three
    const currentWorldPosition = new THREE.Vector3()
    transformObject.getWorldPosition(currentWorldPosition)
    if (
      Math.abs(currentWorldPosition.x - nextX) < 0.0005 &&
      Math.abs(currentWorldPosition.y - nextY) < 0.0005 &&
      Math.abs(currentWorldPosition.z - nextZ) < 0.0005
    ) {
      return
    }

    const nextWorldPosition = new THREE.Vector3(nextX, nextY, nextZ)
    if (transformObject.parent) {
      const nextLocalPosition = nextWorldPosition.clone()
      transformObject.parent.worldToLocal(nextLocalPosition)
      transformObject.position.copy(nextLocalPosition)
    } else {
      transformObject.position.copy(nextWorldPosition)
    }
    if (target.source === 'library') {
      const localPosition = transformObject.position
      updateLibraryPresetData(transformObject, {
        position: { x: localPosition.x, y: localPosition.y, z: localPosition.z },
      })
      const preset = getLibraryPresetFromObject(transformObject)
      if (preset) {
        onLibraryElementChangeRef.current?.(preset.id, {
          position: { x: localPosition.x, y: localPosition.y, z: localPosition.z },
        })
      }
      onIfcElementSelectRef.current?.(getLibraryElementInfo(transformObject))
    }
  }, [selectedIfcElement?.positionX, selectedIfcElement?.positionY, selectedIfcElement?.positionZ, selectedIfcElement])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !target.object) return
    if (!selectedIfcElement) return
    if (
      !Number.isFinite(selectedIfcElement.rotationX) ||
      !Number.isFinite(selectedIfcElement.rotationY) ||
      !Number.isFinite(selectedIfcElement.rotationZ)
    ) {
      return
    }

    const nextRotationX = ((selectedIfcElement.rotationX as number) * Math.PI) / 180
    const nextRotationY = ((selectedIfcElement.rotationY as number) * Math.PI) / 180
    const nextRotationZ = ((selectedIfcElement.rotationZ as number) * Math.PI) / 180
    const transformObject = target.object as LibraryObject3D
    const THREE = sceneState.three
    const currentWorldQuaternion = new THREE.Quaternion()
    const currentWorldEuler = new THREE.Euler()
    transformObject.getWorldQuaternion(currentWorldQuaternion)
    currentWorldEuler.setFromQuaternion(currentWorldQuaternion, 'XYZ')
    if (
      Math.abs(currentWorldEuler.x - nextRotationX) < 0.0005 &&
      Math.abs(currentWorldEuler.y - nextRotationY) < 0.0005 &&
      Math.abs(currentWorldEuler.z - nextRotationZ) < 0.0005
    ) {
      return
    }

    const nextWorldEuler = new THREE.Euler(nextRotationX, nextRotationY, nextRotationZ, 'XYZ')
    const nextWorldQuaternion = new THREE.Quaternion().setFromEuler(nextWorldEuler)
    if (transformObject.parent) {
      const parentWorldQuaternion = new THREE.Quaternion()
      transformObject.parent.getWorldQuaternion(parentWorldQuaternion)
      const nextLocalQuaternion = parentWorldQuaternion.clone().invert().multiply(nextWorldQuaternion)
      transformObject.quaternion.copy(nextLocalQuaternion)
    } else {
      transformObject.quaternion.copy(nextWorldQuaternion)
    }
    if (target.source === 'library') {
      const localRotation = transformObject.rotation
      updateLibraryPresetData(transformObject, {
        rotation: { x: localRotation.x, y: localRotation.y, z: localRotation.z },
      })
      const preset = getLibraryPresetFromObject(transformObject)
      if (preset) {
        onLibraryElementChangeRef.current?.(preset.id, {
          rotation: { x: localRotation.x, y: localRotation.y, z: localRotation.z },
        })
      }
      onIfcElementSelectRef.current?.(getLibraryElementInfo(transformObject))
    }
  }, [selectedIfcElement?.rotationX, selectedIfcElement?.rotationY, selectedIfcElement?.rotationZ, selectedIfcElement])

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
    sceneState.transformControls.setMode(transformMode)
    syncTransformSnap()
  }, [transformMode, syncTransformSnap])

  useEffect(() => {
    syncTransformSnap()
  }, [transformSnapEnabled, transformSnapIntervalMm, syncTransformSnap])

  useEffect(() => {
    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) return

    const { three: THREE } = sceneState
    const selectedLibraryPreset =
      selectedTargetRef.current?.source === 'library'
        ? getLibraryPresetFromObject(selectedTargetRef.current.object as LibraryObject3D)
        : undefined
    presetGroup.children.forEach((child) => {
      disposeObjectMaterials(THREE, child)
    })
    presetGroup.clear()

    libraryElements.forEach((preset, index) => {
      const presetMesh = createPresetMesh(
        THREE,
        preset,
        index,
        sceneState.worldUnitsPerMm,
        sceneState.materialsManager,
      )
      presetGroup.add(presetMesh)
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
        const nextTarget: MultiSelectedTarget = {
          source: 'library',
          object: nextRoot,
          selectedSignature: getElementDimensionSignature(libraryElement),
          selectedColorSignature: getElementColorSignature(libraryElement),
          selectedMaterialSignature: getElementMaterialSignature(libraryElement),
        }
        selectedTargetsRef.current = [nextTarget]
        updateSelectionTargets()
      } else {
        selectedTargetsRef.current = []
        updateSelectionTargets()
      }
    }
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [libraryElements, updateSelectionTargets])

  useEffect(() => {
    if (!libraryDropRequest) return
    if (libraryDropRequest.token <= handledLibraryDropTokenRef.current) return
    handledLibraryDropTokenRef.current = libraryDropRequest.token
    if (isEditingLockedRef.current) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const sceneState = sceneRef.current
    const presetGroup = presetGroupRef.current
    if (!sceneState || !presetGroup) {
      onResolveLibraryDrop?.(libraryDropRequest.token)
      return
    }

    const { three: THREE } = sceneState
    const bounds = sceneState.renderer.domElement.getBoundingClientRect()
    if (!isPointerInsideBounds(bounds, libraryDropRequest.clientX, libraryDropRequest.clientY)) {
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
    raycaster.setFromCamera(normalizedMouse, sceneState.camera as import('three').PerspectiveCamera)

    const ifcHit = raycaster.intersectObject(sceneState.ifcObject, true)[0]
    const hitPoint = ifcHit?.point

    const toPresetLocal = (worldPoint: import('three').Vector3) => (
      presetGroup.worldToLocal(worldPoint.clone())
    )
    const positionPatch = resolveLibraryDropPositionPatch({
      THREE,
      raycaster,
      hitPoint,
      toLocal: toPresetLocal,
    })

    onResolveLibraryDrop?.(libraryDropRequest.token, positionPatch)
  }, [libraryDropRequest, onResolveLibraryDrop, status])

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#F0F2F9]">
      <div ref={containerRef} tabIndex={0} className="h-full w-full outline-none" />
      <ThreeDMarqueeOverlay rect={marqueeRect} />

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
    </div>
  )
}
