/**
 * 3D 라이브러리 IFC manifest 로딩 및 프리셋 보강 유틸.
 *
 * public/ifc-library/manifest.json에서 추출된 실제 IFC 에셋 메타데이터를 읽어
 * 패널 프리셋과 씬 인스턴스의 치수, 색상, 재질, 에셋 URL을 일관되게 보정한다.
 */
import type { ThreeDLibraryPreset } from './threeDLibrary.types'

export const IFC_LIBRARY_BASE_PATH = '/ifc-library'
export const IFC_LIBRARY_MANIFEST_URL = `${IFC_LIBRARY_BASE_PATH}/manifest.json`

export interface IfcLibraryManifestColor {
  name?: string | null
  r: number
  g: number
  b: number
}

export interface IfcLibraryManifestAsset {
  id: string
  label?: string
  category?: string
  assetIfc?: string | null
  materials?: string[]
  colors?: IfcLibraryManifestColor[]
  bbox?: {
    sizeMm?: number[]
  }
}

export interface IfcLibraryManifest {
  assets?: IfcLibraryManifestAsset[]
}

let ifcLibraryManifestPromise: Promise<IfcLibraryManifest | null> | null = null

const toHexColorPart = (value: number) => (
  Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
)

const toHexColor = (color?: IfcLibraryManifestColor) => (
  color ? `#${toHexColorPart(color.r)}${toHexColorPart(color.g)}${toHexColorPart(color.b)}` : undefined
)

/**
 * IFC material/category 문자열을 편집기 재질 프리셋 이름으로 정규화한다.
 * manifest 원본이 영어/한글 혼재라서 대표 키워드와 카테고리 fallback을 함께 사용한다.
 */
const normalizeManifestMaterial = (
  category?: string,
  materials?: string[],
) => {
  const rawMaterial = materials?.find((entry) => entry && entry !== '<Unnamed>')
  const rawLower = rawMaterial?.toLowerCase()
  if (rawLower?.includes('glass') || rawMaterial?.includes('유리')) return 'Glass'
  if (rawLower?.includes('wood') || rawMaterial?.includes('문')) return 'Wood'
  if (rawLower?.includes('steel') || rawLower?.includes('metal')) return 'Steel'
  if (rawLower?.includes('tile')) return 'Tile'
  if (rawLower?.includes('brick')) return 'Brick'

  if (category === 'roof') return 'Tile'
  if (category === 'door') return 'Wood'
  if (category === 'window') return 'Glass'
  if (category === 'stair' || category === 'terrace' || category === 'wall') return 'Concrete'
  return rawMaterial
}

export const toIfcLibraryAssetUrl = (assetIfc?: string | null) => {
  const value = assetIfc?.trim()
  if (!value) return undefined
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/')) return value
  return `${IFC_LIBRARY_BASE_PATH}/${value.replace(/^\/+/, '')}`
}

export const loadIfcLibraryManifest = () => {
  if (ifcLibraryManifestPromise) return ifcLibraryManifestPromise
  ifcLibraryManifestPromise = fetch(IFC_LIBRARY_MANIFEST_URL, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.json() as Promise<IfcLibraryManifest> : null))
    .catch(() => null)
  return ifcLibraryManifestPromise
}

export const buildIfcLibraryManifestMap = (manifest: IfcLibraryManifest | null) => (
  new Map((manifest?.assets ?? []).map((asset) => [asset.id, asset]))
)

/**
 * 단일 프리셋에 manifest 메타데이터를 병합한다.
 * 이미 씬에 배치된 인스턴스는 사용자가 수정한 치수/색상/재질을 우선 보존한다.
 */
export const applyIfcLibraryManifestToPreset = (
  preset: ThreeDLibraryPreset,
  manifestAsset?: IfcLibraryManifestAsset | null,
): ThreeDLibraryPreset => {
  if (!manifestAsset) return preset

  const [lengthMm, thicknessMm, heightMm] = manifestAsset.bbox?.sizeMm ?? []
  const manifestLengthMm = Number.isFinite(lengthMm) ? Math.round(lengthMm) : undefined
  const manifestHeightMm = Number.isFinite(heightMm) ? Math.round(heightMm) : undefined
  const manifestThicknessMm = Number.isFinite(thicknessMm) ? Math.round(thicknessMm) : undefined
  const isSceneInstance = Boolean(preset.sourceAssetId && preset.id !== preset.sourceAssetId)
  const nextLengthMm = isSceneInstance && Number.isFinite(preset.lengthMm)
    ? preset.lengthMm
    : manifestLengthMm ?? preset.lengthMm
  const nextHeightMm = isSceneInstance && Number.isFinite(preset.heightMm)
    ? preset.heightMm
    : manifestHeightMm ?? preset.heightMm
  const nextThicknessMm = isSceneInstance && Number.isFinite(preset.thicknessMm)
    ? preset.thicknessMm
    : manifestThicknessMm ?? preset.thicknessMm
  const assetIfc = manifestAsset.assetIfc ?? preset.assetIfc
  const assetIfcUrl = toIfcLibraryAssetUrl(assetIfc) ?? preset.assetIfcUrl
  const color = isSceneInstance
    ? preset.color
    : toHexColor(manifestAsset.colors?.[0]) ?? preset.color
  const material = isSceneInstance
    ? preset.material
    : normalizeManifestMaterial(manifestAsset.category, manifestAsset.materials) ?? preset.material

  return {
    ...preset,
    name: preset.name || manifestAsset.label || preset.id,
    dimensions: Number.isFinite(nextLengthMm) && Number.isFinite(nextHeightMm) && Number.isFinite(nextThicknessMm)
      ? `${Math.round(nextLengthMm as number)} x ${Math.round(nextHeightMm as number)} x ${Math.round(nextThicknessMm as number)}`
      : preset.dimensions,
    lengthMm: nextLengthMm,
    heightMm: nextHeightMm,
    thicknessMm: nextThicknessMm,
    color,
    material,
    assetIfc: assetIfc ?? preset.assetIfc,
    assetIfcUrl,
    sourceAssetId: manifestAsset.id,
  }
}

export const applyIfcLibraryManifestToPresets = (
  presets: ThreeDLibraryPreset[],
  manifest: IfcLibraryManifest | null,
) => {
  const manifestMap = buildIfcLibraryManifestMap(manifest)
  return presets.map((preset) => applyIfcLibraryManifestToPreset(
    preset,
    manifestMap.get(preset.sourceAssetId ?? preset.id),
  ))
}
