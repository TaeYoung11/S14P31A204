import { useCallback, useEffect, useRef } from 'react'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import { buildFloorPlan3DGroup } from '../../utils/floorPlanTo3D'

interface FloorPlan3DCanvasProps {
  data: FloorPlan3DData
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

/**
 * 2D 평면도 데이터를 Three.js로 즉시 3D 변환하여 표시하는 캔버스.
 * ThatOpen/IFC 없이 순수 Three.js + OrbitControls를 사용한다.
 * 360도 회전, 줌, 패닝을 지원한다.
 */
export function FloorPlan3DCanvas({ data }: FloorPlan3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 렌더 루프/비동기 초기화에서 최신 data를 참조하기 위한 ref 캐시
  const dataRef = useRef(data)
  const threeRef = useRef<ThreeModule | null>(null)
  const sceneRef = useRef<import('three').Scene | null>(null)
  const cameraRef = useRef<import('three').PerspectiveCamera | null>(null)
  const rendererRef = useRef<import('three').WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControlsInstance | null>(null)
  const floorGroupRef = useRef<import('three').Group | null>(null)
  const animationFrameIdRef = useRef(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

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

    void (async () => {
      const [THREE, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
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

      controlsRef.current?.dispose()
      controlsRef.current = null

      if (threeRef.current && floorGroupRef.current) {
        disposeObject3DResources(floorGroupRef.current)
        sceneRef.current?.remove(floorGroupRef.current)
      }
      floorGroupRef.current = null

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
  }, [rebuildFloorGroup])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
    />
  )
}
