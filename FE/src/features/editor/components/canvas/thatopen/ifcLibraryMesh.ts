import type { Object3D } from 'three'
import type { IfcElementInfo } from '../../../types'
import type { ThreeDLibraryPreset } from '../ThreeDLibraryPanel'
import {
  DEFAULT_LIBRARY_MATERIAL_BY_TYPE,
  PROJECT_WORLD_UNITS_PER_MM,
  createElementMaterial,
  getMaterialDefaultColor,
  type ThreeModule,
} from './ifcMaterials'

export type LibraryObject3D = Object3D & {
  uuid?: string
  parent?: Object3D | null
  userData?: {
    libraryPreset?: ThreeDLibraryPreset
    libraryBaseDimensions?: {
      lengthMm?: number
      heightMm?: number
      thicknessMm?: number
    }
    libraryBaseWorldSize?: {
      x: number
      y: number
      z: number
    }
    [key: string]: unknown
  }
}

const CATEGORY_BY_LIBRARY_TYPE: Record<ThreeDLibraryPreset['type'], string> = {
  roof: 'Roof',
  'exterior-wall': 'Exterior wall',
  'interior-wall': 'Interior wall',
  window: 'Window',
  'room-door': 'Room door',
  'front-door': 'Front door',
  stairs: 'Stairs',
  column: 'Column',
  floor: 'Floor',
}

export const parsePresetDimensions = (preset: ThreeDLibraryPreset) => {
  const values = preset.dimensions.match(/\d+/g)?.map(Number) ?? []

  if (preset.type === 'roof') {
    return {
      lengthMm: preset.lengthMm ?? values[0],
      heightMm: preset.heightMm ?? (preset.id.includes('gable') ? 1200 : 240),
      thicknessMm: preset.thicknessMm ?? values[1],
    }
  }

  if (preset.type === 'window') {
    return {
      lengthMm: preset.lengthMm ?? values[0],
      heightMm: preset.heightMm ?? values[1],
      thicknessMm: preset.thicknessMm ?? 120,
    }
  }

  if (preset.type === 'room-door' || preset.type === 'front-door') {
    return {
      lengthMm: preset.lengthMm ?? values[0],
      heightMm: preset.heightMm ?? values[1],
      thicknessMm: preset.thicknessMm ?? (preset.type === 'front-door' ? 180 : 120),
    }
  }

  if (preset.type === 'stairs') {
    return {
      lengthMm: preset.lengthMm ?? values[0],
      heightMm: preset.heightMm ?? 900,
      thicknessMm: preset.thicknessMm ?? values[1],
    }
  }

  if (preset.type === 'column') {
    return {
      lengthMm: preset.lengthMm ?? values[0],
      heightMm: preset.heightMm ?? values[2] ?? values[1],
      thicknessMm: preset.thicknessMm ?? values[1] ?? values[0],
    }
  }

  return {
    lengthMm: preset.lengthMm ?? values[0],
    heightMm: preset.heightMm ?? values[1],
    thicknessMm: preset.thicknessMm ?? values[2],
  }
}

const getPresetWorldScale = (
  presetDimensions: ReturnType<typeof parsePresetDimensions>,
  baseWorldSize: { x: number; y: number; z: number },
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
) => ({
  x: presetDimensions.lengthMm
    ? (presetDimensions.lengthMm * worldUnitsPerMm) / baseWorldSize.x
    : 1,
  y: presetDimensions.heightMm
    ? (presetDimensions.heightMm * worldUnitsPerMm) / baseWorldSize.y
    : 1,
  z: presetDimensions.thicknessMm
    ? (presetDimensions.thicknessMm * worldUnitsPerMm) / baseWorldSize.z
    : 1,
})

export const findLibraryRoot = (object: Object3D, presetGroup: import('three').Group): LibraryObject3D | null => {
  let cursor: LibraryObject3D | null = object as LibraryObject3D
  while (cursor) {
    if (cursor.parent === presetGroup) return cursor
    cursor = (cursor.parent ?? null) as LibraryObject3D | null
  }
  return null
}

export const getLibraryElementInfo = (object: LibraryObject3D): IfcElementInfo | null => {
  const preset = object.userData?.libraryPreset
  if (!preset) return null
  const { lengthMm, heightMm, thicknessMm } = parsePresetDimensions(preset)
  const material = preset.material ?? DEFAULT_LIBRARY_MATERIAL_BY_TYPE[preset.type]
  const category = CATEGORY_BY_LIBRARY_TYPE[preset.type]

  return {
    id: object.uuid ?? preset.id,
    name: preset.name,
    ifcClass: 'LibraryPreset',
    category,
    source: 'library',
    lengthMm,
    heightMm,
    thicknessMm,
    color: preset.color ?? getMaterialDefaultColor(material),
    material,
    properties: {
      Category: category,
      Type: preset.type,
      Length: lengthMm ?? '-',
      Height: heightMm ?? '-',
      Thickness: thicknessMm ?? '-',
      Color: preset.color ?? getMaterialDefaultColor(material),
      Material: material,
    },
  }
}

export const createPresetMesh = (
  THREE: ThreeModule,
  preset: ThreeDLibraryPreset,
  index: number,
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
) => {
  const group = new THREE.Group()
  const parsedDimensions = parsePresetDimensions(preset)
  const presetMaterial = preset.material ?? DEFAULT_LIBRARY_MATERIAL_BY_TYPE[preset.type]
  const material = createElementMaterial(THREE, presetMaterial, preset.color)
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#1F2937', roughness: 0.5 })
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: '#8FD3FF',
    transparent: true,
    opacity: 0.45,
    roughness: 0.2,
  })

  if (preset.id.includes('gable')) {
    const geometryConstructors = THREE as unknown as {
      BufferGeometry: new () => {
        setAttribute: (name: string, attribute: unknown) => void
        setIndex: (index: number[]) => void
        computeVertexNormals: () => void
      }
      Float32BufferAttribute: new (array: number[], itemSize: number) => unknown
    }
    const length = (parsedDimensions.lengthMm ?? 7000) * worldUnitsPerMm
    const height = (parsedDimensions.heightMm ?? 1200) * worldUnitsPerMm
    const thickness = (parsedDimensions.thicknessMm ?? 6000) * worldUnitsPerMm
    const halfLength = length / 2
    const halfThickness = thickness / 2
    const roofGeometry = new geometryConstructors.BufferGeometry()
    roofGeometry.setAttribute(
      'position',
      new geometryConstructors.Float32BufferAttribute([
        -halfLength, 0, -halfThickness,
        halfLength, 0, -halfThickness,
        0, height, -halfThickness,
        -halfLength, 0, halfThickness,
        halfLength, 0, halfThickness,
        0, height, halfThickness,
      ], 3),
    )
    roofGeometry.setIndex([
      0, 1, 2,
      3, 5, 4,
      0, 3, 4,
      0, 4, 1,
      1, 4, 5,
      1, 5, 2,
      2, 5, 3,
      2, 3, 0,
    ])
    roofGeometry.computeVertexNormals()
    const MeshConstructor = THREE.Mesh as unknown as new (geometry: unknown, material: unknown) => Object3D
    const roof = new MeshConstructor(roofGeometry, material)
    group.add(roof)
  } else if (preset.type === 'roof') {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.24, 2.8), material))
  } else if (preset.type === 'exterior-wall') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 0.24), material)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.3), darkMaterial)
    trim.position.y = -1.0
    group.add(wall, trim)
  } else if (preset.type === 'interior-wall') {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.14), material))
  } else if (preset.type === 'window') {
    const frameH = new THREE.BoxGeometry(1.9, 0.1, 0.12)
    const frameV = new THREE.BoxGeometry(0.1, 1.2, 0.12)
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.88, 0.05), glassMaterial)
    const top = new THREE.Mesh(frameH, darkMaterial)
    const bottom = new THREE.Mesh(frameH, darkMaterial)
    const left = new THREE.Mesh(frameV, darkMaterial)
    const right = new THREE.Mesh(frameV, darkMaterial)
    top.position.y = 0.6
    bottom.position.y = -0.6
    left.position.x = -0.95
    right.position.x = 0.95
    group.add(pane, top, bottom, left, right)
  } else if (preset.type === 'room-door') {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.12), material)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8), darkMaterial)
    knob.position.set(0.32, 0, 0.09)
    group.add(door, knob)
  } else if (preset.type === 'front-door') {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.18), material)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), darkMaterial)
    handle.position.set(0.42, 0, 0.13)
    group.add(door, handle)
  } else if (preset.type === 'stairs') {
    for (let step = 0; step < 5; step += 1) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.45), material)
      stair.position.set(0, -0.45 + step * 0.18, -0.8 + step * 0.36)
      group.add(stair)
    }
  } else if (preset.type === 'column') {
    const column = preset.id.includes('round')
      ? new THREE.CylinderGeometry(0.22, 0.22, 2.2, 24)
      : new THREE.BoxGeometry(0.38, 2.2, 0.38)
    group.add(new THREE.Mesh(column, material))
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 2.1), material))
  }

  group.name = preset.name
  const objectSize = new THREE.Vector3()
  new THREE.Box3().setFromObject(group).getSize(objectSize)
  const baseDimensions = {
    lengthMm: parsedDimensions.lengthMm ?? Math.round(objectSize.x * 1000),
    heightMm: parsedDimensions.heightMm ?? Math.round(objectSize.y * 1000),
    thicknessMm: parsedDimensions.thicknessMm ?? Math.round(objectSize.z * 1000),
  }
  const baseWorldSize = {
    x: objectSize.x || 1,
    y: objectSize.y || 1,
    z: objectSize.z || 1,
  }
  const worldScale = getPresetWorldScale(parsedDimensions, baseWorldSize, worldUnitsPerMm)
  const column = index % 3
  const row = Math.floor(index / 3)
  const visualLength = (baseDimensions.lengthMm ?? 2600) * worldUnitsPerMm
  const visualThickness = (baseDimensions.thicknessMm ?? 1400) * worldUnitsPerMm
  const spacingX = Math.max(visualLength + 700 * worldUnitsPerMm, 1800 * worldUnitsPerMm)
  const spacingZ = Math.max(visualThickness + 700 * worldUnitsPerMm, 1800 * worldUnitsPerMm)
  group.scale.set(worldScale.x, worldScale.y, worldScale.z)
  const scaledBox = new THREE.Box3().setFromObject(group)
  const scaledCenter = new THREE.Vector3()
  const scaledSize = new THREE.Vector3()
  scaledBox.getCenter(scaledCenter)
  scaledBox.getSize(scaledSize)
  group.position.set(
    column * spacingX,
    -(scaledCenter.y - scaledSize.y / 2),
    -row * spacingZ,
  )
  if (preset.position) {
    group.position.set(preset.position.x, preset.position.y, preset.position.z)
  }
  ;(group as LibraryObject3D).userData = {
    ...(group as LibraryObject3D).userData,
    libraryPreset: preset,
    libraryBaseDimensions: baseDimensions,
    libraryBaseWorldSize: baseWorldSize,
  }
  group.traverse((child) => {
    ;(child as LibraryObject3D).userData = {
      ...(child as LibraryObject3D).userData,
      libraryPreset: preset,
      libraryBaseDimensions: baseDimensions,
      libraryBaseWorldSize: baseWorldSize,
    }
  })

  return group
}

export const getLibraryPresetFromObject = (object: LibraryObject3D) => object.userData?.libraryPreset

export const updateLibraryPresetData = (
  object: Object3D,
  patch: Partial<ThreeDLibraryPreset>,
) => {
  object.traverse((child) => {
    const libraryObject = child as LibraryObject3D
    const preset = libraryObject.userData?.libraryPreset
    if (!preset) return
    libraryObject.userData = {
      ...libraryObject.userData,
      libraryPreset: {
        ...preset,
        ...patch,
      },
    }
  })
}
