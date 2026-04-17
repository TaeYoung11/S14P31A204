import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url'
import type { FragmentsModel, ItemData, RawItemData } from '@thatopen/fragments'
import type { AuthoringPoint, AuthoringPreview } from '../types/bim'

type ViewerWorld = OBC.SimpleWorld<
  OBC.SimpleScene,
  OBC.SimpleCamera,
  OBC.SimpleRenderer
>

const previewMaterial = new THREE.MeshBasicMaterial({
  color: '#f97316',
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
})

const previewEdgesMaterial = new THREE.LineBasicMaterial({
  color: '#fb923c',
})

const createOrientedPreviewGroup = (
  size: THREE.Vector3,
  center: THREE.Vector3,
  rotationZ = 0,
) => {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  const mesh = new THREE.Mesh(geometry, previewMaterial.clone())
  mesh.position.copy(center)
  mesh.rotation.z = rotationZ

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    previewEdgesMaterial.clone(),
  )
  edges.position.copy(center)
  edges.rotation.z = rotationZ

  const group = new THREE.Group()
  group.add(mesh, edges)
  group.name = 'authoring-preview'
  return group
}

export const useBIMModel = (containerRef: React.RefObject<HTMLDivElement>) => {
  const componentsRef = useRef<OBC.Components | null>(null)
  const worldRef = useRef<ViewerWorld | null>(null)
  const modelRef = useRef<FragmentsModel | null>(null)
  const modelObjectsRef = useRef(new Map<string, THREE.Object3D>())
  const previewObjectRef = useRef<THREE.Object3D | null>(null)
  const targetMarkerRef = useRef<THREE.Object3D | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const isMountedRef = useRef(false)

  const [components, setComponents] = useState<OBC.Components | null>(null)
  const [isReady, setIsReady] = useState(false)

  const clearPreviewGhost = useCallback(() => {
    const world = worldRef.current
    if (!world || !previewObjectRef.current) return
    world.scene.three.remove(previewObjectRef.current)
    previewObjectRef.current.traverse((child) => {
      if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) {
        child.geometry.dispose()
      }
    })
    previewObjectRef.current = null
  }, [])

  const clearTargetMarker = useCallback(() => {
    const world = worldRef.current
    if (!world || !targetMarkerRef.current) return
    world.scene.three.remove(targetMarkerRef.current)
    targetMarkerRef.current.traverse((child) => {
      if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) {
        child.geometry.dispose()
      }
      if ('material' in child) {
        const material = child.material
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose())
        } else if (material instanceof THREE.Material) {
          material.dispose()
        }
      }
    })
    targetMarkerRef.current = null
  }, [])

  const setTargetMarker = useCallback((point: AuthoringPoint | null) => {
    const world = worldRef.current
    if (!world) return

    clearTargetMarker()
    if (!point) return

    const group = new THREE.Group()
    group.name = 'move-target-marker'

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#22c55e' }),
    )
    sphere.position.set(point.x / 1000, point.y / 1000, point.z / 1000 + 0.08)

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(point.x / 1000, point.y / 1000, point.z / 1000),
        new THREE.Vector3(point.x / 1000, point.y / 1000, point.z / 1000 + 0.45),
      ]),
      new THREE.LineBasicMaterial({ color: '#22c55e' }),
    )

    group.add(sphere, line)
    world.scene.three.add(group)
    targetMarkerRef.current = group
  }, [clearTargetMarker])

  const removeModelObject = useCallback((modelId?: string | null) => {
    if (!modelId) return
    const world = worldRef.current
    const object = modelObjectsRef.current.get(modelId)
    if (!world || !object) return
    world.scene.three.remove(object)
    modelObjectsRef.current.delete(modelId)
  }, [])

  const disposeCurrentModel = useCallback(async () => {
    if (!componentsRef.current || !modelRef.current) return

    removeModelObject(modelRef.current.modelId)
    const fragments = componentsRef.current.get(OBC.FragmentsManager)
    await fragments.core.disposeModel(modelRef.current.modelId)
    modelRef.current = null
  }, [removeModelObject])

  const initViewer = useCallback(async () => {
    if (!containerRef.current || componentsRef.current) return

    const nextComponents = new OBC.Components()
    componentsRef.current = nextComponents

    try {
      const worlds = nextComponents.get(OBC.Worlds)
      const world =
        worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>()
      worldRef.current = world

      world.scene = new OBC.SimpleScene(nextComponents)
      world.renderer = new OBC.SimpleRenderer(nextComponents, containerRef.current)
      
      world.camera = new OBC.SimpleCamera(nextComponents)

      world.scene.setup()
      world.scene.three.background = new THREE.Color('#111111')

      world.scene.three.add(
        new THREE.AmbientLight(0xffffff, 0.8),
        new THREE.HemisphereLight(0xffffff, 0x444444, 1),
      )

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
      keyLight.position.set(12, 14, 10)
      world.scene.three.add(keyLight)

      nextComponents.init()

      const grids = nextComponents.get(OBC.Grids)
      grids.create(world)

      const fragments = nextComponents.get(OBC.FragmentsManager)
      fragments.init(fragmentsWorkerUrl)

      world.camera.controls.addEventListener('update', () => {
        void fragments.core.update()
      })

      fragments.list.onItemSet.add(({ key, value: model }) => {
        model.useCamera(world.camera.three)
        modelObjectsRef.current.set(key, model.object)
        world.scene.three.add(model.object)
        void fragments.core.update(true)
      })
      fragments.list.onItemDeleted.add((key) => {
        removeModelObject(key)
      })

      const loader = nextComponents.get(OBC.IfcLoader)
      await loader.setup({
        autoSetWasm: false,
        wasm: {
          path: new URL('/wasm/', window.location.origin).href,
          absolute: true,
        },
      })

      if (!isMountedRef.current || componentsRef.current !== nextComponents) {
        nextComponents.dispose()
        componentsRef.current = null
        worldRef.current = null
        modelRef.current = null
        return
      }

      const highlighter = nextComponents.get(OBCF.Highlighter)
      highlighter.setup({ world })
      highlighter.enabled = true

      await world.camera.controls.setLookAt(16, 16, 16, 0, 0, 0)

      if (!isMountedRef.current || componentsRef.current !== nextComponents) {
        nextComponents.dispose()
        componentsRef.current = null
        worldRef.current = null
        modelRef.current = null
        return
      }

      setComponents(nextComponents)
      setIsReady(true)
    } catch (error) {
      nextComponents.dispose()
      componentsRef.current = null
      worldRef.current = null
      modelRef.current = null
      modelObjectsRef.current.clear()
      setComponents(null)
      setIsReady(false)
      throw error
    }
  }, [containerRef])

  const ensureInit = useCallback(async () => {
    if (componentsRef.current) return true
    if (!containerRef.current) return false

    if (!initPromiseRef.current) {
      initPromiseRef.current = initViewer().finally(() => {
        if (!componentsRef.current) {
          initPromiseRef.current = null
        }
      })
    }

    await initPromiseRef.current
    return !!componentsRef.current
  }, [containerRef, initViewer])

  const loadModel = useCallback(
    async (url: string, bustCache = false) => {
      try {
        const initialized = await ensureInit()
        if (!initialized || !componentsRef.current || !worldRef.current) return

        await disposeCurrentModel()
        clearPreviewGhost()
        clearTargetMarker()

        const loader = componentsRef.current.get(OBC.IfcLoader)
        const requestUrl = bustCache ? `${url}?t=${Date.now()}` : url
        const response = await fetch(requestUrl)
        if (!response.ok) {
          throw new Error(`Failed to load IFC: ${response.status}`)
        }

        const data = await response.arrayBuffer()
        const buffer = new Uint8Array(data)
        const modelName = `ifc-model-${Date.now()}`
        const model = await loader.load(buffer, false, modelName)

        modelRef.current = model

        const sphere = model.box.getBoundingSphere(new THREE.Sphere())
        await worldRef.current.camera.controls.fitToSphere(sphere, true)
      } catch (error) {
        console.error('Error loading IFC:', error)
      }
    },
    [clearPreviewGhost, clearTargetMarker, disposeCurrentModel, ensureInit],
  )

  const loadIFC = useCallback(async (url: string) => {
    await loadModel(url)
  }, [loadModel])

  const refreshModel = useCallback(async (url: string) => {
    await loadModel(url, true)
  }, [loadModel])

  const getElementProperties = useCallback(async (expressID: number): Promise<Record<string, unknown> | null> => {
    if (!modelRef.current) return null

    try {
      const [itemsData, rawItems] = await Promise.all([
        modelRef.current.getItemsData([expressID], {
          attributesDefault: true,
        }),
        modelRef.current.getItems([expressID]),
      ])

      const item = itemsData[0] as ItemData | undefined
      const rawItem = rawItems.get(expressID) as RawItemData | undefined
      const merged: Record<string, unknown> = {
        ...((item as ItemData | undefined) ?? {}),
        __category: rawItem?.category,
        __guid: rawItem?.guid,
      }

      if (!merged.GlobalId && rawItem?.guid) {
        merged.GlobalId = { type: 1, value: rawItem.guid }
      }

      return merged
    } catch (error) {
      console.error('Failed to get properties:', error)
      return null
    }
  }, [])

  const pickGroundPoint = useCallback(
    (clientX: number, clientY: number, elevationMm = 0): AuthoringPoint | null => {
      const world = worldRef.current
      const container = containerRef.current
      if (!world || !container) return null

      const rect = container.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = -((clientY - rect.top) / rect.height) * 2 + 1

      const pointer = new THREE.Vector2(x, y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(pointer, world.camera.three)

      const plane = new THREE.Plane(
        new THREE.Vector3(0, 0, 1),
        -(elevationMm / 1000),
      )
      const point = new THREE.Vector3()
      const hit = raycaster.ray.intersectPlane(plane, point)
      if (!hit) return null

      return {
        x: point.x * 1000,
        y: point.y * 1000,
        z: elevationMm,
      }
    },
    [containerRef],
  )

  const setPreviewGhost = useCallback(
    (preview: AuthoringPreview | null) => {
      const world = worldRef.current
      if (!world) return

      clearPreviewGhost()

      if (!preview) return

      const geometry = preview.geometry
      const toMeters = (value: unknown, fallback = 0) =>
        Math.max((typeof value === 'number' ? value : fallback) / 1000, 0.05)
      const toRotation = (value: unknown) =>
        typeof value === 'number' ? THREE.MathUtils.degToRad(value) : 0

      let group: THREE.Group | null = null
      if (
        preview.element_type === 'wall' &&
        geometry &&
        typeof geometry === 'object' &&
        'start' in geometry &&
        'end' in geometry
      ) {
        const start = geometry.start as AuthoringPoint
        const end = geometry.end as AuthoringPoint
        const length = Math.hypot(end.x - start.x, end.y - start.y)
        const height = typeof geometry.height === 'number' ? geometry.height : 3000
        const thickness = typeof geometry.thickness === 'number' ? geometry.thickness : 200
        const center = new THREE.Vector3(
          (start.x + end.x) / 2000,
          (start.y + end.y) / 2000,
          (start.z + height / 2) / 1000,
        )
        const rotationZ = Math.atan2(end.y - start.y, end.x - start.x)
        group = createOrientedPreviewGroup(
          new THREE.Vector3(toMeters(length), toMeters(thickness), toMeters(height)),
          center,
          rotationZ,
        )
      } else if (
        geometry &&
        typeof geometry === 'object' &&
        'position' in geometry
      ) {
        const position = geometry.position as AuthoringPoint
        if (position) {
          let xSize = 4000
          let ySize = 400
          let zSize =
            typeof geometry.height === 'number'
              ? geometry.height
              : typeof geometry.thickness === 'number'
                ? geometry.thickness
                : 3000

          if (preview.element_type === 'slab') {
            xSize = typeof geometry.length === 'number' ? geometry.length : 6000
            ySize = typeof geometry.width === 'number' ? geometry.width : 4000
            zSize = typeof geometry.thickness === 'number' ? geometry.thickness : zSize
          } else if (preview.element_type === 'roof') {
            xSize = typeof geometry.width === 'number' ? geometry.width : 4000
            ySize = typeof geometry.length === 'number' ? geometry.length : 6000
          } else {
            xSize = typeof geometry.width === 'number' ? geometry.width : 400
            ySize =
              typeof geometry.depth === 'number'
                ? geometry.depth
                : typeof geometry.length === 'number'
                  ? geometry.length
                  : 4000
          }

          group = createOrientedPreviewGroup(
            new THREE.Vector3(toMeters(xSize), toMeters(ySize), toMeters(zSize)),
            new THREE.Vector3(position.x / 1000, position.y / 1000, (position.z + zSize / 2) / 1000),
            toRotation(geometry.rotation_z),
          )
        }
      }

      if (!group) {
        const box = preview.bbox
        const size = new THREE.Vector3(
          Math.max((box.max.x - box.min.x) / 1000, 0.05),
          Math.max((box.max.y - box.min.y) / 1000, 0.05),
          Math.max((box.max.z - box.min.z) / 1000, 0.05),
        )
        const center = new THREE.Vector3(
          (box.min.x + box.max.x) / 2000,
          (box.min.y + box.max.y) / 2000,
          (box.min.z + box.max.z) / 2000,
        )
        group = createOrientedPreviewGroup(size, center)
      }

      world.scene.three.add(group)
      previewObjectRef.current = group
    },
    [clearPreviewGhost],
  )

  const captureScreenshot = useCallback((): string | null => {
    const world = worldRef.current
    if (!world || !world.renderer || !world.camera) return null

    // 스크린샷 캡처 직전에 강제로 렌더링하여 버퍼를 채웁니다.
    // preserveDrawingBuffer 옵션이 있더라도 이 방법이 가장 확실합니다.
    world.renderer.three.render(world.scene.three, world.camera.three)

    // OBC.SimpleRenderer manages the WebGL canvas
    const canvas = world.renderer.three.domElement
    return canvas.toDataURL('image/png')
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void ensureInit()

    const handleUpdate = (event: Event) => {
      const delta = (event as CustomEvent<{ project_id?: string }>).detail
      window.setTimeout(() => {
        if (delta?.project_id) {
          void refreshModel(`http://localhost:8000/api/v1/projects/${delta.project_id}/model`)
        }
      }, 500)
    }

    const handleReset = () => {
      window.location.reload()
    }

    window.addEventListener('bim-model-update', handleUpdate)
    window.addEventListener('bim-model-reset', handleReset)

    return () => {
      isMountedRef.current = false
      window.removeEventListener('bim-model-update', handleUpdate)
      window.removeEventListener('bim-model-reset', handleReset)
      clearPreviewGhost()
      clearTargetMarker()

      if (componentsRef.current) {
        try {
          componentsRef.current.dispose()
        } catch (error) {
          console.warn('Dispose failed:', error)
        }
      }

      componentsRef.current = null
      worldRef.current = null
      modelRef.current = null
      modelObjectsRef.current.clear()
      initPromiseRef.current = null
      setComponents(null)
      setIsReady(false)
    }
  }, [clearPreviewGhost, clearTargetMarker, ensureInit, refreshModel])

  return {
    components,
    isReady,
    loadIFC,
    refreshModel,
    getElementProperties,
    pickGroundPoint,
    setPreviewGhost,
    clearPreviewGhost,
    setTargetMarker,
    clearTargetMarker,
    captureScreenshot,
  }
}
