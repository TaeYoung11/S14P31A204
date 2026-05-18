import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import type { IfcElementInfo } from '../../types'

type ElementLike = Pick<IfcElementInfo, 'ifcClass' | 'category'>

type FloorPlanElementMeta = {
  id: string
  name: string
  ifcClass: string
  category: string
  roofShape?: 'flat' | 'gable'
  lengthMm?: number
  heightMm?: number
  thicknessMm?: number
  properties?: IfcElementInfo['properties']
}

const FLOOR_PLAN_WORLD_UNITS_PER_MM = 0.001

const SELECTABLE_CATEGORY_KEYS = new Set([
  'space',
  'room',
  'wall',
  'exterior wall',
  'interior wall',
  'window',
  'door',
  'opening',
  'room door',
  'front door',
  'roof',
  'ceiling',
  'floor',
  'slab',
  'stair',
  'stairs',
  'column',
])

const SELECTABLE_IFC_CLASS_KEYS = new Set([
  'ifcspace',
  'ifcwall',
  'ifcwallstandardcase',
  'ifcwindow',
  'ifcdoor',
  'ifcopeningelement',
  'ifcopeningstandardcase',
  'ifcroof',
  'ifccovering',
  'ifcslab',
  'ifcstair',
  'ifcstairflight',
  'ifccolumn',
])

const normalizeToken = (value?: string | null) => value
  ?.trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')

export const isSelectableThreeDComponent = (element?: ElementLike | null) => {
  if (!element) return false
  const categoryKey = normalizeToken(element.category)
  if (categoryKey && SELECTABLE_CATEGORY_KEYS.has(categoryKey)) return true

  const ifcClassKey = normalizeToken(element.ifcClass)?.replace(/\s+/g, '')
  if (ifcClassKey && SELECTABLE_IFC_CLASS_KEYS.has(ifcClassKey)) return true

  return false
}

export const getFloorPlanElementInfo = (object: Object3D): IfcElementInfo | null => {
  const meta = (object.userData as { floorPlanElement?: FloorPlanElementMeta }).floorPlanElement
  if (!meta) return null
  const baseWorldSize = (
    object.userData as { floorPlanBaseWorldSize?: { x: number; y: number; z: number } }
  ).floorPlanBaseWorldSize
  const position = new Vector3()
  const quaternion = new Quaternion()
  const euler = new Euler()
  object.getWorldPosition(position)
  object.getWorldQuaternion(quaternion)
  euler.setFromQuaternion(quaternion, 'XYZ')

  const scaledLengthMm = baseWorldSize
    ? Math.round((object.scale.x * baseWorldSize.x) / FLOOR_PLAN_WORLD_UNITS_PER_MM)
    : meta.lengthMm
  const scaledHeightMm = baseWorldSize
    ? Math.round((object.scale.y * baseWorldSize.y) / FLOOR_PLAN_WORLD_UNITS_PER_MM)
    : meta.heightMm
  const scaledThicknessMm = baseWorldSize
    ? Math.round((object.scale.z * baseWorldSize.z) / FLOOR_PLAN_WORLD_UNITS_PER_MM)
    : meta.thicknessMm

  const roofShape = (
    meta.roofShape === 'flat' || meta.roofShape === 'gable'
      ? meta.roofShape
      : (meta.properties?.RoofShape === 'flat' || meta.properties?.RoofShape === 'gable'
        ? meta.properties.RoofShape
        : undefined)
  )

  return {
    id: meta.id,
    name: meta.name,
    ifcClass: meta.ifcClass,
    category: meta.category,
    source: 'ifc',
    roofShape,
    lengthMm: scaledLengthMm,
    heightMm: scaledHeightMm,
    thicknessMm: scaledThicknessMm,
    positionX: position.x,
    positionY: position.y,
    positionZ: position.z,
    rotationX: (euler.x * 180) / Math.PI,
    rotationY: (euler.y * 180) / Math.PI,
    rotationZ: (euler.z * 180) / Math.PI,
    properties: {
      ...(meta.properties ?? {}),
      Length: scaledLengthMm ?? '-',
      Height: scaledHeightMm ?? '-',
      Thickness: scaledThicknessMm ?? '-',
      PositionX: Number(position.x.toFixed(3)),
      PositionY: Number(position.y.toFixed(3)),
      PositionZ: Number(position.z.toFixed(3)),
      RotationX: Number((((euler.x * 180) / Math.PI)).toFixed(2)),
      RotationY: Number((((euler.y * 180) / Math.PI)).toFixed(2)),
      RotationZ: Number((((euler.z * 180) / Math.PI)).toFixed(2)),
      ...(roofShape ? { RoofShape: roofShape } : {}),
    },
  }
}
