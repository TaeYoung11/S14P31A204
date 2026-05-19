import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import type { IfcElementInfo, Point2D } from '../../types'

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
  startMm?: Point2D
  endMm?: Point2D
  properties?: IfcElementInfo['properties']
}

const FLOOR_PLAN_WORLD_UNITS_PER_MM = 0.001

const SELECTABLE_CATEGORY_KEYS = new Set([
  'wall',
  'exterior wall',
  'interior wall',
  'window',
  'door',
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
  'ifcwall',
  'ifcwallstandardcase',
  'ifcwindow',
  'ifcdoor',
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
  const centerMm = {
    x: position.x / FLOOR_PLAN_WORLD_UNITS_PER_MM,
    y: position.z / FLOOR_PLAN_WORLD_UNITS_PER_MM,
  }
  const directionAngle = -euler.y
  const halfLengthMm = (scaledLengthMm ?? 0) / 2
  const transformedStartMm = meta.startMm && meta.endMm && halfLengthMm > 0
    ? {
        x: centerMm.x - Math.cos(directionAngle) * halfLengthMm,
        y: centerMm.y - Math.sin(directionAngle) * halfLengthMm,
      }
    : meta.startMm
  const transformedEndMm = meta.startMm && meta.endMm && halfLengthMm > 0
    ? {
        x: centerMm.x + Math.cos(directionAngle) * halfLengthMm,
        y: centerMm.y + Math.sin(directionAngle) * halfLengthMm,
      }
    : meta.endMm

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
    startMm: transformedStartMm,
    endMm: transformedEndMm,
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
      ...(transformedStartMm ? { StartMmX: Math.round(transformedStartMm.x), StartMmY: Math.round(transformedStartMm.y) } : {}),
      ...(transformedEndMm ? { EndMmX: Math.round(transformedEndMm.x), EndMmY: Math.round(transformedEndMm.y) } : {}),
      RotationX: Number((((euler.x * 180) / Math.PI)).toFixed(2)),
      RotationY: Number((((euler.y * 180) / Math.PI)).toFixed(2)),
      RotationZ: Number((((euler.z * 180) / Math.PI)).toFixed(2)),
      ...(roofShape ? { RoofShape: roofShape } : {}),
    },
  }
}
