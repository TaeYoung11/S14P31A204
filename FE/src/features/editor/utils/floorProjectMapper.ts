import type { ConnectionData, FloorLayer, FloorOpening, FloorRoom, FloorWall, FloorWallType } from '../types'
import type { FloorProject, FloorProjectPoint2D, FloorProjectRoom, FloorProjectWallType } from '../types/floorProject.types'
import type { BubbleData } from '../types'
import { calcPxDimensionsFromMm } from './bubbleCalc'
import { DEFAULT_WALL_MATERIAL, FLOOR_MM_PER_PX, FLOOR_WALL_PRESETS } from '../constants'

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

interface ProjectTransform {
  scale: number
  offsetX: number
  offsetY: number
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
  return Math.abs(area) / 2 / 1_000_000
}

const toCanvasPoint = (point: FloorProjectPoint2D, scale: number, offsetX: number, offsetY: number) => ({
  x: point.x * scale + offsetX,
  y: point.y * scale + offsetY,
})

const mapRoomContourToCanvas = (
  contour: FloorProjectRoom['contour'],
  scale: number,
  offsetX: number,
  offsetY: number,
): FloorRoom['contour'] => {
  if (!contour || contour.length === 0) return undefined
  return contour.map((segment) => {
    if (segment.type === 'line') {
      return {
        type: 'line',
        from: toCanvasPoint(segment.from, scale, offsetX, offsetY),
        to: toCanvasPoint(segment.to, scale, offsetX, offsetY),
      }
    }
    return {
      type: 'arc',
      center: toCanvasPoint(segment.center, scale, offsetX, offsetY),
      radius: segment.radius * scale,
      startAngleDeg: segment.start_angle_deg,
      endAngleDeg: segment.end_angle_deg,
      clockwise: segment.clockwise,
    }
  })
}

const mapRoomTransformToCanvas = (
  transform: FloorProjectRoom['transform'],
  scale: number,
  offsetX: number,
  offsetY: number,
): FloorRoom['transform'] => {
  if (!transform) return undefined
  return {
    translationX: transform.translation ? transform.translation.x * scale : undefined,
    translationY: transform.translation ? transform.translation.y * scale : undefined,
    rotationDeg: transform.rotation_deg,
    scaleX: transform.scale_x,
    scaleY: transform.scale_y,
    origin: transform.origin ? toCanvasPoint(transform.origin, scale, offsetX, offsetY) : undefined,
  }
}

/** adjacency 목록을 roomId → 연결된 roomId[] 맵으로 변환한다. */
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

const getBoundsByFloor = (rooms: FloorProjectRoom[]): Map<string, Bounds> => {
  const grouped = new Map<string, FloorProjectRoom[]>()
  rooms.forEach((room) => {
    const current = grouped.get(room.floor) ?? []
    current.push(room)
    grouped.set(room.floor, current)
  })

  const result = new Map<string, Bounds>()
  grouped.forEach((floorRooms, floorId) => {
    const floorBounds = buildProjectBounds(floorRooms)
    if (floorBounds) result.set(floorId, floorBounds)
  })
  return result
}

/** mm 좌표를 캔버스 px 좌표로 변환하는 스케일/오프셋 계산 */
const computeProjectTransform = (rooms: FloorProjectRoom[], options: MapperOptions): ProjectTransform => {
  const width = Math.max(0, options.width)
  const height = Math.max(0, options.height)
  const padding = options.padding ?? DEFAULT_PADDING
  const projectBounds = buildProjectBounds(rooms)
  const layoutWidth = projectBounds ? projectBounds.maxX - projectBounds.minX : 1
  const layoutHeight = projectBounds ? projectBounds.maxY - projectBounds.minY : 1
  const availableWidth = Math.max(width - padding * 2, 1)
  const availableHeight = Math.max(height - padding * 2, 1)
  const scale = projectBounds
    ? clamp(Math.min(availableWidth / layoutWidth, availableHeight / layoutHeight), 0.01, 100)
    : 1
  const offsetX = projectBounds ? (width - layoutWidth * scale) / 2 - projectBounds.minX * scale : 0
  const offsetY = projectBounds ? (height - layoutHeight * scale) / 2 - projectBounds.minY * scale : 0
  return { scale, offsetX, offsetY }
}

/** FloorProjectWallType → FE FloorWallType 변환 */
const toFloorWallType = (type?: FloorProjectWallType): FloorWallType => {
  if (type === 'exterior') return 'exterior'
  if (type === 'loadBearing') return 'loadBearing'
  if (type === 'partition' || type === 'interior') return 'partition'
  return 'general'
}

const createBubbleIndex = (index: number) => String(index + 1).padStart(2, '0')
const mapStrengthToStyle = (strength: number): ConnectionData['type'] =>
  strength >= 0.75 ? 'bold' : strength >= 0.45 ? 'thin' : 'dashed'

/**
 * BATANG 2D FloorProject를 기존 에디터의 FloorLayer[] 구조로 변환한다.
 * 목적: API 응답 연동 전에도 프론트 렌더링 경로를 고정해 두기 위함.
 */
export function mapFloorProjectToLayers(project: FloorProject, options: MapperOptions): FloorLayer[] {
  /** floor.id(GlobalId) → FloorProjectFloor 역참조 */
  const floorById = new Map(project.floors.map((floor) => [floor.id, floor]))
  const connectedMap = toConnectedMap(project.adjacency)
  const { scale, offsetX, offsetY } = computeProjectTransform(project.rooms, options)

  const roomsByFloor = new Map<string, FloorRoom[]>()

  project.rooms.forEach((room) => {
    const bounds = toBounds(room.polygon)
    if (!bounds) return

    const floorRooms = roomsByFloor.get(room.floor) ?? []
    const polygon = room.polygon.map((point) => toCanvasPoint(point, scale, offsetX, offsetY))
    const contour = mapRoomContourToCanvas(room.contour, scale, offsetX, offsetY)
    const transform = mapRoomTransformToCanvas(room.transform, scale, offsetX, offsetY)
    const roomWidth = (bounds.maxX - bounds.minX) * scale
    const roomHeight = (bounds.maxY - bounds.minY) * scale
    const roomWidthMm = Math.max(bounds.maxX - bounds.minX, 100)
    const roomHeightMm = Math.max(bounds.maxY - bounds.minY, 100)

    floorRooms.push({
      id: room.id,
      bubbleId: room.id,
      label: room.name,
      type: room.type,
      x: bounds.minX * scale + offsetX,
      y: bounds.minY * scale + offsetY,
      width: clamp(roomWidth, 20, Number.MAX_SAFE_INTEGER),
      height: clamp(roomHeight, 20, Number.MAX_SAFE_INTEGER),
      widthMm: roomWidthMm,
      heightMm: roomHeightMm,
      area: computeRoomAreaM2(room.polygon),
      color: room.color ?? DEFAULT_ROOM_COLOR,
      material: room.floor_material ?? '콘크리트',
      connectedIds: connectedMap.get(room.id) ?? [],
      polygon,
      contour,
      transform,
    })

    roomsByFloor.set(room.floor, floorRooms)
  })

  return [...roomsByFloor.entries()]
    .sort(([idA], [idB]) => {
      const numA = floorById.get(idA)?.number ?? 0
      const numB = floorById.get(idB)?.number ?? 0
      return numA - numB
    })
    .map(([floorId, rooms]) => {
      const floor = floorById.get(floorId)
      return {
        id: `floor-${floor?.number ?? floorId}`,
        name: floor?.name ?? `${floorId} 평면도`,
        rooms,
      }
    })
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
 * FloorProject.walls(IFC IfcWall) → FE FloorWall[] 변환
 * walls 필드가 없거나 비어 있으면 빈 배열 반환 → 호출측에서 autoWalls로 폴백
 */
export function mapFloorProjectToWalls(project: FloorProject, options: MapperOptions): FloorWall[] {
  if (!project.walls || project.walls.length === 0) return []
  const { scale, offsetX, offsetY } = computeProjectTransform(project.rooms, options)
  return project.walls.map((wall) => {
    const wallType = toFloorWallType(wall.type)
    return {
      id: wall.id,
      sourceIfcClass: wall.ifc_class,
      start: { x: wall.start.x * scale + offsetX, y: wall.start.y * scale + offsetY },
      end: { x: wall.end.x * scale + offsetX, y: wall.end.y * scale + offsetY },
      type: wallType,
      thickness: wall.thickness ?? FLOOR_WALL_PRESETS[wallType].thickness,
      heightMm: wall.height ?? FLOOR_WALL_PRESETS[wallType].heightMm,
      material: DEFAULT_WALL_MATERIAL,
    }
  })
}

/**
 * FloorProject.openings(IFC IfcDoor/IfcWindow) → FE FloorOpening[] 변환
 * openings 필드가 없거나 비어 있으면 빈 배열 반환 → 호출측에서 autoOpenings로 폴백
 */
export function mapFloorProjectToOpenings(project: FloorProject): FloorOpening[] {
  if (!project.openings || project.openings.length === 0) return []
  return project.openings.map((opening) => ({
    id: opening.id,
    sourceIfcClass: opening.ifc_class,
    type: opening.type,
    wallId: opening.wall_id,
    wallPosition: opening.wall_position,
    widthMm: opening.width,
    heightMm: opening.height ?? (opening.type === 'door' ? 2100 : 1200),
    sillHeightMm: opening.sill_height,
    doorHingeSide: opening.type === 'door' ? ('left' as const) : undefined,
    doorSwingDirection: opening.type === 'door' ? ('inward' as const) : undefined,
  }))
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
  /** floor.id(GlobalId) → floor.number 역참조 (정렬용) */
  const floorNumberById = new Map(project.floors.map((floor) => [floor.id, floor.number]))
  const sortedFloorIds = [...new Set(project.rooms.map((room) => room.floor))]
    .sort((a, b) => (floorNumberById.get(a) ?? 0) - (floorNumberById.get(b) ?? 0))

  let currentOffsetX = padding
  const floorOffsetX = new Map<string, number>()
  const floorScale = new Map<string, number>()

  sortedFloorIds.forEach((floorId) => {
    const bounds = boundsByFloor.get(floorId)
    if (!bounds) return
    const floorWidthPx = Math.max((bounds.maxX - bounds.minX) / FLOOR_MM_PER_PX, 1)
    const floorHeightPx = Math.max((bounds.maxY - bounds.minY) / FLOOR_MM_PER_PX, 1)
    const availableHeight = Math.max(height - padding * 2, 1)
    // IFC(mm) 기반 실측 비율을 유지하되, 캔버스에 과도하게 작거나 큰 경우만 완만하게 보정한다.
    const fitScale = clamp(availableHeight / floorHeightPx, 0.6, 2.2)
    const scale = fitScale
    floorOffsetX.set(floorId, currentOffsetX)
    floorScale.set(floorId, scale)
    currentOffsetX += floorWidthPx * scale + gapX
  })

  const canvasCenterY = height / 2

  return project.rooms.map((room, index) => {
    const roomBounds = toBounds(room.polygon)
    const bounds = roomBounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    const floorBounds = boundsByFloor.get(room.floor) ?? bounds
    const scale = floorScale.get(room.floor) ?? 1
    const offsetX = floorOffsetX.get(room.floor) ?? padding

    const centerX = (bounds.minX + bounds.maxX) / 2
    const roomCenterY = (bounds.minY + bounds.maxY) / 2
    const floorCenterY = (floorBounds.minY + floorBounds.maxY) / 2

    const widthMm = Math.max(bounds.maxX - bounds.minX, 600)
    const heightMm = Math.max(bounds.maxY - bounds.minY, 600)
    const ratio = computeRoomAreaM2(room.polygon)
    const safeRatio = ratio > 0 ? ratio : (widthMm * heightMm) / 1_000_000
    const basePx = calcPxDimensionsFromMm(widthMm, heightMm)
    const px = {
      width: basePx.width * scale,
      height: basePx.height * scale,
    }

    const centerXPx = (centerX - floorBounds.minX) / FLOOR_MM_PER_PX
    const centerYPx = (roomCenterY - floorCenterY) / FLOOR_MM_PER_PX
    const x = offsetX + centerXPx * scale - px.width / 2
    const y = canvasCenterY + centerYPx * scale - px.height / 2

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
      material: room.floor_material ?? '콘크리트',
      index: createBubbleIndex(index),
    }
  })
}
