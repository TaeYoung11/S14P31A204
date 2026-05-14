import type { FloorLayer, FloorOpening, FloorRoom, FloorWall } from '../../types'

export interface HierarchyItem {
  id: string
  label: string
}

export interface HierarchyGroup {
  id: string
  name: string
  children: HierarchyItem[]
}

interface IfcHierarchyNode {
  id: string
  label: string
  children: IfcHierarchyNode[]
}

const IFC_LABEL_KEY_CANDIDATES = ['label', 'name', 'title', 'ifcClass', 'type', 'id'] as const
const IFC_CHILDREN_KEY_CANDIDATES = ['children', 'items', 'elements', 'nodes'] as const
const MAX_IFC_CHILDREN = 240

const toDisplayText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

const pickLabelFromRecord = (record: Record<string, unknown>, fallback: string) => {
  for (const key of IFC_LABEL_KEY_CANDIDATES) {
    const text = toDisplayText(record[key])
    if (text) return text
  }
  return fallback
}

const pickChildrenFromRecord = (record: Record<string, unknown>) => {
  for (const key of IFC_CHILDREN_KEY_CANDIDATES) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

const normalizeIfcNode = (node: unknown, fallbackId: string): IfcHierarchyNode | null => {
  if (typeof node === 'string' || typeof node === 'number') {
    const text = toDisplayText(node)
    if (!text) return null
    return { id: fallbackId, label: text, children: [] }
  }
  if (!node || typeof node !== 'object') return null

  const record = node as Record<string, unknown>
  const id = toDisplayText(record.id) || fallbackId
  const label = pickLabelFromRecord(record, id)
  const rawChildren = pickChildrenFromRecord(record)
  const children: IfcHierarchyNode[] = []

  rawChildren.forEach((child, index) => {
    const normalized = normalizeIfcNode(child, `${id}-${index + 1}`)
    if (normalized) children.push(normalized)
  })

  return { id, label, children }
}

const collectIfcItems = (nodes: IfcHierarchyNode[]) => {
  const items: HierarchyItem[] = []

  const walk = (node: IfcHierarchyNode, parentPath: string) => {
    if (items.length >= MAX_IFC_CHILDREN) return

    const label = parentPath ? `${parentPath} > ${node.label}` : node.label
    items.push({ id: node.id, label })
    node.children.forEach((child) => walk(child, label))
  }

  nodes.forEach((node) => walk(node, ''))
  return items
}

const toRoomItems = (floorRooms: FloorRoom[]) =>
  floorRooms.map((room, index) => ({
    id: room.id || room.bubbleId || `room-${index + 1}`,
    label: room.label || room.type || `Room ${index + 1}`,
  }))

const toWallItems = (floorWalls: FloorWall[]) =>
  floorWalls.map((wall, index) => ({
    id: wall.id || `wall-${index + 1}`,
    label: `벽체 ${index + 1} (${wall.type})`,
  }))

const toOpeningItems = (floorOpenings: FloorOpening[]) =>
  floorOpenings.map((opening, index) => ({
    id: opening.id || `opening-${index + 1}`,
    label: `${opening.type === 'door' ? '문' : '창문'} ${index + 1}`,
  }))

const toFloorItems = (floorLayers: FloorLayer[], activeFloorLayerId?: string | null) =>
  floorLayers.map((layer, index) => ({
    id: layer.id || `floor-${index + 1}`,
    label: `${activeFloorLayerId === layer.id ? '[활성] ' : ''}${layer.name || `${index + 1}층 평면도`} (${layer.rooms.length})`,
  }))

/**
 * 에디터 실데이터를 계층 구조 패널 표시용 그룹으로 변환한다.
 */
export function buildHierarchyGroups(input: {
  floorRooms?: FloorRoom[]
  floorWalls?: FloorWall[]
  floorOpenings?: FloorOpening[]
  floorLayers?: FloorLayer[]
  activeFloorLayerId?: string | null
  ifcElementHierarchy?: unknown
}): HierarchyGroup[] {
  const floorLayers = input.floorLayers ?? []
  const activeLayerRooms =
    floorLayers.find((layer) => layer.id === (input.activeFloorLayerId ?? null))?.rooms
  const floorRooms = activeLayerRooms ?? input.floorRooms ?? []
  const floorWalls = input.floorWalls ?? []
  const floorOpenings = input.floorOpenings ?? []
  const groups: HierarchyGroup[] = []

  groups.push({
    id: 'floors',
    name: `층 (${floorLayers.length})`,
    children: toFloorItems(floorLayers, input.activeFloorLayerId),
  })

  groups.push({
    id: 'rooms',
    name: `실내 공간 (${floorRooms.length})`,
    children: toRoomItems(floorRooms),
  })
  groups.push({
    id: 'walls',
    name: `벽체 (${floorWalls.length})`,
    children: toWallItems(floorWalls),
  })
  groups.push({
    id: 'openings',
    name: `개구부 (${floorOpenings.length})`,
    children: toOpeningItems(floorOpenings),
  })

  if (Array.isArray(input.ifcElementHierarchy)) {
    const ifcNodes = input.ifcElementHierarchy
      .map((node, index) => normalizeIfcNode(node, `ifc-${index + 1}`))
      .filter((node): node is IfcHierarchyNode => node != null)
    const ifcItems = collectIfcItems(ifcNodes)
    if (ifcItems.length > 0) {
      groups.push({
        id: 'ifc-elements',
        name: `IFC 요소 (${ifcItems.length})`,
        children: ifcItems,
      })
    }
  }

  return groups
}
