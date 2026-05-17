import type { Object3D } from 'three'
import type { IfcElementInfo } from '@/features/editor/types'
import { decodeIfcStepString } from '@/features/editor/utils/ifcStepString'
import {
  DEFAULT_IFC_COLOR_BY_CATEGORY,
  getMaterialDefaultColor,
  isEditorMaterial,
  normalizeMaterialNameForEditor,
} from './ifcMaterials'

export type FragmentDataRecord = Record<string, unknown>
type FragmentDataValue = { value?: unknown; type?: unknown } | FragmentDataRecord[] | unknown
export type IfcElementMetrics = Pick<IfcElementInfo, 'lengthMm' | 'heightMm' | 'thicknessMm' | 'material' | 'color'>
export type ParsedIfcElementInfo = IfcElementMetrics & Pick<IfcElementInfo, 'name' | 'ifcClass' | 'category' | 'globalId'> & {
  expressId: number
}
export type IfcPsetMetricMaps = {
  byId: Record<number, ParsedIfcElementInfo>
  byName: Record<string, ParsedIfcElementInfo>
}

export const IFC_CATEGORY_LABELS: Array<[string, string]> = [
  ['IfcRoof', 'Roof'],
  ['IfcSlab', 'Slab'],
  ['IfcWall', 'Wall'],
  ['IfcWallStandardCase', 'Wall'],
  ['IfcWindow', 'Window'],
  ['IfcDoor', 'Door'],
  ['IfcStair', 'Stair'],
  ['IfcColumn', 'Column'],
  ['IfcBeam', 'Beam'],
  ['IfcSpace', 'Space'],
]

const pickRecordValue = (
  record: Record<string, unknown>,
  keys: string[],
): string | number | boolean | undefined => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  }
  return undefined
}

const decodeIfcValue = (value: string | number | boolean): string | number | boolean =>
  typeof value === 'string' ? decodeIfcStepString(value) : value

export const normalizeIfcElement = (object: Object3D, fallbackPrefix = 'ifc-element'): IfcElementInfo => {
  const node = object as Object3D & {
    uuid?: string
    type?: string
    userData?: Record<string, unknown>
    parent?: Object3D | null
  }
  const userData = node.userData ?? {}
  const lineage: string[] = []
  let cursor: typeof node | null | undefined = node
  while (cursor && lineage.length < 8) {
    if (cursor.name) lineage.push(cursor.name)
    cursor = (cursor.parent ?? null) as typeof node | null
  }

  const searchable = [
    ...lineage,
    node.type,
    pickRecordValue(userData, ['ifcClass', 'type', 'category', 'Entity', 'class']),
  ].filter(Boolean).join(' ')
  const matchedClass = IFC_CATEGORY_LABELS.find(([ifcClass]) => searchable.includes(ifcClass))
  const ifcClass = matchedClass?.[0] ?? String(pickRecordValue(userData, ['ifcClass', 'type', 'category']) ?? node.type ?? 'IfcElement')
  const category = matchedClass?.[1] ?? (ifcClass.replace(/^Ifc/, '') || 'Element')
  const rawExpressId = pickRecordValue(userData, ['expressID', 'expressId', 'ExpressID', 'id'])
  const expressId = typeof rawExpressId === 'boolean' ? undefined : rawExpressId
  const rawGlobalId = pickRecordValue(userData, ['GlobalId', 'globalId', 'global_id', 'guid'])
  const globalId = typeof rawGlobalId === 'string' && rawGlobalId.trim().length > 0 ? rawGlobalId.trim() : undefined
  const decodedName = decodeIfcStepString(String(pickRecordValue(userData, ['Name', 'name', 'LongName']) ?? lineage[0] ?? category)).trim()
  const name = decodedName || category || 'Element'
  const id = String(expressId ?? node.uuid ?? `${fallbackPrefix}-${name}`)
  const properties: IfcElementInfo['properties'] = {
    Category: category,
    Class: ifcClass,
  }
  if (expressId !== undefined) properties.ExpressID = expressId
  if (globalId) properties.GlobalId = globalId
  if (node.uuid) properties.UUID = node.uuid
  if (node.type) properties.ObjectType = node.type
  if (lineage.length > 0) properties.Hierarchy = decodeIfcStepString(lineage.join(' / '))

  return {
    id,
    name,
    ifcClass,
    category,
    source: 'ifc',
    expressId,
    globalId,
    properties,
  }
}

const stringifyFragmentValue = (value: unknown): string | number | boolean | undefined => {
  if (typeof value === 'string') return decodeIfcStepString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object' && 'value' in value) return stringifyFragmentValue((value as { value?: unknown }).value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const flattenFragmentData = (
  data: FragmentDataRecord,
  prefix = '',
  output: IfcElementInfo['properties'] = {},
  depth = 0,
) => {
  if (depth > 2 || Object.keys(output).length >= 80) return output

  Object.entries(data).forEach(([key, rawValue]) => {
    if (Object.keys(output).length >= 80) return
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(rawValue)) {
      rawValue.forEach((child, index) => {
        if (index >= 10 || Object.keys(output).length >= 80) return
        if (child && typeof child === 'object') {
          flattenFragmentData(child as FragmentDataRecord, `${nextKey}[${index}]`, output, depth + 1)
        }
      })
      if (rawValue.length === 0) output[nextKey] = '0 items'
      if (rawValue.length > 10) output[`${nextKey}.more`] = `${rawValue.length - 10} more items`
      return
    }

    const value = stringifyFragmentValue(rawValue as FragmentDataValue)
    if (value !== undefined) output[nextKey] = value
  })

  return output
}

const getFragmentAttribute = (
  data: FragmentDataRecord,
  keys: string[],
): string | number | boolean | undefined => {
  for (const key of keys) {
    const value = stringifyFragmentValue(data[key])
    if (value !== undefined) return value
  }
  return undefined
}

const normalizeDimensionToMm = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value < 100 ? value * 1000 : value)
}

const getFirstNumericProperty = (
  properties: IfcElementInfo['properties'],
  patterns: RegExp[],
) => {
  const match = Object.entries(properties).find(([key, value]) => (
    typeof value === 'number' &&
    patterns.some((pattern) => pattern.test(key))
  ))

  return match ? normalizeDimensionToMm(match[1] as number) : undefined
}

const getFirstStringProperty = (
  properties: IfcElementInfo['properties'],
  patterns: RegExp[],
) => {
  const match = Object.entries(properties).find(([key, value]) => (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length < 80 &&
    patterns.some((pattern) => pattern.test(key))
  ))

  return match ? String(match[1]) : undefined
}

const getIfcElementMetrics = (
  properties: IfcElementInfo['properties'],
  category: string,
) => {
  const lengthMm = getFirstNumericProperty(properties, [
    /(^|\.)(length|depth|longlength|grosslength|netlength)(\.|$)/i,
    /qto.*length/i,
  ])
  const heightMm = getFirstNumericProperty(properties, [
    /(^|\.)(height|overallheight|grossheight|netheight)(\.|$)/i,
    /qto.*height/i,
  ])
  const thicknessMm = getFirstNumericProperty(properties, [
    /(^|\.)(thickness|nominalwidth|width|overallwidth)(\.|$)/i,
    /qto.*(thickness|width)/i,
  ])
  const material = getFirstStringProperty(properties, [
    /material.*name/i,
    /material/i,
  ])
  const color = getFirstStringProperty(properties, [
    /color/i,
    /colour/i,
  ]) ?? DEFAULT_IFC_COLOR_BY_CATEGORY[category] ?? DEFAULT_IFC_COLOR_BY_CATEGORY.Element

  return {
    lengthMm,
    heightMm,
    thicknessMm,
    material,
    color,
  }
}

const getNormalizedIfcMaterialMetrics = (metrics: IfcElementMetrics, category: string) => {
  const material = normalizeMaterialNameForEditor(metrics.material)
  const categoryColor = DEFAULT_IFC_COLOR_BY_CATEGORY[category] ?? DEFAULT_IFC_COLOR_BY_CATEGORY.Element
  const hasNormalizedEditorMaterial = isEditorMaterial(material)
  const materialWasNormalized = Boolean(material && metrics.material?.trim() !== material)
  const color = hasNormalizedEditorMaterial && (!metrics.color || materialWasNormalized)
    ? getMaterialDefaultColor(material)
    : metrics.color ?? categoryColor

  return {
    ...metrics,
    material,
    color,
  }
}

const parseIfcPropertyValue = (line: string) => {
  const numberMatch = line.match(/IFC(?:LENGTHMEASURE|REAL|INTEGER)\((-?\d+(?:\.\d+)?)\.?\)/i)
  if (numberMatch) return Number(numberMatch[1])

  const labelMatch = line.match(/IFC(?:LABEL|TEXT)\('([^']*)'\)/i)
  if (labelMatch) return decodeIfcStepString(labelMatch[1])

  return undefined
}

const PRODUCT_TYPE_BY_STEP_ENTITY: Record<string, string> = {
  WALL: 'IfcWall',
  WALLSTANDARDCASE: 'IfcWallStandardCase',
  SLAB: 'IfcSlab',
  ROOF: 'IfcRoof',
  DOOR: 'IfcDoor',
  WINDOW: 'IfcWindow',
  STAIR: 'IfcStair',
  STAIRFLIGHT: 'IfcStairFlight',
  COLUMN: 'IfcColumn',
  BEAM: 'IfcBeam',
}

const splitIfcStepArguments = (text: string): string[] => {
  const args: string[] = []
  let current = ''
  let depth = 0
  let inString = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    current += char

    if (char === "'") {
      if (text[index + 1] === "'") {
        current += text[index + 1]
        index += 1
        continue
      }
      inString = !inString
      continue
    }

    if (inString) continue
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) {
      args.push(current.slice(0, -1).trim())
      current = ''
    }
  }

  if (current.trim()) args.push(current.trim())
  return args
}

const parseIfcStepStringArgument = (value?: string): string | undefined => {
  if (!value || value === '$' || value === '*') return undefined
  const match = value.match(/^'((?:''|[^'])*)'$/)
  if (!match) return undefined
  return decodeIfcStepString(match[1].replace(/''/g, "'"))
}

const parseIfcReferenceId = (value?: string): number | undefined => {
  const match = value?.match(/^#(\d+)$/)
  return match ? Number(match[1]) : undefined
}

export const parseBatangDimensionProperties = (ifcText: string): IfcPsetMetricMaps => {
  const propertyValues: Record<string, string | number> = {}
  const propertySetToValues: Record<string, IfcElementMetrics> = {}
  const productById: Record<number, ParsedIfcElementInfo> = {}
  const aliasToProductId: Record<number, number> = {}
  const metricsByElementId: Record<number, ParsedIfcElementInfo> = {}
  const metricsByElementName: Record<string, ParsedIfcElementInfo> = {}

  Array.from(ifcText.matchAll(/#(\d+)=IFC(WALLSTANDARDCASE|WALL|SLAB|ROOF|DOOR|WINDOW|STAIRFLIGHT|STAIR|COLUMN|BEAM)\(([^;]*)\);/gi)).forEach((match) => {
    const productId = Number(match[1])
    const ifcClass = PRODUCT_TYPE_BY_STEP_ENTITY[match[2].toUpperCase()]
    if (!ifcClass) return
    const args = splitIfcStepArguments(match[3])
    const globalId = parseIfcStepStringArgument(args[0])
    if (!globalId) return
    const decodedName = parseIfcStepStringArgument(args[2])
    const category = IFC_CATEGORY_LABELS.find(([candidate]) => candidate.toLowerCase() === ifcClass.toLowerCase())?.[1]
      ?? ifcClass.replace(/^Ifc/i, '')
    productById[productId] = {
      expressId: productId,
      globalId,
      name: decodedName ?? category,
      ifcClass,
      category,
    }
    aliasToProductId[productId] = productId
    const objectPlacementId = parseIfcReferenceId(args[5])
    const representationId = parseIfcReferenceId(args[6])
    if (objectPlacementId !== undefined) aliasToProductId[objectPlacementId] = productId
    if (representationId !== undefined) aliasToProductId[representationId] = productId
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCPRODUCTDEFINITIONSHAPE\([^;]+,\(#(\d+),#(\d+)\)\);/gi)).forEach((match) => {
    const productShapeId = Number(match[1])
    const productId = aliasToProductId[productShapeId]
    if (!productId) return
    aliasToProductId[Number(match[2])] = productId
    aliasToProductId[Number(match[3])] = productId
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCSHAPEREPRESENTATION\([^;]+,\(#(\d+)\)\);/gi)).forEach((match) => {
    const shapeRepresentationId = Number(match[1])
    const productId = aliasToProductId[shapeRepresentationId]
    if (!productId) return
    aliasToProductId[Number(match[2])] = productId
  })

  Object.entries(aliasToProductId).forEach(([aliasId, productId]) => {
    const product = productById[productId]
    if (!product) return
    metricsByElementId[Number(aliasId)] = product
    metricsByElementName[product.name] = product
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCPROPERTYSINGLEVALUE\('([^']+)',\$,(.+?),\$\);/gi)).forEach((match) => {
    const [, id, name, rawValue] = match
    const value = parseIfcPropertyValue(rawValue)
    if (value !== undefined) propertyValues[`${id}:${decodeIfcStepString(name)}`] = value
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCPROPERTYSET\('[^']+',#\d+,'Pset_Batang_Dimensions',\$,\(((?:#\d+,?)+)\)\);/gi)).forEach((match) => {
    const [, propertySetId, rawPropertyRefs] = match
    const metrics: IfcElementMetrics = {}

    rawPropertyRefs.match(/#\d+/g)?.forEach((propertyRef) => {
      const propertyId = propertyRef.slice(1)
      const entries = Object.entries(propertyValues).filter(([key]) => key.startsWith(`${propertyId}:`))
      entries.forEach(([key, value]) => {
        const name = key.split(':')[1]
        if (name === 'Length' && typeof value === 'number') metrics.lengthMm = value
        if (name === 'Height' && typeof value === 'number') metrics.heightMm = value
        if (name === 'Thickness' && typeof value === 'number') metrics.thicknessMm = value
        if (name === 'Material' && typeof value === 'string') metrics.material = value
        if (name === 'Color' && typeof value === 'string') metrics.color = value
      })
    })

    propertySetToValues[propertySetId] = metrics
  })

  Array.from(ifcText.matchAll(/IFCRELDEFINESBYPROPERTIES\('[^']+',#\d+,\$,\$,\(((?:#\d+,?)+)\),#(\d+)\);/gi)).forEach((match) => {
    const [, rawElementRefs, propertySetId] = match
    const metrics = propertySetToValues[propertySetId]
    if (!metrics) return

    rawElementRefs.match(/#\d+/g)?.forEach((elementRef) => {
      const elementId = Number(elementRef.slice(1))
      const product = productById[elementId]
      if (!product) return

      const parsedElement = {
        ...product,
        ...metrics,
      }

      Object.entries(aliasToProductId).forEach(([aliasId, productId]) => {
        if (productId === elementId) metricsByElementId[Number(aliasId)] = parsedElement
      })
      metricsByElementId[elementId] = parsedElement
      metricsByElementName[product.name] = parsedElement
    })
  })

  return {
    byId: metricsByElementId,
    byName: metricsByElementName,
  }
}

export const getIfcElementFromFragments = async (
  fragments: import('@thatopen/components').FragmentsManager,
  pick: { modelId: string; localId: number },
  psetMetricMaps?: IfcPsetMetricMaps,
): Promise<IfcElementInfo | null> => {
  const parsedElement = psetMetricMaps?.byId[pick.localId]
  const modelIdMap: import('@thatopen/components').ModelIdMap = {
    [pick.modelId]: new Set([pick.localId]),
  }
  const dataByModel = await fragments.getData(modelIdMap, {
    attributesDefault: true,
    relationsDefault: {
      attributes: true,
      relations: false,
    },
  })
  const itemData = dataByModel[pick.modelId]?.[0] as FragmentDataRecord | undefined
  if (!itemData) return null

  const properties = flattenFragmentData(itemData, '', {
    ModelID: pick.modelId,
    LocalID: pick.localId,
  })
  const rawClass = getFragmentAttribute(itemData, ['_category', 'category', 'type', 'Class', 'Name'])
  const ifcClass = String(parsedElement?.ifcClass ?? rawClass ?? 'IfcElement')
  const name = decodeIfcStepString(String(parsedElement?.name ?? getFragmentAttribute(itemData, ['Name', 'LongName', 'ObjectType', 'Tag']) ?? ifcClass))
  const matchedClass = IFC_CATEGORY_LABELS.find(([candidate]) => ifcClass.includes(candidate) || name.includes(candidate))
  const category = parsedElement?.category ?? matchedClass?.[1] ?? (ifcClass.replace(/^Ifc/i, '') || 'Element')
  const psetMetrics = parsedElement ?? psetMetricMaps?.byName[name]
  const metrics = {
    ...getIfcElementMetrics(properties, category),
    ...psetMetrics,
  }
  const normalizedMetrics = getNormalizedIfcMaterialMetrics(metrics, category)
  const material = normalizedMetrics.material
  const color = normalizedMetrics.color
  const fragmentGlobalId = getFragmentAttribute(itemData, ['GlobalId', 'globalId', 'global_id', 'guid'])
  const globalId = parsedElement?.globalId
    ?? (typeof fragmentGlobalId === 'string' && fragmentGlobalId.trim().length > 0 ? fragmentGlobalId.trim() : undefined)
  properties.Length = normalizedMetrics.lengthMm ?? '-'
  properties.Height = normalizedMetrics.heightMm ?? '-'
  properties.Thickness = normalizedMetrics.thicknessMm ?? '-'
  properties.Material = material ?? '-'
  properties.Color = color
  Object.entries(properties).forEach(([key, value]) => {
    properties[key] = decodeIfcValue(value)
  })

  return {
    id: `${pick.modelId}:${pick.localId}`,
    name,
    ifcClass,
    category,
    source: 'ifc',
    expressId: parsedElement?.expressId ?? pick.localId,
    globalId,
    lengthMm: normalizedMetrics.lengthMm,
    heightMm: normalizedMetrics.heightMm,
    thicknessMm: normalizedMetrics.thicknessMm,
    material,
    color,
    properties,
  }
}
