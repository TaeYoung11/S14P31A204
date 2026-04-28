import type { ConnectionData, FloorLayer, FloorRoom } from '../types'
import type { FloorProject, FloorProjectPoint2D, FloorProjectRoom } from '../types/floorProject.types'
import type { BubbleData } from '../types'
import { calcPxDimensionsByAreaAndAspect } from './bubbleCalc'

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface MapperOptions {
  width: number
  height: number
  padding?: number
}

const DEFAULT_ROOM_COLOR = '#DCE3F3'
const DEFAULT_PADDING = 80

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const toBounds = (polygon: FloorProjectPoint2D[]): Bounds | null => {
  if (!polygon || polygon.length < 3) return null
  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

const computeRoomAreaM2 = (polygon: FloorProjectPoint2D[]): number => {
  if (!polygon || polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i]
    const next = polygon[(i + 1) % polygon.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

const toLayerName = (floorNumber: number, floorNameByNumber: Map<number, string>) =>
  floorNameByNumber.get(floorNumber) ?? `${floorNumber}층 평면도`

const toConnectedMap = (adjacency: FloorProject['adjacency']): Map<string, string[]> => {
  const connected = new Map<string, Set<string>>()
  adjacency.forEach((item) => {
    if (!connected.has(item.from_room_id)) connected.set(item.from_room_id, new Set<string>())
    if (!connected.has(item.to_room_id)) connected.set(item.to_room_id, new Set<string>())
    connected.get(item.from_room_id)?.add(item.to_room_id)
    connected.get(item.to_room_id)?.add(item.from_room_id)
  })
  return new Map([...connected.entries()].map(([key, value]) => [key, [...value]]))
}

const buildProjectBounds = (rooms: FloorProjectRoom[]): Bounds | null => {
  const roomBounds = rooms
    .map((room) => toBounds(room.polygon))
    .filter((value): value is Bounds => value !== null)

  if (roomBounds.length === 0) return null

  return {
    minX: Math.min(...roomBounds.map((bound) => bound.minX)),
    minY: Math.min(...roomBounds.map((bound) => bound.minY)),
    maxX: Math.max(...roomBounds.map((bound) => bound.maxX)),
    maxY: Math.max(...roomBounds.map((bound) => bound.maxY)),
  }
}

const getBoundsByFloor = (rooms: FloorProjectRoom[]): Map<number, Bounds> => {
  const grouped = new Map<number, FloorProjectRoom[]>()
  rooms.forEach((room) => {
    const current = grouped.get(room.floor) ?? []
    current.push(room)
    grouped.set(room.floor, current)
  })

  const result = new Map<number, Bounds>()
  grouped.forEach((floorRooms, floorNumber) => {
    const floorBounds = buildProjectBounds(floorRooms)
    if (floorBounds) result.set(floorNumber, floorBounds)
  })
  return result
}

const createBubbleIndex = (index: number) => String(index + 1).padStart(2, '0')
const mapStrengthToStyle = (strength: number): ConnectionData['type'] =>
  strength >= 0.75 ? 'bold' : strength >= 0.45 ? 'thin' : 'dashed'

/**
 * BATANG 2D FloorProject를 기존 에디터의 FloorLayer[] 구조로 변환한다.
 * 목적: API 응답 연동 전에도 프론트 렌더링 경로를 고정해 두기 위함.
 */
export function mapFloorProjectToLayers(project: FloorProject, options: MapperOptions): FloorLayer[] {
  const floorNameByNumber = new Map(project.floors.map((floor) => [floor.number, floor.name]))
  const connectedMap = toConnectedMap(project.adjacency)
  const projectBounds = buildProjectBounds(project.rooms)

  const width = Math.max(0, options.width)
  const height = Math.max(0, options.height)
  const padding = options.padding ?? DEFAULT_PADDING

  const layoutWidth = projectBounds ? projectBounds.maxX - projectBounds.minX : 1
  const layoutHeight = projectBounds ? projectBounds.maxY - projectBounds.minY : 1

  const availableWidth = Math.max(width - padding * 2, 1)
  const availableHeight = Math.max(height - padding * 2, 1)
  const scale = projectBounds
    ? clamp(Math.min(availableWidth / layoutWidth, availableHeight / layoutHeight), 0.01, 100)
    : 1

  const offsetX = projectBounds ? (width - layoutWidth * scale) / 2 - projectBounds.minX * scale : 0
  const offsetY = projectBounds ? (height - layoutHeight * scale) / 2 - projectBounds.minY * scale : 0

  const roomsByFloor = new Map<number, FloorRoom[]>()

  project.rooms.forEach((room) => {
    const bounds = toBounds(room.polygon)
    if (!bounds) return

    const floorRooms = roomsByFloor.get(room.floor) ?? []
    const roomWidth = (bounds.maxX - bounds.minX) * scale
    const roomHeight = (bounds.maxY - bounds.minY) * scale

    floorRooms.push({
      id: room.id,
      bubbleId: room.id,
      label: room.name,
      type: room.type,
      x: bounds.minX * scale + offsetX,
      y: bounds.minY * scale + offsetY,
      width: clamp(roomWidth, 20, Number.MAX_SAFE_INTEGER),
      height: clamp(roomHeight, 20, Number.MAX_SAFE_INTEGER),
      area: computeRoomAreaM2(room.polygon),
      color: room.color ?? DEFAULT_ROOM_COLOR,
      connectedIds: connectedMap.get(room.id) ?? [],
    })

    roomsByFloor.set(room.floor, floorRooms)
  })

  return [...roomsByFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floorNumber, rooms]) => ({
      id: `floor-${floorNumber}`,
      name: toLayerName(floorNumber, floorNameByNumber),
      rooms,
    }))
}

/**
 * BATANG 2D adjacency를 연결선 타입으로 변환한다.
 * - 강도 0.75 이상: bold
 * - 강도 0.45 이상: thin
 * - 그 외: dashed
 */
export function mapAdjacencyToConnections(adjacency: FloorProject['adjacency']): ConnectionData[] {
  const seen = new Set<string>()
  return adjacency
    .map((item) => ({
      from: item.from_room_id,
      to: item.to_room_id,
      type: mapStrengthToStyle(item.strength),
    }))
    .filter((connection) => {
      if (connection.from === connection.to) return false
      const key = [connection.from, connection.to].sort().join('::')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * BATANG 2D FloorProject를 버블 다이어그램 상태로 변환한다.
 * 세 모드 동기화를 위해 import 시 bubbles/connections 원본 상태를 함께 갱신할 때 사용한다.
 */
export function mapFloorProjectToBubbles(project: FloorProject, options: MapperOptions): BubbleData[] {
  const height = Math.max(0, options.height)
  const padding = options.padding ?? DEFAULT_PADDING
  const gapX = 120

  const boundsByFloor = getBoundsByFloor(project.rooms)
  const sortedFloorNumbers = [...new Set(project.rooms.map((room) => room.floor))].sort((a, b) => a - b)

  let currentOffsetX = padding
  const floorOffsetX = new Map<number, number>()
  const floorScale = new Map<number, number>()

  sortedFloorNumbers.forEach((floorNumber) => {
    const bounds = boundsByFloor.get(floorNumber)
    if (!bounds) return
    const floorWidthM = Math.max(bounds.maxX - bounds.minX, 1)
    const floorHeightM = Math.max(bounds.maxY - bounds.minY, 1)
    const scale = clamp((height - padding * 2) / floorHeightM, 35, 90)
    floorOffsetX.set(floorNumber, currentOffsetX)
    floorScale.set(floorNumber, scale)
    currentOffsetX += floorWidthM * scale + gapX
  })

  const centerY = height / 2

  return project.rooms.map((room, index) => {
    const roomBounds = toBounds(room.polygon)
    const bounds = roomBounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    const floorBounds = boundsByFloor.get(room.floor) ?? bounds
    const scale = floorScale.get(room.floor) ?? 55
    const offsetX = floorOffsetX.get(room.floor) ?? padding

    const centerXMeter = (bounds.minX + bounds.maxX) / 2
    const centerYMeter = (bounds.minY + bounds.maxY) / 2
    const floorCenterYMeter = (floorBounds.minY + floorBounds.maxY) / 2

    const widthMm = Math.max((bounds.maxX - bounds.minX) * 1000, 600)
    const heightMm = Math.max((bounds.maxY - bounds.minY) * 1000, 600)
    const ratio = computeRoomAreaM2(room.polygon)
    const safeRatio = ratio > 0 ? ratio : (widthMm * heightMm) / 1_000_000
    const aspect = widthMm / heightMm
    const px = calcPxDimensionsByAreaAndAspect(safeRatio, aspect)

    const x = offsetX + (centerXMeter - floorBounds.minX) * scale - px.width / 2
    const y = centerY + (centerYMeter - floorCenterYMeter) * scale - px.height / 2

    return {
      id: room.id,
      x,
      y,
      width: px.width,
      height: px.height,
      widthMm,
      heightMm,
      label: room.name,
      type: room.type || '미선택',
      ratio: safeRatio,
      area: `${safeRatio.toFixed(1)} m²`,
      color: room.color ?? '#ffffff',
      index: createBubbleIndex(index),
    }
  })
}
