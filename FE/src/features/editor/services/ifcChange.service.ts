import type { IfcElementChange } from '../types'

type BatangPsetIndex = {
  propertyByName: Record<string, number>
}

type BatangGeometryIndex = {
  profileId?: number
  profilePointId?: number
  solidId?: number
  boundingBoxId?: number
}

const EDITOR_MATERIAL_COLORS: Record<string, { hex: string; rgb: [number, number, number] }> = {
  Concrete: { hex: '#A8A29E', rgb: [168 / 255, 162 / 255, 158 / 255] },
  Brick: { hex: '#A3472C', rgb: [163 / 255, 71 / 255, 44 / 255] },
  Steel: { hex: '#8A94A3', rgb: [138 / 255, 148 / 255, 163 / 255] },
  Wood: { hex: '#9A6232', rgb: [154 / 255, 98 / 255, 50 / 255] },
  Glass: { hex: '#8FD3FF', rgb: [143 / 255, 211 / 255, 255 / 255] },
  Stone: { hex: '#8D8D86', rgb: [141 / 255, 141 / 255, 134 / 255] },
  Tile: { hex: '#C56F45', rgb: [197 / 255, 111 / 255, 69 / 255] },
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const indexBatangPropertySets = (ifcText: string) => {
  const psetPropertiesById: Record<number, number[]> = {}
  const indexByElementId: Record<number, BatangPsetIndex> = {}

  Array.from(ifcText.matchAll(/#(\d+)=IFCPROPERTYSET\('[^']+',#\d+,'Pset_Batang_Dimensions',\$,\(((?:#\d+,?)+)\)\);/gi)).forEach((match) => {
    psetPropertiesById[Number(match[1])] = match[2].match(/#\d+/g)?.map((ref) => Number(ref.slice(1))) ?? []
  })

  Array.from(ifcText.matchAll(/IFCRELDEFINESBYPROPERTIES\('[^']+',#\d+,\$,\$,\(((?:#\d+,?)+)\),#(\d+)\);/gi)).forEach((match) => {
    const elementIds = match[1].match(/#\d+/g)?.map((ref) => Number(ref.slice(1))) ?? []
    const propertyIds = psetPropertiesById[Number(match[2])] ?? []
    const propertyByName: Record<string, number> = {}

    propertyIds.forEach((propertyId) => {
      const propertyMatch = ifcText.match(new RegExp(`#${propertyId}=IFCPROPERTYSINGLEVALUE\\('([^']+)'`, 'i'))
      if (propertyMatch) propertyByName[propertyMatch[1]] = propertyId
    })

    elementIds.forEach((elementId) => {
      indexByElementId[elementId] = { propertyByName }
    })
  })

  return indexByElementId
}

const parseReferenceList = (rawRefs: string) => (
  rawRefs.match(/#\d+/g)?.map((ref) => Number(ref.slice(1))) ?? []
)

const indexBatangRectangularGeometries = (ifcText: string) => {
  const shapeRepresentationItemsById: Record<number, number[]> = {}
  const productShapeRepresentationsById: Record<number, number[]> = {}
  const solidIndexById: Record<number, { profileId: number }> = {}
  const profilePointById: Record<number, number | undefined> = {}
  const indexByElementId: Record<number, BatangGeometryIndex> = {}

  Array.from(ifcText.matchAll(/#(\d+)=IFCSHAPEREPRESENTATION\([^;]+,\(((?:#\d+,?)+)\)\);/gi)).forEach((match) => {
    shapeRepresentationItemsById[Number(match[1])] = parseReferenceList(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCPRODUCTDEFINITIONSHAPE\([^;]+,\(((?:#\d+,?)+)\)\);/gi)).forEach((match) => {
    productShapeRepresentationsById[Number(match[1])] = parseReferenceList(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCEXTRUDEDAREASOLID\(#(\d+),#[^,]+,#[^,]+,[-\d.]+\);/gi)).forEach((match) => {
    solidIndexById[Number(match[1])] = { profileId: Number(match[2]) }
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCRECTANGLEPROFILEDEF\([^;]+,#(\d+),[-\d.]+,[-\d.]+\);/gi)).forEach((match) => {
    profilePointById[Number(match[1])] = Number(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFC(WALL|SLAB|ROOF)\('[^']+',\$,'[^']+',[^;]+,#(\d+),\$/gi)).forEach((match) => {
    const elementId = Number(match[1])
    const productShapeId = Number(match[3])
    const representationIds = productShapeRepresentationsById[productShapeId] ?? []
    const itemIds = representationIds.flatMap((representationId) => shapeRepresentationItemsById[representationId] ?? [])
    const solidId = itemIds.find((itemId) => solidIndexById[itemId])
    const boundingBoxId = itemIds.find((itemId) => new RegExp(`#${itemId}=IFCBOUNDINGBOX\\(`, 'i').test(ifcText))
    const profileId = solidId ? solidIndexById[solidId]?.profileId : undefined

    if (!profileId && !solidId && !boundingBoxId) return
    indexByElementId[elementId] = {
      profileId,
      profilePointId: profileId ? profilePointById[profileId] : undefined,
      solidId,
      boundingBoxId,
    }
  })

  return indexByElementId
}

const replaceIfcLabelProperty = (
  ifcText: string,
  propertyId: number,
  value: string,
) => {
  const escaped = value.replace(/'/g, "''")
  const pattern = new RegExp(`(#${propertyId}=IFCPROPERTYSINGLEVALUE\\('[^']+',\\$,IFCLABEL\\(')[^']*('\\),\\$\\);)`, 'i')
  return ifcText.replace(pattern, `$1${escaped}$2`)
}

const replaceIfcRgbColor = (
  ifcText: string,
  colorId: number,
  rgb: [number, number, number],
) => {
  const pattern = new RegExp(`(#${colorId}=IFCCOLOURRGB\\(\\$,)[-\\d.]+,[-\\d.]+,[-\\d.]+(\\);)`, 'i')
  return ifcText.replace(pattern, `$1${rgb[0]},${rgb[1]},${rgb[2]}$2`)
}

const hexToRgb = (hex: string): [number, number, number] | undefined => {
  const match = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!match) return undefined
  return [
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  ]
}

const replaceIfcLengthProperty = (
  ifcText: string,
  propertyId: number,
  value: number,
) => {
  const pattern = new RegExp(`(#${propertyId}=IFCPROPERTYSINGLEVALUE\\('[^']+',\\$,IFCLENGTHMEASURE\\()[-\\d.]+(\\),\\$\\);)`, 'i')
  return ifcText.replace(pattern, `$1${Math.round(value)}$2`)
}

const replaceRectangleProfileDimensions = (
  ifcText: string,
  profileId: number,
  lengthMm: number,
  thicknessMm: number,
) => {
  const pattern = new RegExp(`(#${profileId}=IFCRECTANGLEPROFILEDEF\\((?:[^,]*,){3})[-\\d.]+,[-\\d.]+(\\);)`, 'i')
  return ifcText.replace(pattern, `$1${Math.round(lengthMm)}.,${Math.round(thicknessMm)}.$2`)
}

const replaceProfileCenterPoint = (
  ifcText: string,
  pointId: number,
  lengthMm: number,
  thicknessMm: number,
) => {
  const pattern = new RegExp(`(#${pointId}=IFCCARTESIANPOINT\\(\\()[-\\d.]+,[-\\d.]+,[-\\d.]+(\\)\\);)`, 'i')
  const fallbackPattern = new RegExp(`(#${pointId}=IFCCARTESIANPOINT\\(\\()[-\\d.]+,[-\\d.]+(\\)\\);)`, 'i')
  const nextX = Math.round(lengthMm / 2)
  const nextY = Math.round(thicknessMm / 2)
  if (pattern.test(ifcText)) return ifcText.replace(pattern, `$1${nextX}.,${nextY}.,0.$2`)
  return ifcText.replace(fallbackPattern, `$1${nextX}.,${nextY}.$2`)
}

const replaceExtrusionDepth = (
  ifcText: string,
  solidId: number,
  heightMm: number,
) => {
  const pattern = new RegExp(`(#${solidId}=IFCEXTRUDEDAREASOLID\\(#[^,]+,#[^,]+,#[^,]+,)[-\\d.]+(\\);)`, 'i')
  return ifcText.replace(pattern, `$1${Math.round(heightMm)}.$2`)
}

const replaceBoundingBoxDimensions = (
  ifcText: string,
  boundingBoxId: number,
  lengthMm: number,
  thicknessMm: number,
  heightMm: number,
) => {
  const pattern = new RegExp(`(#${boundingBoxId}=IFCBOUNDINGBOX\\(#[^,]+,)[-\\d.]+,[-\\d.]+,[-\\d.]+(\\);)`, 'i')
  return ifcText.replace(pattern, `$1${Math.round(lengthMm)}.,${Math.round(thicknessMm)}.,${Math.round(heightMm)}.$2`)
}

const patchRectangularGeometry = (
  ifcText: string,
  geometry: BatangGeometryIndex,
  change: IfcElementChange,
) => {
  let nextText = ifcText
  const lengthMm = change.lengthMm
  const heightMm = change.heightMm
  const thicknessMm = change.thicknessMm

  if (typeof lengthMm === 'number' && typeof thicknessMm === 'number' && geometry.profileId) {
    nextText = replaceRectangleProfileDimensions(nextText, geometry.profileId, lengthMm, thicknessMm)
  }

  if (typeof lengthMm === 'number' && typeof thicknessMm === 'number' && geometry.profilePointId) {
    nextText = replaceProfileCenterPoint(nextText, geometry.profilePointId, lengthMm, thicknessMm)
  }

  if (typeof heightMm === 'number' && geometry.solidId) {
    nextText = replaceExtrusionDepth(nextText, geometry.solidId, heightMm)
  }

  if (
    typeof lengthMm === 'number' &&
    typeof heightMm === 'number' &&
    typeof thicknessMm === 'number' &&
    geometry.boundingBoxId
  ) {
    nextText = replaceBoundingBoxDimensions(nextText, geometry.boundingBoxId, lengthMm, thicknessMm, heightMm)
  }

  return nextText
}

const indexStyledColorIdsByElement = (ifcText: string) => {
  const shapeRepresentationItemsById: Record<number, number[]> = {}
  const productShapeRepresentationsById: Record<number, number[]> = {}
  const styleIdsByItemId: Record<number, number[]> = {}
  const renderingIdByStyleId: Record<number, number | undefined> = {}
  const colorIdByRenderingId: Record<number, number | undefined> = {}
  const colorIdsByElementId: Record<number, number[]> = {}

  Array.from(ifcText.matchAll(/#(\d+)=IFCSHAPEREPRESENTATION\([^;]+,\(((?:#\d+,?)+)\)\);/gi)).forEach((match) => {
    shapeRepresentationItemsById[Number(match[1])] = parseReferenceList(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCPRODUCTDEFINITIONSHAPE\([^;]+,\(((?:#\d+,?)+)\)\);/gi)).forEach((match) => {
    productShapeRepresentationsById[Number(match[1])] = parseReferenceList(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCSTYLEDITEM\(#(\d+),\(((?:#\d+,?)+)\),\$\);/gi)).forEach((match) => {
    styleIdsByItemId[Number(match[2])] = parseReferenceList(match[3])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCSURFACESTYLE\('[^']+',\.[A-Z]+\.,\(#(\d+)\)\);/gi)).forEach((match) => {
    renderingIdByStyleId[Number(match[1])] = Number(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFCSURFACESTYLERENDERING\(#(\d+),/gi)).forEach((match) => {
    colorIdByRenderingId[Number(match[1])] = Number(match[2])
  })

  Array.from(ifcText.matchAll(/#(\d+)=IFC[A-Z]+\('[^']+',\$,'[^']+',[^;]+,#(\d+),\$/gi)).forEach((match) => {
    const elementId = Number(match[1])
    const productShapeId = Number(match[2])
    const representationIds = productShapeRepresentationsById[productShapeId] ?? []
    const itemIds = representationIds.flatMap((representationId) => shapeRepresentationItemsById[representationId] ?? [])
    const colorIds = itemIds.flatMap((itemId) => (
      styleIdsByItemId[itemId] ?? []
    ).flatMap((styleId) => {
      const renderingId = renderingIdByStyleId[styleId]
      const colorId = renderingId ? colorIdByRenderingId[renderingId] : undefined
      return colorId ? [colorId] : []
    }))

    if (colorIds.length > 0) colorIdsByElementId[elementId] = colorIds
  })

  return colorIdsByElementId
}

export const patchIfcTextForMaterialDefaults = (ifcText: string) => {
  const psetIndex = indexBatangPropertySets(ifcText)
  const styledColorIdsByElement = indexStyledColorIdsByElement(ifcText)
  let nextText = ifcText

  Object.entries(psetIndex).forEach(([rawElementId, pset]) => {
    const materialPropertyId = pset.propertyByName.Material
    const colorPropertyId = pset.propertyByName.Color
    if (!materialPropertyId) return

    const materialMatch = nextText.match(new RegExp(`#${materialPropertyId}=IFCPROPERTYSINGLEVALUE\\('Material',\\$,IFCLABEL\\('([^']+)'\\),\\$\\);`, 'i'))
    const materialColor = materialMatch ? EDITOR_MATERIAL_COLORS[materialMatch[1]] : undefined
    if (!materialColor) return

    if (colorPropertyId) {
      nextText = replaceIfcLabelProperty(nextText, colorPropertyId, materialColor.hex)
    }

    const elementId = Number(rawElementId)
    styledColorIdsByElement[elementId]?.forEach((colorId) => {
      nextText = replaceIfcRgbColor(nextText, colorId, materialColor.rgb)
    })
  })

  return nextText
}

export const patchIfcTextForElementChanges = (ifcText: string, changes: IfcElementChange[]) => {
  const psetIndex = indexBatangPropertySets(ifcText)
  const geometryIndex = indexBatangRectangularGeometries(ifcText)
  const styledColorIdsByElement = indexStyledColorIdsByElement(ifcText)
  let nextText = ifcText

  changes.forEach((change) => {
    const pset = psetIndex[change.expressId]
    if (!pset) return

    const colorPropertyId = pset.propertyByName.Color
    if (change.color && colorPropertyId) {
      nextText = replaceIfcLabelProperty(nextText, colorPropertyId, change.color)
      const rgb = hexToRgb(change.color)
      if (rgb) {
        styledColorIdsByElement[change.expressId]?.forEach((colorId) => {
          nextText = replaceIfcRgbColor(nextText, colorId, rgb)
        })
      }
    }

    const materialPropertyId = pset.propertyByName.Material
    if (change.material && materialPropertyId) {
      nextText = replaceIfcLabelProperty(nextText, materialPropertyId, change.material)
    }

    const lengthPropertyId = pset.propertyByName.Length
    if (typeof change.lengthMm === 'number' && lengthPropertyId) {
      nextText = replaceIfcLengthProperty(nextText, lengthPropertyId, change.lengthMm)
    }

    const heightPropertyId = pset.propertyByName.Height
    if (typeof change.heightMm === 'number' && heightPropertyId) {
      nextText = replaceIfcLengthProperty(nextText, heightPropertyId, change.heightMm)
    }

    const thicknessPropertyId = pset.propertyByName.Thickness
    if (typeof change.thicknessMm === 'number' && thicknessPropertyId) {
      nextText = replaceIfcLengthProperty(nextText, thicknessPropertyId, change.thicknessMm)
    }

    const geometry = geometryIndex[change.expressId]
    if (geometry) {
      nextText = patchRectangularGeometry(nextText, geometry, change)
    }
  })

  return nextText
}

export async function applyIfcElementChanges(
  sourceIfcText: string,
  changes: IfcElementChange[],
) {
  const patchedText = patchIfcTextForElementChanges(sourceIfcText, changes)

  const { IfcAPI } = await import('web-ifc')
  const ifcApi = new IfcAPI()
  ifcApi.SetWasmPath('/', false)
  await ifcApi.Init()

  const modelId = ifcApi.OpenModel(textEncoder.encode(patchedText))
  if (modelId < 0) {
    ifcApi.Dispose()
    throw new Error('IFC 변경 상태를 적용할 수 없습니다.')
  }

  try {
    const saved = ifcApi.SaveModel(modelId)
    return textDecoder.decode(saved)
  } finally {
    ifcApi.CloseModel(modelId)
    ifcApi.Dispose()
  }
}

export function downloadIfcText(filename: string, ifcText: string) {
  const blob = new Blob([ifcText], { type: 'application/x-step' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
