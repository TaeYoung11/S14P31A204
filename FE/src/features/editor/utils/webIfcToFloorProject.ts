import type { FloorProject, FloorProjectPoint2D } from '../types/floorProject.types'

interface IfcImportSuccess {
  ok: true
  project: FloorProject
}

interface IfcImportFailure {
  ok: false
  message: string
}

export type WebIfcToFloorProjectResult = IfcImportSuccess | IfcImportFailure

interface IfcVectorLike<T> {
  size: () => number
  get: (index: number) => T
}

interface IfcGeometryLike {
  GetVertexData: () => number
  GetVertexDataSize: () => number
  delete?: () => void
}

interface FlatGeometryLike {
  geometryExpressID: number
  flatTransformation?: number[]
}

interface FlatMeshLike {
  geometries: IfcVectorLike<FlatGeometryLike>
  delete?: () => void
}

export interface WebIfcApiForFloorProject {
  GetTypeCodeFromName: (typeName: string) => number
  GetNameFromTypeCode?: (typeCode: number) => string
  GetLineIDsWithType: (modelID: number, type: number, includeInherited?: boolean) => IfcVectorLike<number>
  GetLine: (modelID: number, expressID: number, flatten?: boolean, inverse?: boolean, inversePropKey?: string | null) => unknown
  GetFlatMesh?: (modelID: number, expressID: number) => FlatMeshLike
  GetGeometry?: (modelID: number, geometryExpressID: number) => IfcGeometryLike
  GetVertexArray?: (ptr: number, size: number) => Float32Array
}

interface ParseWebIfcInput {
  ifcApi: WebIfcApiForFloorProject
  modelId: number
  sourceName: string
}

interface Aabb3D {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

const mmMultiplierFromPrefix = (prefix: string | null): number => {
  switch ((prefix ?? '').toUpperCase()) {
    case 'MILLI':
      return 1
    case 'CENTI':
      return 10
    case 'DECI':
      return 100
    case '':
    case 'NONE':
      return 1000
    default:
      return 1
  }
}

const roundMm = (value: number): number => Math.round(value * 1000) / 1000

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeEnumToken = (value: string): string =>
  value.trim().replace(/^\./, '').replace(/\.$/, '').toUpperCase()

const readString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (isObjectRecord(value) && 'value' in value) {
    return readString(value.value)
  }
  return null
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (isObjectRecord(value) && 'value' in value) {
    return readNumber(value.value)
  }
  return null
}

const readEnum = (value: unknown): string | null => {
  const raw = readString(value)
  return raw ? normalizeEnumToken(raw) : null
}

const readRef = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!isObjectRecord(value)) return null

  if ('value' in value) {
    const nested = readRef(value.value)
    if (nested !== null) return nested
  }
  if ('expressID' in value && typeof value.expressID === 'number' && Number.isFinite(value.expressID)) {
    return value.expressID
  }
  if ('id' in value && typeof value.id === 'number' && Number.isFinite(value.id)) {
    return value.id
  }
  return null
}

const readRefList = (value: unknown): number[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => readRef(item)).filter((item): item is number => item !== null)
  }
  if (isObjectRecord(value) && typeof value.size === 'function' && typeof value.get === 'function') {
    const vector = value as unknown as IfcVectorLike<unknown>
    const result: number[] = []
    for (let i = 0; i < vector.size(); i += 1) {
      const ref = readRef(vector.get(i))
      if (ref !== null) result.push(ref)
    }
    return result
  }
  if (isObjectRecord(value) && 'value' in value) {
    return readRefList(value.value)
  }
  return []
}

const multiplyMat4Vec3 = (m: number[], x: number, y: number, z: number): [number, number, number] => ([
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
])

const toIdentityMat4 = (): number[] => ([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
])

const computeConvexHull2D = (points: FloorProjectPoint2D[]): FloorProjectPoint2D[] => {
  if (points.length <= 3) return points

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (o: FloorProjectPoint2D, a: FloorProjectPoint2D, b: FloorProjectPoint2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: FloorProjectPoint2D[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }

  const upper: FloorProjectPoint2D[] = []
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

const computeWallPositionRatio = (
  wallStart: FloorProjectPoint2D,
  wallEnd: FloorProjectPoint2D,
  point: FloorProjectPoint2D,
): number => {
  const vx = wallEnd.x - wallStart.x
  const vy = wallEnd.y - wallStart.y
  const lenSq = vx * vx + vy * vy
  if (lenSq <= Number.EPSILON) return 0.5
  const px = point.x - wallStart.x
  const py = point.y - wallStart.y
  const ratio = (px * vx + py * vy) / lenSq
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}

function buildElementAabb(
  ifcApi: WebIfcApiForFloorProject,
  modelId: number,
  expressId: number,
): Aabb3D | null {
  if (!ifcApi.GetFlatMesh || !ifcApi.GetGeometry || !ifcApi.GetVertexArray) return null

  let flatMesh: FlatMeshLike | null = null
  try {
    flatMesh = ifcApi.GetFlatMesh(modelId, expressId)
    if (!flatMesh || !flatMesh.geometries) return null

    let hasPoint = false
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY

    for (let i = 0; i < flatMesh.geometries.size(); i += 1) {
      const placed = flatMesh.geometries.get(i)
      const transform = Array.isArray(placed.flatTransformation) && placed.flatTransformation.length === 16
        ? placed.flatTransformation
        : toIdentityMat4()
      const geometry = ifcApi.GetGeometry(modelId, placed.geometryExpressID)
      try {
        const vertices = ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
        const stride = vertices.length % 6 === 0 ? 6 : 3
        for (let cursor = 0; cursor + 2 < vertices.length; cursor += stride) {
          const x = vertices[cursor]
          const y = vertices[cursor + 1]
          const z = vertices[cursor + 2]
          const [tx, ty, tz] = multiplyMat4Vec3(transform, x, y, z)
          if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) continue
          hasPoint = true
          minX = Math.min(minX, tx)
          minY = Math.min(minY, ty)
          minZ = Math.min(minZ, tz)
          maxX = Math.max(maxX, tx)
          maxY = Math.max(maxY, ty)
          maxZ = Math.max(maxZ, tz)
        }
      } finally {
        geometry.delete?.()
      }
    }

    if (!hasPoint) return null
    return { minX, maxX, minY, maxY, minZ, maxZ }
  } catch {
    return null
  } finally {
    flatMesh?.delete?.()
  }
}

function toRoomPolygonFromAabb(aabb: Aabb3D, lengthMultiplier: number): FloorProjectPoint2D[] {
  return [
    { x: roundMm(aabb.minX * lengthMultiplier), y: roundMm(aabb.minY * lengthMultiplier) },
    { x: roundMm(aabb.maxX * lengthMultiplier), y: roundMm(aabb.minY * lengthMultiplier) },
    { x: roundMm(aabb.maxX * lengthMultiplier), y: roundMm(aabb.maxY * lengthMultiplier) },
    { x: roundMm(aabb.minX * lengthMultiplier), y: roundMm(aabb.maxY * lengthMultiplier) },
  ]
}

function toWallFromAabb(aabb: Aabb3D, lengthMultiplier: number) {
  const width = (aabb.maxX - aabb.minX) * lengthMultiplier
  const height = (aabb.maxY - aabb.minY) * lengthMultiplier
  const zHeight = (aabb.maxZ - aabb.minZ) * lengthMultiplier
  const cx = (aabb.maxX + aabb.minX) / 2
  const cy = (aabb.maxY + aabb.minY) / 2

  if (Math.abs(width) >= Math.abs(height)) {
    return {
      start: { x: roundMm(aabb.minX * lengthMultiplier), y: roundMm(cy * lengthMultiplier) },
      end: { x: roundMm(aabb.maxX * lengthMultiplier), y: roundMm(cy * lengthMultiplier) },
      thickness: roundMm(Math.abs(height)),
      height: roundMm(Math.abs(zHeight)),
    }
  }
  return {
    start: { x: roundMm(cx * lengthMultiplier), y: roundMm(aabb.minY * lengthMultiplier) },
    end: { x: roundMm(cx * lengthMultiplier), y: roundMm(aabb.maxY * lengthMultiplier) },
    thickness: roundMm(Math.abs(width)),
    height: roundMm(Math.abs(zHeight)),
  }
}

const normalizeIfcRoomType = (objectTypeRaw: string | null): string => {
  const value = (objectTypeRaw ?? '').trim().toLowerCase()
  if (!value) return 'other'
  const token = value.replace(/[\s_-]+/g, '')
  if (token === 'living') return 'living'
  if (token === 'bedroom') return 'bedroom'
  if (token === 'kitchen') return 'kitchen'
  if (token === 'bathroom') return 'bathroom'
  if (token === 'office') return 'office'
  if (token === 'corridor') return 'corridor'
  return 'other'
}

const getTypeCodeOrNull = (ifcApi: WebIfcApiForFloorProject, typeName: string): number | null => {
  try {
    const code = ifcApi.GetTypeCodeFromName(typeName)
    return Number.isFinite(code) ? code : null
  } catch {
    return null
  }
}

const getLinesByType = (
  ifcApi: WebIfcApiForFloorProject,
  modelId: number,
  typeName: string,
  includeInherited = false,
): Array<{ expressId: number; line: Record<string, unknown> }> => {
  const typeCode = getTypeCodeOrNull(ifcApi, typeName)
  if (typeCode === null) return []

  let ids: IfcVectorLike<number>
  try {
    ids = ifcApi.GetLineIDsWithType(modelId, typeCode, includeInherited)
  } catch {
    return []
  }

  const result: Array<{ expressId: number; line: Record<string, unknown> }> = []
  for (let i = 0; i < ids.size(); i += 1) {
    const expressId = ids.get(i)
    const rawLine = ifcApi.GetLine(modelId, expressId, false, false, null)
    if (!isObjectRecord(rawLine)) continue
    result.push({ expressId, line: rawLine })
  }
  return result
}

export function parseWebIfcToFloorProject({
  ifcApi,
  modelId,
  sourceName,
}: ParseWebIfcInput): WebIfcToFloorProjectResult {
  const now = new Date().toISOString()

  const siUnits = getLinesByType(ifcApi, modelId, 'IFCSIUNIT')
  let lengthMultiplier = 1
  for (const { line } of siUnits) {
    const unitType = readEnum(line.UnitType)
    const unitName = readEnum(line.Name)
    if (unitType === 'LENGTHUNIT' && unitName === 'METRE') {
      lengthMultiplier = mmMultiplierFromPrefix(readEnum(line.Prefix))
      break
    }
  }

  const storeyLines = getLinesByType(ifcApi, modelId, 'IFCBUILDINGSTOREY')
  if (storeyLines.length === 0) {
    return { ok: false, message: 'IfcBuildingStorey를 찾지 못했습니다.' }
  }

  const floors = storeyLines
    .map(({ expressId, line }) => {
      const id = readString(line.GlobalId) ?? `storey-${expressId}`
      const name = readString(line.Name) ?? id
      const elevation = readNumber(line.Elevation) ?? 0
      return {
        expressId,
        id,
        name,
        elevationMm: roundMm(elevation * lengthMultiplier),
      }
    })
    .sort((a, b) => a.elevationMm - b.elevationMm)
    .map((item, index) => ({
      id: item.id,
      number: index + 1,
      name: item.name,
      elevation: item.elevationMm,
      ceiling_height: 2700,
      metadata: null,
    }))

  const floorIdByStoreyExpressId = new Map<number, string>()
  storeyLines.forEach(({ expressId, line }) => {
    floorIdByStoreyExpressId.set(expressId, readString(line.GlobalId) ?? `storey-${expressId}`)
  })
  const defaultFloorId = floors[0]?.id ?? 'floor-1'

  const spaceToFloorId = new Map<number, string>()
  const wallToFloorId = new Map<number, string>()

  const relAggregates = getLinesByType(ifcApi, modelId, 'IFCRELAGGREGATES')
  for (const { line } of relAggregates) {
    const relatingRef = readRef(line.RelatingObject)
    if (relatingRef === null) continue
    const floorId = floorIdByStoreyExpressId.get(relatingRef)
    if (!floorId) continue
    readRefList(line.RelatedObjects).forEach((ref) => {
      spaceToFloorId.set(ref, floorId)
    })
  }

  const relContained = getLinesByType(ifcApi, modelId, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')
  for (const { line } of relContained) {
    const relatingRef = readRef(line.RelatingStructure)
    if (relatingRef === null) continue
    const floorId = floorIdByStoreyExpressId.get(relatingRef)
    if (!floorId) continue
    readRefList(line.RelatedElements).forEach((ref) => {
      const relatedTypeName = ifcApi.GetNameFromTypeCode?.(ifcApi.GetTypeCodeFromName('IFCSPACE')) ?? 'IFCSPACE'
      const related = ifcApi.GetLine(modelId, ref, false, false, null)
      if (!isObjectRecord(related) || typeof related.type !== 'number') return
      const typeName = ifcApi.GetNameFromTypeCode?.(related.type) ?? relatedTypeName
      if (typeName === 'IFCSPACE') spaceToFloorId.set(ref, floorId)
      if (typeName === 'IFCWALL' || typeName === 'IFCWALLSTANDARDCASE') wallToFloorId.set(ref, floorId)
    })
  }

  const spaceLines = getLinesByType(ifcApi, modelId, 'IFCSPACE')
  const rooms: FloorProject['rooms'] = []
  for (const { expressId, line } of spaceLines) {
    const roomId = readString(line.GlobalId) ?? `space-${expressId}`
    const floorId = spaceToFloorId.get(expressId) ?? defaultFloorId
    const aabb = buildElementAabb(ifcApi, modelId, expressId)
    if (!aabb) continue
    const roughPolygon = toRoomPolygonFromAabb(aabb, lengthMultiplier)
    const polygon = computeConvexHull2D(roughPolygon)
    if (polygon.length < 3) continue
    rooms.push({
      id: roomId,
      name: readString(line.Name) ?? roomId,
      type: normalizeIfcRoomType(readString(line.ObjectType)),
      floor: floorId,
      polygon,
      metadata: null,
    })
  }

  const wallLines = getLinesByType(ifcApi, modelId, 'IFCWALL', true)
  const walls: FloorProject['walls'] = []
  const wallByExpressId = new Map<number, { id: string; floor: string; start: FloorProjectPoint2D; end: FloorProjectPoint2D }>()
  for (const { expressId, line } of wallLines) {
    const aabb = buildElementAabb(ifcApi, modelId, expressId)
    if (!aabb) continue
    const derived = toWallFromAabb(aabb, lengthMultiplier)
    const wallId = readString(line.GlobalId) ?? `wall-${expressId}`
    const floorId = wallToFloorId.get(expressId) ?? defaultFloorId
    walls.push({
      id: wallId,
      floor: floorId,
      ifc_class: 'IfcWall',
      start: derived.start,
      end: derived.end,
      thickness: derived.thickness > 0 ? derived.thickness : undefined,
      height: derived.height > 0 ? derived.height : undefined,
      metadata: null,
    })
    wallByExpressId.set(expressId, { id: wallId, floor: floorId, start: derived.start, end: derived.end })
  }

  const openingToWallRef = new Map<number, number>()
  const relVoids = getLinesByType(ifcApi, modelId, 'IFCRELVOIDSELEMENT')
  for (const { line } of relVoids) {
    const wallRef = readRef(line.RelatingBuildingElement)
    const openingRef = readRef(line.RelatedOpeningElement)
    if (wallRef === null || openingRef === null) continue
    openingToWallRef.set(openingRef, wallRef)
  }

  const fillToOpeningRef = new Map<number, number>()
  const relFills = getLinesByType(ifcApi, modelId, 'IFCRELFILLSELEMENT')
  for (const { line } of relFills) {
    const openingRef = readRef(line.RelatingOpeningElement)
    const fillRef = readRef(line.RelatedBuildingElement)
    if (openingRef === null || fillRef === null) continue
    fillToOpeningRef.set(fillRef, openingRef)
  }

  const doorLines = getLinesByType(ifcApi, modelId, 'IFCDOOR', true)
  const windowLines = getLinesByType(ifcApi, modelId, 'IFCWINDOW', true)
  const openings: FloorProject['openings'] = []

  const appendOpening = (
    entry: { expressId: number; line: Record<string, unknown> },
    openingType: 'door' | 'window',
    ifcClass: 'IfcDoor' | 'IfcWindow',
  ) => {
    const openingRef = fillToOpeningRef.get(entry.expressId)
    if (openingRef === undefined) return
    const wallRef = openingToWallRef.get(openingRef)
    if (wallRef === undefined) return
    const wall = wallByExpressId.get(wallRef)
    if (!wall) return

    const aabb = buildElementAabb(ifcApi, modelId, entry.expressId)
    if (!aabb) return
    const center = {
      x: roundMm(((aabb.minX + aabb.maxX) / 2) * lengthMultiplier),
      y: roundMm(((aabb.minY + aabb.maxY) / 2) * lengthMultiplier),
    }
    const width = roundMm(Math.max((aabb.maxX - aabb.minX) * lengthMultiplier, (aabb.maxY - aabb.minY) * lengthMultiplier))
    const height = roundMm((aabb.maxZ - aabb.minZ) * lengthMultiplier)

    openings.push({
      id: readString(entry.line.GlobalId) ?? `${openingType}-${entry.expressId}`,
      floor: wall.floor,
      ifc_class: ifcClass,
      type: openingType,
      wall_id: wall.id,
      wall_position: roundMm(computeWallPositionRatio(wall.start, wall.end, center)),
      width: Math.max(1, width),
      height: height > 0 ? height : undefined,
      sill_height: openingType === 'window' ? 900 : undefined,
      metadata: null,
    })
  }

  doorLines.forEach((entry) => appendOpening(entry, 'door', 'IfcDoor'))
  windowLines.forEach((entry) => appendOpening(entry, 'window', 'IfcWindow'))

  if (rooms.length === 0 && walls.length === 0) {
    return {
      ok: false,
      message: 'web-ifc에서 공간/벽 형상을 추출하지 못했습니다.',
    }
  }

  return {
    ok: true,
    project: {
      id: `ifc-${Date.now()}`,
      name: sourceName.replace(/\.ifc$/i, '') || 'IFC Import',
      created_at: now,
      updated_at: now,
      unit: 'mm',
      metadata: {
        source_ifc: sourceName,
        extractor: 'web-ifc-direct',
      },
      floors,
      rooms,
      adjacency: [],
      walls,
      openings,
    },
  }
}
