/**
 * 3D 라이브러리 패널 — 프리셋 데이터 및 미리보기 유틸
 *
 * 이 파일에는 다음 세 가지가 포함된다.
 *  1. PRESETS            — 라이브러리에 노출되는 건축 요소 프리셋 목록
 *  2. 미리보기 관련 상수   — SVG 도형 마크업·색상 테마 등
 *  3. IFC manifest 연동 유틸 — 실물 IFC 에셋의 bbox/색상/재질 보강
 *  4. buildPresetPreviewDataUri — SVG 인라인 data URI 생성 유틸
 */

import type { ThreeDLibraryPreset, ThreeDLibraryPresetType } from './threeDLibrary.types'

// ─────────────────────────────────────────────
// 미리보기 SVG 도형 마크업 (타입별 기본 도형)
// ─────────────────────────────────────────────

export const PREVIEW_SHAPE_BY_TYPE: Record<ThreeDLibraryPresetType, string> = {
  roof: '<polygon points="26,52 64,26 102,52 102,84 26,84" />',
  'exterior-wall': '<rect x="26" y="34" width="76" height="50" rx="10" />',
  'interior-wall': '<rect x="34" y="30" width="60" height="54" rx="8" />',
  window: '<rect x="28" y="26" width="72" height="60" rx="10" /><path d="M64 26V86M28 56H100" fill="none" stroke="currentColor" stroke-width="5" />',
  'room-door': '<path d="M34 84V28H92V84" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round" /><circle cx="80" cy="57" r="4" />',
  'front-door': '<rect x="38" y="24" width="52" height="60" rx="8" /><rect x="72" y="50" width="6" height="14" rx="3" fill="#F8FAFF" />',
  stairs: '<path d="M26 84V72H42V60H58V48H74V36H90V24H102V84Z" />',
  terrace: '<rect x="22" y="62" width="84" height="18" rx="6" /><path d="M28 62V34H100V62M44 34V62M64 34V62M84 34V62" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" />',
  column: '<rect x="42" y="22" width="44" height="62" rx="10" />',
  floor: '<rect x="22" y="58" width="84" height="24" rx="8" />',
  ceiling: '<rect x="22" y="24" width="84" height="24" rx="8" />',
  furniture: '<rect x="24" y="52" width="80" height="24" rx="12" /><rect x="30" y="34" width="68" height="22" rx="10" />',
}

/** 프리셋 ID별 세밀한 SVG 도형 마크업 (기본 타입 도형보다 우선 적용) */
export const PREVIEW_SHAPE_BY_PRESET_ID: Record<string, string> = {
  'roof-gable': '<polygon points="20,58 64,24 108,58 108,84 20,84" />',
  'roof-flat': '<rect x="18" y="60" width="92" height="20" rx="8" /><rect x="22" y="52" width="84" height="8" rx="4" opacity="0.9" />',
  'roof-178223': '<path d="M12 64H116V82H12Z" /><path d="M18 64L34 46H100L116 64Z" opacity="0.92" /><path d="M34 46L56 28H82L100 46Z" opacity="0.76" /><rect x="18" y="76" width="98" height="6" opacity="0.35" />',
  'roof-180558': '<path d="M18 62H80V80H18Z" /><path d="M80 58H112V76H80Z" opacity="0.86" /><path d="M24 62L42 42H74L88 58L80 62Z" opacity="0.78" /><path d="M88 58L98 44L112 58Z" opacity="0.62" />',
  'roof-181099': '<path d="M34 62H92V80H34Z" /><path d="M40 62L56 42H82L92 62Z" opacity="0.88" /><path d="M56 42L68 30L82 42Z" opacity="0.68" /><rect x="38" y="74" width="50" height="6" opacity="0.34" />',
  'roof-187335': '<path d="M14 64H114V82H14Z" /><path d="M14 64L36 40H72L88 54L104 36L116 64Z" opacity="0.9" /><path d="M36 40L56 22L76 40Z" opacity="0.74" /><path d="M82 54L100 34L116 64Z" opacity="0.62" /><rect x="20" y="76" width="88" height="6" opacity="0.32" />',
  'exterior-wall-200': '<rect x="18" y="36" width="92" height="48" rx="7" /><rect x="26" y="42" width="76" height="6" rx="3" opacity="0.38" /><path d="M24 60H104M24 70H104" fill="none" stroke="currentColor" stroke-width="2.8" opacity="0.45" />',
  'exterior-wall-brick': '<rect x="18" y="36" width="92" height="48" rx="7" /><path d="M22 46H106M22 56H106M22 66H106M22 76H106M30 36V46M46 36V46M62 36V46M78 36V46M94 36V46M38 46V56M54 46V56M70 46V56M86 46V56M30 56V66M46 56V66M62 56V66M78 56V66M94 56V66M38 66V76M54 66V76M70 66V76M86 66V76" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.45" />',
  'wall-139029': '<rect x="10" y="52" width="108" height="24" rx="4" /><rect x="18" y="58" width="92" height="5" rx="2.5" opacity="0.42" /><path d="M22 70H108M34 52V76M58 52V76M82 52V76M106 52V76" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.34" />',
  'interior-wall-100': '<rect x="24" y="36" width="80" height="46" rx="6" /><rect x="30" y="56" width="68" height="5" rx="2.5" opacity="0.5" />',
  'interior-wall-150': '<rect x="20" y="32" width="88" height="50" rx="6" /><path d="M30 48H98M30 58H98M30 68H98" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.45" />',
  'window-fixed': '<rect x="24" y="26" width="80" height="60" rx="10" /><rect x="30" y="32" width="68" height="48" rx="8" fill="#BFE6FF" /><rect x="34" y="36" width="60" height="40" rx="6" opacity="0.32" />',
  'window-wide': '<rect x="14" y="30" width="100" height="56" rx="10" /><rect x="20" y="36" width="88" height="44" rx="8" fill="#BFE6FF" /><path d="M42 36V80M64 36V80M86 36V80" fill="none" stroke="currentColor" stroke-width="4.5" opacity="0.7" />',
  'room-door-basic': '<path d="M30 86V24H90V86" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" /><rect x="38" y="30" width="44" height="50" rx="6" opacity="0.42" /><circle cx="76" cy="56" r="3.3" fill="#F8FAFF" /><path d="M30 84A30 30 0 0 1 60 54" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.5" />',
  'room-door-sliding': '<rect x="18" y="30" width="92" height="54" rx="8" /><rect x="22" y="34" width="42" height="46" rx="6" opacity="0.46" /><rect x="62" y="34" width="42" height="46" rx="6" opacity="0.28" /><rect x="18" y="24" width="92" height="4" rx="2" opacity="0.45" />',
  'front-door-steel': '<rect x="32" y="20" width="64" height="66" rx="8" /><path d="M40 30H88M40 40H88M40 50H88M40 60H88M40 70H88" fill="none" stroke="currentColor" stroke-width="2.8" opacity="0.48" /><rect x="78" y="49" width="5" height="16" rx="2.5" fill="#F8FAFF" />',
  'front-door-glass': '<rect x="32" y="20" width="64" height="66" rx="8" /><rect x="42" y="30" width="44" height="42" rx="6" fill="#BFE6FF" /><path d="M64 30V72" stroke="currentColor" stroke-width="2.6" opacity="0.45" /><rect x="78" y="49" width="5" height="16" rx="2.5" fill="#F8FAFF" />',
  'stairs-straight': '<path d="M18 84V74H34V64H50V54H66V44H82V34H98V24H110V84Z" />',
  'stairs-l': '<path d="M18 84V74H34V64H50V54H66V44H82V34H98V56H86V66H74V76H62V84Z" />',
  'stair-145090': '<path d="M20 84V74H38V64H56V54H74V44H92V34H108V84Z" /><path d="M22 54L58 34L104 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.65" /><path d="M34 76V58M56 66V45M78 56V35M100 46V27" fill="none" stroke="currentColor" stroke-width="3.4" opacity="0.55" />',
  'column-square': '<rect x="44" y="24" width="40" height="56" rx="5" /><rect x="34" y="24" width="60" height="7" rx="3.5" opacity="0.45" /><rect x="34" y="73" width="60" height="7" rx="3.5" opacity="0.45" />',
  'column-round': '<ellipse cx="64" cy="24" rx="20" ry="7" /><rect x="44" y="24" width="40" height="52" rx="20" /><ellipse cx="64" cy="76" rx="20" ry="7" />',
  'floor-wood': '<rect x="14" y="60" width="100" height="22" rx="8" /><path d="M22 60L34 82M38 60L50 82M54 60L66 82M70 60L82 82M86 60L98 82" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.5" />',
  'floor-tile': '<rect x="14" y="60" width="100" height="22" rx="8" /><path d="M14 67H114M14 74H114M30 60V82M46 60V82M62 60V82M78 60V82M94 60V82" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.52" />',
  'ceiling-flat': '<rect x="14" y="18" width="100" height="24" rx="8" /><circle cx="64" cy="30" r="5" opacity="0.45" />',
  'ceiling-wood': '<rect x="14" y="18" width="100" height="24" rx="8" /><path d="M18 22H110M18 27H110M18 32H110M18 37H110" fill="none" stroke="currentColor" stroke-width="2.3" opacity="0.5" />',
  'furniture-sofa': '<rect x="20" y="56" width="88" height="24" rx="10" /><rect x="28" y="36" width="72" height="24" rx="10" /><rect x="20" y="46" width="10" height="26" rx="4" /><rect x="98" y="46" width="10" height="26" rx="4" />',
  'furniture-dining-table': '<rect x="24" y="46" width="80" height="12" rx="4" /><rect x="30" y="58" width="8" height="24" rx="3" /><rect x="90" y="58" width="8" height="24" rx="3" /><rect x="42" y="62" width="6" height="20" rx="3" opacity="0.65" /><rect x="80" y="62" width="6" height="20" rx="3" opacity="0.65" />',
  'furniture-bed-double': '<rect x="20" y="40" width="88" height="42" rx="8" /><rect x="20" y="32" width="88" height="10" rx="5" /><rect x="28" y="48" width="32" height="14" rx="6" fill="#F8FAFF" /><rect x="68" y="48" width="32" height="14" rx="6" fill="#F8FAFF" />',
  'furniture-wardrobe': '<rect x="30" y="22" width="68" height="62" rx="6" /><rect x="63" y="22" width="2.8" height="62" opacity="0.35" /><rect x="56" y="48" width="3" height="12" rx="1.5" fill="#F8FAFF" /><rect x="70" y="48" width="3" height="12" rx="1.5" fill="#F8FAFF" />',
}

/** 프리셋 타입별 SVG 도형 채움 색상 */
export const SHAPE_FILL_BY_TYPE: Record<ThreeDLibraryPresetType, string> = {
  roof: '#F2F5FF',
  'exterior-wall': '#F6EFE6',
  'interior-wall': '#F0F4FB',
  window: '#D5EEFF',
  'room-door': '#F6E9DC',
  'front-door': '#E5ECF8',
  stairs: '#F5EADB',
  terrace: '#F1F4F0',
  column: '#EEF2F8',
  floor: '#F3E7D9',
  ceiling: '#F3F6FA',
  furniture: '#EFF2FA',
}

/** 프리셋 ID별 그라디언트 배경 및 도형 색상 테마 */
export const PRESET_THEME_BY_ID: Record<string, { bgStart: string; bgEnd: string; shapeFill: string }> = {
  'roof-gable': { bgStart: '#6A7386', bgEnd: '#4A5468', shapeFill: '#EAF0FF' },
  'roof-flat': { bgStart: '#758090', bgEnd: '#565F72', shapeFill: '#EEF2FF' },
  'exterior-wall-200': { bgStart: '#B69A7D', bgEnd: '#8B7156', shapeFill: '#F6EDE2' },
  'exterior-wall-brick': { bgStart: '#AA6D54', bgEnd: '#7A4B3B', shapeFill: '#F9E9DF' },
  'interior-wall-100': { bgStart: '#A9B6CB', bgEnd: '#798AA7', shapeFill: '#F2F6FC' },
  'interior-wall-150': { bgStart: '#8C9EBB', bgEnd: '#5E7393', shapeFill: '#EDF3FC' },
  'window-fixed': { bgStart: '#7AB2D8', bgEnd: '#4F86B1', shapeFill: '#E7F7FF' },
  'window-wide': { bgStart: '#6AA5D0', bgEnd: '#3F77A6', shapeFill: '#E2F3FF' },
  'room-door-basic': { bgStart: '#B58C66', bgEnd: '#7D5D43', shapeFill: '#F3E8DB' },
  'room-door-sliding': { bgStart: '#A88059', bgEnd: '#6F533E', shapeFill: '#F6ECDD' },
  'front-door-steel': { bgStart: '#5E6D84', bgEnd: '#3F4F67', shapeFill: '#E8EEF8' },
  'front-door-glass': { bgStart: '#4F627E', bgEnd: '#35475F', shapeFill: '#E6F4FF' },
  'roof-178223': { bgStart: '#7B8495', bgEnd: '#515B6F', shapeFill: '#EEF2FF' },
  'roof-180558': { bgStart: '#8A8391', bgEnd: '#5D6172', shapeFill: '#F2EEF8' },
  'roof-181099': { bgStart: '#8A93A3', bgEnd: '#626B7D', shapeFill: '#F2F5FF' },
  'roof-187335': { bgStart: '#737F91', bgEnd: '#4B596D', shapeFill: '#EAF0FF' },
  'stairs-straight': { bgStart: '#B68963', bgEnd: '#8F6241', shapeFill: '#F3E6D9' },
  'stairs-l': { bgStart: '#BF9870', bgEnd: '#987048', shapeFill: '#F5EAD8' },
  'stair-145090': { bgStart: '#A9A29A', bgEnd: '#77716C', shapeFill: '#F4EBDD' },
  'wall-139029': { bgStart: '#A5ABB5', bgEnd: '#7C8491', shapeFill: '#F2F0EC' },
  'column-square': { bgStart: '#AEB6C4', bgEnd: '#868FA1', shapeFill: '#EEF2FA' },
  'column-round': { bgStart: '#C0C8D6', bgEnd: '#9AA4B8', shapeFill: '#F2F5FA' },
  'floor-wood': { bgStart: '#BC946C', bgEnd: '#8F6A49', shapeFill: '#F4E7D8' },
  'floor-tile': { bgStart: '#B7B2AA', bgEnd: '#87827C', shapeFill: '#F1ECE4' },
  'ceiling-flat': { bgStart: '#BFC4CC', bgEnd: '#8E96A3', shapeFill: '#F2F5FA' },
  'ceiling-wood': { bgStart: '#B7A28D', bgEnd: '#86828D', shapeFill: '#F0E7DB' },
  'furniture-sofa': { bgStart: '#8F94B2', bgEnd: '#69708E', shapeFill: '#EDF1FB' },
  'furniture-dining-table': { bgStart: '#9A7A57', bgEnd: '#72583D', shapeFill: '#F1E2D2' },
  'furniture-bed-double': { bgStart: '#A89A8D', bgEnd: '#7C7066', shapeFill: '#FAF7F3' },
  'furniture-wardrobe': { bgStart: '#C4B8A8', bgEnd: '#9A8E80', shapeFill: '#F5EFE6' },
}

// ─────────────────────────────────────────────
// IFC manifest 연동 유틸
// ─────────────────────────────────────────────

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

export const applyIfcLibraryManifestToPreset = (
  preset: ThreeDLibraryPreset,
  manifestAsset?: IfcLibraryManifestAsset | null,
): ThreeDLibraryPreset => {
  if (!manifestAsset) return preset

  const [lengthMm, thicknessMm, heightMm] = manifestAsset.bbox?.sizeMm ?? []
  const assetIfc = manifestAsset.assetIfc ?? preset.assetIfc
  const assetIfcUrl = toIfcLibraryAssetUrl(assetIfc) ?? preset.assetIfcUrl
  const color = toHexColor(manifestAsset.colors?.[0]) ?? preset.color
  const material = normalizeManifestMaterial(manifestAsset.category, manifestAsset.materials) ?? preset.material

  return {
    ...preset,
    name: preset.name || manifestAsset.label || preset.id,
    dimensions: Number.isFinite(lengthMm) && Number.isFinite(heightMm) && Number.isFinite(thicknessMm)
      ? `${Math.round(lengthMm)} x ${Math.round(heightMm)} x ${Math.round(thicknessMm)}`
      : preset.dimensions,
    lengthMm: Number.isFinite(lengthMm) ? Math.round(lengthMm) : preset.lengthMm,
    heightMm: Number.isFinite(heightMm) ? Math.round(heightMm) : preset.heightMm,
    thicknessMm: Number.isFinite(thicknessMm) ? Math.round(thicknessMm) : preset.thicknessMm,
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

// ─────────────────────────────────────────────
// 프리셋 목록
// ─────────────────────────────────────────────

/** 3D 라이브러리에 노출되는 전체 프리셋 목록 */
export const PRESETS: ThreeDLibraryPreset[] = [
  {
    id: 'roof-gable',
    type: 'roof',
    roofShape: 'gable',
    name: '박공지붕',
    description: '단독주택에 사용하는 기본 경사지붕',
    dimensions: '7000 x 1200 x 6000',
    lengthMm: 7000,
    heightMm: 1200,
    thicknessMm: 6000,
    color: '#5B6475',
  },
  {
    id: 'roof-flat',
    type: 'roof',
    roofShape: 'flat',
    name: '평지붕',
    description: '옥상 활용이 가능한 평지붕',
    dimensions: '4800 x 3400',
    color: '#6B7280',
  },
  {
    id: 'roof-178223',
    type: 'roof',
    roofShape: 'flat',
    name: 'IFC 지붕 178223',
    description: 'roof-178223.ifc에서 추출한 기본 지붕 에셋',
    dimensions: '16725 x 1200 x 6500',
    lengthMm: 16725,
    heightMm: 1200,
    thicknessMm: 6500,
    color: '#E8808B',
    material: 'Tile',
    sourceAssetId: 'roof-178223',
    assetIfc: 'assets/roof-178223.ifc',
    assetIfcUrl: '/ifc-library/assets/roof-178223.ifc',
  },
  {
    id: 'roof-180558',
    type: 'roof',
    roofShape: 'flat',
    name: 'IFC 지붕 180558',
    description: 'roof-180558.ifc에서 추출한 다중 지붕 에셋',
    dimensions: '6714 x 600 x 1984',
    lengthMm: 6714,
    heightMm: 600,
    thicknessMm: 1984,
    color: '#E8808B',
    material: 'Tile',
    sourceAssetId: 'roof-180558',
    assetIfc: 'assets/roof-180558.ifc',
    assetIfcUrl: '/ifc-library/assets/roof-180558.ifc',
  },
  {
    id: 'roof-181099',
    type: 'roof',
    roofShape: 'flat',
    name: 'IFC 지붕 181099',
    description: 'roof-181099.ifc에서 추출한 소형 지붕 에셋',
    dimensions: '3525 x 650 x 1180',
    lengthMm: 3525,
    heightMm: 650,
    thicknessMm: 1180,
    color: '#E8808B',
    material: 'Tile',
    sourceAssetId: 'roof-181099',
    assetIfc: 'assets/roof-181099.ifc',
    assetIfcUrl: '/ifc-library/assets/roof-181099.ifc',
  },
  {
    id: 'roof-187335',
    type: 'roof',
    roofShape: 'gable',
    name: 'IFC 지붕 187335',
    description: 'roof-187335.ifc에서 추출한 대형 상부 지붕 에셋',
    dimensions: '10239 x 1500 x 10379',
    lengthMm: 10239,
    heightMm: 1500,
    thicknessMm: 10379,
    color: '#E8808B',
    material: 'Tile',
    sourceAssetId: 'roof-187335',
    assetIfc: 'assets/roof-187335.ifc',
    assetIfcUrl: '/ifc-library/assets/roof-187335.ifc',
  },
  {
    id: 'exterior-wall-200',
    type: 'exterior-wall',
    name: '외벽 200T',
    description: '단열층을 포함한 기본 외벽',
    dimensions: '3200 x 2600 x 200',
    color: '#B9A58F',
  },
  {
    id: 'exterior-wall-brick',
    type: 'exterior-wall',
    name: '벽돌 외벽',
    description: '적벽돌 마감 외벽',
    dimensions: '3200 x 2600 x 220',
    color: '#9E5A45',
  },
  {
    id: 'wall-139029',
    type: 'exterior-wall',
    name: 'IFC 벽 139029',
    description: 'wall-139029.ifc에서 추출한 일반 200mm 벽 에셋',
    dimensions: '12000 x 2500 x 200',
    lengthMm: 12000,
    heightMm: 2500,
    thicknessMm: 200,
    color: '#DED9D9',
    material: 'Concrete',
    sourceAssetId: 'wall-139029',
    assetIfc: 'assets/wall-139029.ifc',
    assetIfcUrl: '/ifc-library/assets/wall-139029.ifc',
  },
  {
    id: 'interior-wall-100',
    type: 'interior-wall',
    name: '내벽 100T',
    description: '실내 공간 구획용 경량 벽체',
    dimensions: '2800 x 2400 x 100',
    color: '#D8DDE8',
  },
  {
    id: 'interior-wall-150',
    type: 'interior-wall',
    name: '차음 내벽 150T',
    description: '침실과 욕실 주변 차음 벽체',
    dimensions: '2800 x 2400 x 150',
    color: '#C7CEDA',
  },
  {
    id: 'window-fixed',
    type: 'window',
    name: '고정창',
    description: '채광용 고정 창호',
    dimensions: '1200 x 1200',
    color: '#8FD3FF',
  },
  {
    id: 'window-wide',
    type: 'window',
    name: '거실 와이드창',
    description: '거실 입면용 대형 창호',
    dimensions: '2400 x 1500',
    color: '#9BD5FF',
  },
  {
    id: 'window-189252',
    type: 'window',
    name: 'IFC 창 189252',
    description: 'window-189252.ifc에서 추출한 고정창 에셋',
    dimensions: '1900 x 2000 x 200',
    lengthMm: 1900,
    heightMm: 2000,
    thicknessMm: 200,
    color: '#8FD3FF',
    material: 'Glass',
    sourceAssetId: 'window-189252',
    assetIfc: 'assets/window-189252.ifc',
    assetIfcUrl: '/ifc-library/assets/window-189252.ifc',
  },
  {
    id: 'room-door-basic',
    type: 'room-door',
    name: '기본 방문',
    description: '침실과 방에 사용하는 900mm 문',
    dimensions: '900 x 2100',
    color: '#8B5E3C',
  },
  {
    id: 'room-door-sliding',
    type: 'room-door',
    name: '슬라이딩 방문',
    description: '공간 절약형 미닫이 방문',
    dimensions: '900 x 2100',
    color: '#A06A42',
  },
  {
    id: 'door-152970',
    type: 'room-door',
    name: 'IFC 문 152970',
    description: 'door-152970.ifc에서 추출한 단일 플러시 문 에셋',
    dimensions: '1067 x 2210 x 250',
    lengthMm: 1067,
    heightMm: 2210,
    thicknessMm: 250,
    color: '#A46744',
    material: 'Wood',
    sourceAssetId: 'door-152970',
    assetIfc: 'assets/door-152970.ifc',
    assetIfcUrl: '/ifc-library/assets/door-152970.ifc',
  },
  {
    id: 'front-door-steel',
    type: 'front-door',
    name: '현관 방화문',
    description: '주택 출입구용 방화 현관문',
    dimensions: '1100 x 2200',
    color: '#2F3A4A',
  },
  {
    id: 'front-door-glass',
    type: 'front-door',
    name: '유리 현관문',
    description: '채광이 있는 포치형 현관문',
    dimensions: '1200 x 2200',
    color: '#3F5268',
  },
  {
    id: 'stairs-straight',
    type: 'stairs',
    name: '직선 계단',
    description: '층간 이동용 기본 직선 계단',
    dimensions: '900 x 3200',
    color: '#A87952',
  },
  {
    id: 'stairs-l',
    type: 'stairs',
    name: 'ㄱ자 계단',
    description: '중간참이 있는 ㄱ자 계단',
    dimensions: '1800 x 2600',
    color: '#B78A60',
  },
  {
    id: 'stair-145090',
    type: 'stairs',
    name: 'IFC 계단 145090',
    description: 'stair-145090.ifc에서 추출한 조합 계단과 난간 에셋',
    dimensions: '1700 x 3039 x 2762',
    lengthMm: 1700,
    heightMm: 3039,
    thicknessMm: 2762,
    color: '#A8A29E',
    material: 'Concrete',
    sourceAssetId: 'stair-145090',
    assetIfc: 'assets/stair-145090.ifc',
    assetIfcUrl: '/ifc-library/assets/stair-145090.ifc',
  },
  {
    id: 'terrace',
    type: 'terrace',
    name: 'IFC 테라스',
    description: 'terrace.ifc에서 추출한 테라스 벽체와 바닥 에셋',
    dimensions: '6494 x 1620 x 1380',
    lengthMm: 6494,
    heightMm: 1620,
    thicknessMm: 1380,
    color: '#DED9D9',
    material: 'Concrete',
    sourceAssetId: 'terrace',
    assetIfc: 'assets/terrace.ifc',
    assetIfcUrl: '/ifc-library/assets/terrace.ifc',
  },
  {
    id: 'column-square',
    type: 'column',
    name: '사각 기둥',
    description: '구조 보강용 사각 기둥',
    dimensions: '300 x 300 x 2600',
    color: '#9CA3AF',
  },
  {
    id: 'column-round',
    type: 'column',
    name: '원형 기둥',
    description: '포치와 실내 장식용 원형 기둥',
    dimensions: 'D300 x 2600',
    color: '#AEB7C4',
  },
  {
    id: 'floor-wood',
    type: 'floor',
    name: '우드 바닥',
    description: '거실과 침실에 사용하는 목재 바닥',
    dimensions: '3200 x 2400 x 120',
    color: '#B8875B',
  },
  {
    id: 'floor-tile',
    type: 'floor',
    name: '타일 바닥',
    description: '현관과 욕실에 사용하는 타일 바닥',
    dimensions: '2400 x 1800 x 100',
    color: '#C8CDD6',
  },
  {
    id: 'ceiling-flat',
    type: 'ceiling',
    name: '평천장',
    description: '거실과 침실의 기본 마감 천장',
    dimensions: '4800 x 3600 x 100',
    lengthMm: 4800,
    heightMm: 100,
    thicknessMm: 3600,
    color: '#F0F0EC',
  },
  {
    id: 'ceiling-wood',
    type: 'ceiling',
    name: '우드 천장',
    description: '루버 목재 마감 천장',
    dimensions: '4800 x 3600 x 120',
    lengthMm: 4800,
    heightMm: 120,
    thicknessMm: 3600,
    color: '#C8A07A',
  },
  {
    id: 'furniture-sofa',
    type: 'furniture',
    name: '3인 소파',
    description: '거실용 패브릭 3인 소파',
    dimensions: '2100 x 850 x 780',
    lengthMm: 2100,
    heightMm: 780,
    thicknessMm: 850,
    color: '#8B8FA8',
    previewImageUrl: '/library-previews/presets/furniture-sofa.svg',
  },
  {
    id: 'furniture-dining-table',
    type: 'furniture',
    name: '식탁 (4인)',
    description: '4인용 직사각 식탁',
    dimensions: '1400 x 800 x 750',
    lengthMm: 1400,
    heightMm: 750,
    thicknessMm: 800,
    color: '#A07850',
    previewImageUrl: '/library-previews/presets/furniture-dining-table.svg',
  },
  {
    id: 'furniture-bed-double',
    type: 'furniture',
    name: '더블 침대',
    description: '안방용 더블 침대',
    dimensions: '1600 x 2000 x 500',
    lengthMm: 1600,
    heightMm: 500,
    thicknessMm: 2000,
    color: '#C8B8A8',
    previewImageUrl: '/library-previews/presets/furniture-bed-double.svg',
  },
  {
    id: 'furniture-wardrobe',
    type: 'furniture',
    name: '붙박이장',
    description: '침실용 빌트인 수납장',
    dimensions: '1800 x 2200 x 600',
    lengthMm: 1800,
    heightMm: 2200,
    thicknessMm: 600,
    color: '#E8E0D0',
    previewImageUrl: '/library-previews/presets/furniture-wardrobe.svg',
  },
]

// ─────────────────────────────────────────────
// 미리보기 SVG data URI 생성
// ─────────────────────────────────────────────

/**
 * 프리셋의 SVG 인라인 미리보기 data URI를 생성한다.
 * previewImageUrl이 없거나 로드에 실패할 때 fallback으로 사용된다.
 *
 * @param preset - id와 type을 포함한 프리셋 객체
 * @returns data:image/svg+xml;charset=UTF-8,... 형태의 data URI
 */
export const buildPresetPreviewDataUri = (preset: Pick<ThreeDLibraryPreset, 'id' | 'type'>): string => {
  const shapeMarkup = PREVIEW_SHAPE_BY_PRESET_ID[preset.id] ?? PREVIEW_SHAPE_BY_TYPE[preset.type]
  const presetTheme = PRESET_THEME_BY_ID[preset.id]
  const shapeFill = presetTheme?.shapeFill ?? SHAPE_FILL_BY_TYPE[preset.type]
  const bgStart = presetTheme?.bgStart ?? '#BEC4CC'
  const bgEnd = presetTheme?.bgEnd ?? '#8E96A4'
  // 그라디언트 id는 알파벳·숫자만 허용 (SVG 명세)
  const gid = `g${preset.id.replace(/[^a-z0-9]/gi, '')}`

  const encodedSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 128 96">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgStart}"/>
          <stop offset="100%" stop-color="${bgEnd}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="96" rx="18" fill="url(#${gid})" />
      <g fill="${shapeFill}" style="color:${shapeFill}">
        ${shapeMarkup}
      </g>
    </svg>`,
  )

  return `data:image/svg+xml;charset=UTF-8,${encodedSvg}`
}
