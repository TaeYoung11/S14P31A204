/**
 * ifcMaterials — IFC/라이브러리 요소 재질 생성 및 적용 유틸
 *
 * Three.js MeshPhysicalMaterial 기반으로 건축 재질(콘크리트, 벽돌, 강재 등)을
 * 시각적으로 표현한다. thatopen MaterialsManager가 제공되면 재질 등록을 연동하고,
 * 미지원 환경에서는 기존 로컬 재질 생성 플로우로 폴백한다.
 */
import type { Object3D } from 'three'
import type { ThreeDLibraryPreset } from '../threeDLibrary.types'

/** Three.js 모듈 타입 단축 alias */
export type ThreeModule = typeof import('three')
type ThatOpenMaterialsList = {
  set: (key: number, value: unknown) => unknown
  has?: (key: number) => boolean
}
export type MaybeThatOpenMaterialsManager = {
  list?: ThatOpenMaterialsList
  [key: string]: unknown
} | null | undefined

/** 프로젝트 기본 월드 단위 비율: 1mm = 0.001 three.js unit */
export const PROJECT_WORLD_UNITS_PER_MM = 0.001

/** 라이브러리 타입별 기본 재질 이름 */
export const DEFAULT_LIBRARY_MATERIAL_BY_TYPE: Record<ThreeDLibraryPreset['type'], string> = {
  roof: 'Tile',
  'exterior-wall': 'Brick',
  'interior-wall': 'Concrete',
  window: 'Glass',
  'room-door': 'Wood',
  'front-door': 'Steel',
  stairs: 'Concrete',
  terrace: 'Concrete',
  column: 'Stone',
  floor: 'Concrete',
  ceiling: 'Concrete',
  furniture: 'Wood',
}

/** IFC 카테고리별 기본 표시 색상 (HEX). 재질이 지정되지 않은 요소에 적용된다. */
export const DEFAULT_IFC_COLOR_BY_CATEGORY: Record<string, string> = {
  Roof: '#5B6475',
  Slab: '#B8875B',
  Wall: '#B9A58F',
  Window: '#8FD3FF',
  Door: '#8B5E3C',
  Stair: '#9CA3AF',
  Column: '#9CA3AF',
  Beam: '#9CA3AF',
  Space: '#D8DDE8',
  Element: '#D8DDE8',
}

const MATERIAL_VISUAL_STYLE: Record<string, {
  color: string
  roughness: number
  metalness: number
  opacity?: number
  pattern?: 'noise' | 'brick' | 'grain' | 'speckle' | 'tile'
}> = {
  Concrete: { color: '#A8A29E', roughness: 0.92, metalness: 0, pattern: 'noise' },
  Brick: { color: '#A3472C', roughness: 0.86, metalness: 0, pattern: 'brick' },
  Steel: { color: '#8A94A3', roughness: 0.28, metalness: 0.85 },
  Wood: { color: '#9A6232', roughness: 0.58, metalness: 0, pattern: 'grain' },
  Glass: { color: '#8FD3FF', roughness: 0.08, metalness: 0, opacity: 0.38 },
  Stone: { color: '#8D8D86', roughness: 0.82, metalness: 0, pattern: 'speckle' },
  Tile: { color: '#C56F45', roughness: 0.48, metalness: 0, pattern: 'tile' },
}

/**
 * 임의 문자열 재질명을 에디터 재질명으로 정규화한다.
 * IFC 파일에 포함된 영문/한문 재질 문자열도 인식한다.
 */
export const normalizeMaterialNameForEditor = (material?: string) => {
  const value = material?.trim()
  if (!value) return undefined
  if (MATERIAL_VISUAL_STYLE[value]) return value

  const lowerValue = value.toLowerCase()
  if (lowerValue.includes('concrete')) return 'Concrete'
  if (lowerValue.includes('brick')) return 'Brick'
  if (lowerValue.includes('steel') || lowerValue.includes('metal')) return 'Steel'
  if (lowerValue.includes('wood') || lowerValue.includes('timber')) return 'Wood'
  if (lowerValue.includes('glass')) return 'Glass'
  if (lowerValue.includes('stone')) return 'Stone'
  if (lowerValue.includes('tile')) return 'Tile'

  return value
}

/** 에디터가 시각 스타일을 지원하는 재질인지 확인한다. */
export const isEditorMaterial = (material?: string) => (
  Boolean(material && MATERIAL_VISUAL_STYLE[material])
)

const normalizeVisualMaterialName = (material?: string) => {
  const normalizedMaterial = normalizeMaterialNameForEditor(material)
  return isEditorMaterial(normalizedMaterial) ? normalizedMaterial as string : 'Concrete'
}

/** 재질 이름에 대응하는 기본 HEX 색상을 반환한다. */
export const getMaterialDefaultColor = (material?: string) => (
  MATERIAL_VISUAL_STYLE[normalizeVisualMaterialName(material)].color
)

const createMaterialTexture = (
  THREE: ThreeModule,
  materialName?: string,
) => {
  const style = MATERIAL_VISUAL_STYLE[normalizeVisualMaterialName(materialName)]
  if (!style?.pattern || typeof document === 'undefined') return undefined

  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return undefined

  context.fillStyle = style.color
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (style.pattern === 'brick') {
    context.strokeStyle = 'rgba(255,255,255,0.28)'
    context.lineWidth = 4
    for (let y = 0; y <= 128; y += 32) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(128, y)
      context.stroke()
      for (let x = y % 64 === 0 ? 0 : -32; x <= 128; x += 64) {
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x, y + 32)
        context.stroke()
      }
    }
  } else if (style.pattern === 'grain') {
    context.strokeStyle = 'rgba(80,40,16,0.32)'
    context.lineWidth = 3
    for (let y = 12; y < 128; y += 18) {
      context.beginPath()
      context.moveTo(0, y)
      context.bezierCurveTo(38, y - 10, 72, y + 10, 128, y - 4)
      context.stroke()
    }
  } else if (style.pattern === 'tile') {
    context.strokeStyle = 'rgba(255,255,255,0.35)'
    context.lineWidth = 4
    for (let y = 0; y <= 128; y += 42) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(128, y)
      context.stroke()
    }
    for (let x = 0; x <= 128; x += 42) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, 128)
      context.stroke()
    }
  } else {
    for (let index = 0; index < 220; index += 1) {
      const alpha = style.pattern === 'noise' ? 0.16 : 0.28
      context.fillStyle = `rgba(255,255,255,${Math.random() * alpha})`
      context.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 4)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  return texture
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
)

const isThatOpenMaterialsList = (value: unknown): value is ThatOpenMaterialsList => (
  isRecord(value) && typeof value.set === 'function'
)

const toStableManagerMaterialId = (key: string) => {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0
  }
  return hash === 0 ? -1 : hash
}

const registerMaterialWithManager = (
  manager: MaybeThatOpenMaterialsManager,
  key: string,
  material: unknown,
) => {
  if (!isRecord(manager)) return

  // @thatopen/fragments 3.4.x: fragments.core.models.materials.list.set(...)
  const strictList = manager.list
  if (isThatOpenMaterialsList(strictList)) {
    const materialId = toStableManagerMaterialId(key)
    if (strictList.has?.(materialId)) return
    try {
      strictList.set(materialId, material)
      return
    } catch {
      // strict 경로 실패 시 아래 레거시 폴백으로 진행
    }
  }

  const registerWithMethod = (
    methodName: 'add' | 'set' | 'addMaterial' | 'register',
  ) => {
    const method = manager[methodName]
    if (typeof method !== 'function') return false
    try {
      ;(method as (name: string, value: unknown) => unknown).call(manager, key, material)
      return true
    } catch {
      return false
    }
  }

  if (registerWithMethod('add')) return
  if (registerWithMethod('set')) return
  if (registerWithMethod('addMaterial')) return
  if (registerWithMethod('register')) return

  const listCandidate = manager.list
  if (isRecord(listCandidate) && typeof listCandidate.set === 'function') {
    try {
      ;(listCandidate.set as unknown as (name: unknown, value: unknown) => unknown).call(listCandidate, key, material)
      return
    } catch {
      // no-op
    }
  }

  if (isRecord(listCandidate)) {
    const listRecord = listCandidate as Record<string, unknown>
    if (!(key in listRecord)) {
      listRecord[key] = material
    }
  }
}

/**
 * 재질 이름과 색상으로 MeshPhysicalMaterial을 생성한다.
 * - 재질에 대응하는 캔버스 텍스처(패턴)를 생성해 map으로 설정한다.
 * - color가 지정되면 재질 기본 색상을 덮어쓴다.
 * - thatopen MaterialsManager가 있으면 생성 재질을 등록한다.
 */
export const createElementMaterial = (
  THREE: ThreeModule,
  materialName?: string,
  color?: string,
  materialsManager?: MaybeThatOpenMaterialsManager,
) => {
  const style = MATERIAL_VISUAL_STYLE[normalizeVisualMaterialName(materialName)]
  const isGlassLike = style?.opacity !== undefined && style.opacity < 1
  const texture = createMaterialTexture(THREE, materialName)
  const materialParameters: import('three').MeshPhysicalMaterialParameters = {
    color: color ?? style?.color ?? '#BEC4D1',
    metalness: style?.metalness ?? 0,
    roughness: style?.roughness ?? 0.55,
    transparent: typeof style?.opacity === 'number',
    opacity: style?.opacity ?? 1,
    transmission: isGlassLike ? 0.2 : 0,
    ior: isGlassLike ? 1.45 : 1.5,
    thickness: isGlassLike ? 0.02 : 0,
    clearcoat: isGlassLike ? 0.05 : 0,
    clearcoatRoughness: isGlassLike ? 0.1 : 0,
  }
  if (texture) {
    materialParameters.map = texture
  }
  const material = new THREE.MeshPhysicalMaterial(materialParameters)
  const managerKey = `editor-${normalizeVisualMaterialName(materialName)}-${color ?? 'default'}`
  registerMaterialWithManager(materialsManager, managerKey, material)
  return material
}

/** 오브젝트의 모든 메시 재질 색상을 변경한다. */
export const applyObjectColor = (THREE: ThreeModule, object: Object3D | null, color?: string) => {
  if (!object || !color) return

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return

    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      const colorTarget = (material as { color?: { set: (value: string) => void } }).color
      if (!colorTarget) return
      colorTarget.set(color)
      ;(material as { needsUpdate?: boolean }).needsUpdate = true
    })
  })
}

/**
 * 오브젝트의 모든 메시 재질을 교체한다.
 * 기존 재질의 텍스처를 먼저 dispose한 후 새 재질을 생성해 할당한다.
 */
export const applyObjectMaterial = (
  THREE: ThreeModule,
  object: Object3D | null,
  materialName?: string,
  color?: string,
  materialsManager?: MaybeThatOpenMaterialsManager,
) => {
  if (!object || !materialName) return

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return

    const previousMaterials = Array.isArray(child.material) ? child.material : [child.material]
    previousMaterials.forEach((material) => {
      const map = (material as { map?: { dispose?: () => void } }).map
      map?.dispose?.()
      material.dispose()
    })
    child.material = createElementMaterial(THREE, materialName, color, materialsManager)
  })
}
