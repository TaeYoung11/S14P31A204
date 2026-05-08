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
  setObjectOpacity,
  clearSelectedTarget,
  positionPresetGroupBesideIfc,
  inferWorldUnitsPerMm,
  getObjectSizeMm,
  toDisplayCoordinates,
  applyInitialIfcMaterialStyles,
  applyIfcItemColor,
  attachIfcTransformProxy,
} from './thatopen/ifcSceneHelpers'

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const deleteSelectedTarget = useCallback(async () => {
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
      selectedTargetRef.current = null
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
      onIfcElementSelectRef.current?.(null)
      onThreeDCoordinatesChangeRef.current?.(toDisplayCoordinates(sceneState.camera.position))
      if (preset) onLibraryElementDeleteRef.current?.(preset.id)
    }
  }, [])
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
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let components: import('@thatopen/components').Components | null = null
    let handlePointerDown: ((event: PointerEvent) => void) | null = null
    let handleKeyDown: ((event: KeyboardEvent) => void) | null = null
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
        ;(transformControls as unknown as {
          addEventListener: (type: 'mouseDown' | 'mouseUp', listener: () => void) => void
        }).addEventListener('mouseDown', () => {
          isTransformPointerActive = true
        })
        ;(transformControls as unknown as {
          addEventListener: (type: 'mouseDown' | 'mouseUp', listener: () => void) => void
        }).addEventListener('mouseUp', () => {
          isTransformPointerActive = false
        })
        ;(transformControls as unknown as {
          addEventListener: (type: 'dragging-changed', listener: (event: { value: boolean }) => void) => void
        }).addEventListener('dragging-changed', (event) => {
          if (world.camera.controls) {
            ;(world.camera.controls as unknown as { enabled: boolean }).enabled = !event.value
          }
          if (event.value) return
          const selectedTarget = selectedTargetRef.current
          if (selectedTarget?.source === 'library') {
            const libraryObject = selectedTarget.object as LibraryObject3D
            const preset = getLibraryPresetFromObject(libraryObject)
            if (preset) {
              onLibraryElementChangeRef.current?.(preset.id, {
                position: {
                  x: libraryObject.position.x,
                  y: libraryObject.position.y,
                  z: libraryObject.position.z,
                },
              })
            }
          }
          if (selectedTarget?.object) {
            emitCoordinates(selectedTarget.object.position)
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
          worldCamera: world.camera,
          cameraControls: world.camera.controls,
        }
        presetGroupRef.current = presetGroup
        positionPresetGroupBesideIfc(THREE, fragmentModel.object, presetGroup, worldUnitsPerMm)
        const renderer = world.renderer.three
        const camera = world.camera.three

        handlePointerDown = async (event: PointerEvent) => {
          if (disposed) return
          container.focus()
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
          const wasTransformActive = transformControls.visible && transformControls.enabled
          const transformState = transformControls as unknown as { dragging?: boolean }
          if (transformState.dragging || (wasTransformActive && isTransformPointerActive)) {
            return
          }
          const ifcEditHit = raycaster.intersectObjects(ifcEditGroup.children, true)[0]
          const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
          // 이전 선택을 해제한다. 동일 객체/로컬ID이면 아무 처리도 하지 않는다.
          const clearPreviousSelection = async (nextObject?: Object3D, nextIfcLocalId?: number) => {
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
            if (editableRoot && editTarget) {
              await clearPreviousSelection(editableRoot, editTarget.hitLocalId)
              setObjectOpacity(THREE, editableRoot, 0.86)
              selectedTargetRef.current = {
                source: 'ifc',
                modelId: editTarget.modelId,
                localId: editTarget.localId,
                hitLocalId: editTarget.hitLocalId,
                object: editableRoot,
                selectedSignature: getElementDimensionSignature(editTarget.element),
                selectedColorSignature: getElementColorSignature(editTarget.element),
                selectedMaterialSignature: getElementMaterialSignature(editTarget.element),
              }
              transformControls.attach(editableRoot)
              transformControls.visible = true
              transformControls.enabled = true
              onIfcElementSelectRef.current?.(editTarget.element)
              emitCoordinates(editableRoot.position)
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
              await clearPreviousSelection(undefined, ifcPick.localId)
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
              )
              if (editableObject) {
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
              }
              nextTarget.selectedSignature = getElementDimensionSignature(selectedElement)
              nextTarget.selectedColorSignature = getElementColorSignature(selectedElement)
              nextTarget.selectedMaterialSignature = getElementMaterialSignature(selectedElement)
              nextTarget.object = editableObject ?? undefined
              selectedTargetRef.current = nextTarget
              onIfcElementSelectRef.current?.(selectedElement)
              if (editableObject) {
                emitCoordinates(editableObject.position)
              } else {
                emitCoordinates(world.camera.three.position)
              }
              return
            }
          }

          if (libraryHit?.object) {
            const libraryRoot = findLibraryRoot(libraryHit.object, presetGroup) ?? (libraryHit.object as LibraryObject3D)
            await clearPreviousSelection(libraryRoot)
            const libraryElement = getLibraryElementInfo(libraryRoot) ?? normalizeIfcElement(libraryRoot, 'library-preset')
            selectedTargetRef.current = {
              source: 'library',
              object: libraryRoot,
              selectedSignature: getElementDimensionSignature(libraryElement),
              selectedColorSignature: getElementColorSignature(libraryElement),
              selectedMaterialSignature: getElementMaterialSignature(libraryElement),
            }
            transformControls.attach(libraryRoot)
            transformControls.visible = true
            transformControls.enabled = true
            onIfcElementSelectRef.current?.(libraryElement)
            emitCoordinates(libraryRoot.position)
            return
          }

          if (wasTransformActive) {
            return
          }

          await clearPreviousSelection()
          selectedTargetRef.current = null
          onIfcElementSelectRef.current?.(null)
          emitCoordinates(world.camera.three.position)
        }
        container.addEventListener('pointerdown', handlePointerDown)

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
      if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown, true)
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
    }
  }, [deleteSelectedTarget, ifcUrl, projectId])

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

    // ifc 타겟의 경우 object가 undefined일 수 있으므로 null coalescing으로 처리한다.
    applyObjectMaterial(sceneState.three, target.object ?? null, selectedIfcElement.material, selectedIfcElement.color)
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

    const length = selectedIfcElement.lengthMm ? selectedIfcElement.lengthMm * sceneState.worldUnitsPerMm : undefined
    const height = selectedIfcElement.heightMm ? selectedIfcElement.heightMm * sceneState.worldUnitsPerMm : undefined
    const thickness = selectedIfcElement.thicknessMm ? selectedIfcElement.thicknessMm * sceneState.worldUnitsPerMm : undefined
    if (!length || !height || !thickness) return

    void sceneState.hider.set(false, {
      [target.modelId]: new Set([target.hitLocalId]),
    })

    target.object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      child.geometry = new THREE.BoxGeometry(length, height, thickness)
    })

    const editable = target.object as IfcEditableObject3D
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
    sceneState.transformControls.setMode(transformMode)
  }, [transformMode])

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
      const presetMesh = createPresetMesh(THREE, preset, index, sceneState.worldUnitsPerMm)
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
        selectedTargetRef.current = {
          source: 'library',
          object: nextRoot,
          selectedSignature: getElementDimensionSignature(libraryElement),
          selectedColorSignature: getElementColorSignature(libraryElement),
          selectedMaterialSignature: getElementMaterialSignature(libraryElement),
        }
        sceneState.transformControls.attach(nextRoot)
        sceneState.transformControls.visible = true
        sceneState.transformControls.enabled = true
      } else {
        selectedTargetRef.current = null
      }
    }
    sceneState.renderer.render(sceneState.scene, sceneState.camera as import('three').PerspectiveCamera)
  }, [libraryElements])

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
    </div>
  )
}
