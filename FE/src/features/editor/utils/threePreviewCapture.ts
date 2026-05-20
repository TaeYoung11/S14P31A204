import { captureCanvasWithBackground } from '@/features/editor/utils/canvasPreviewCapture'
import type {
  Box3,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

type ThreeModule = typeof import('three')

interface CameraControlsLike {
  target: Vector3
  update: () => void
}

interface CaptureFocusedThreePreviewParams {
  THREE: ThreeModule
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  focusObjects: Object3D[]
  controls?: CameraControlsLike
  backgroundColor?: string
  quality?: number
}

const PREVIEW_CAMERA_FOV = 45
const PREVIEW_CAMERA_MARGIN = 1.08
const PREVIEW_CAMERA_MIN_DISTANCE = 1

const getPreviewCanvasAspect = (canvas: HTMLCanvasElement): number => {
  const width = canvas.width || canvas.clientWidth || 1
  const height = canvas.height || canvas.clientHeight || 1
  return Math.max(width / height, 0.01)
}

const getPreviewCameraFit = (
  THREE: ThreeModule,
  box: Box3,
  aspect: number,
): {
  center: Vector3
  direction: Vector3
  up: Vector3
  distance: number
  fitSize: number
} => {
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)

  const direction = new THREE.Vector3(1, 0.65, 1).normalize()
  const worldUp = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(worldUp, direction)
  if (right.lengthSq() < 0.000001) {
    right.set(1, 0, 0)
  } else {
    right.normalize()
  }
  const up = new THREE.Vector3().crossVectors(direction, right).normalize()

  const halfVerticalFov = (PREVIEW_CAMERA_FOV * Math.PI) / 360
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * Math.max(aspect, 0.01))
  const tanVertical = Math.max(Math.tan(halfVerticalFov), 0.000001)
  const tanHorizontal = Math.max(Math.tan(halfHorizontalFov), 0.000001)
  const { min, max } = box
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ]

  let distance = PREVIEW_CAMERA_MIN_DISTANCE
  corners.forEach((corner) => {
    const relative = corner.sub(center)
    const depthTowardCamera = relative.dot(direction)
    distance = Math.max(
      distance,
      Math.abs(relative.dot(right)) / tanHorizontal + depthTowardCamera,
      Math.abs(relative.dot(up)) / tanVertical + depthTowardCamera,
    )
  })

  const fitSize = Math.max(size.x, size.y, size.z, size.length(), PREVIEW_CAMERA_MIN_DISTANCE)
  return {
    center,
    direction,
    up,
    distance: Math.max(distance * PREVIEW_CAMERA_MARGIN, PREVIEW_CAMERA_MIN_DISTANCE),
    fitSize,
  }
}

/**
 * 3D 오브젝트 그룹이 카드 썸네일 안에 꽉 차도록 임시 카메라를 맞추고 캡처한다.
 * 호출 후에는 카메라, 컨트롤 타겟, renderer clear color를 원래 상태로 되돌린다.
 */
export function captureFocusedThreePreview({
  THREE,
  scene,
  camera,
  renderer,
  focusObjects,
  controls,
  backgroundColor = '#f0f2f9',
  quality = 0.92,
}: CaptureFocusedThreePreviewParams): string | null {
  if (focusObjects.length === 0) return null

  const previousPosition = camera.position.clone()
  const previousRotation = camera.rotation.clone()
  const previousUp = camera.up.clone()
  const previousNear = camera.near
  const previousFar = camera.far
  const previousFov = camera.fov
  const previousAspect = camera.aspect
  const previousTarget = controls?.target.clone()
  const previousClearColor = renderer.getClearColor(new THREE.Color())
  const previousClearAlpha = renderer.getClearAlpha()

  try {
    const box = new THREE.Box3()
    focusObjects.forEach((object) => {
      object.updateMatrixWorld(true)
      box.expandByObject(object)
    })
    if (box.isEmpty()) return null

    const fit = getPreviewCameraFit(THREE, box, getPreviewCanvasAspect(renderer.domElement))
    camera.position.copy(fit.center).addScaledVector(fit.direction, fit.distance)
    camera.fov = PREVIEW_CAMERA_FOV
    camera.aspect = getPreviewCanvasAspect(renderer.domElement)
    camera.near = 0.01
    camera.far = Math.max(fit.distance + fit.fitSize * 3, 1000)
    camera.up.copy(fit.up)
    camera.lookAt(fit.center)
    camera.updateProjectionMatrix()
    controls?.target.copy(fit.center)
    controls?.update()
    renderer.setClearColor(backgroundColor, 1)
    renderer.render(scene, camera)

    return captureCanvasWithBackground(renderer.domElement, {
      backgroundColor,
      quality,
    })
  } finally {
    camera.position.copy(previousPosition)
    camera.rotation.copy(previousRotation)
    camera.up.copy(previousUp)
    camera.near = previousNear
    camera.far = previousFar
    camera.fov = previousFov
    camera.aspect = previousAspect
    camera.updateProjectionMatrix()
    if (previousTarget) {
      controls?.target.copy(previousTarget)
      controls?.update()
    }
    renderer.setClearColor(previousClearColor, previousClearAlpha)
    renderer.render(scene, camera)
  }
}
