import type { Object3D } from 'three'
import type { ThreeDLibraryPreset } from '../ThreeDLibraryPanel'

export type ThreeModule = typeof import('three')

export const PROJECT_WORLD_UNITS_PER_MM = 0.001

export const DEFAULT_LIBRARY_MATERIAL_BY_TYPE: Record<ThreeDLibraryPreset['type'], string> = {
  roof: 'Tile',
  'exterior-wall': 'Brick',
  'interior-wall': 'Concrete',
  window: 'Glass',
  'room-door': 'Wood',
  'front-door': 'Steel',
  stairs: 'Concrete',
  column: 'Stone',
  floor: 'Concrete',
}

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

export const isEditorMaterial = (material?: string) => (
  Boolean(material && MATERIAL_VISUAL_STYLE[material])
)

const normalizeVisualMaterialName = (material?: string) => {
  const normalizedMaterial = normalizeMaterialNameForEditor(material)
  return isEditorMaterial(normalizedMaterial) ? normalizedMaterial as string : 'Concrete'
}

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

export const createElementMaterial = (
  THREE: ThreeModule,
  materialName?: string,
  color?: string,
) => {
  const style = MATERIAL_VISUAL_STYLE[normalizeVisualMaterialName(materialName)]
  return new THREE.MeshStandardMaterial({
    color: color ?? style?.color ?? '#BEC4D1',
    map: createMaterialTexture(THREE, materialName),
    metalness: style?.metalness ?? 0,
    roughness: style?.roughness ?? 0.55,
    transparent: typeof style?.opacity === 'number',
    opacity: style?.opacity ?? 1,
  })
}

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

export const applyObjectMaterial = (
  THREE: ThreeModule,
  object: Object3D | null,
  materialName?: string,
  color?: string,
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
    child.material = createElementMaterial(THREE, materialName, color)
  })
}
