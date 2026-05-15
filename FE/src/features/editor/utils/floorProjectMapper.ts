import type { ConnectionData, FloorLayer, FloorOpening, FloorRoom, FloorWall, FloorWallType } from '../types'
import type { FloorProject, FloorProjectPoint2D, FloorProjectRoom, FloorProjectWallType } from '../types/floorProject.types'
import type { BubbleData } from '../types'
import { calcPxDimensionsFromMm } from './bubbleCalc'
import { DEFAULT_WALL_MATERIAL, FLOOR_MM_PER_PX, FLOOR_WALL_PRESETS } from '../constants'
import { normalizeIfcDisplayText } from './ifcStepString'
import { readPositiveNumber } from './numberUtils'

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
  scaleMode?: 'fit' | 'real' | 'canvas'
  referenceBubbles?: Pick<BubbleData, 'id' | 'x' | 'y' | 'width' | 'height' | 'widthMm' | 'heightMm' | 'ratio' | 'label' | 'type'>[]
}

interface ProjectTransform {
  scale: number
  offsetX: number
  offsetY: number
}

const DEFAULT_ROOM_COLOR = '#DCE3F3'
const DEFAULT_PADDING = 80

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const median = (values: number[]): number | null => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

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

const isSamePoint = (a: FloorProjectPoint2D, b: FloorProjectPoint2D, epsilon = 0.001): boolean =>
  Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon

const isAxisAlignedRectanglePolygon = (polygon: FloorProjectPoint2D[]): boolean => {
  const bounds = toBounds(polygon)
  if (!bounds) return false
  const points = polygon.slice()
  if (points.length > 1 && isSamePoint(points[0], points[points.length - 1])) {
    points.pop()
  }
  if (points.length !== 4) return false

  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]
  return points.every((point) => corners.some((corner) => isSamePoint(point, corner)))
}

const computeRawPolygonArea = (polygon: FloorProjectPoint2D[]): number => {
  if (!polygon || polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i]
    const next = polygon[(i + 1) % polygon.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

const computeRoomAreaM2 = (polygon: FloorProjectPoint2D[], coordinateMmMultiplier = 1): number => {
  return (computeRawPolygonArea(polygon) * coordinateMmMultiplier * coordinateMmMultiplier) / 1_000_000
}

const readPositiveDimension = (value: unknown): number | null => {
  const numericValue = readPositiveNumber(value)
  return numericValue !== null ? numericValue : null
}

const normalizeMatchKey = (value: string | undefined): string =>
  normalizeIfcDisplayText(value ?? '').trim().replace(/\s+/g, '').toLowerCase()

const buildReferenceBubbleResolver = (referenceBubbles?: MapperOptions['referenceBubbles']) => {
  const bubbles = referenceBubbles ?? []
  const bubbleById = new Map(bubbles.map((bubble) => [bubble.id, bubble]))
  const bubblesByLabel = new Map<string, typeof bubbles>()

  bubbles.forEach((bubble) => {
    const keys = [normalizeMatchKey(bubble.label), normalizeMatchKey(bubble.type)].filter(Boolean)
    keys.forEach((key) => {
      const current = bubblesByLabel.get(key) ?? []
      current.push(bubble)
      bubblesByLabel.set(key, current)
    })
  })

  return (room: FloorProjectRoom, index: number) => {
    const byId = bubbleById.get(room.id)
    if (byId) return byId

    const roomKeys = [normalizeMatchKey(room.name), normalizeMatchKey(room.type)].filter(Boolean)
    for (const key of roomKeys) {
      const matches = bubblesByLabel.get(key)
      if (matches?.length) return matches.shift()
    }

    return bubbles[index] ?? null
  }
}

const readMetadataNumber = (metadata: FloorProjectRoom['metadata'], keys: string[]): number | null => {
  if (!metadata) return null
  for (const key of keys) {
    const value = readPositiveNumber(metadata[key])
    if (value !== null) return value
  }
  return null
}

const readRoomAreaM2 = (room: FloorProjectRoom): number | null => {
  const directAreaM2 =
    readPositiveNumber(room.areaM2)
    ?? readPositiveNumber(room.area_m2)
    ?? readPositiveNumber(room.grossAreaM2)
    ?? readPositiveNumber(room.gross_area_m2)
    ?? readPositiveNumber(room.netAreaM2)
    ?? readPositiveNumber(room.net_area_m2)
    ?? readMetadataNumber(room.metadata, [
      'areaM2',
      'area_m2',
      'grossAreaM2',
      'gross_area_m2',
      'netAreaM2',
      'net_area_m2',
      'GrossFloorArea',
      'NetFloorArea',
    ])
  if (directAreaM2 !== null) return directAreaM2

  const directAreaMm2 = readMetadataNumber(room.metadata, [
    'areaMm2',
    'area_mm2',
    'grossAreaMm2',
    'gross_area_mm2',
    'netAreaMm2',
    'net_area_mm2',
  ])
  if (directAreaMm2 !== null) return directAreaMm2 / 1_000_000

  return readPositiveNumber(room.area) ?? readMetadataNumber(room.metadata, ['area'])
}

const resolveRoomAreaM2 = (room: FloorProjectRoom, coordinateMmMultiplier = 1): number =>
  readRoomAreaM2(room) ?? computeRoomAreaM2(room.polygon, coordinateMmMultiplier)

const resolveMappedRoomAreaM2 = (
  room: FloorProjectRoom,
  referenceBubble?: Pick<BubbleData, 'ratio'>,
  coordinateMmMultiplier = 1,
): number => {
  const roomArea = readRoomAreaM2(room)
  if (roomArea !== null) return roomArea
  const referenceArea = readPositiveNumber(referenceBubble?.ratio)
  if (referenceArea !== null) return referenceArea
  return computeRoomAreaM2(room.polygon, coordinateMmMultiplier)
}

const inferCoordinateMmMultiplier = (rooms: FloorProjectRoom[]): number => {
  const dimensions = rooms.flatMap((room) => {
    const bounds = toBounds(room.polygon)
    if (!bounds) return []
    return [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY]
  })
  const medianDimension = median(dimensions)
  if (medianDimension !== null && medianDimension > 0 && medianDimension < 500) return 1000
  return 1
}

const resolveRoomType = (room: FloorProjectRoom): string => {
  const rawType = room.type?.trim()
  if (rawType && rawType !== 'other') return rawType

  const label = normalizeIfcDisplayText(room.name).trim()
  if (!label) return rawType || 'other'
  return label
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
const computeReferenceBubbleTransform = (
  rooms: FloorProjectRoom[],
  referenceBubbles?: MapperOptions['referenceBubbles'],
): ProjectTransform | null => {
  if (!referenceBubbles || referenceBubbles.length === 0) return null

  const resolveReferenceBubble = buildReferenceBubbleResolver(referenceBubbles)
  const scaleCandidates: number[] = []
  const pairs: Array<{ projectCenterX: number; projectCenterY: number; bubbleCenterX: number; bubbleCenterY: number }> = []

  rooms.forEach((room, index) => {
    const bubble = resolveReferenceBubble(room, index)
    const bounds = toBounds(room.polygon)
    if (!bubble || !bounds) return

    const projectWidth = bounds.maxX - bounds.minX
    const projectHeight = bounds.maxY - bounds.minY
    if (projectWidth > 0 && bubble.width > 0) scaleCandidates.push(bubble.width / projectWidth)
    if (projectHeight > 0 && bubble.height > 0) scaleCandidates.push(bubble.height / projectHeight)

    pairs.push({
      projectCenterX: (bounds.minX + bounds.maxX) / 2,
      projectCenterY: (bounds.minY + bounds.maxY) / 2,
      bubbleCenterX: bubble.x + bubble.width / 2,
      bubbleCenterY: bubble.y + bubble.height / 2,
    })
  })

  const scale = median(scaleCandidates)
  if (scale === null || pairs.length === 0) return null

  const offsetX = pairs.reduce((sum, pair) => sum + pair.bubbleCenterX - pair.projectCenterX * scale, 0) / pairs.length
  const offsetY = pairs.reduce((sum, pair) => sum + pair.bubbleCenterY - pair.projectCenterY * scale, 0) / pairs.length
  return { scale, offsetX, offsetY }
}

const computeProjectTransform = (rooms: FloorProjectRoom[], options: MapperOptions): ProjectTransform => {
  const projectBounds = buildProjectBounds(rooms)

  if (options.scaleMode === 'canvas') {
    const referenceTransform = computeReferenceBubbleTransform(rooms, options.referenceBubbles)
    if (referenceTransform) return referenceTransform
    return { scale: 1 / FLOOR_MM_PER_PX, offsetX: 0, offsetY: 0 }
  }

  if (options.scaleMode === 'real') {
    const scale = 1 / FLOOR_MM_PER_PX
    if (!projectBounds) return { scale, offsetX: 0, offsetY: 0 }

    const layoutWidth = projectBounds.maxX - projectBounds.minX
    const layoutHeight = projectBounds.maxY - projectBounds.minY
    const width = Math.max(0, options.width)
    const height = Math.max(0, options.height)
    const offsetX = (width - layoutWidth * scale) / 2 - projectBounds.minX * scale
    const offsetY = (height - layoutHeight * scale) / 2 - projectBounds.minY * scale
    return { scale, offsetX, offsetY }
  }

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

const interpolateMmPoint = (
  start: FloorProjectPoint2D | undefined,
  end: FloorProjectPoint2D | undefined,
  ratio: number,
): FloorProjectPoint2D | undefined => {
  if (!start || !end || !Number.isFinite(ratio)) return undefined
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  }
}

/**
 * BATANG 2D FloorProject를 기존 에디터의 FloorLayer[] 구조로 변환한다.
 * 목적: API 응답 연동 전에도 프론트 렌더링 경로를 고정해 두기 위함.
 */
export function mapFloorProjectToLayers(project: FloorProject, options: MapperOptions): FloorLayer[] {
  /** floor.id(GlobalId) → FloorProjectFloor 역참조 */
  const floorById = new Map(project.floors.map((floor) => [floor.id, floor]))
  const connectedMap = toConnectedMap(project.adjacency)
  const { scale, offsetX, offsetY } = computeProjectTransform(project.rooms, options)
  const resolveReferenceBubble = buildReferenceBubbleResolver(options.referenceBubbles)
  const coordinateMmMultiplier = inferCoordinateMmMultiplier(project.rooms)

  const roomsByFloor = new Map<string, FloorRoom[]>()

  project.rooms.forEach((room, index) => {
    const bounds = toBounds(room.polygon)
    if (!bounds) return

    const floorRooms = roomsByFloor.get(room.floor) ?? []
    const polygon = isAxisAlignedRectanglePolygon(room.polygon)
      ? undefined
      : room.polygon.map((point) => toCanvasPoint(point, scale, offsetX, offsetY))
    const contour = mapRoomContourToCanvas(room.contour, scale, offsetX, offsetY)
    const transform = mapRoomTransformToCanvas(room.transform, scale, offsetX, offsetY)
    const roomWidth = (bounds.maxX - bounds.minX) * scale
    const roomHeight = (bounds.maxY - bounds.minY) * scale
    const referenceBubble = resolveReferenceBubble(room, index)
    const roomWidthMm = Math.max(
      readPositiveDimension(referenceBubble?.widthMm) ?? (bounds.maxX - bounds.minX) * coordinateMmMultiplier,
      100,
    )
    const roomHeightMm = Math.max(
      readPositiveDimension(referenceBubble?.heightMm) ?? (bounds.maxY - bounds.minY) * coordinateMmMultiplier,
      100,
    )
    const roomAreaM2 = resolveMappedRoomAreaM2(room, referenceBubble, coordinateMmMultiplier)

    const roomLabel = normalizeIfcDisplayText(referenceBubble?.label ?? room.name)
    const roomType = referenceBubble?.type?.trim() || resolveRoomType(room)

    floorRooms.push({
      id: room.id,
      bubbleId: room.id,
      label: roomLabel,
      type: roomType,
      x: bounds.minX * scale + offsetX,
      y: bounds.minY * scale + offsetY,
      width: clamp(roomWidth, 1, Number.MAX_SAFE_INTEGER),
      height: clamp(roomHeight, 1, Number.MAX_SAFE_INTEGER),
      widthMm: roomWidthMm,
      heightMm: roomHeightMm,
      area: roomAreaM2,
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
        storeyGlobalId: floorId,
        storeyName: floor?.name,
        name: floor?.name ?? `${floorId} 평면도`,
        elevationMm: floor?.elevation,
        ceilingHeightMm: floor?.ceiling_height,
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
      globalId: wall.id,
      storeyGlobalId: wall.floor,
      storeyName: project.floors.find((floor) => floor.id === wall.floor)?.name,
      sourceIfcClass: wall.ifc_class,
      start: { x: wall.start.x * scale + offsetX, y: wall.start.y * scale + offsetY },
      end: { x: wall.end.x * scale + offsetX, y: wall.end.y * scale + offsetY },
      startMm: { ...wall.start },
      endMm: { ...wall.end },
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
  const wallById = new Map((project.walls ?? []).map((wall) => [wall.id, wall]))
  const floorById = new Map(project.floors.map((floor) => [floor.id, floor]))
  return project.openings.map((opening) => {
    const hostWall = wallById.get(opening.wall_id)
    return {
      id: opening.id,
      globalId: opening.id,
      hostWallGlobalId: opening.wall_id,
      storeyGlobalId: opening.floor,
      storeyName: floorById.get(opening.floor)?.name,
      sourceIfcClass: opening.ifc_class,
      type: opening.type,
      wallId: opening.wall_id,
      wallPosition: opening.wall_position,
      centerMm: interpolateMmPoint(hostWall?.start, hostWall?.end, opening.wall_position),
      widthMm: opening.width,
      heightMm: opening.height ?? (opening.type === 'door' ? 2100 : 1200),
      sillHeightMm: opening.sill_height,
      doorHingeSide: opening.type === 'door' ? ('left' as const) : undefined,
      doorSwingDirection: opening.type === 'door' ? ('inward' as const) : undefined,
    }
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
  const coordinateMmMultiplier = inferCoordinateMmMultiplier(project.rooms)

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
    const floorWidthPx = Math.max(((bounds.maxX - bounds.minX) * coordinateMmMultiplier) / FLOOR_MM_PER_PX, 1)
    const floorHeightPx = Math.max(((bounds.maxY - bounds.minY) * coordinateMmMultiplier) / FLOOR_MM_PER_PX, 1)
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

    const widthMm = Math.max((bounds.maxX - bounds.minX) * coordinateMmMultiplier, 600)
    const heightMm = Math.max((bounds.maxY - bounds.minY) * coordinateMmMultiplier, 600)
    const ratio = resolveRoomAreaM2(room, coordinateMmMultiplier)
    const safeRatio = ratio > 0 ? ratio : (widthMm * heightMm) / 1_000_000
    const basePx = calcPxDimensionsFromMm(widthMm, heightMm)
    const px = {
      width: basePx.width * scale,
      height: basePx.height * scale,
    }

    const centerXPx = ((centerX - floorBounds.minX) * coordinateMmMultiplier) / FLOOR_MM_PER_PX
    const centerYPx = ((roomCenterY - floorCenterY) * coordinateMmMultiplier) / FLOOR_MM_PER_PX
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
      label: normalizeIfcDisplayText(room.name),
      type: room.type || '미선택',
      ratio: safeRatio,
      area: `${safeRatio.toFixed(1)} m²`,
      color: room.color ?? '#ffffff',
      material: room.floor_material ?? '콘크리트',
      index: createBubbleIndex(index),
    }
  })
}
