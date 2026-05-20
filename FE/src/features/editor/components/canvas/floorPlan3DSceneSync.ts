import type { FloorLayerOverlay, IfcElementInfo } from '../../types'
import type { FloorPlan3DData } from '../../utils/floorPlanTo3D'
import { getFloorPlanElementInfo } from './threeDSelection.utils'

export type FloorPlanMultiSelectionEntry = {
  key: string
  object: import('three').Object3D
  source: 'library' | 'floor'
  element: IfcElementInfo
}

export type FloorHitCandidate = {
  distance: number
  root: import('three').Object3D
  element: IfcElementInfo
}

export const SELECTION_ID_LIKE_PROPERTY_KEYS = [
  'RoomId',
  'WallId',
  'BubbleId',
  'OpeningId',
  'HostWallGlobalId',
  'FloorLayerId',
  'LayerId',
  'GlobalId',
  'globalId',
  'global_id',
  'guid',
  'Id',
  'id',
] as const

const normalizeSelectionToken = (value?: string | null) => value
  ?.trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')

/**
 * 로컬 3D에서 겹쳐진 객체를 클릭했을 때 개구부 → 벽 → 방 순서로 선택 우선순위를 둔다.
 */
export const getFloorSelectionPriority = (element: IfcElementInfo): number => {
  const category = normalizeSelectionToken(element.category) ?? ''
  const ifcClass = normalizeSelectionToken(element.ifcClass)?.replace(/\s+/g, '') ?? ''
  if (
    category.includes('door') ||
    category.includes('window') ||
    category.includes('opening') ||
    ifcClass.includes('ifcdoor') ||
    ifcClass.includes('ifcwindow') ||
    ifcClass.includes('ifcopening')
  ) {
    return 0
  }
  if (category.includes('wall') || ifcClass.includes('ifcwall')) return 1
  if (category.includes('space') || category.includes('room') || ifcClass.includes('ifcspace')) return 9
  return 4
}

const collectSelectionTokens = (element: IfcElementInfo): Set<string> => {
  const tokens = new Set<string>()
  const addToken = (value: unknown) => {
    if (typeof value !== 'string' && typeof value !== 'number') return
    const token = String(value).trim()
    if (token) tokens.add(token)
  }

  addToken(element.id)
  addToken(element.globalId)
  addToken(element.expressId)
  SELECTION_ID_LIKE_PROPERTY_KEYS.forEach((key) => addToken(element.properties?.[key]))

  return tokens
}

const hasSharedSelectionToken = (left: IfcElementInfo, right: IfcElementInfo): boolean => {
  const leftTokens = collectSelectionTokens(left)
  for (const token of collectSelectionTokens(right)) {
    if (leftTokens.has(token)) return true
  }
  return false
}

const hasSameFloorElementDimensions = (left: IfcElementInfo, right: IfcElementInfo): boolean => (
  left.lengthMm === right.lengthMm &&
  left.heightMm === right.heightMm &&
  left.thicknessMm === right.thicknessMm
)

/**
 * 사용자가 로컬 3D 요소를 이동한 직후 들어오는 2D 데이터 echo를 구분하기 위한 안정 서명이다.
 * 위치는 의도적으로 제외하고, 객체 재생성 여부를 판단하는 구조/치수/층 데이터만 포함한다.
 */
export const buildFloorDataStableSignature = (
  data: FloorPlan3DData,
  overlayLayers: FloorLayerOverlay[],
): string => JSON.stringify({
  storyHeightMm: data.storyHeightMm,
  activeFloorLayerId: data.activeFloorLayerId ?? null,
  rooms: data.rooms.map((room) => ({
    id: room.id,
    globalId: room.globalId ?? null,
    bubbleId: room.bubbleId,
    label: room.label,
    type: room.type,
    width: room.width,
    height: room.height,
    widthMm: room.widthMm,
    heightMm: room.heightMm,
    color: room.color,
    material: room.material ?? null,
    connectedIds: room.connectedIds,
  })),
  walls: data.walls.map((wall) => ({
    id: wall.id,
    globalId: wall.globalId ?? null,
    storeyGlobalId: wall.storeyGlobalId ?? null,
    sourceIfcClass: wall.sourceIfcClass ?? null,
    type: wall.type,
    thickness: wall.thickness,
    heightMm: wall.heightMm,
    material: wall.material ?? null,
  })),
  overlayLayers: overlayLayers.map((layer) => ({
    layerId: layer.layerId,
    storeyGlobalId: layer.storeyGlobalId ?? null,
    opacity: layer.opacity,
    rooms: layer.rooms.map((room) => ({
      id: room.id,
      globalId: room.globalId ?? null,
      bubbleId: room.bubbleId,
      type: room.type,
      width: room.width,
      height: room.height,
      widthMm: room.widthMm,
      heightMm: room.heightMm,
      color: room.color,
      material: room.material ?? null,
    })),
  })),
})

const canReuseFloorObjectInPlace = (current: IfcElementInfo, next: IfcElementInfo): boolean => (
  hasSharedSelectionToken(current, next) &&
  current.ifcClass === next.ifcClass &&
  current.category === next.category &&
  hasSameFloorElementDimensions(current, next)
)

const copyMaterialState = (targetMaterial: unknown, sourceMaterial: unknown) => {
  if (!targetMaterial || !sourceMaterial) return
  if (Array.isArray(targetMaterial) || Array.isArray(sourceMaterial)) {
    if (!Array.isArray(targetMaterial) || !Array.isArray(sourceMaterial)) return
    targetMaterial.forEach((targetEntry, index) => copyMaterialState(targetEntry, sourceMaterial[index]))
    return
  }

  const target = targetMaterial as {
    color?: { copy?: (color: unknown) => void }
    opacity?: number
    transparent?: boolean
    depthWrite?: boolean
    needsUpdate?: boolean
  }
  const source = sourceMaterial as {
    color?: unknown
    opacity?: number
    transparent?: boolean
    depthWrite?: boolean
  }
  if (target.color?.copy && source.color) target.color.copy(source.color)
  if (typeof source.opacity === 'number') target.opacity = source.opacity
  if (typeof source.transparent === 'boolean') target.transparent = source.transparent
  if (typeof source.depthWrite === 'boolean') target.depthWrite = source.depthWrite
  target.needsUpdate = true
}

const copyObjectVisualState = (
  target: import('three').Object3D,
  source: import('three').Object3D,
) => {
  const targetDrawables: Array<import('three').Object3D & { material?: unknown }> = []
  const sourceDrawables: Array<import('three').Object3D & { material?: unknown }> = []
  target.traverse((child) => {
    if ((child as { material?: unknown }).material) {
      targetDrawables.push(child as import('three').Object3D & { material?: unknown })
    }
  })
  source.traverse((child) => {
    if ((child as { material?: unknown }).material) {
      sourceDrawables.push(child as import('three').Object3D & { material?: unknown })
    }
  })
  targetDrawables.forEach((targetChild, index) => {
    copyMaterialState(targetChild.material, sourceDrawables[index]?.material)
  })
}

/**
 * 평면도 데이터가 갱신돼도 기존 Object3D를 최대한 재사용한다.
 * TransformControls가 붙은 선택 객체를 유지해 이동 중 선택/기즈모가 끊기지 않게 한다.
 */
export const syncFloorGroupInPlace = (
  currentGroup: import('three').Group,
  nextGroup: import('three').Group,
  disposeObject: (object: import('three').Object3D) => void,
): boolean => {
  const currentChildren = [...currentGroup.children]
  const nextChildren = [...nextGroup.children]
  const usedCurrentChildren = new Set<import('three').Object3D>()

  nextChildren.forEach((nextChild) => {
    const nextElement = getFloorPlanElementInfo(nextChild)
    if (!nextElement) {
      currentGroup.add(nextChild)
      return
    }

    const reusableChild = currentChildren.find((currentChild) => {
      if (usedCurrentChildren.has(currentChild)) return false
      const currentElement = getFloorPlanElementInfo(currentChild)
      return currentElement ? canReuseFloorObjectInPlace(currentElement, nextElement) : false
    })

    if (!reusableChild) {
      currentGroup.add(nextChild)
      return
    }

    usedCurrentChildren.add(reusableChild)
    reusableChild.position.copy(nextChild.position)
    reusableChild.quaternion.copy(nextChild.quaternion)
    reusableChild.scale.copy(nextChild.scale)
    reusableChild.visible = nextChild.visible
    reusableChild.userData = {
      ...reusableChild.userData,
      floorPlanElement: nextChild.userData.floorPlanElement,
      floorPlanBaseWorldSize: nextChild.userData.floorPlanBaseWorldSize,
    }
    copyObjectVisualState(reusableChild, nextChild)
    nextChild.parent?.remove(nextChild)
    disposeObject(nextChild)
  })

  currentChildren.forEach((currentChild) => {
    if (usedCurrentChildren.has(currentChild)) return
    currentChild.parent?.remove(currentChild)
    disposeObject(currentChild)
  })

  return true
}

const buildFloorCandidates = (floorGroup: import('three').Group) => floorGroup.children
  .map((child) => {
    const element = getFloorPlanElementInfo(child)
    return element ? { object: child, element } : null
  })
  .filter((candidate): candidate is { object: import('three').Object3D; element: IfcElementInfo } =>
    Boolean(candidate))

/**
 * 평면도 group 재생성 후 기존 선택 항목을 새 Object3D 참조로 다시 연결한다.
 */
export const remapFloorSelectionEntries = (
  entries: FloorPlanMultiSelectionEntry[],
  floorGroup: import('three').Group,
): FloorPlanMultiSelectionEntry[] => {
  const candidates = buildFloorCandidates(floorGroup)

  return entries
    .map((entry) => {
      if (entry.source !== 'floor') return entry
      const matched = candidates.find((candidate) => hasSharedSelectionToken(entry.element, candidate.element))
      if (!matched) return null
      return {
        ...entry,
        key: `floor:${matched.element.id}`,
        object: matched.object,
        element: matched.element,
      }
    })
    .filter((entry): entry is FloorPlanMultiSelectionEntry => Boolean(entry))
}

/**
 * 이동 직후 2D echo가 들어온 경우 선택된 Object3D 자체를 보존한다.
 * 새로 생성된 같은 요소의 메타데이터만 옮겨와 사용자 조작 중 깜빡임과 선택 해제를 방지한다.
 */
export const preserveSelectedFloorObjects = (
  entries: FloorPlanMultiSelectionEntry[],
  nextFloorGroup: import('three').Group,
  disposeObject: (object: import('three').Object3D) => void,
): FloorPlanMultiSelectionEntry[] => {
  const candidates = buildFloorCandidates(nextFloorGroup)

  return entries
    .map((entry) => {
      if (entry.source !== 'floor') return entry
      const matched = candidates.find((candidate) =>
        hasSharedSelectionToken(entry.element, candidate.element) &&
        hasSameFloorElementDimensions(entry.element, candidate.element))
      if (!matched) return null

      const preservedObject = entry.object
      preservedObject.parent?.remove(preservedObject)
      matched.object.parent?.remove(matched.object)
      preservedObject.userData = {
        ...preservedObject.userData,
        floorPlanElement: matched.object.userData.floorPlanElement,
        floorPlanBaseWorldSize: matched.object.userData.floorPlanBaseWorldSize,
      }
      nextFloorGroup.add(preservedObject)
      disposeObject(matched.object)

      return {
        ...entry,
        key: `floor:${matched.element.id}`,
        object: preservedObject,
        element: matched.element,
      }
    })
    .filter((entry): entry is FloorPlanMultiSelectionEntry => Boolean(entry))
}
