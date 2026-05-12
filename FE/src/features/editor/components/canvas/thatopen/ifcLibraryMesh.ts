/**
 * ifcLibraryMesh — 3D 라이브러리 프리셋 메시 생성 및 메타데이터 관리
 *
 * 라이브러리 패널에서 선택된 프리셋을 Three.js Group으로 생성하고,
 * userData에 프리셋 정보·기본 치수·월드 크기를 저장해 편집 시 참조할 수 있도록 한다.
 */
import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import type { IfcElementInfo } from '../../../types'
import type { ThreeDLibraryPreset } from '../threeDLibrary.types'
import {
  DEFAULT_LIBRARY_MATERIAL_BY_TYPE,
  PROJECT_WORLD_UNITS_PER_MM,
  createElementMaterial,
  getMaterialDefaultColor,
  type MaybeThatOpenMaterialsManager,
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
  ceiling: 'Ceiling',
  furniture: 'Furniture',
}

const resolveRoofShape = (preset: ThreeDLibraryPreset): 'flat' | 'gable' => {
  if (preset.roofShape === 'flat' || preset.roofShape === 'gable') return preset.roofShape
  return preset.id.includes('gable') ? 'gable' : 'flat'
}

/**
 * 프리셋의 dimensions 문자열 또는 직접 지정된 치수값을 파싱해 mm 단위 크기를 반환한다.
 * 타입별로 치수 해석 방식이 다르다 (예: column은 높이가 세 번째 값).
 */
export const parsePresetDimensions = (preset: ThreeDLibraryPreset) => {
  const values = preset.dimensions.match(/\d+/g)?.map(Number) ?? []

  if (preset.type === 'roof') {
    const roofShape = resolveRoofShape(preset)
    return {
      lengthMm: preset.lengthMm ?? values[0],
      heightMm: preset.heightMm ?? (roofShape === 'gable' ? 1200 : 240),
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

/**
 * 클릭된 오브젝트에서 presetGroup의 직접 자식(라이브러리 루트)을 찾아 반환한다.
 * 부모 체인을 타고 올라가며 presetGroup에 직접 속한 노드를 찾는다.
 */
export const findLibraryRoot = (object: Object3D, presetGroup: import('three').Group): LibraryObject3D | null => {
  let cursor: LibraryObject3D | null = object as LibraryObject3D
  while (cursor) {
    if (cursor.parent === presetGroup) return cursor
    cursor = (cursor.parent ?? null) as LibraryObject3D | null
  }
  return null
}

/**
 * 라이브러리 오브젝트의 userData에서 IfcElementInfo 형태의 정보를 추출한다.
 * 어트리뷰트 패널에서 라이브러리 요소를 IFC 요소와 동일한 방식으로 표시할 때 사용한다.
 */
export const getLibraryElementInfo = (object: LibraryObject3D): IfcElementInfo | null => {
  const preset = object.userData?.libraryPreset
  if (!preset) return null
  const { lengthMm, heightMm, thicknessMm } = parsePresetDimensions(preset)
  const material = preset.material ?? DEFAULT_LIBRARY_MATERIAL_BY_TYPE[preset.type]
  const category = CATEGORY_BY_LIBRARY_TYPE[preset.type]
  const worldPosition = new Vector3()
  const worldQuaternion = new Quaternion()
  const worldRotation = new Euler()
  object.getWorldPosition(worldPosition)
  object.getWorldQuaternion(worldQuaternion)
  worldRotation.setFromQuaternion(worldQuaternion, 'XYZ')

  return {
    // 패널/선택 동기화는 preset id를 기준으로 유지해야 재생성 후에도 안정적이다.
    id: preset.id,
    name: preset.name,
    ifcClass: 'LibraryPreset',
    category,
    source: 'library',
    roofShape: preset.type === 'roof' ? resolveRoofShape(preset) : undefined,
    lengthMm,
    heightMm,
    thicknessMm,
    positionX: worldPosition.x,
    positionY: worldPosition.y,
    positionZ: worldPosition.z,
    rotationX: (worldRotation.x * 180) / Math.PI,
    rotationY: (worldRotation.y * 180) / Math.PI,
    rotationZ: (worldRotation.z * 180) / Math.PI,
    color: preset.color ?? getMaterialDefaultColor(material),
    material,
    properties: {
      Category: category,
      Type: preset.type,
      RoofShape: preset.type === 'roof' ? resolveRoofShape(preset) : '-',
      Length: lengthMm ?? '-',
      Height: heightMm ?? '-',
      Thickness: thicknessMm ?? '-',
      PositionX: Number(worldPosition.x.toFixed(3)),
      PositionY: Number(worldPosition.y.toFixed(3)),
      PositionZ: Number(worldPosition.z.toFixed(3)),
      RotationX: Number((((worldRotation.x * 180) / Math.PI)).toFixed(2)),
      RotationY: Number((((worldRotation.y * 180) / Math.PI)).toFixed(2)),
      RotationZ: Number((((worldRotation.z * 180) / Math.PI)).toFixed(2)),
      Color: preset.color ?? getMaterialDefaultColor(material),
      Material: material,
    },
  }
}

/**
 * 프리셋 데이터를 기반으로 Three.js Group 메시를 생성한다.
 * - 프리셋 타입에 따라 기하학적 형태(박스, 실린더, 커스텀)를 구성한다.
 * - 생성된 그룹에 치수 스케일을 적용하고 격자 배치(column, row)로 위치를 설정한다.
 * - userData에 libraryPreset, libraryBaseDimensions, libraryBaseWorldSize를 저장한다.
 */
export const createPresetMesh = (
  THREE: ThreeModule,
  preset: ThreeDLibraryPreset,
  index: number,
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
  materialsManager?: MaybeThatOpenMaterialsManager,
) => {
  const group = new THREE.Group()
  const parsedDimensions = parsePresetDimensions(preset)
  const presetMaterial = preset.material ?? DEFAULT_LIBRARY_MATERIAL_BY_TYPE[preset.type]
  const material = createElementMaterial(THREE, presetMaterial, preset.color, materialsManager)
  const darkMaterial = createElementMaterial(THREE, 'Steel', '#1F2937', materialsManager)
  darkMaterial.roughness = 0.5
  darkMaterial.metalness = 0.75
  darkMaterial.needsUpdate = true
  const glassMaterial = createElementMaterial(THREE, 'Glass', '#8FD3FF', materialsManager)
  glassMaterial.opacity = 0.45
  glassMaterial.transparent = true
  glassMaterial.roughness = 0.2
  glassMaterial.needsUpdate = true

  const roofShape = preset.type === 'roof' ? resolveRoofShape(preset) : undefined
  if (roofShape === 'gable') {
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
  } else if (preset.type === 'ceiling') {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.1), material))
  } else if (preset.type === 'furniture') {
    if (preset.id.includes('sofa')) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.9), material)
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.22), material)
      const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.9), material)
      const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.9), material)
      back.position.set(0, 0.42, -0.34)
      armLeft.position.set(-0.94, 0, 0)
      armRight.position.set(0.94, 0, 0)
      group.add(seat, back, armLeft, armRight)
    } else if (preset.id.includes('dining-table')) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), material)
      const legGeometry = new THREE.BoxGeometry(0.08, 0.68, 0.08)
      const legOffsets: Array<[number, number]> = [
        [-0.62, -0.32],
        [0.62, -0.32],
        [-0.62, 0.32],
        [0.62, 0.32],
      ]
      const legs = legOffsets.map(([x, z]) => {
        const leg = new THREE.Mesh(legGeometry, darkMaterial)
        leg.position.set(x, -0.38, z)
        return leg
      })
      group.add(top, ...legs)
    } else if (preset.id.includes('bed')) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 2.0), material)
      const pillowMaterial = createElementMaterial(THREE, 'Concrete', '#F6F5F3', materialsManager)
      pillowMaterial.roughness = 0.9
      pillowMaterial.metalness = 0
      pillowMaterial.needsUpdate = true
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.4), pillowMaterial)
      pillow.position.set(0, 0.2, -0.72)
      group.add(frame, pillow)
    } else if (preset.id.includes('wardrobe')) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.6), material)
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.0, 0.62), darkMaterial)
      line.position.set(0, 0, 0)
      group.add(body, line)
    } else {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.8), material))
    }
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
  if (preset.rotation) {
    group.rotation.set(preset.rotation.x, preset.rotation.y, preset.rotation.z)
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

/** 라이브러리 오브젝트의 userData에서 ThreeDLibraryPreset을 꺼낸다. */
export const getLibraryPresetFromObject = (object: LibraryObject3D) => object.userData?.libraryPreset

/**
 * 오브젝트 트리 전체를 순회하며 libraryPreset userData를 patch로 업데이트한다.
 * 색상·재질·치수 변경 시 씬 오브젝트와 React 상태를 동기화하는 데 사용된다.
 */
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

/**
 * 라이브러리 루트 오브젝트의 현재 스케일을 mm 치수 패치로 변환한다.
 * TransformControls Scale 드래그 결과를 상태에 영속화할 때 사용한다.
 */
export const getLibraryScaleDimensionPatch = (
  object: LibraryObject3D,
  worldUnitsPerMm = PROJECT_WORLD_UNITS_PER_MM,
): Pick<ThreeDLibraryPreset, 'lengthMm' | 'heightMm' | 'thicknessMm'> | null => {
  if (!(worldUnitsPerMm > 0)) return null
  const baseWorldSize = object.userData?.libraryBaseWorldSize
  if (!baseWorldSize) return null

  const lengthMm = Math.round((object.scale.x * baseWorldSize.x) / worldUnitsPerMm)
  const heightMm = Math.round((object.scale.y * baseWorldSize.y) / worldUnitsPerMm)
  const thicknessMm = Math.round((object.scale.z * baseWorldSize.z) / worldUnitsPerMm)

  if (!Number.isFinite(lengthMm) || !Number.isFinite(heightMm) || !Number.isFinite(thicknessMm)) {
    return null
  }

  return {
    lengthMm: Math.max(1, lengthMm),
    heightMm: Math.max(1, heightMm),
    thicknessMm: Math.max(1, thicknessMm),
  }
}
