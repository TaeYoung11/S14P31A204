/**
 * ifcSceneHelpers — ThatOpenIfcCanvas 씬 헬퍼 순수 함수 모음
 *
 * ThatOpenIfcCanvas 컴포넌트에서 사용되는 순수 함수와 공유 타입을 분리한 파일.
 * React 의존성이 없으며, Three.js / @thatopen/components 씬 조작만 담당한다.
 *
 * 내용:
 *  - 공유 타입: Selected3DTarget, IfcEditableObject3D, ThatOpenSceneState
 *  - 시그니처 유틸: 변경 감지용 문자열 키 생성
 *  - IFC 로드 유틸: 모델 ID 생성, IFC 텍스트 fetch
 *  - 카메라/씬 헬퍼: 클리핑 평면 조정, 카메라 피팅
 *  - 오브젝트 헬퍼: 편집 루트 탐색, 재질/투명도 적용, 선택 해제
 *  - 치수/좌표 헬퍼: 크기 계산, 월드 단위 추정, 좌표 반올림
 *  - 재질 헬퍼: 초기 재질 스타일 적용, IFC 색상 오버라이드, TransformProxy 생성
 */
import type { Object3D } from 'three'
import type { IfcElementInfo } from '../../../types'
import {
  DEFAULT_IFC_COLOR_BY_CATEGORY,
  PROJECT_WORLD_UNITS_PER_MM,
  createElementMaterial,
  type MaybeThatOpenMaterialsManager,
  type ThreeModule,
} from './ifcMaterials'

// ─────────────────────────────────────────────────────────────────────────────
// 공유 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

/** 씬에서 현재 선택된 3D 오브젝트의 출처와 메타데이터 */
export type Selected3DTarget =
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

/** ifcEditTarget userData를 가진 편집 프록시 오브젝트 타입 */
export type IfcEditableObject3D = Object3D & {
  userData: {
    ifcEditTarget?: {
      modelId: string
      localId: number
      hitLocalId: number
      element: IfcElementInfo
    }
    ifcEditBaseWorldSize?: {
      x: number
      y: number
      z: number
    }
    [key: string]: unknown
  }
}

/**
 * ThatOpenIfcCanvas 씬 전체 상태를 담는 타입.
 * useRef로 관리되며 렌더 사이클 외부에서도 접근 가능하다.
 */
export type ThatOpenSceneState = {
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
  modelId: string
  worldUnitsPerMm: number
  materialsManager?: MaybeThatOpenMaterialsManager
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

// ─────────────────────────────────────────────────────────────────────────────
// 시그니처 유틸: 선택 상태 변경 여부를 빠르게 비교하기 위한 문자열 키 생성
// ─────────────────────────────────────────────────────────────────────────────

/** 치수(길이·높이·두께) 기반 변경 감지용 시그니처 */
export const getElementDimensionSignature = (element?: IfcElementInfo | null) => [
  element?.id ?? '',
  element?.lengthMm ?? '',
  element?.heightMm ?? '',
  element?.thicknessMm ?? '',
].join(':')

/** 색상 변경 감지용 시그니처 */
export const getElementColorSignature = (element?: IfcElementInfo | null) => [
  element?.id ?? '',
  element?.color ?? '',
].join(':')

/** 재질 변경 감지용 시그니처 */
export const getElementMaterialSignature = (element?: IfcElementInfo | null) => [
  element?.id ?? '',
  element?.material ?? '',
].join(':')

// ─────────────────────────────────────────────────────────────────────────────
// IFC 모델 로드 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** projectId가 없을 때 사용하는 fallback 모델 ID */
export const FALLBACK_IFC_MODEL_ID = 'mock-shinchan-house'
/** IFC 좌표 단위를 mm(1:1)로 판별할 최소 모델 길이 임계값 */
const IFC_MM_UNIT_SIZE_THRESHOLD = 500

/**
 * 프로젝트 ID에서 씬 내 모델 ID를 생성한다.
 * 같은 IFC가 여러 프로젝트에 사용될 때 ID 충돌을 방지한다.
 */
export const getRuntimeIfcModelId = (projectId?: string | null) => (
  projectId ? `project-${projectId}` : FALLBACK_IFC_MODEL_ID
)

/** IFC 파일을 URL에서 텍스트로 가져온다. 실패 시 에러를 throw한다. */
export const fetchIfcText = async (ifcUrl: string) => {
  if (import.meta.env.DEV) {
    console.log('[3d-ifc-fetch][request]', { ifcUrl })
  }
  const response = await fetch(ifcUrl)
  if (import.meta.env.DEV) {
    console.log('[3d-ifc-fetch][response]', {
      ifcUrl,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
    })
  }
  if (!response.ok) {
    throw new Error(`IFC file load failed. (${response.status})`)
  }
  return response.text()
}

// ─────────────────────────────────────────────────────────────────────────────
// 카메라 및 씬 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 모델 크기에 맞게 카메라 near/far 클리핑 평면을 조정한다.
 * far 값이 너무 작으면 큰 모델이 잘리는 문제가 발생한다.
 */
export const setCameraClipping = (
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

/**
 * 오브젝트 바운딩박스를 기준으로 카메라를 적절한 거리에 배치한다.
 * - padding이 클수록 오브젝트가 화면에 더 작게 들어온다.
 * - camera-controls가 있으면 setLookAt으로 부드럽게 이동하고, 없으면 직접 설정한다.
 */
export const fitObjectWithPadding = (
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

// ─────────────────────────────────────────────────────────────────────────────
// 오브젝트 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 클릭된 오브젝트에서 ifcEditTarget userData를 가진 루트를 찾는다.
 * TransformControls가 붙어 있는 편집 프록시 오브젝트를 반환한다.
 */
export const findIfcEditableRoot = (object: Object3D, editGroup: import('three').Group): IfcEditableObject3D | null => {
  let cursor: IfcEditableObject3D | null = object as IfcEditableObject3D
  while (cursor) {
    if (cursor.userData?.ifcEditTarget) return cursor
    if (cursor.parent === editGroup) return cursor
    cursor = (cursor.parent ?? null) as IfcEditableObject3D | null
  }
  return null
}

/** 오브젝트의 geometry 및 material을 GPU 메모리에서 해제한다 (메모리 누수 방지). */
export const disposeObjectMaterials = (THREE: ThreeModule, object: Object3D) => {
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

/** 오브젝트의 모든 메시에 일괄 투명도를 적용한다. */
export const setObjectOpacity = (THREE: ThreeModule, object: Object3D | undefined, opacity: number) => {
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

/**
 * TransformControls를 분리하고 선택 상태를 초기화한다.
 * removeObject=true이면 씬에서 오브젝트도 제거하고 GPU 메모리를 해제한다.
 */
export const clearSelectedTarget = async (
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

/**
 * 라이브러리 프리셋 그룹을 IFC 모델 옆에 배치한다.
 * IFC 모델의 바운딩박스 우측 끝에서 600mm 간격을 두고 놓는다.
 */
export const positionPresetGroupBesideIfc = (
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

// ─────────────────────────────────────────────────────────────────────────────
// 치수·좌표·재질 유틸
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IFC 모델 크기를 보고 월드 단위/mm 비율을 추정한다.
 * - 모델 최대 길이가 충분히 크면(mm 기반 좌표) 1:1로 간주한다.
 * - 그렇지 않으면 프로젝트 기본값(미터 기반 좌표 추정)을 사용한다.
 *
 * 기존 100 임계값은 meter 기반 대형 모델(예: 120m)을 mm로 오인해
 * 이동 스냅 간격이 과도하게 커지는 문제가 있어 보수적으로 상향한다.
 */
export const inferWorldUnitsPerMm = (THREE: ThreeModule, ifcObject: Object3D) => {
  const ifcSize = new THREE.Vector3()
  new THREE.Box3().setFromObject(ifcObject).getSize(ifcSize)
  const maxSize = Math.max(ifcSize.x, ifcSize.y, ifcSize.z)

  return maxSize > IFC_MM_UNIT_SIZE_THRESHOLD ? 1 : PROJECT_WORLD_UNITS_PER_MM
}

/** Three.js 재질 객체에서 HEX 색상 문자열을 추출한다. */
export const getMaterialColorHex = (material: unknown) => {
  const color = (material as { color?: { getHexString?: () => string } })?.color
  const hex = color?.getHexString?.()
  return hex ? `#${hex.toUpperCase()}` : undefined
}

/**
 * 오브젝트 바운딩박스에서 길이·높이·두께를 mm 단위로 반환한다.
 * 유효하지 않은 크기이면 null을 반환한다.
 */
export const getObjectSizeMm = (
  THREE: ThreeModule,
  object: Object3D | undefined,
  worldUnitsPerMm: number,
) => {
  if (!object) return null
  if (!Number.isFinite(worldUnitsPerMm) || worldUnitsPerMm <= 0) return null
  const size = new THREE.Vector3()
  // 회전된 오브젝트의 월드 AABB는 치수가 과대해질 수 있으므로,
  // 측정 전 루트 회전을 제거한 복제본에서 스케일 기반 크기를 계산한다.
  const measurementRoot = object.clone(true)
  measurementRoot.position.set(0, 0, 0)
  measurementRoot.rotation.set(0, 0, 0)
  measurementRoot.quaternion.identity()
  measurementRoot.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(measurementRoot)
  if (box.isEmpty()) return null
  box.getSize(size)
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)) return null
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null

  return {
    lengthMm: Math.round(size.x / worldUnitsPerMm),
    heightMm: Math.round(size.y / worldUnitsPerMm),
    thicknessMm: Math.round(size.z / worldUnitsPerMm),
  }
}

/**
 * IFC 모델의 기존 색상(HEX)으로부터 에디터 재질 이름을 역추론한다.
 * DEFAULT_IFC_COLOR_BY_CATEGORY와 대응되는 색상만 인식하며,
 * 그 외 색상은 undefined를 반환해 재질 스타일 덮어쓰기를 생략한다.
 */
export const resolveEditorMaterialFromColor = (color?: string) => {
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

/** 좌표값을 소수점 1자리로 반올림한다. */
export const roundCoordinate = (value: number) => Math.round(value * 10) / 10

/** Three.js 위치 객체를 디스플레이용 좌표로 변환한다. */
export const toDisplayCoordinates = (position: { x: number; y: number; z: number }) => ({
  x: roundCoordinate(position.x),
  y: roundCoordinate(position.y),
  z: roundCoordinate(position.z),
})

// ─────────────────────────────────────────────────────────────────────────────
// 재질 스타일 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IFC 모델 최초 로드 시 기존 재질 색상으로부터 에디터 재질 스타일을 적용한다.
 * 인식된 색상의 메시에만 createElementMaterial로 교체하고, 그 외는 유지한다.
 */
export const applyInitialIfcMaterialStyles = (
  THREE: ThreeModule,
  ifcObject: Object3D,
  materialsManager?: MaybeThatOpenMaterialsManager,
) => {
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
    child.material = createElementMaterial(THREE, materialName, color, materialsManager)
  })
}

/**
 * fragments.highlight를 이용해 IFC 요소에 색상을 적용한다.
 * preserveOriginalMaterial: true로 원본 재질을 보존하고 색상 레이어만 덮어씌운다.
 */
export const applyIfcItemColor = async (
  THREE: ThreeModule,
  fragments: import('@thatopen/components').FragmentsManager,
  target: Extract<Selected3DTarget, { source: 'ifc' }>,
  color?: string,
) => {
  if (!color) return

  await fragments.highlight({
    color: new THREE.Color(color),
    opacity: 1,
    transparent: false,
    renderedFaces: 1,
    preserveOriginalMaterial: true,
  }, {
    [target.modelId]: new Set([target.hitLocalId]),
  })
}

/**
 * IFC 요소의 바운딩박스 위에 편집 프록시 오브젝트(BoxGeometry)를 생성하고
 * TransformControls를 연결한다.
 * - hider.set(false)로 원본 IFC 요소를 숨겨 프록시만 보이게 한다.
 * - 이미 같은 ID의 프록시가 있으면 재사용한다.
 */
export const attachIfcTransformProxy = async (
  THREE: ThreeModule,
  fragments: import('@thatopen/components').FragmentsManager,
  hider: import('@thatopen/components').Hider,
  transformControls: import('three/examples/jsm/controls/TransformControls.js').TransformControls,
  editGroup: import('three').Group,
  modelId: string,
  localIds: number[],
  visibleLocalId: number,
  element: IfcElementInfo,
  materialsManager?: MaybeThatOpenMaterialsManager,
) => {
  const buildProxyMaterial = (color?: string, materialName?: string): import('three').Material => {
    const material = createElementMaterial(
      THREE,
      materialName,
      color,
      materialsManager,
    ) as unknown as import('three').Material & {
      map?: { dispose?: () => void } | null
      transparent?: boolean
      opacity?: number
      depthWrite?: boolean
      needsUpdate?: boolean
    }
    // 선택 프록시는 원본과 시각 불일치를 줄이기 위해 패턴 텍스처/반투명을 쓰지 않는다.
    material.map?.dispose?.()
    material.map = null
    material.transparent = false
    material.opacity = 1
    material.depthWrite = true
    material.needsUpdate = true
    return material as import('three').Material
  }

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
    if (!existing) {
      editable.position.copy(center)
    }
    editable.userData = {
      ...editable.userData,
      ifcEditTarget: {
        modelId,
        localId: stableLocalId,
        hitLocalId: localId,
        element,
      },
      ifcEditBaseWorldSize: {
        x: size.x,
        y: size.y,
        z: size.z,
      },
    }

    if (!existing) {
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
      const material = buildProxyMaterial(
        element.color ?? DEFAULT_IFC_COLOR_BY_CATEGORY[element.category] ?? DEFAULT_IFC_COLOR_BY_CATEGORY.Element,
        element.material,
      )
      const mesh = new THREE.Mesh(geometry, material)
      editable.add(mesh)
      editGroup.add(editable)
    } else {
      editable.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const previousMaterials = Array.isArray(child.material) ? child.material : [child.material]
        previousMaterials.forEach((previousMaterial) => {
          const map = (previousMaterial as { map?: { dispose?: () => void } }).map
          map?.dispose?.()
          previousMaterial.dispose()
        })
        child.material = buildProxyMaterial(
          element.color ?? DEFAULT_IFC_COLOR_BY_CATEGORY[element.category] ?? DEFAULT_IFC_COLOR_BY_CATEGORY.Element,
          element.material,
        )
      })
    }

    await hider.set(false, {
      [modelId]: new Set([visibleLocalId]),
    })
    transformControls.attach(editable)
    transformControls.visible = true
    transformControls.enabled = true
    return editable
  }

  return null
}
