/**
 * IFC 라이브러리 에셋 로딩 보조 유틸.
 *
 * ThatOpenIfcCanvas의 React effect에서 분리 가능한 순수 처리만 모아 둔다.
 * 에셋 모델 ID/캐시 키 생성, IFC 원점 보정, 씬 그래프 가시성 조작을 담당한다.
 */
import type { Object3D } from 'three'
import type { ThreeDLibraryPreset } from '../threeDLibrary.types'
import { toIfcLibraryAssetUrl } from '../threeDLibraryManifest'
import type { ThreeModule } from './ifcMaterials'
import type { LibraryObject3D } from './ifcLibraryMesh'

const IFC_LIBRARY_PLACEMENT_NORMALIZER_VERSION = 'placement-normalizer-v3'

export const toLibraryAssetModelId = (preset: ThreeDLibraryPreset, instanceId?: string) => {
  const source = preset.sourceAssetId ?? preset.id
  const normalizedSource = source.replace(/[^0-9A-Za-z_-]/g, '-')
  const normalizedInstance = instanceId?.replace(/[^0-9A-Za-z_-]/g, '-')
  return normalizedInstance
    ? `library-asset-${normalizedSource}-${normalizedInstance}`
    : `library-asset-${normalizedSource}`
}

/**
 * 추출 IFC 에셋의 배치점과 기하점 좌표를 원점 기준으로 이동한다.
 * 템플릿으로 로드한 에셋을 프리셋 치수/TransformControls 기준점에 맞추기 위한 전처리다.
 */
export const translateIfcLibraryAssetPlacements = (
  ifcText: string,
  preset: ThreeDLibraryPreset,
) => {
  const axisPointById = new Map<string, string>()
  const pointReferenceCount = new Map<string, number>()
  for (const match of ifcText.matchAll(/#(\d+)=IFCAXIS2PLACEMENT3D\(#(\d+),/g)) {
    axisPointById.set(match[1], match[2])
    pointReferenceCount.set(match[2], (pointReferenceCount.get(match[2]) ?? 0) + 1)
  }
  const axisPlacementPointIds = new Set(axisPointById.values())

  const placementPointIds = new Set<string>()
  for (const match of ifcText.matchAll(/#(\d+)=IFCLOCALPLACEMENT\(\$,#(\d+)\);/g)) {
    const pointId = axisPointById.get(match[2])
    if (!pointId) continue
    // 여러 placement가 공유하는 원점은 project/context 기준점일 가능성이 높아 이동하지 않는다.
    if ((pointReferenceCount.get(pointId) ?? 0) > 1) continue
    placementPointIds.add(pointId)
  }

  const pointRegex = /#(\d+)=IFCCARTESIANPOINT\(\(([-+0-9.Ee]+),([-+0-9.Ee]+),([-+0-9.Ee]+)\)\);/g
  const placementPoints = new Map<string, { x: number; y: number; z: number }>()
  const geometryPoints = new Map<string, { x: number; y: number; z: number }>()
  for (const match of ifcText.matchAll(pointRegex)) {
    const [, pointId, rawX, rawY, rawZ] = match
    const point = {
      x: Number(rawX),
      y: Number(rawY),
      z: Number(rawZ),
    }
    if (![point.x, point.y, point.z].every(Number.isFinite)) continue
    if (placementPointIds.has(pointId)) {
      placementPoints.set(pointId, point)
    } else if (!axisPlacementPointIds.has(pointId)) {
      geometryPoints.set(pointId, point)
    }
  }
  if (placementPoints.size === 0 && geometryPoints.size === 0) return ifcText

  const resolveOffset = (
    points: Iterable<{ x: number; y: number; z: number }>,
    fallbackToPreset = false,
  ) => {
    const list = Array.from(points)
    if (list.length === 0) return null
    const xs = list.map((point) => point.x)
    const ys = list.map((point) => point.y)
    const zs = list.map((point) => point.z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const minZ = Math.min(...zs)
    const fallbackOffsetX = Number.isFinite(preset.lengthMm) ? -Number(preset.lengthMm) / 2 : 0
    const fallbackOffsetY = Number.isFinite(preset.thicknessMm) ? -Number(preset.thicknessMm) / 2 : 0
    return {
      x: Number.isFinite(minX) && Number.isFinite(maxX)
        ? -((minX + maxX) / 2)
        : fallbackToPreset
          ? fallbackOffsetX
          : 0,
      y: Number.isFinite(minY) && Number.isFinite(maxY)
        ? -((minY + maxY) / 2)
        : fallbackToPreset
          ? fallbackOffsetY
          : 0,
      z: Number.isFinite(minZ) ? -minZ : 0,
    }
  }
  const placementOffset = resolveOffset(placementPoints.values(), true)
  const geometryOffset = resolveOffset(geometryPoints.values())

  return ifcText.replace(
    pointRegex,
    (line, pointId: string, rawX: string, rawY: string, rawZ: string) => {
      const offset = placementPointIds.has(pointId) ? placementOffset : geometryOffset
      if (!offset) return line
      const x = Number(rawX)
      const y = Number(rawY)
      const z = Number(rawZ)
      if (![x, y, z].every(Number.isFinite)) return line
      return `#${pointId}=IFCCARTESIANPOINT((${x + offset.x},${y + offset.y},${z + offset.z}));`
    },
  )
}

export const shouldUseIfcAssetForPreset = (preset: ThreeDLibraryPreset) => (
  Boolean(preset.assetIfcUrl || preset.assetIfc)
)

export const getLibraryAssetCacheKey = (preset: ThreeDLibraryPreset) => {
  const assetIfcUrl = preset.assetIfcUrl?.trim() || toIfcLibraryAssetUrl(preset.assetIfc)
  if (!assetIfcUrl) return null
  return [
    assetIfcUrl,
    IFC_LIBRARY_PLACEMENT_NORMALIZER_VERSION,
    preset.sourceAssetId ?? preset.id,
    preset.lengthMm ?? '',
    preset.heightMm ?? '',
    preset.thicknessMm ?? '',
  ].join('|')
}

export const isObjectInSceneGraph = (
  scene: Object3D,
  object: Object3D | undefined | null,
) => {
  if (!object) return false
  let cursor: Object3D | null = object
  while (cursor) {
    if (cursor === scene) return true
    cursor = (cursor.parent ?? null) as Object3D | null
  }
  return false
}

export const detachAndHideObjectTree = (object: Object3D | undefined | null) => {
  if (!object) return
  object.visible = false
  object.traverse((child) => {
    child.visible = false
  })
  object.parent?.remove(object)
}

export const setObjectTreeVisible = (
  object: Object3D | undefined | null,
  visible: boolean,
) => {
  if (!object) return
  object.visible = visible
  object.traverse((child) => {
    child.visible = visible
  })
}

export const setIfcAssetPlaceholderPending = (
  object: LibraryObject3D,
  pending: boolean,
) => {
  object.userData = {
    ...object.userData,
    ifcAssetPlaceholderPending: pending,
  }
  object.traverse((child) => {
    ;(child as LibraryObject3D).userData = {
      ...(child as LibraryObject3D).userData,
      ifcAssetPlaceholderPending: pending,
    }
  })
  setObjectTreeVisible(object, !pending)
}

/**
 * 변환된 IFC 에셋 clone이 실제 렌더 가능한 geometry를 포함하는지 확인한다.
 * 에셋 변환 실패 시 placeholder로 되돌릴지 판단하는 안전장치다.
 */
export const hasRenderableObject = (
  THREE: ThreeModule,
  object: Object3D,
) => {
  let hasRenderableGeometry = false
  let childCount = 0
  object.traverse((child) => {
    if (child !== object) childCount += 1
    const candidate = child as Object3D & {
      geometry?: {
        getAttribute?: (name: string) => {
          array?: unknown
          count?: number
          data?: { array?: unknown }
        } | undefined
      }
    }
    const position = candidate.geometry?.getAttribute?.('position')
    const positionArray = position?.array ?? position?.data?.array
    if (position && positionArray && Number.isFinite(position.count) && (position.count ?? 0) > 0) {
      hasRenderableGeometry = true
    }
  })
  try {
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return hasRenderableGeometry || childCount > 0
    const size = new THREE.Vector3()
    box.getSize(size)
    return [size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 1e-8)
  } catch {
    return hasRenderableGeometry || childCount > 0
  }
}
