import { useCallback, useEffect, useRef } from 'react'
import type { IfcElementInfo } from '../../types'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import { buildFloorPlan3DGroup } from '../../utils/floorPlanTo3D'
import type { ThreeDLibraryPreset } from './threeDLibrary.types'
import {
  createPresetMesh,
  findLibraryRoot,
  getLibraryElementInfo,
  getLibraryPresetFromObject,
  type LibraryObject3D,
} from './thatopen/ifcLibraryMesh'
import { disposeObjectMaterials, positionPresetGroupBesideIfc } from './thatopen/ifcSceneHelpers'

interface FloorPlan3DCanvasProps {
  data: FloorPlan3DData
  libraryElements?: ThreeDLibraryPreset[]
  deleteRequestToken?: number
  onLibraryElementChange?: (id: string, patch: Partial<ThreeDLibraryPreset>) => void
  onLibraryElementDelete?: (id: string) => void
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
}

type ThreeModule = typeof import('three')
type OrbitControlsInstance = import('three/examples/jsm/controls/OrbitControls.js').OrbitControls

/** 오브젝트 하위 메시의 geometry/material을 재귀적으로 해제한다. */
function disposeObject3DResources(object: import('three').Object3D) {
  object.traverse((child) => {
    const drawable = child as import('three').Object3D & {
      geometry?: { dispose?: () => void }
      material?: unknown
    }
    drawable.geometry?.dispose?.()

    const material = drawable.material
    if (Array.isArray(material)) {
      material.forEach((entry) => (entry as { dispose?: () => void })?.dispose?.())
      return
    }
    ;(material as { dispose?: () => void } | undefined)?.dispose?.()
  })
}

type TransformControlsInstance =
  import('three/examples/jsm/controls/TransformControls.js').TransformControls

/**
 * 2D 평면도 데이터를 Three.js로 즉시 3D 변환하여 표시하는 캔버스.
 * ThatOpen/IFC 없이 순수 Three.js + OrbitControls를 사용한다.
 * 360도 회전, 줌, 패닝을 지원한다.
 * 라이브러리 프리셋 추가 및 TransformControls를 통한 이동을 지원한다.
 */
export function FloorPlan3DCanvas({
  data,
  libraryElements,
  deleteRequestToken = 0,
  onLibraryElementChange,
  onLibraryElementDelete,
  onIfcElementSelect,
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
  const presetGroupRef = useRef<import('three').Group | null>(null)
  const selectedPresetRef = useRef<LibraryObject3D | null>(null)
  const animationFrameIdRef = useRef(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const onLibraryElementChangeRef = useRef(onLibraryElementChange)
  const onLibraryElementDeleteRef = useRef(onLibraryElementDelete)
  const onIfcElementSelectRef = useRef(onIfcElementSelect)

  useEffect(() => { onLibraryElementChangeRef.current = onLibraryElementChange }, [onLibraryElementChange])
  useEffect(() => { onLibraryElementDeleteRef.current = onLibraryElementDelete }, [onLibraryElementDelete])
  useEffect(() => { onIfcElementSelectRef.current = onIfcElementSelect }, [onIfcElementSelect])

  /** 현재 선택된 프리셋을 씬에서 제거하고 상태를 초기화한다. */
  const deleteSelectedPreset = useCallback(() => {
    const THREE = threeRef.current
    const selected = selectedPresetRef.current
    const tc = transformControlsRef.current
    if (!THREE || !selected || !tc) return

    const preset = getLibraryPresetFromObject(selected)
    tc.detach()
    tc.visible = false
    tc.enabled = false
    selected.parent?.remove(selected)
    disposeObjectMaterials(THREE, selected)
    selectedPresetRef.current = null
    onIfcElementSelectRef.current?.(null)
    if (preset) onLibraryElementDeleteRef.current?.(preset.id)
  }, [])

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
    let handleKeyDown: ((event: KeyboardEvent) => void) | null = null

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
      controlsRef.current = controls

      // ── 라이브러리 프리셋 그룹 ──
      const presetGroup = new THREE.Group()
      presetGroup.name = 'library-presets'
      scene.add(presetGroup)
      presetGroupRef.current = presetGroup

      // ── TransformControls (프리셋 이동용) ──
      const tc = new TransformControls(camera, renderer.domElement)
      tc.setMode('translate')
      tc.visible = false
      tc.enabled = false
      const tcHelper = tc.getHelper()
      scene.add(tcHelper)
      transformControlsRef.current = tc

      // 드래그 중 OrbitControls 비활성화
      ;(tc as unknown as {
        addEventListener: (type: 'dragging-changed', listener: (e: { value: boolean }) => void) => void
      }).addEventListener('dragging-changed', (event) => {
        ;(controls as unknown as { enabled: boolean }).enabled = !event.value
        if (event.value) return
        const selected = selectedPresetRef.current
        if (!selected) return
        const preset = getLibraryPresetFromObject(selected)
        if (preset) {
          onLibraryElementChangeRef.current?.(preset.id, {
            position: { x: selected.position.x, y: selected.position.y, z: selected.position.z },
          })
        }
      })

      // ── 프리셋 클릭 선택 ──
      handlePointerDown = (event: PointerEvent) => {
        if (cancelled) return
        const bounds = renderer.domElement.getBoundingClientRect()
        if (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        ) return

        const normalizedMouse = new THREE.Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        )
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(normalizedMouse, camera)
        const hit = raycaster.intersectObjects(presetGroup.children, true)[0]

        // 이전 선택 해제
        if (selectedPresetRef.current) {
          tc.detach()
          tc.visible = false
          tc.enabled = false
        }

        if (hit?.object) {
          const root = findLibraryRoot(hit.object, presetGroup) ?? (hit.object as LibraryObject3D)
          selectedPresetRef.current = root
          tc.attach(root)
          tc.visible = true
          tc.enabled = true
          const elementInfo = getLibraryElementInfo(root)
          onIfcElementSelectRef.current?.(elementInfo)
        } else {
          selectedPresetRef.current = null
          onIfcElementSelectRef.current?.(null)
        }
      }
      container.addEventListener('pointerdown', handlePointerDown)

      // ── Delete 키로 선택 프리셋 삭제 ──
      handleKeyDown = (event: KeyboardEvent) => {
        const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace'
        if (!isDeleteKey || !selectedPresetRef.current) return
        const target = event.target
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) return
        event.preventDefault()
        event.stopPropagation()
        deleteSelectedPreset()
      }
      window.addEventListener('keydown', handleKeyDown, true)

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
      if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown, true)

      controlsRef.current?.dispose()
      controlsRef.current = null

      ;(transformControlsRef.current as unknown as { dispose?: () => void })?.dispose?.()
      transformControlsRef.current = null
      selectedPresetRef.current = null

      if (threeRef.current) {
        if (floorGroupRef.current) {
          disposeObject3DResources(floorGroupRef.current)
          sceneRef.current?.remove(floorGroupRef.current)
        }
        if (presetGroupRef.current) {
          disposeObjectMaterials(threeRef.current, presetGroupRef.current)
          sceneRef.current?.remove(presetGroupRef.current)
        }
      }
      floorGroupRef.current = null
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
  }, [rebuildFloorGroup, deleteSelectedPreset])

  // libraryElements 변경 시 presetGroup을 재구성한다.
  useEffect(() => {
    const THREE = threeRef.current
    const presetGroup = presetGroupRef.current
    const tc = transformControlsRef.current
    if (!THREE || !presetGroup) return

    // 변경 전 선택된 프리셋 ID를 보존해 재구성 후 재선택한다.
    const previousSelectedId = selectedPresetRef.current
      ? getLibraryPresetFromObject(selectedPresetRef.current)?.id
      : undefined

    // TransformControls를 먼저 분리해 dangling reference를 방지한다.
    if (tc) {
      tc.detach()
      tc.visible = false
      tc.enabled = false
    }
    selectedPresetRef.current = null

    presetGroup.children.forEach((child) => disposeObjectMaterials(THREE, child))
    presetGroup.clear()

    if (!libraryElements?.length) {
      onIfcElementSelectRef.current?.(null)
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
        tc.attach(nextRoot)
        tc.visible = true
        tc.enabled = true
      } else {
        onIfcElementSelectRef.current?.(null)
      }
    }
  }, [libraryElements])

  // deleteRequestToken 증가 시 선택된 프리셋을 삭제한다.
  useEffect(() => {
    if (deleteRequestToken <= 0) return
    deleteSelectedPreset()
  }, [deleteRequestToken, deleteSelectedPreset])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
    />
  )
}
