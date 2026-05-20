import type { FloorProject, FloorProjectPoint2D } from '../types/floorProject.types'
import {
  parseStepEntities,
  parseStepEnum,
  parseStepNumber,
  parseStepRef,
  parseStepRefList,
  parseStepString,
  type StepEntity,
} from './ifcStepParser'

interface IfcImportSuccess {
  ok: true
  project: FloorProject
}

interface IfcImportFailure {
  ok: false
  message: string
}

export type IfcToFloorProjectResult = IfcImportSuccess | IfcImportFailure

interface Affine2D {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

const IDENTITY_2D: Affine2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

const mmMultiplierFromPrefix = (prefix: string | null): number => {
  switch ((prefix ?? '').toUpperCase()) {
    case 'MILLI':
      return 1
    case 'CENTI':
      return 10
    case 'DECI':
      return 100
    case 'NONE':
    case '':
      return 1000
    default:
      return 1
  }
}

const multiplyAffine = (parent: Affine2D, local: Affine2D): Affine2D => ({
  a: parent.a * local.a + parent.b * local.c,
  b: parent.a * local.b + parent.b * local.d,
  c: parent.c * local.a + parent.d * local.c,
  d: parent.c * local.b + parent.d * local.d,
  tx: parent.a * local.tx + parent.b * local.ty + parent.tx,
  ty: parent.c * local.tx + parent.d * local.ty + parent.ty,
})

const applyAffine = (matrix: Affine2D, point: FloorProjectPoint2D): FloorProjectPoint2D => ({
  x: matrix.a * point.x + matrix.b * point.y + matrix.tx,
  y: matrix.c * point.x + matrix.d * point.y + matrix.ty,
})

const extractDirection2D = (entity: StepEntity | undefined): { x: number; y: number } => {
  if (!entity || entity.type !== 'IFCDIRECTION' || entity.args.length === 0) return { x: 1, y: 0 }
  const coords = entity.args[0].trim()
  if (!coords.startsWith('(') || !coords.endsWith(')')) return { x: 1, y: 0 }
  const raw = coords.slice(1, -1).split(',').map((value) => parseStepNumber(value.trim()) ?? 0)
  const x = raw[0] ?? 1
  const y = raw[1] ?? 0
  const length = Math.hypot(x, y)
  if (length <= Number.EPSILON) return { x: 1, y: 0 }
  return { x: x / length, y: y / length }
}

const extractCartesianPoint2D = (entity: StepEntity | undefined): FloorProjectPoint2D => {
  if (!entity || entity.type !== 'IFCCARTESIANPOINT' || entity.args.length === 0) return { x: 0, y: 0 }
  const coords = entity.args[0].trim()
  if (!coords.startsWith('(') || !coords.endsWith(')')) return { x: 0, y: 0 }
  const raw = coords.slice(1, -1).split(',').map((value) => parseStepNumber(value.trim()) ?? 0)
  return { x: raw[0] ?? 0, y: raw[1] ?? 0 }
}

const buildPlacementMatrix = (
  placementRef: number | null,
  entities: Map<number, StepEntity>,
  cache: Map<number, Affine2D>,
): Affine2D => {
  if (placementRef === null) return IDENTITY_2D
  const cached = cache.get(placementRef)
  if (cached) return cached

  const placement = entities.get(placementRef)
  if (!placement || placement.type !== 'IFCLOCALPLACEMENT') return IDENTITY_2D

  const parentRef = parseStepRef(placement.args[0] ?? '$')
  const relativeRef = parseStepRef(placement.args[1] ?? '$')
  const parentMatrix = buildPlacementMatrix(parentRef, entities, cache)
  const relative = entities.get(relativeRef ?? -1)

  let local = IDENTITY_2D
  if (relative && (relative.type === 'IFCAXIS2PLACEMENT2D' || relative.type === 'IFCAXIS2PLACEMENT3D')) {
    const locationRef = parseStepRef(relative.args[0] ?? '$')
    const directionRef = parseStepRef(relative.args[relative.type === 'IFCAXIS2PLACEMENT2D' ? 1 : 2] ?? '$')
    const location = extractCartesianPoint2D(entities.get(locationRef ?? -1))
    const dir = extractDirection2D(entities.get(directionRef ?? -1))
    local = {
      a: dir.x,
      b: -dir.y,
      c: dir.y,
      d: dir.x,
      tx: location.x,
      ty: location.y,
    }
  }

  const result = multiplyAffine(parentMatrix, local)
  cache.set(placementRef, result)
  return result
}

const extractProfilePoints = (
  profileRef: number | null,
  entities: Map<number, StepEntity>,
): FloorProjectPoint2D[] => {
  const profile = entities.get(profileRef ?? -1)
  if (!profile) return []

  if (profile.type === 'IFCRECTANGLEPROFILEDEF' || profile.type === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
    const width = parseStepNumber(profile.args[3] ?? '') ?? 0
    const height = parseStepNumber(profile.args[4] ?? '') ?? 0
    if (width <= 0 || height <= 0) return []
    const halfW = width / 2
    const halfH = height / 2
    return [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ]
  }

  if (profile.type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
    const curveRef = parseStepRef(profile.args[2] ?? '$')
    const curve = entities.get(curveRef ?? -1)
    if (!curve) return []
    if (curve.type === 'IFCPOLYLINE') {
      const pointRefs = parseStepRefList(curve.args[0] ?? '')
      const points = pointRefs
        .map((ref) => extractCartesianPoint2D(entities.get(ref)))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      if (points.length >= 3) {
        const first = points[0]
        const last = points[points.length - 1]
        if (first.x === last.x && first.y === last.y) points.pop()
      }
      return points
    }
  }

  return []
}

const extractSpacePolygon = (
  space: StepEntity,
  entities: Map<number, StepEntity>,
  placementCache: Map<number, Affine2D>,
): FloorProjectPoint2D[] => {
  const placementRef = parseStepRef(space.args[5] ?? '$')
  const representationRef = parseStepRef(space.args[6] ?? '$')
  const representation = entities.get(representationRef ?? -1)
  if (!representation || representation.type !== 'IFCPRODUCTDEFINITIONSHAPE') return []

  const shapeRefs = readProductRepresentationRefs(representation)
  for (const shapeRef of shapeRefs) {
    const shape = entities.get(shapeRef)
    if (!shape || shape.type !== 'IFCSHAPEREPRESENTATION') continue
    const itemRefs = parseStepRefList(shape.args[3] ?? '')
    for (const itemRef of itemRefs) {
      const item = entities.get(itemRef)
      if (!item || item.type !== 'IFCEXTRUDEDAREASOLID') continue

      const profileRef = parseStepRef(item.args[0] ?? '$')
      const profilePoints = extractProfilePoints(profileRef, entities)
      if (profilePoints.length < 3) continue

      const profilePlacementRef = parseStepRef(item.args[1] ?? '$')
      const profilePlacement = entities.get(profilePlacementRef ?? -1)
      let profileMatrix = IDENTITY_2D
      if (profilePlacement && (profilePlacement.type === 'IFCAXIS2PLACEMENT3D' || profilePlacement.type === 'IFCAXIS2PLACEMENT2D')) {
        const locationRef = parseStepRef(profilePlacement.args[0] ?? '$')
        const directionRef = parseStepRef(profilePlacement.args[profilePlacement.type === 'IFCAXIS2PLACEMENT2D' ? 1 : 2] ?? '$')
        const location = extractCartesianPoint2D(entities.get(locationRef ?? -1))
        const dir = extractDirection2D(entities.get(directionRef ?? -1))
        profileMatrix = {
          a: dir.x,
          b: -dir.y,
          c: dir.y,
          d: dir.x,
          tx: location.x,
          ty: location.y,
        }
      }

      const objectMatrix = buildPlacementMatrix(placementRef, entities, placementCache)
      const fullMatrix = multiplyAffine(objectMatrix, profileMatrix)
      return profilePoints.map((point) => applyAffine(fullMatrix, point))
    }
  }

  return []
}

const normalizeIfcRoomType = (objectTypeRaw: string | null): string => {
  const value = (objectTypeRaw ?? '').trim().toLowerCase()
  if (!value) return '미선택'
  const token = value.replace(/[\s_-]+/g, '')
  if (token === 'living' || token === 'livingroom' || token === '거실') return '거실'
  if (token === 'bedroom' || token === 'masterbedroom' || token === '침실') return '침실'
  if (token === 'room' || token === 'study' || token === 'studyroom' || token === '방') return '방'
  if (token === 'kitchen' || token === '주방') return '주방'
  if (token === 'bathroom' || token === 'restroom' || token === 'toilet' || token === 'wc' || token === '화장실') return '화장실'
  if (token === 'corridor' || token === 'hall' || token === 'hallway' || token === '복도') return '복도'
  if (token === 'entrance' || token === 'entrancehall' || token === 'entrancestairhall' || token === '현관') return '현관'
  if (token === 'other' || token === 'notdefined' || token === 'undefined' || token === 'unknown' || token === '미선택') return '미선택'
  return '미선택'
}

const resolveSpaceStoreyMap = (entities: Map<number, StepEntity>): Map<number, number> => {
  const mapping = new Map<number, number>()

  for (const entity of entities.values()) {
    if (entity.type === 'IFCRELAGGREGATES') {
      const relating = parseStepRef(entity.args[4] ?? '$')
      const related = parseStepRefList(entity.args[5] ?? '')
      if (relating === null) continue
      const relatingEntity = entities.get(relating)
      if (!relatingEntity || relatingEntity.type !== 'IFCBUILDINGSTOREY') continue
      related.forEach((childRef) => {
        const child = entities.get(childRef)
        if (child && child.type === 'IFCSPACE') mapping.set(childRef, relating)
      })
    }

    if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const related = parseStepRefList(entity.args[4] ?? '')
      const relating = parseStepRef(entity.args[5] ?? '$')
      if (relating === null) continue
      const relatingEntity = entities.get(relating)
      if (!relatingEntity || relatingEntity.type !== 'IFCBUILDINGSTOREY') continue
      related.forEach((childRef) => {
        const child = entities.get(childRef)
        if (child && child.type === 'IFCSPACE') mapping.set(childRef, relating)
      })
    }
  }

  return mapping
}

const roundMm = (value: number): number => Math.round(value * 1000) / 1000

type ImportedRoom = {
  id: string
  name: string
  type: string
  floor: string
  polygon: FloorProjectPoint2D[]
  areaM2?: number
  grossAreaM2?: number
  netAreaM2?: number
  metadata: Record<string, unknown> | null
}

interface ImportedWall {
  entityRef: number
  id: string
  floor: string
  ifc_class: 'IfcWall' | 'IfcWallStandardCase'
  start: FloorProjectPoint2D
  end: FloorProjectPoint2D
  thickness: number | undefined
  height: number | undefined
  metadata: null
}

interface ImportedOpening {
  id: string
  floor: string
  ifc_class: 'IfcDoor' | 'IfcWindow'
  type: 'door' | 'window'
  wall_id: string
  wall_position: number
  width: number
  height: number | undefined
  sill_height: number | undefined
  metadata: null
}

const resolveWallStoreyMap = (entities: Map<number, StepEntity>): Map<number, number> => {
  const mapping = new Map<number, number>()
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue
    const related = parseStepRefList(entity.args[4] ?? '')
    const relating = parseStepRef(entity.args[5] ?? '$')
    if (relating === null) continue
    const relatingEntity = entities.get(relating)
    if (!relatingEntity || relatingEntity.type !== 'IFCBUILDINGSTOREY') continue
    related.forEach((childRef) => {
      const child = entities.get(childRef)
      if (child && (child.type === 'IFCWALL' || child.type === 'IFCWALLSTANDARDCASE')) {
        mapping.set(childRef, relating)
      }
    })
  }
  return mapping
}

const normalizeQuantityName = (value: string | null): string => (value ?? '').replace(/[\s_-]+/g, '').toLowerCase()

const readAreaQuantityM2 = (
  quantityRef: number,
  entities: Map<number, StepEntity>,
  areaMultiplier: number,
): { key: 'areaM2' | 'grossAreaM2' | 'netAreaM2'; value: number } | null => {
  const quantity = entities.get(quantityRef)
  if (!quantity || quantity.type !== 'IFCQUANTITYAREA') return null

  const name = normalizeQuantityName(parseStepString(quantity.args[0] ?? ''))
  const rawArea = parseStepNumber(quantity.args[3] ?? '')
  if (rawArea === null || rawArea <= 0) return null

  const value = rawArea * areaMultiplier
  if (!Number.isFinite(value) || value <= 0) return null

  if (name === 'grossfloorarea' || name === 'grossarea') return { key: 'grossAreaM2', value }
  if (name === 'netfloorarea' || name === 'netarea') return { key: 'netAreaM2', value }
  if (name === 'area' || name === 'floorarea') return { key: 'areaM2', value }
  return null
}

const resolveSpaceAreaMap = (
  entities: Map<number, StepEntity>,
  areaMultiplier: number,
): Map<number, { areaM2?: number; grossAreaM2?: number; netAreaM2?: number }> => {
  const result = new Map<number, { areaM2?: number; grossAreaM2?: number; netAreaM2?: number }>()

  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELDEFINESBYPROPERTIES') continue
    const relatedRefs = parseStepRefList(entity.args[4] ?? '')
    const propertyDefinitionRef = parseStepRef(entity.args[5] ?? '$')
    const propertyDefinition = entities.get(propertyDefinitionRef ?? -1)
    if (!propertyDefinition || propertyDefinition.type !== 'IFCELEMENTQUANTITY') continue

    const quantityRefs = parseStepRefList(propertyDefinition.args[5] ?? propertyDefinition.args[4] ?? '')
    if (quantityRefs.length === 0) continue

    const areaValues: { areaM2?: number; grossAreaM2?: number; netAreaM2?: number } = {}
    quantityRefs.forEach((quantityRef) => {
      const area = readAreaQuantityM2(quantityRef, entities, areaMultiplier)
      if (area) areaValues[area.key] = area.value
    })
    if (!areaValues.areaM2 && !areaValues.grossAreaM2 && !areaValues.netAreaM2) continue

    relatedRefs.forEach((relatedRef) => {
      const related = entities.get(relatedRef)
      if (!related || related.type !== 'IFCSPACE') return
      result.set(relatedRef, { ...result.get(relatedRef), ...areaValues })
    })
  }

  return result
}

interface ShapeRepresentationData {
  identifier: string | null
  representationType: string | null
  items: StepEntity[]
}

const readProductRepresentationRefs = (representation: StepEntity): number[] => {
  const refsFromSecond = parseStepRefList(representation.args[1] ?? '')
  if (refsFromSecond.length > 0) return refsFromSecond
  return parseStepRefList(representation.args[2] ?? '')
}

const readShapeRepresentations = (
  productRepresentationRef: number | null,
  entities: Map<number, StepEntity>,
): ShapeRepresentationData[] => {
  const representation = entities.get(productRepresentationRef ?? -1)
  if (!representation || representation.type !== 'IFCPRODUCTDEFINITIONSHAPE') return []
  const shapeRefs = readProductRepresentationRefs(representation)
  const result: ShapeRepresentationData[] = []
  for (const shapeRef of shapeRefs) {
    const shape = entities.get(shapeRef)
    if (!shape || shape.type !== 'IFCSHAPEREPRESENTATION') continue
    const identifier = parseStepString(shape.args[1] ?? '$')
    const representationType = parseStepString(shape.args[2] ?? '$')
    const itemRefs = parseStepRefList(shape.args[3] ?? '')
    const items: StepEntity[] = []
    itemRefs.forEach((itemRef) => {
      const item = entities.get(itemRef)
      if (item) items.push(item)
    })
    result.push({ identifier, representationType, items })
  }
  return result
}

const extractWallGeometry = (
  wall: StepEntity,
  entities: Map<number, StepEntity>,
  placementCache: Map<number, Affine2D>,
): { start: FloorProjectPoint2D; end: FloorProjectPoint2D; thickness?: number; height?: number } | null => {
  const placementRef = parseStepRef(wall.args[5] ?? '$')
  const representationRef = parseStepRef(wall.args[6] ?? '$')
  const matrix = buildPlacementMatrix(placementRef, entities, placementCache)
  const representations = readShapeRepresentations(representationRef, entities)
  if (representations.length === 0) return null

  let axisStart: FloorProjectPoint2D | null = null
  let axisEnd: FloorProjectPoint2D | null = null
  let bodyStart: FloorProjectPoint2D | null = null
  let bodyEnd: FloorProjectPoint2D | null = null
  let thickness: number | undefined
  let height: number | undefined

  for (const rep of representations) {
    const idLower = (rep.identifier ?? '').toLowerCase()
    const typeLower = (rep.representationType ?? '').toLowerCase()
    const isAxisRep = idLower === 'axis' || typeLower === 'curve2d'

    if (isAxisRep) {
      for (const item of rep.items) {
        if (item.type !== 'IFCPOLYLINE') continue
        const pointRefs = parseStepRefList(item.args[0] ?? '')
        if (pointRefs.length < 2) continue
        const localStart = extractCartesianPoint2D(entities.get(pointRefs[0]))
        const localEnd = extractCartesianPoint2D(entities.get(pointRefs[pointRefs.length - 1]))
        axisStart = applyAffine(matrix, localStart)
        axisEnd = applyAffine(matrix, localEnd)
        break
      }
      continue
    }

    for (const item of rep.items) {
      if (item.type !== 'IFCEXTRUDEDAREASOLID') continue
      const profileRef = parseStepRef(item.args[0] ?? '$')
      const profile = entities.get(profileRef ?? -1)
      const nextHeight = parseStepNumber(item.args[3] ?? '')
      if (nextHeight !== null) height = nextHeight

      if (profile?.type === 'IFCRECTANGLEPROFILEDEF' || profile?.type === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
        const length = parseStepNumber(profile.args[3] ?? '')
        const nextThickness = parseStepNumber(profile.args[4] ?? '')
        if (nextThickness !== null) thickness = nextThickness
        if (length === null) continue
        bodyStart = applyAffine(matrix, { x: -length / 2, y: 0 })
        bodyEnd = applyAffine(matrix, { x: length / 2, y: 0 })
        continue
      }

      if (profile?.type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
        const points = extractProfilePoints(profileRef, entities)
        if (points.length < 2) continue
        const xs = points.map((point) => point.x)
        const ys = points.map((point) => point.y)
        if (xs.length === 0 || ys.length === 0) continue
        if (!xs.every(Number.isFinite) || !ys.every(Number.isFinite)) continue
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        if (![minX, maxX, minY, maxY].every(Number.isFinite)) continue
        const length = maxX - minX
        const nextThickness = maxY - minY
        if (!Number.isFinite(length) || !Number.isFinite(nextThickness)) continue
        if (nextThickness > 0) thickness = nextThickness
        if (length <= 0) continue
        const centerY = (minY + maxY) / 2
        if (!Number.isFinite(centerY)) continue
        bodyStart = applyAffine(matrix, { x: minX, y: centerY })
        bodyEnd = applyAffine(matrix, { x: maxX, y: centerY })
      }
    }
  }

  const start = axisStart ?? bodyStart
  const end = axisEnd ?? bodyEnd
  if (!start || !end) return null
  return { start, end, thickness, height }
}

const clamp01 = (value: number): number => {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const pointDistance = (a: FloorProjectPoint2D, b: FloorProjectPoint2D): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

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
  return clamp01((px * vx + py * vy) / lenSq)
}

const resolveOpeningWallMap = (entities: Map<number, StepEntity>): Map<number, number> => {
  const openingToWall = new Map<number, number>()
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELVOIDSELEMENT') continue
    const wallRef = parseStepRef(entity.args[4] ?? '$')
    const openingRef = parseStepRef(entity.args[5] ?? '$')
    if (wallRef === null || openingRef === null) continue
    const wallEntity = entities.get(wallRef)
    const openingEntity = entities.get(openingRef)
    if (!wallEntity || !openingEntity) continue
    if (!(wallEntity.type === 'IFCWALL' || wallEntity.type === 'IFCWALLSTANDARDCASE')) continue
    if (!(openingEntity.type === 'IFCOPENINGELEMENT' || openingEntity.type === 'IFCOPENINGSTANDARDCASE')) continue
    openingToWall.set(openingRef, wallRef)
  }
  return openingToWall
}

const resolveFillToOpeningMap = (entities: Map<number, StepEntity>): Map<number, number> => {
  const fillToOpening = new Map<number, number>()
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELFILLSELEMENT') continue
    const openingRef = parseStepRef(entity.args[4] ?? '$')
    const fillRef = parseStepRef(entity.args[5] ?? '$')
    if (openingRef === null || fillRef === null) continue
    fillToOpening.set(fillRef, openingRef)
  }
  return fillToOpening
}

const extractProductCenter2D = (
  product: StepEntity,
  entities: Map<number, StepEntity>,
  placementCache: Map<number, Affine2D>,
): FloorProjectPoint2D | null => {
  const placementRef = parseStepRef(product.args[5] ?? '$')
  if (placementRef === null) return null
  const matrix = buildPlacementMatrix(placementRef, entities, placementCache)
  return { x: matrix.tx, y: matrix.ty }
}

/**
 * IFC STEP 텍스트를 BATANG 2D FloorProject 스키마로 변환한다.
 * 층(IfcBuildingStorey), 공간(IfcSpace), 벽(IfcWall), 개구부(IfcDoor/IfcWindow)를
 * 순서대로 추출해 FloorProject 객체로 조합한다.
 * 파싱 실패 시 { ok: false, message } 형태로 반환한다.
 */
export const parseIfcToFloorProject = (
  ifcText: string,
  sourceName = 'import.ifc',
): IfcToFloorProjectResult => {
  const entities = parseStepEntities(ifcText)
  if (entities.size === 0) {
    return { ok: false, message: 'IFC STEP 엔티티를 읽지 못했습니다. 파일 형식을 확인해 주세요.' }
  }

  const schemaMatch = ifcText.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)
  const schema = schemaMatch?.[1] ?? 'UNKNOWN'

  let lengthMultiplier = 1
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCSIUNIT') continue
    const unitType = parseStepEnum(entity.args[0] ?? '')
    const prefix = parseStepEnum(entity.args[1] ?? '')
    const name = parseStepEnum(entity.args[2] ?? '')
    if (unitType === 'LENGTHUNIT' && name === 'METRE') {
      lengthMultiplier = mmMultiplierFromPrefix(prefix)
      break
    }
  }

  const storeys = Array.from(entities.values()).filter((entity) => entity.type === 'IFCBUILDINGSTOREY')
  if (storeys.length === 0) {
    return { ok: false, message: 'IfcBuildingStorey를 찾지 못했습니다.' }
  }

  const floors = storeys
    .map((storey) => {
      const globalId = parseStepString(storey.args[0] ?? '')
      if (!globalId) return null
      const name = parseStepString(storey.args[2] ?? '') ?? globalId
      let elevation = 0
      for (let i = storey.args.length - 1; i >= 0; i -= 1) {
        const numeric = parseStepNumber(storey.args[i])
        if (numeric !== null) {
          elevation = numeric * lengthMultiplier
          break
        }
      }
      return {
        id: globalId,
        name,
        elevation,
      }
    })
    .filter((item): item is { id: string; name: string; elevation: number } => item !== null)
    .sort((a, b) => a.elevation - b.elevation)
    .map((item, index) => ({
      id: item.id,
      number: index + 1,
      name: item.name || `${index + 1}F`,
      elevation: roundMm(item.elevation),
      ceiling_height: 2700,
      metadata: null,
    }))

  if (floors.length === 0) {
    return { ok: false, message: '유효한 층(GlobalId)을 찾지 못했습니다.' }
  }

  const spaceStoreyMap = resolveSpaceStoreyMap(entities)
  const spaceAreaMap = resolveSpaceAreaMap(entities, (lengthMultiplier * lengthMultiplier) / 1_000_000)
  const placementCache = new Map<number, Affine2D>()
  const spaces = Array.from(entities.values()).filter((entity) => entity.type === 'IFCSPACE')

  const rooms: FloorProject['rooms'] = spaces
    .map((space) => {
      const globalId = parseStepString(space.args[0] ?? '')
      if (!globalId) return null
      const spaceEntityRef = space.id
      const storeyEntityRef = spaceStoreyMap.get(spaceEntityRef)
      if (!storeyEntityRef) return null
      const storeyEntity = entities.get(storeyEntityRef)
      if (!storeyEntity) return null
      const floorId = parseStepString(storeyEntity.args[0] ?? '')
      if (!floorId) return null

      const name = parseStepString(space.args[2] ?? '') ?? globalId
      const objectType = parseStepString(space.args[4] ?? '$')
      const areaValues = spaceAreaMap.get(spaceEntityRef)
      const polygon = extractSpacePolygon(space, entities, placementCache)
        .map((point) => ({
          x: roundMm(point.x * lengthMultiplier),
          y: roundMm(point.y * lengthMultiplier),
        }))

      if (polygon.length < 3) return null

      return {
        id: globalId,
        name,
        type: normalizeIfcRoomType(objectType),
        floor: floorId,
        polygon,
        ...(areaValues?.areaM2 ? { areaM2: areaValues.areaM2 } : {}),
        ...(areaValues?.grossAreaM2 ? { grossAreaM2: areaValues.grossAreaM2 } : {}),
        ...(areaValues?.netAreaM2 ? { netAreaM2: areaValues.netAreaM2 } : {}),
        metadata: areaValues ? { ...areaValues } : null,
      }
    })
    .filter((room): room is ImportedRoom => room !== null)

  const wallStoreyMap = resolveWallStoreyMap(entities)
  const extractedWalls: ImportedWall[] = Array.from(entities.values())
    .filter((entity) => entity.type === 'IFCWALL' || entity.type === 'IFCWALLSTANDARDCASE')
    .map((entity) => {
      const globalId = parseStepString(entity.args[0] ?? '')
      if (!globalId) return null
      const storeyEntityRef = wallStoreyMap.get(entity.id)
      if (!storeyEntityRef) return null
      const storeyEntity = entities.get(storeyEntityRef)
      const floorId = storeyEntity ? parseStepString(storeyEntity.args[0] ?? '') : null
      if (!floorId) return null

      const geometry = extractWallGeometry(entity, entities, placementCache)
      if (!geometry) return null

      const rawStart = {
        x: roundMm(geometry.start.x * lengthMultiplier),
        y: roundMm(geometry.start.y * lengthMultiplier),
      }
      const rawEnd = {
        x: roundMm(geometry.end.x * lengthMultiplier),
        y: roundMm(geometry.end.y * lengthMultiplier),
      }

      const start =
        rawStart.x < rawEnd.x || (rawStart.x === rawEnd.x && rawStart.y <= rawEnd.y)
          ? rawStart
          : rawEnd
      const end = start === rawStart ? rawEnd : rawStart

      return {
        entityRef: entity.id,
        id: globalId,
        floor: floorId,
        ifc_class: entity.type === 'IFCWALLSTANDARDCASE' ? 'IfcWallStandardCase' : 'IfcWall',
        start,
        end,
        thickness: geometry.thickness !== undefined ? roundMm(geometry.thickness * lengthMultiplier) : undefined,
        height: geometry.height !== undefined ? roundMm(geometry.height * lengthMultiplier) : undefined,
        metadata: null,
      } satisfies ImportedWall
    })
    .filter((wall): wall is ImportedWall => wall !== null)

  if (rooms.length === 0 && extractedWalls.length === 0) {
    return {
      ok: false,
      message: 'IfcSpace/IfcWall 형상을 해석하지 못했습니다. 현재 지원되지 않는 IFC 형상일 수 있습니다.',
    }
  }

  const wallByEntityRef = new Map<number, ImportedWall>(
    extractedWalls.map((wall) => [wall.entityRef, wall] as const),
  )

  const fillToOpeningMap = resolveFillToOpeningMap(entities)
  const openingToWallMap = resolveOpeningWallMap(entities)
  const openings: ImportedOpening[] = Array.from(entities.values())
    .filter((entity) => entity.type === 'IFCDOOR' || entity.type === 'IFCWINDOW')
    .map((entity): ImportedOpening | null => {
      const globalId = parseStepString(entity.args[0] ?? '')
      if (!globalId) return null

      const openingRef = fillToOpeningMap.get(entity.id)
      if (openingRef === undefined) return null
      const wallRef = openingToWallMap.get(openingRef)
      if (wallRef === undefined) return null
      const wall = wallByEntityRef.get(wallRef)
      if (!wall) return null

      const openingEntity = entities.get(openingRef)
      const openingCenterLocal =
        openingEntity ? extractProductCenter2D(openingEntity, entities, placementCache) : null
      const fillCenterLocal = extractProductCenter2D(entity, entities, placementCache)
      const center = openingCenterLocal ?? fillCenterLocal
      if (!center) return null

      const centerMm = {
        x: center.x * lengthMultiplier,
        y: center.y * lengthMultiplier,
      }
      const wallPosition = computeWallPositionRatio(wall.start, wall.end, centerMm)

      const ifcClass = entity.type === 'IFCDOOR' ? 'IfcDoor' : 'IfcWindow'
      const openingType: 'door' | 'window' = entity.type === 'IFCDOOR' ? 'door' : 'window'

      const overallHeight = parseStepNumber(entity.args[8] ?? '$')
      const overallWidth = parseStepNumber(entity.args[9] ?? '$')

      const wallLength = pointDistance(wall.start, wall.end)
      const fallbackWidth = openingType === 'door' ? 900 : 1200
      const width = overallWidth !== null
        ? roundMm(overallWidth * lengthMultiplier)
        : roundMm(Math.min(fallbackWidth, wallLength))
      const height = overallHeight !== null
        ? roundMm(overallHeight * lengthMultiplier)
        : openingType === 'door'
          ? 2100
          : 1200

      return {
        id: globalId,
        floor: wall.floor,
        ifc_class: ifcClass,
        type: openingType,
        wall_id: wall.id,
        wall_position: roundMm(wallPosition),
        width: Math.max(1, width),
        height: Math.max(1, height),
        sill_height: openingType === 'window' ? 900 : undefined,
        metadata: null,
      }
    })
    .filter((opening): opening is ImportedOpening => opening !== null)

  const walls: FloorProject['walls'] = extractedWalls.map((wall) => ({
    id: wall.id,
    floor: wall.floor,
    ifc_class: wall.ifc_class,
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness,
    height: wall.height,
    metadata: wall.metadata,
  }))

  const now = new Date().toISOString()
  const project: FloorProject = {
    id: `ifc-${Date.now()}`,
    name: sourceName.replace(/\.ifc$/i, '') || 'IFC Import',
    created_at: now,
    updated_at: now,
    unit: 'mm',
    metadata: { source_ifc: sourceName, schema },
    floors,
    rooms,
    adjacency: [],
    walls,
    openings,
  }

  return { ok: true, project }
}
