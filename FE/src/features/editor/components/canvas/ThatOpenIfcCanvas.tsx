import { useEffect, useRef, useState } from 'react'
import type { Object3D } from 'three'
import type { IfcElementChange, IfcElementInfo } from '../../types'
import {
  patchIfcTextForMaterialDefaults,
} from '../../services/ifcChange.service'
import type { ThreeDLibraryPreset } from './ThreeDLibraryPanel'
import {
  DEFAULT_IFC_COLOR_BY_CATEGORY,
  PROJECT_WORLD_UNITS_PER_MM,
  applyObjectColor,
  applyObjectMaterial,
  createElementMaterial,
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

interface ThatOpenIfcCanvasProps {
  ifcUrl: string
  libraryElements: ThreeDLibraryPreset[]
  ifcElementChanges: IfcElementChange[]
  isRotationLocked: boolean
  zoomScale: number
  selectedIfcElement?: IfcElementInfo | null
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
  onLibraryElementChange?: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete?: (id: string) => void
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
type Selected3DTarget =
  | {
      source: 'ifc'
      modelId: string
      localId: number
      hitLocalId: number
      object?: Object3D
      selectedSignature?: string
      selectedColorSignature?: string
      selectedMaterialSignature?: string
    }
  | {
      source: 'library'
      object: Object3D
      selectedSignature?: string
      selectedColorSignature?: string
      selectedMaterialSignature?: string
    }
  | null
type IfcEditableObject3D = Object3D & {
  userData: {
    ifcEditTarget?: {
      modelId: string
      localId: number
      hitLocalId: number
      element: IfcElementInfo
    }
    [key: string]: unknown
  }
}
type ThatOpenSceneState = {
  three: ThreeModule
  scene: import('three').Scene
  camera: import('three').PerspectiveCamera | import('three').OrthographicCamera
  renderer: import('three').WebGLRenderer
  fragments: import('@thatopen/components').FragmentsManager
  hider: import('@thatopen/components').Hider
  raycaster: import('@thatopen/components').SimpleRaycaster
  transformControls: import('three/examples/jsm/controls/TransformControls.js').TransformControls
  contentGroup: import('three').Group
  ifcEditGroup: import('three').Group
  ifcObject: Object3D
  worldUnitsPerMm: number
  worldCamera?: {
    fitToItems?: () => Promise<void> | void
  }
  cameraControls?: {
    azimuthRotateSpeed: number
    polarRotateSpeed: number
    setLookAt?: (
      positionX: number,
      positionY: number,
      positionZ: number,
      targetX: number,
      targetY: number,
      targetZ: number,
      enableTransition?: boolean,
    ) => Promise<void> | void
  }
}

const getElementDimensionSignature = (element?: IfcElementInfo | null) => [
  element?.id ?? '',
  element?.lengthMm ?? '',
  element?.heightMm ?? '',
  element?.thicknessMm ?? '',
].join(':')

const getElementColorSignature = (element?: IfcElementInfo | null) => [
  element?.id ?? '',
  element?.color ?? '',
].join(':')

const getElementMaterialSignature = (element?: IfcElementInfo | null) => [
  element?.id ?? '',
  element?.material ?? '',
].join(':')

const setCameraClipping = (
  camera: import('three').PerspectiveCamera | import('three').OrthographicCamera,
  maxSize: number,
) => {
  const clippingCamera = camera as typeof camera & {
    near?: number
    far?: number
    updateProjectionMatrix?: () => void
  }
  clippingCamera.near = 1
  clippingCamera.far = Math.max(maxSize * 12, 100000)
  clippingCamera.updateProjectionMatrix?.()
}

const fitObjectWithPadding = (
  THREE: ThreeModule,
  camera: import('three').PerspectiveCamera | import('three').OrthographicCamera,
  controls: {
    setLookAt?: (
      positionX: number,
      positionY: number,
      positionZ: number,
      targetX: number,
      targetY: number,
      targetZ: number,
      enableTransition?: boolean,
    ) => Promise<void> | void
  } | undefined,
  object: Object3D,
  padding = 1.8,
) => {
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  const maxSize = Math.max(size.x, size.y, size.z, 1)
  setCameraClipping(camera, maxSize)
  const distance = maxSize * padding
  const nextX = center.x + distance
  const nextY = center.y + distance * 0.7
  const nextZ = center.z + distance

  if (controls?.setLookAt) {
    void controls.setLookAt(nextX, nextY, nextZ, center.x, center.y, center.z, true)
    return
  }

  const fallbackCamera = camera as typeof camera & {
    lookAt?: (target: import('three').Vector3) => void
    updateProjectionMatrix?: () => void
  }
  fallbackCamera.position.set(nextX, nextY, nextZ)
  fallbackCamera.lookAt?.(center)
  fallbackCamera.updateProjectionMatrix?.()
}

const findIfcEditableRoot = (object: Object3D, editGroup: import('three').Group): IfcEditableObject3D | null => {
  let cursor: IfcEditableObject3D | null = object as IfcEditableObject3D
  while (cursor) {
    if (cursor.userData?.ifcEditTarget) return cursor
    if (cursor.parent === editGroup) return cursor
    cursor = (cursor.parent ?? null) as IfcEditableObject3D | null
  }
  return null
}

const disposeObjectMaterials = (THREE: ThreeModule, object: Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose())
    } else {
      child.material.dispose()
    }
  })
}

const setObjectOpacity = (THREE: ThreeModule, object: Object3D | undefined, opacity: number) => {
  if (!object) return
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      ;(material as { transparent?: boolean }).transparent = opacity < 1
      ;(material as { opacity?: number }).opacity = opacity
      ;(material as { depthWrite?: boolean }).depthWrite = true
      ;(material as { needsUpdate?: boolean }).needsUpdate = true
    })
  })
}

const clearSelectedTarget = async (
  sceneState: ThatOpenSceneState,
  target: Selected3DTarget,
  removeObject = false,
) => {
  if (!target) return

  sceneState.transformControls.detach()
  sceneState.transformControls.visible = false
  sceneState.transformControls.enabled = false

  if (target.source === 'ifc') {
    setObjectOpacity(sceneState.three, target.object, 1)
    if (target.object) {
      if (removeObject) {
        target.object.parent?.remove(target.object)
        disposeObjectMaterials(sceneState.three, target.object)
      }
    }
    return
  }

  if (removeObject) {
    target.object.parent?.remove(target.object)
    disposeObjectMaterials(sceneState.three, target.object)
  }
}

const positionPresetGroupBesideIfc = (
  THREE: ThreeModule,
  ifcObject: Object3D,
  presetGroup: import('three').Group,
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
) => {
  if (presetGroup.children.length === 0) return

  const ifcBox = new THREE.Box3().setFromObject(ifcObject)
  const ifcCenter = new THREE.Vector3()
  const ifcSize = new THREE.Vector3()
  ifcBox.getCenter(ifcCenter)
  ifcBox.getSize(ifcSize)
  const ifcGroundY = ifcCenter.y - ifcSize.y / 2

  const previousPosition = new THREE.Vector3(
    presetGroup.position.x,
    presetGroup.position.y,
    presetGroup.position.z,
  )
  presetGroup.position.set(0, 0, 0)
  ;(presetGroup as Object3D & { updateMatrixWorld?: (force?: boolean) => void }).updateMatrixWorld?.(true)

  const presetBox = new THREE.Box3().setFromObject(presetGroup)
  const presetCenter = new THREE.Vector3()
  const presetSize = new THREE.Vector3()
  presetBox.getCenter(presetCenter)
  presetBox.getSize(presetSize)
  const presetGroundY = presetCenter.y - presetSize.y / 2

  const gap = 600
  presetGroup.position.copy(previousPosition)
  presetGroup.position.set(
    ifcCenter.x + ifcSize.x / 2 + gap * worldUnitsPerMm - (presetCenter.x - presetSize.x / 2),
    ifcGroundY - presetGroundY,
    ifcCenter.z - presetCenter.z,
  )
  ;(presetGroup as Object3D & { updateMatrixWorld?: (force?: boolean) => void }).updateMatrixWorld?.(true)
}

const inferWorldUnitsPerMm = (THREE: ThreeModule, ifcObject: Object3D) => {
  const ifcSize = new THREE.Vector3()
  new THREE.Box3().setFromObject(ifcObject).getSize(ifcSize)
  const maxSize = Math.max(ifcSize.x, ifcSize.y, ifcSize.z)

  return maxSize > 100 ? 1 : PROJECT_WORLD_UNITS_PER_MM
}

const getMaterialColorHex = (material: unknown) => {
  const color = (material as { color?: { getHexString?: () => string } })?.color
  const hex = color?.getHexString?.()
  return hex ? `#${hex.toUpperCase()}` : undefined
}

const resolveEditorMaterialFromColor = (color?: string) => {
  if (!color) return undefined
  const normalized = color.toUpperCase()
  if (normalized === '#C56F45') return 'Tile'
  if (normalized === '#A8A29E') return 'Concrete'
  if (normalized === '#A3472C') return 'Brick'
  if (normalized === '#8A94A3') return 'Steel'
  if (normalized === '#9A6232') return 'Wood'
  if (normalized === '#8FD3FF') return 'Glass'
  if (normalized === '#8D8D86') return 'Stone'
  return undefined
}

const applyInitialIfcMaterialStyles = (THREE: ThreeModule, ifcObject: Object3D) => {
  ifcObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return

    const previousMaterials = Array.isArray(child.material) ? child.material : [child.material]
    const color = previousMaterials.map(getMaterialColorHex).find(Boolean)
    const materialName = resolveEditorMaterialFromColor(color)
    if (!materialName) return

    previousMaterials.forEach((material) => {
      const map = (material as { map?: { dispose?: () => void } }).map
      map?.dispose?.()
      material.dispose()
    })
    child.material = createElementMaterial(THREE, materialName, color)
  })
}

const applyIfcItemColor = async (
  THREE: ThreeModule,
  fragments: import('@thatopen/components').FragmentsManager,
  target: Extract<Selected3DTarget, { source: 'ifc' }>,
  color?: string,
) => {
  if (!color) return
  const ThreeColor = (THREE as unknown as { Color: new (value: string) => unknown }).Color

  await fragments.highlight({
    color: new ThreeColor(color),
    opacity: 1,
    transparent: false,
    renderedFaces: 1,
    preserveOriginalMaterial: true,
  }, {
    [target.modelId]: new Set([target.hitLocalId]),
  })
}

const attachIfcTransformProxy = async (
  THREE: ThreeModule,
  fragments: import('@thatopen/components').FragmentsManager,
  hider: import('@thatopen/components').Hider,
  transformControls: import('three/examples/jsm/controls/TransformControls.js').TransformControls,
  editGroup: import('three').Group,
  modelId: string,
  localIds: number[],
  visibleLocalId: number,
  element: IfcElementInfo,
) => {
  for (const localId of localIds) {
    const boxes = await fragments.getBBoxes({ [modelId]: new Set([localId]) })
    const box = boxes[0]
    if (!box) continue

    const stableLocalId = localIds[0]
    const objectName = `ifc-edit-${modelId}-${stableLocalId}`
    const existing = editGroup.children.find((child) => child.name === objectName) as IfcEditableObject3D | undefined
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const editable = existing ?? new THREE.Group()
    editable.name = objectName
    editable.position.copy(center)
    editable.userData = {
      ...editable.userData,
      ifcEditTarget: {
        modelId,
        localId: stableLocalId,
        hitLocalId: localId,
        element,
      },
    }

    if (!existing) {
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
      const material = createElementMaterial(
        THREE,
        element.material,
        element.color ?? DEFAULT_IFC_COLOR_BY_CATEGORY[element.category] ?? DEFAULT_IFC_COLOR_BY_CATEGORY.Element,
      )
      ;(material as unknown as { transparent: boolean; opacity: number; depthWrite: boolean }).transparent = true
      ;(material as unknown as { transparent: boolean; opacity: number; depthWrite: boolean }).opacity = 0.86
      ;(material as unknown as { transparent: boolean; opacity: number; depthWrite: boolean }).depthWrite = true
      const mesh = new THREE.Mesh(geometry, material)
      editable.add(mesh)
      editGroup.add(editable)
    }

    await hider.set(false, {
      [modelId]: new Set([visibleLocalId]),
    })
    setObjectOpacity(THREE, editable, 0.86)
    transformControls.attach(editable)
    transformControls.visible = true
    transformControls.enabled = true
    return editable
  }

  return null
}

export default function ThatOpenIfcCanvas({
  ifcUrl,
  libraryElements,
  ifcElementChanges,
  isRotationLocked,
  zoomScale,
  selectedIfcElement,
  onIfcElementSelect,
  onLibraryElementChange,
  onLibraryElementDelete,
}: ThatOpenIfcCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<ThatOpenSceneState | null>(null)
  const presetGroupRef = useRef<import('three').Group | null>(null)
  const rotationLockedRef = useRef(isRotationLocked)
  const onIfcElementSelectRef = useRef(onIfcElementSelect)
  const onLibraryElementChangeRef = useRef(onLibraryElementChange)
  const onLibraryElementDeleteRef = useRef(onLibraryElementDelete)
  const ifcPsetMetricsRef = useRef<IfcPsetMetricMaps>({ byId: {}, byName: {} })
  const selectedTargetRef = useRef<Selected3DTarget>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  void ifcElementChanges

  useEffect(() => {
    onIfcElementSelectRef.current = onIfcElementSelect
  }, [onIfcElementSelect])

  useEffect(() => {
    onLibraryElementChangeRef.current = onLibraryElementChange
  }, [onLibraryElementChange])

  useEffect(() => {
    onLibraryElementDeleteRef.current = onLibraryElementDelete
  }, [onLibraryElementDelete])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let components: import('@thatopen/components').Components | null = null
    let handlePointerDown: ((event: PointerEvent) => void) | null = null
    let handleKeyDown: ((event: KeyboardEvent) => void) | null = null

    const loadIfc = async () => {
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
        world.camera = new OBC.SimpleCamera(components)

        components.init()
        world.scene.setup()
        world.scene.three.background = null
        await world.camera.controls?.setLookAt(8, 6, 8, 0, 0, 0)
        if (world.camera.controls) {
          world.camera.controls.azimuthRotateSpeed = rotationLockedRef.current ? 0 : 1
          world.camera.controls.polarRotateSpeed = rotationLockedRef.current ? 0 : 1
        }

        const grids = components.get(OBC.Grids)
        grids.create(world)

        const fragments = components.get(OBC.FragmentsManager)
        fragments.init(await OBC.FragmentsManager.getWorker())

        const ifcLoader = components.get(OBC.IfcLoader)
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: '/',
            absolute: false,
          },
        })

        const response = await fetch(ifcUrl)
        if (!response.ok) {
          throw new Error(`IFC file load failed. (${response.status})`)
        }

        const patchedIfcText = patchIfcTextForMaterialDefaults(await response.text())
        const data = new TextEncoder().encode(patchedIfcText)
        ifcPsetMetricsRef.current = parseBatangDimensionProperties(patchedIfcText)
        const model = await ifcLoader.load(data, true, 'shinchan-house')
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
        ;(transformControls as unknown as {
          addEventListener: (type: 'dragging-changed', listener: (event: { value: boolean }) => void) => void
        }).addEventListener('dragging-changed', (event) => {
          if (!world.camera.controls) return
          ;(world.camera.controls as unknown as { enabled: boolean }).enabled = !event.value
          if (event.value) return
          const selectedTarget = selectedTargetRef.current
          if (selectedTarget?.source !== 'library') return
          const libraryObject = selectedTarget.object as LibraryObject3D
          const preset = getLibraryPresetFromObject(libraryObject)
          if (!preset) return
          onLibraryElementChangeRef.current?.(preset.id, {
            position: {
              x: libraryObject.position.x,
              y: libraryObject.position.y,
              z: libraryObject.position.z,
            },
          })
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
          if ((transformControls as unknown as { dragging?: boolean }).dragging) {
            return
          }
          const ifcEditHit = raycaster.intersectObjects(ifcEditGroup.children, true)[0]
          const libraryHit = raycaster.intersectObjects(presetGroup.children, true)[0]
          const clearPreviousSelection = async (nextObject?: Object3D, nextIfcLocalId?: number) => {
            const currentTarget = selectedTargetRef.current
            if (!currentTarget) return
            if (nextObject && currentTarget.object === nextObject) return
            if (currentTarget.source === 'ifc' && currentTarget.hitLocalId === nextIfcLocalId) return
            await clearSelectedTarget(sceneRef.current ?? {
              three: THREE,
              scene: world.scene.three,
              camera,
              renderer,
              fragments,
              hider,
              raycaster: thatOpenRaycaster,
              transformControls,
              contentGroup,
              ifcEditGroup,
              ifcObject: fragmentModel.object,
              worldUnitsPerMm,
              worldCamera: world.camera,
              cameraControls: world.camera.controls,
            }, currentTarget)
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
              const selectedElement = element ?? (ifcPick.object
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
              nextTarget.object = editableObject ?? undefined
              selectedTargetRef.current = nextTarget
              onIfcElementSelectRef.current?.(selectedElement)
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
            return
          }

          if (wasTransformActive) {
            return
          }

          await clearPreviousSelection()
          selectedTargetRef.current = null
          onIfcElementSelectRef.current?.(null)
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

          if (selectedTarget.source === 'ifc') {
            await hider.set(false, {
              [selectedTarget.modelId]: new Set([selectedTarget.hitLocalId]),
            })
            transformControls.detach()
            transformControls.visible = false
            transformControls.enabled = false
            if (selectedTarget.object) {
              selectedTarget.object.parent?.remove(selectedTarget.object)
            }
            selectedTargetRef.current = null
            onIfcElementSelectRef.current?.(null)
            return
          }

          if (selectedTarget.source === 'library') {
            const libraryObject = selectedTarget.object as LibraryObject3D
            const preset = getLibraryPresetFromObject(libraryObject)
            transformControls.detach()
            transformControls.visible = false
            transformControls.enabled = false
            libraryObject.parent?.remove(libraryObject)
            disposeObjectMaterials(THREE, libraryObject)
            selectedTargetRef.current = null
            onIfcElementSelectRef.current?.(null)
            if (preset) onLibraryElementDeleteRef.current?.(preset.id)
          }
        }
        window.addEventListener('keydown', handleKeyDown, true)

        await fragments.core.update(true)
        fitObjectWithPadding(THREE, world.camera.three, world.camera.controls, fragmentModel.object, 1.55 / Math.max(zoomScale, 0.1))
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
  }, [ifcUrl])

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
  }, [selectedIfcElement?.color])

  useEffect(() => {
    const sceneState = sceneRef.current
    const target = selectedTargetRef.current
    if (!sceneState || !target || !selectedIfcElement?.material) return
    const currentMaterialSignature = getElementMaterialSignature(selectedIfcElement)
    if (target.selectedMaterialSignature === currentMaterialSignature) return
    target.selectedMaterialSignature = currentMaterialSignature

    const object = target.source === 'library' ? target.object : target.object
    applyObjectMaterial(sceneState.three, object ?? null, selectedIfcElement.material, selectedIfcElement.color)
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
  }, [selectedIfcElement?.material])

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
    positionPresetGroupBesideIfc(THREE, sceneState.ifcObject, presetGroup, sceneState.worldUnitsPerMm)
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

