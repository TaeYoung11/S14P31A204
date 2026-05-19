import type {
  ElementHierarchyNode,
  ElementRegistryFloor,
  ElementRegistryItem,
  ElementRegistryState,
  ElementSourceType,
  FloorLayer,
  FloorOpening,
  FloorRoom,
  FloorWall,
  IfcElementChange,
  IfcElementInfo,
} from '../types'
import type { IfcStoreyInfo } from '../components/canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'

interface BuildElementRegistryInput {
  ifcStoreys?: IfcStoreyInfo[]
  floorLayers?: FloorLayer[]
  floorRooms?: FloorRoom[]
  floorWalls?: FloorWall[]
  floorOpenings?: FloorOpening[]
  libraryElements?: ThreeDLibraryPreset[]
  ifcElementChanges?: IfcElementChange[]
  selectedIfcElement?: IfcElementInfo | null
  selectedRoomId?: string | null
  selectedFloorWallId?: string | null
  selectedFloorOpeningId?: string | null
  activeIfcStoreyId?: number | null
  activeFloorLayerId?: string | null
  overlayIfcStoreyIds?: number[]
  overlayFloorLayerIds?: string[]
  hiddenElementIds?: string[]
}

const SOURCE_PRIORITY: Record<ElementSourceType, number> = {
  IFC_MOCK: 0,
  FROM_2D: 1,
  LIBRARY: 2,
}

const CATEGORY_LABELS: Record<string, string> = {
  Space: '공간',
  Wall: '벽체',
  Door: '문',
  Window: '창문',
  Opening: '개구부',
  Floor: '바닥',
  Roof: '지붕',
  Slab: '슬래브',
  Column: '기둥',
  Beam: '보',
  Stair: '계단',
  Library: '라이브러리',
  Unassigned: '미배정',
}

const compareByName = <T extends { name?: string; label?: string; floorId?: string | null }>(left: T, right: T) => {
  const leftFloor = left.floorId ?? ''
  const rightFloor = right.floorId ?? ''
  if (leftFloor !== rightFloor) return leftFloor.localeCompare(rightFloor, 'ko')
  return (left.name ?? left.label ?? '').localeCompare(right.name ?? right.label ?? '', 'ko')
}

const normalizeIfcElementId = (localId: number): string => `ifc:${localId}`
const normalizeRoomElementId = (roomId: string): string => `2d:room:${roomId}`
const normalizeWallElementId = (wallId: string): string => `2d:wall:${wallId}`
const normalizeOpeningElementId = (openingId: string): string => `2d:opening:${openingId}`
const normalizeLibraryElementId = (libraryId: string): string => `library:${libraryId}`

const toStringRecordValue = (value: unknown): string | number | boolean | null => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value == null) return null
  return String(value)
}

const normalizeProperties = (properties: Record<string, unknown>): ElementRegistryItem['properties'] =>
  Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, toStringRecordValue(value)]))

const floorNameFallback = (floorId: string, index: number): string =>
  floorId === 'unassigned' ? '미배정' : `${index + 1}층`

const buildRoomFloorIdMap = (floorLayers: FloorLayer[]) => {
  const map = new Map<string, string>()
  floorLayers.forEach((layer) => {
    layer.rooms.forEach((room) => {
      map.set(room.id, layer.id)
      if (room.bubbleId) map.set(room.bubbleId, layer.id)
    })
  })
  return map
}

const buildWallFloorIdMap = (walls: FloorWall[]) => {
  const map = new Map<string, string>()
  walls.forEach((wall) => {
    if (wall.floorLayerId) map.set(wall.id, wall.floorLayerId)
  })
  return map
}

const getDeletedIfcLocalIdSet = (changes: IfcElementChange[] = []) => {
  const deleted = new Set<number>()
  changes.forEach((change) => {
    if (!change.deleted) return
    if (Number.isFinite(change.localId)) deleted.add(change.localId as number)
    change.localIds?.forEach((id) => {
      if (Number.isFinite(id)) deleted.add(id)
    })
    if (
      !Number.isFinite(change.localId) &&
      (!change.localIds || change.localIds.length === 0) &&
      Number.isFinite(change.expressId)
    ) {
      deleted.add(change.expressId)
    }
  })
  return deleted
}

const upsertFloor = (
  floorMap: Map<string, ElementRegistryFloor>,
  floor: Omit<ElementRegistryFloor, 'elementCount'>,
) => {
  const existing = floorMap.get(floor.floorId)
  if (!existing) {
    floorMap.set(floor.floorId, { ...floor, elementCount: 0 })
    return
  }
  floorMap.set(floor.floorId, {
    ...existing,
    name: existing.name || floor.name,
    sourceType: existing.sourceType === floor.sourceType ? existing.sourceType : 'MIXED',
    elevationMm: existing.elevationMm ?? floor.elevationMm,
  })
}

const createIfcElements = (
  storeys: IfcStoreyInfo[],
  deletedLocalIds: Set<number>,
): ElementRegistryItem[] => {
  const items: ElementRegistryItem[] = []
  storeys.forEach((storey) => {
    const elementPreviewByLocalId = new Map((storey.elements ?? []).map((element) => [element.localId, element]))
    storey.elementLocalIds.forEach((localId) => {
      if (!Number.isFinite(localId) || deletedLocalIds.has(localId)) return
      const preview = elementPreviewByLocalId.get(localId)
      items.push({
        elementId: normalizeIfcElementId(localId),
        sourceType: 'IFC_MOCK',
        floorId: String(storey.expressId),
        parentId: `floor:${storey.expressId}`,
        category: preview?.category ?? 'Element',
        name: preview?.name ?? `IFC 요소 ${localId}`,
        geometryId: `ifc-local:${localId}`,
        ifcLocalId: localId,
        properties: normalizeProperties({
          LocalID: localId,
          IfcClass: preview?.ifcClass ?? 'IfcElement',
          StoreyExpressId: storey.expressId,
          StoreyName: storey.name,
        }),
      })
    })
  })
  return items
}

const createRoomElement = (room: FloorRoom, floorId: string | null): ElementRegistryItem => ({
  elementId: normalizeRoomElementId(room.bubbleId || room.id),
  sourceType: 'FROM_2D',
  floorId,
  parentId: floorId ? `floor:${floorId}` : 'unassigned',
  category: 'Space',
  name: room.label || room.type || '공간',
  geometryId: room.globalId ?? room.id,
  source2dId: room.bubbleId || room.id,
  properties: normalizeProperties({
    RoomId: room.id,
    BubbleId: room.bubbleId,
    Type: room.type,
    WidthMm: room.widthMm,
    HeightMm: room.heightMm,
    AreaM2: room.area,
    Material: room.material,
    GlobalId: room.globalId,
  }),
})

const createWallElement = (wall: FloorWall): ElementRegistryItem => ({
  elementId: normalizeWallElementId(wall.id),
  sourceType: 'FROM_2D',
  floorId: wall.floorLayerId ?? null,
  parentId: wall.floorLayerId ? `floor:${wall.floorLayerId}` : 'unassigned',
  category: wall.type === 'exterior' ? 'ExteriorWall' : 'Wall',
  name: wall.type === 'exterior' ? '외벽' : wall.type === 'partition' ? '내벽' : '벽체',
  geometryId: wall.globalId ?? wall.id,
  source2dId: wall.id,
  properties: normalizeProperties({
    WallId: wall.id,
    WallType: wall.type,
    ThicknessMm: wall.thickness,
    HeightMm: wall.heightMm,
    Material: wall.material,
    StoreyGlobalId: wall.storeyGlobalId,
    StoreyName: wall.storeyName,
    GlobalId: wall.globalId,
  }),
})

const createOpeningElement = (opening: FloorOpening, floorId: string | null): ElementRegistryItem => ({
  elementId: normalizeOpeningElementId(opening.id),
  sourceType: 'FROM_2D',
  floorId,
  parentId: floorId ? `floor:${floorId}` : `2d:wall:${opening.wallId}`,
  category: opening.type === 'door' ? 'Door' : 'Window',
  name: opening.type === 'door' ? '문' : '창문',
  geometryId: opening.globalId ?? opening.id,
  source2dId: opening.id,
  properties: normalizeProperties({
    OpeningId: opening.id,
    HostWallId: opening.wallId,
    WidthMm: opening.widthMm,
    HeightMm: opening.heightMm,
    SillHeightMm: opening.sillHeightMm,
    StoreyGlobalId: opening.storeyGlobalId,
    StoreyName: opening.storeyName,
    GlobalId: opening.globalId,
  }),
})

const createLibraryElement = (preset: ThreeDLibraryPreset): ElementRegistryItem => ({
  elementId: normalizeLibraryElementId(preset.id),
  sourceType: 'LIBRARY',
  floorId: Number.isFinite(preset.storeyExpressId) ? String(preset.storeyExpressId) : null,
  parentId: Number.isFinite(preset.storeyExpressId) ? `floor:${preset.storeyExpressId}` : 'unassigned',
  category: preset.type,
  name: preset.name,
  geometryId: preset.sourceAssetId ?? preset.assetIfc ?? preset.id,
  libraryId: preset.id,
  properties: normalizeProperties({
    LibraryId: preset.id,
    Type: preset.type,
    Description: preset.description,
    Dimensions: preset.dimensions,
    LengthMm: preset.lengthMm,
    HeightMm: preset.heightMm,
    ThicknessMm: preset.thicknessMm,
    Material: preset.material,
    StoreyExpressId: preset.storeyExpressId,
  }),
})

const getSelectedElementId = (input: BuildElementRegistryInput): string | null => {
  if (input.selectedIfcElement?.source === 'library' && input.selectedIfcElement.id) {
    return normalizeLibraryElementId(input.selectedIfcElement.id)
  }
  const selectedBubbleId = input.selectedIfcElement?.properties?.BubbleId
  if (typeof selectedBubbleId === 'string' && selectedBubbleId.trim()) {
    return normalizeRoomElementId(selectedBubbleId)
  }
  const selectedRoomId = input.selectedIfcElement?.properties?.RoomId
  if (typeof selectedRoomId === 'string' && selectedRoomId.trim()) {
    return normalizeRoomElementId(selectedRoomId)
  }
  const selectedWallId = input.selectedIfcElement?.properties?.WallId
  if (typeof selectedWallId === 'string' && selectedWallId.trim()) {
    return normalizeWallElementId(selectedWallId)
  }
  const selectedOpeningId = input.selectedIfcElement?.properties?.OpeningId
  if (typeof selectedOpeningId === 'string' && selectedOpeningId.trim()) {
    return normalizeOpeningElementId(selectedOpeningId)
  }
  if (input.selectedIfcElement?.source === 'ifc') {
    const localId = typeof input.selectedIfcElement.properties?.LocalID === 'number'
      ? input.selectedIfcElement.properties.LocalID
      : input.selectedIfcElement.expressId
    if (typeof localId === 'number' && Number.isFinite(localId)) return normalizeIfcElementId(localId)
  }
  if (input.selectedFloorOpeningId) return normalizeOpeningElementId(input.selectedFloorOpeningId)
  if (input.selectedFloorWallId) return normalizeWallElementId(input.selectedFloorWallId)
  if (input.selectedRoomId) return normalizeRoomElementId(input.selectedRoomId)
  return null
}

export const resolveRegistryElementSelectionTarget = (element: ElementRegistryItem) => {
  if (element.sourceType === 'IFC_MOCK' && Number.isFinite(element.ifcLocalId)) {
    return { kind: 'ifc' as const, localId: element.ifcLocalId as number }
  }
  if (element.sourceType === 'LIBRARY' && element.libraryId) {
    return { kind: 'library' as const, id: element.libraryId }
  }
  if (element.elementId.startsWith('2d:room:')) {
    return { kind: 'room' as const, id: element.source2dId ?? element.elementId.replace(/^2d:room:/, '') }
  }
  if (element.elementId.startsWith('2d:wall:')) {
    return { kind: 'wall' as const, id: element.source2dId ?? element.elementId.replace(/^2d:wall:/, '') }
  }
  if (element.elementId.startsWith('2d:opening:')) {
    return { kind: 'opening' as const, id: element.source2dId ?? element.elementId.replace(/^2d:opening:/, '') }
  }
  return { kind: 'unknown' as const, id: element.elementId }
}

export function buildElementRegistry(input: BuildElementRegistryInput): ElementRegistryState {
  const ifcStoreys = input.ifcStoreys ?? []
  const floorLayers = input.floorLayers ?? []
  const floorRooms = input.floorRooms ?? []
  const floorWalls = input.floorWalls ?? []
  const floorOpenings = input.floorOpenings ?? []
  const libraryElements = input.libraryElements ?? []
  const deletedIfcLocalIds = getDeletedIfcLocalIdSet(input.ifcElementChanges)
  const floorMap = new Map<string, ElementRegistryFloor>()

  ifcStoreys.forEach((storey) => {
    upsertFloor(floorMap, {
      floorId: String(storey.expressId),
      name: storey.name,
      sourceType: 'IFC_MOCK',
      elevationMm: storey.elevation,
    })
  })

  floorLayers.forEach((layer, index) => {
    upsertFloor(floorMap, {
      floorId: layer.id,
      name: layer.name || floorNameFallback(layer.id, index),
      sourceType: 'FROM_2D',
      elevationMm: layer.elevationMm ?? null,
    })
  })

  const roomFloorIdMap = buildRoomFloorIdMap(floorLayers)
  const wallFloorIdMap = buildWallFloorIdMap(floorWalls)
  const elements = [
    ...createIfcElements(ifcStoreys, deletedIfcLocalIds),
    ...floorRooms.map((room) => createRoomElement(room, roomFloorIdMap.get(room.id) ?? roomFloorIdMap.get(room.bubbleId) ?? input.activeFloorLayerId ?? null)),
    ...floorWalls.map(createWallElement),
    ...floorOpenings.map((opening) => createOpeningElement(opening, wallFloorIdMap.get(opening.wallId) ?? input.activeFloorLayerId ?? null)),
    ...libraryElements.map(createLibraryElement),
  ].sort((left, right) => {
    const sourceSort = SOURCE_PRIORITY[left.sourceType] - SOURCE_PRIORITY[right.sourceType]
    if (sourceSort !== 0) return sourceSort
    return compareByName(left, right)
  })

  elements.forEach((element) => {
    if (!element.floorId) {
      upsertFloor(floorMap, {
        floorId: 'unassigned',
        name: '미배정',
        sourceType: element.sourceType,
        elevationMm: null,
      })
    }
    const floorId = element.floorId ?? 'unassigned'
    const floor = floorMap.get(floorId)
    if (floor) floor.elementCount += 1
  })

  const selectedFloorId = input.activeIfcStoreyId != null
    ? String(input.activeIfcStoreyId)
    : input.activeFloorLayerId ?? null
  const visibleFloorSet = new Set<string>()
  if (input.activeIfcStoreyId != null) visibleFloorSet.add(String(input.activeIfcStoreyId))
  input.overlayIfcStoreyIds?.forEach((id) => visibleFloorSet.add(String(id)))
  if (input.activeFloorLayerId) visibleFloorSet.add(input.activeFloorLayerId)
  input.overlayFloorLayerIds?.forEach((id) => visibleFloorSet.add(id))
  if (visibleFloorSet.size === 0) {
    floorMap.forEach((floor) => visibleFloorSet.add(floor.floorId))
  }

  return {
    elements,
    floors: Array.from(floorMap.values()).sort(compareByName),
    selectedElementId: getSelectedElementId(input),
    selectedFloorId,
    visibleFloorIds: Array.from(visibleFloorSet),
    hiddenElementIds: input.hiddenElementIds ?? [],
  }
}

const getCategoryLabel = (category: string): string =>
  CATEGORY_LABELS[category] ?? CATEGORY_LABELS[category.replace(/^Ifc/i, '')] ?? category

const getElementComputedVisibility = (
  element: ElementRegistryItem,
  visibleFloorIds: Set<string>,
  hiddenElementIds: Set<string>,
): boolean => {
  const floorVisible = element.floorId == null || visibleFloorIds.size === 0 || visibleFloorIds.has(element.floorId)
  return floorVisible && !hiddenElementIds.has(element.elementId)
}

export function buildElementHierarchyTree(registry: ElementRegistryState): ElementHierarchyNode[] {
  const selectedElementId = registry.selectedElementId
  const visibleFloorIds = new Set(registry.visibleFloorIds)
  const hiddenElementIds = new Set(registry.hiddenElementIds)
  const elementsByFloor = new Map<string, ElementRegistryItem[]>()
  registry.elements.forEach((element) => {
    const floorId = element.floorId ?? 'unassigned'
    const current = elementsByFloor.get(floorId) ?? []
    current.push(element)
    elementsByFloor.set(floorId, current)
  })

  const floorNodes = registry.floors.map<ElementHierarchyNode>((floor) => {
    const floorElements = (elementsByFloor.get(floor.floorId) ?? []).sort(compareByName)
    const categoryMap = new Map<string, ElementRegistryItem[]>()
    floorElements.forEach((element) => {
      const current = categoryMap.get(element.category) ?? []
      current.push(element)
      categoryMap.set(element.category, current)
    })

    const categoryNodes = Array.from(categoryMap.entries())
      .sort(([left], [right]) => getCategoryLabel(left).localeCompare(getCategoryLabel(right), 'ko'))
      .map<ElementHierarchyNode>(([category, elements]) => ({
        id: `category:${floor.floorId}:${category}`,
        label: `${getCategoryLabel(category)} (${elements.length})`,
        kind: 'category',
        floorId: floor.floorId,
        category,
        sourceType: floor.sourceType,
        isVisible: elements.some((element) => getElementComputedVisibility(element, visibleFloorIds, hiddenElementIds)),
        children: elements.map((element) => ({
          id: element.elementId,
          label: element.name,
          kind: 'element',
          elementId: element.elementId,
          floorId: element.floorId,
          category: element.category,
          sourceType: element.sourceType,
          isSelected: selectedElementId === element.elementId,
          isVisible: getElementComputedVisibility(element, visibleFloorIds, hiddenElementIds),
          isLocked: element.isLocked,
          children: [],
        })),
      }))

    return {
      id: `floor:${floor.floorId}`,
      label: `${floor.name} (${floor.elementCount})`,
      kind: floor.floorId === 'unassigned' ? 'unassigned' : 'floor',
      floorId: floor.floorId,
      sourceType: floor.sourceType,
      isSelected: registry.selectedFloorId === floor.floorId,
      isVisible: visibleFloorIds.has(floor.floorId),
      children: categoryNodes,
    }
  })

  return [{
    id: 'building',
    label: 'Building',
    kind: 'building',
    sourceType: 'MIXED',
    isVisible: true,
    children: floorNodes,
  }]
}

export function findRegistryElement(
  registry: ElementRegistryState,
  elementId: string,
): ElementRegistryItem | null {
  return registry.elements.find((element) => element.elementId === elementId) ?? null
}
