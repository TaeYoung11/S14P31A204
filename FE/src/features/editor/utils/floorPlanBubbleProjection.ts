import type { BubbleData, ConnectionData, FloorLayer, FloorRoom, ZoneData } from '../types'
import { normalizeBubbleFloor, readNonZeroIntegerFromUnknown } from './bubbleFloorUtils'

interface BubbleFloorMeta {
  namesByFloor: Record<number, string>
  extraFloors: number[]
}

export interface FloorPlanBubbleProjection {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones: ZoneData[]
  floorMeta: BubbleFloorMeta
  availableFloors: number[]
}

interface BuildFloorPlanBubbleProjectionInput {
  floorLayers: FloorLayer[]
  previousBubbles: BubbleData[]
  previousConnections: ConnectionData[]
  previousZones: ZoneData[]
}

const parseSafeFloorFromLayerId = (value: string): number | null => {
  const match = value.match(/^floor-(-?\d+)$/i)
  if (!match?.[1]) return null
  const parsed = Number.parseInt(match[1], 10)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 200) return null
  return normalizeBubbleFloor(parsed)
}

const resolveBubbleFloorFromLayer = (layer: FloorLayer, layerIndex: number): number => {
  const parsedFromStoreyName = readNonZeroIntegerFromUnknown(layer.storeyName)
  if (parsedFromStoreyName !== null) return normalizeBubbleFloor(parsedFromStoreyName)

  const parsedFromLayerName = readNonZeroIntegerFromUnknown(layer.name)
  if (parsedFromLayerName !== null) return normalizeBubbleFloor(parsedFromLayerName)

  const parsedFromLayerId = parseSafeFloorFromLayerId(layer.id)
  if (parsedFromLayerId !== null) return parsedFromLayerId

  return normalizeBubbleFloor(layerIndex + 1)
}

const resolveRoomArea = (room: FloorRoom): number => {
  if (Number.isFinite(room.area) && room.area > 0) return room.area
  if (Number.isFinite(room.widthMm) && Number.isFinite(room.heightMm)) {
    return Math.max((room.widthMm * room.heightMm) / 1_000_000, 0)
  }
  return 0
}

const toProjectedBubble = (
  room: FloorRoom,
  floor: number,
  index: number,
  previousBubble?: BubbleData,
): BubbleData => {
  const area = resolveRoomArea(room)
  const x = previousBubble?.x ?? room.x
  const y = previousBubble?.y ?? room.y
  return {
    id: room.bubbleId || room.id,
    floor,
    x,
    y,
    width: room.width,
    height: room.height,
    widthMm: room.widthMm,
    heightMm: room.heightMm,
    label: room.label,
    type: room.type,
    ratio: area,
    area: `${area.toFixed(1)} m2`,
    color: room.color,
    material: room.material ?? previousBubble?.material,
    index: previousBubble?.index ?? String(index + 1).padStart(2, '0'),
    originalType: previousBubble?.originalType,
    wallType: previousBubble?.wallType,
  }
}

const connectionKey = (from: string, to: string): string => [from, to].sort().join('::')

const buildProjectedConnections = (
  rooms: FloorRoom[],
  previousConnections: ConnectionData[],
): ConnectionData[] => {
  const nextByKey = new Map<string, ConnectionData>()
  const validBubbleIds = new Set(rooms.map((room) => room.bubbleId || room.id))

  // Bubble connections are explicit diagram lines, not inferred 2D room adjacency.
  previousConnections.forEach((connection) => {
    if (!validBubbleIds.has(connection.from) || !validBubbleIds.has(connection.to)) return
    nextByKey.set(connectionKey(connection.from, connection.to), connection)
  })

  return Array.from(nextByKey.values())
}

const pruneZones = (zones: ZoneData[], bubbleIds: Set<string>): ZoneData[] =>
  zones
    .map((zone) => ({
      ...zone,
      bubbleIds: zone.bubbleIds.filter((bubbleId) => bubbleIds.has(bubbleId)),
    }))
    .filter((zone) => zone.bubbleIds.length > 0)

export function buildFloorPlanBubbleProjection({
  floorLayers,
  previousBubbles,
  previousConnections,
  previousZones,
}: BuildFloorPlanBubbleProjectionInput): FloorPlanBubbleProjection {
  const previousBubbleById = new Map(previousBubbles.map((bubble) => [bubble.id, bubble] as const))
  const floors = new Set<number>()
  const floorMeta: BubbleFloorMeta = {
    namesByFloor: {},
    extraFloors: [],
  }
  const rooms: FloorRoom[] = []
  const bubbles: BubbleData[] = []

  floorLayers.forEach((layer, layerIndex) => {
    const floor = resolveBubbleFloorFromLayer(layer, layerIndex)
    floors.add(floor)
    floorMeta.namesByFloor[floor] = layer.name.trim() || layer.storeyName?.trim() || String(floor)
    rooms.push(...layer.rooms)
    layer.rooms.forEach((room) => {
      bubbles.push(toProjectedBubble(room, floor, bubbles.length, previousBubbleById.get(room.bubbleId || room.id)))
    })
  })

  if (floors.size === 0) floors.add(1)
  const availableFloors = Array.from(floors).sort((left, right) => left - right)
  floorMeta.extraFloors = availableFloors.filter((floor) => !bubbles.some((bubble) => normalizeBubbleFloor(bubble.floor) === floor))

  const bubbleIds = new Set(bubbles.map((bubble) => bubble.id))
  return {
    bubbles,
    connections: buildProjectedConnections(rooms, previousConnections),
    zones: pruneZones(previousZones, bubbleIds),
    floorMeta,
    availableFloors,
  }
}
