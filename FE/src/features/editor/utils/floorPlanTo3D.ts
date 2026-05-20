import type { FloorLayerOverlay, FloorRoom, FloorWall } from '../types'

const MM_TO_WORLD = 0.001
const PX_TO_MM = 25
const PX_TO_WORLD = PX_TO_MM * MM_TO_WORLD

type ThreeModule = typeof import('three')

export interface FloorPlan3DLayerData {
  layerId: string
  layerName: string
  elevationMm: number
  ceilingHeightMm: number
  rooms: FloorRoom[]
  walls: FloorWall[]
}

export interface FloorPlan3DData {
  rooms: FloorRoom[]
  walls: FloorWall[]
  storyHeightMm: number
  activeFloorLayerId?: string | null
  activeFloorElevationMm?: number
  displayBaseElevationMm?: number
  layers?: FloorPlan3DLayerData[]
}

const ROOM_COLOR_PALETTE = [
  '#B8C4E8', '#C8D8A8', '#E8C8A8', '#D8A8C8', '#A8D8D8',
  '#E8D8A8', '#C8A8B8', '#A8B8C8', '#D8C8A8', '#B8D8C8',
]

const getDefaultRoomColor = (index: number) =>
  ROOM_COLOR_PALETTE[index % ROOM_COLOR_PALETTE.length]

const toFiniteMm = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value as number : fallback

const buildFallbackLayer = (data: FloorPlan3DData): FloorPlan3DLayerData => ({
  layerId: data.activeFloorLayerId ?? 'floor-local',
  layerName: data.activeFloorLayerId ?? 'Floor',
  elevationMm: toFiniteMm(data.activeFloorElevationMm, 0),
  ceilingHeightMm: toFiniteMm(data.storyHeightMm, 3000),
  rooms: data.rooms,
  walls: data.walls,
})

export function buildFloorPlan3DGroup(
  THREE: ThreeModule,
  data: FloorPlan3DData,
  overlayLayers: FloorLayerOverlay[] = [],
): import('three').Group {
  const group = new THREE.Group()
  const layerSpecs = data.layers?.length ? data.layers : [buildFallbackLayer(data)]
  const displayBaseElevationMm = toFiniteMm(data.displayBaseElevationMm, 0)

  layerSpecs.forEach((layer) => {
    const absoluteElevationMm = toFiniteMm(layer.elevationMm, 0)
    const elevationMm = absoluteElevationMm - displayBaseElevationMm
    const storyHeightMm = Math.max(toFiniteMm(layer.ceilingHeightMm, data.storyHeightMm), 1)
    const baseY = elevationMm * MM_TO_WORLD
    const wallHeightWorld = storyHeightMm * MM_TO_WORLD

    layer.rooms.forEach((room, index) => {
      const sizeX = room.widthMm * MM_TO_WORLD
      const sizeY = wallHeightWorld
      const sizeZ = room.heightMm * MM_TO_WORLD
      if (sizeX < 0.01 || sizeY < 0.01 || sizeZ < 0.01) return

      const posX = (room.x + room.width / 2) * PX_TO_WORLD
      const posY = baseY + sizeY / 2
      const posZ = (room.y + room.height / 2) * PX_TO_WORLD

      const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
      const mat = new THREE.MeshLambertMaterial({
        color: room.color || getDefaultRoomColor(index),
        transparent: true,
        opacity: 0.45,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(posX, posY, posZ)
      mesh.userData.floorPlanElement = {
        id: room.id,
        name: room.label || 'Room',
        ifcClass: 'IfcSpace',
        category: 'Space',
        lengthMm: room.widthMm,
        heightMm: storyHeightMm,
        thicknessMm: room.heightMm,
        properties: {
          RoomId: room.id,
          BubbleId: room.bubbleId,
          FloorLayerId: layer.layerId,
          FloorLayerName: layer.layerName,
          ElevationMm: absoluteElevationMm,
          ...(room.globalId ? { GlobalId: room.globalId } : {}),
          Category: 'Space',
          Class: 'IfcSpace',
        },
      }
      mesh.userData.floorPlanBaseWorldSize = { x: sizeX, y: sizeY, z: sizeZ }

      const edgesGeo = new THREE.EdgesGeometry(geo)
      const edgesMat = new THREE.LineBasicMaterial({ color: '#3b45b3' })
      mesh.add(new THREE.LineSegments(edgesGeo, edgesMat))
      group.add(mesh)
    })

    layer.walls.forEach((wall) => {
      const dx = (wall.end.x - wall.start.x) * PX_TO_WORLD
      const dz = (wall.end.y - wall.start.y) * PX_TO_WORLD
      const length = Math.sqrt(dx * dx + dz * dz)
      if (length < 0.01) return

      const wallThickness = wall.thickness * MM_TO_WORLD
      const height = (wall.heightMm || storyHeightMm) * MM_TO_WORLD
      const midX = ((wall.start.x + wall.end.x) / 2) * PX_TO_WORLD
      const midZ = ((wall.start.y + wall.end.y) / 2) * PX_TO_WORLD

      const geo = new THREE.BoxGeometry(length, height, wallThickness)
      const mat = new THREE.MeshLambertMaterial({ color: '#c8c0b4' })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(midX, baseY + height / 2, midZ)
      mesh.rotation.y = -Math.atan2(dz, dx)

      const wallCategory = wall.type === 'exterior'
        ? 'Exterior wall'
        : wall.type === 'partition'
          ? 'Interior wall'
          : 'Wall'
      const wallFloorLayerId = wall.floorLayerId ?? layer.layerId
      mesh.userData.floorPlanElement = {
        id: wall.id,
        name: wallCategory,
        ifcClass: wall.type === 'exterior' ? 'IfcWallStandardCase' : 'IfcWall',
        category: wallCategory,
        lengthMm: Math.round(length / MM_TO_WORLD),
        heightMm: wall.heightMm || storyHeightMm,
        thicknessMm: wall.thickness,
        startMm: wall.startMm,
        endMm: wall.endMm,
        rotationY: -(Math.atan2(dz, dx) * 180) / Math.PI,
        properties: {
          WallId: wall.id,
          FloorLayerId: wallFloorLayerId,
          FloorLayerName: layer.layerName,
          ElevationMm: absoluteElevationMm,
          ...(wall.globalId ? { GlobalId: wall.globalId } : {}),
          Category: wallCategory,
          Class: wall.type === 'exterior' ? 'IfcWallStandardCase' : 'IfcWall',
          ...(wall.startMm ? { StartMmX: wall.startMm.x, StartMmY: wall.startMm.y } : {}),
          ...(wall.endMm ? { EndMmX: wall.endMm.x, EndMmY: wall.endMm.y } : {}),
        },
      }
      mesh.userData.floorPlanBaseWorldSize = { x: length, y: height, z: wallThickness }
      group.add(mesh)
    })

    if (layer.rooms.length === 0) return
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    layer.rooms.forEach((room) => {
      const x1 = room.x * PX_TO_WORLD
      const z1 = room.y * PX_TO_WORLD
      const x2 = (room.x + room.width) * PX_TO_WORLD
      const z2 = (room.y + room.height) * PX_TO_WORLD
      minX = Math.min(minX, x1)
      maxX = Math.max(maxX, x2)
      minZ = Math.min(minZ, z1)
      maxZ = Math.max(maxZ, z2)
    })

    const floorW = maxX - minX
    const floorD = maxZ - minZ
    if (floorW <= 0.01 || floorD <= 0.01) return

    const floorGeo = new THREE.BoxGeometry(floorW, 0.05, floorD)
    const floorMat = new THREE.MeshLambertMaterial({ color: '#e8e4de' })
    const floorMesh = new THREE.Mesh(floorGeo, floorMat)
    floorMesh.position.set(minX + floorW / 2, baseY - 0.025, minZ + floorD / 2)
    floorMesh.userData.floorPlanElement = {
      id: `local-floor-slab:${layer.layerId}`,
      name: `${layer.layerName} Floor`,
      ifcClass: 'IfcSlab',
      category: 'Floor',
      lengthMm: Math.round(floorW / MM_TO_WORLD),
      thicknessMm: Math.round(0.05 / MM_TO_WORLD),
      heightMm: Math.round(floorD / MM_TO_WORLD),
      properties: {
        FloorLayerId: layer.layerId,
        FloorLayerName: layer.layerName,
        ElevationMm: absoluteElevationMm,
        Category: 'Floor',
        Class: 'IfcSlab',
      },
    }
    floorMesh.userData.floorPlanBaseWorldSize = { x: floorW, y: 0.05, z: floorD }
    group.add(floorMesh)
  })

  overlayLayers.forEach((overlayLayer, layerIndex) => {
    const overlayOpacity = Math.min(Math.max(overlayLayer.opacity, 0.1), 0.95)
    const absoluteOverlayElevationMm = toFiniteMm(overlayLayer.elevationMm, toFiniteMm(data.activeFloorElevationMm, 0))
    const overlayElevationMm = absoluteOverlayElevationMm - displayBaseElevationMm
    const overlayHeightWorld = Math.max(toFiniteMm(overlayLayer.ceilingHeightMm, data.storyHeightMm), 1) * MM_TO_WORLD
    const overlayBaseY = overlayElevationMm * MM_TO_WORLD
    overlayLayer.rooms.forEach((room, roomIndex) => {
      const sizeX = room.widthMm * MM_TO_WORLD
      const sizeY = overlayHeightWorld
      const sizeZ = room.heightMm * MM_TO_WORLD
      if (sizeX < 0.01 || sizeY < 0.01 || sizeZ < 0.01) return

      const posX = (room.x + room.width / 2) * PX_TO_WORLD
      const posY = overlayBaseY + sizeY / 2
      const posZ = (room.y + room.height / 2) * PX_TO_WORLD

      const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
      const mat = new THREE.MeshLambertMaterial({
        color: room.color || getDefaultRoomColor(roomIndex),
        transparent: true,
        opacity: overlayOpacity,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(posX, posY + 0.002 + layerIndex * 0.0005, posZ)
      mesh.userData.floorPlanElement = {
        id: `overlay:${overlayLayer.layerId}:${room.id}`,
        name: `${overlayLayer.layerName || 'Overlay'} - ${room.label || 'Room'}`,
        ifcClass: 'IfcSpace',
        category: 'OverlaySpace',
        lengthMm: room.widthMm,
        heightMm: Math.round(overlayHeightWorld / MM_TO_WORLD),
        thicknessMm: room.heightMm,
        properties: {
          RoomId: room.id,
          BubbleId: room.bubbleId,
          LayerId: overlayLayer.layerId,
          LayerName: overlayLayer.layerName,
          ElevationMm: absoluteOverlayElevationMm,
          ...(room.globalId ? { GlobalId: room.globalId } : {}),
          Category: 'OverlaySpace',
          Class: 'IfcSpace',
        },
      }
      group.add(mesh)
    })
  })

  return group
}
