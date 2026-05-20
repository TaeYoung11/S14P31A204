import type { FloorLayerOverlay, FloorRoom, FloorWall } from '../types'

/** 1mm → Three.js world units (PROJECT_WORLD_UNITS_PER_MM 기준) */
const MM_TO_WORLD = 0.001

/** 캔버스 픽셀 → mm */
const PX_TO_MM = 25

/** 캔버스 픽셀 → Three.js world units */
const PX_TO_WORLD = PX_TO_MM * MM_TO_WORLD

type ThreeModule = typeof import('three')

/** FloorPlan3DCanvas에 전달하는 3D 생성용 데이터 */
export interface FloorPlan3DData {
  rooms: FloorRoom[]
  walls: FloorWall[]
  storyHeightMm: number
}

const ROOM_COLOR_PALETTE = [
  '#B8C4E8', '#C8D8A8', '#E8C8A8', '#D8A8C8', '#A8D8D8',
  '#E8D8A8', '#C8A8B8', '#A8B8C8', '#D8C8A8', '#B8D8C8',
]

const getDefaultRoomColor = (index: number) =>
  ROOM_COLOR_PALETTE[index % ROOM_COLOR_PALETTE.length]

/**
 * 2D 평면도 데이터(FloorRoom, FloorWall)를 Three.js Group으로 변환한다.
 * - 각 방은 반투명 색상 박스 + 엣지 라인으로 표현
 * - 각 벽은 불투명 박스로 표현
 * - 바닥 슬라브(thin box)를 전체 바운딩 영역에 추가
 */
export function buildFloorPlan3DGroup(
  THREE: ThreeModule,
  data: FloorPlan3DData,
  overlayLayers: FloorLayerOverlay[] = [],
): import('three').Group {
  const group = new THREE.Group()
  const { rooms, walls, storyHeightMm } = data
  const wallHeightWorld = storyHeightMm * MM_TO_WORLD

  // ── 방(Room) 박스 ──
  rooms.forEach((room, index) => {
    const sizeX = room.widthMm * MM_TO_WORLD
    const sizeY = wallHeightWorld
    const sizeZ = room.heightMm * MM_TO_WORLD

    if (sizeX < 0.01 || sizeY < 0.01 || sizeZ < 0.01) return

    const posX = (room.x + room.width / 2) * PX_TO_WORLD
    const posY = sizeY / 2
    const posZ = (room.y + room.height / 2) * PX_TO_WORLD

    const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
    const color = room.color || getDefaultRoomColor(index)
    const mat = new THREE.MeshLambertMaterial({
      color,
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
        ...(room.globalId ? { GlobalId: room.globalId } : {}),
        Category: 'Space',
        Class: 'IfcSpace',
      },
    }
    mesh.userData.floorPlanBaseWorldSize = {
      x: sizeX,
      y: sizeY,
      z: sizeZ,
    }

    // 엣지 윤곽선
    const edgesGeo = new THREE.EdgesGeometry(geo)
    const edgesMat = new THREE.LineBasicMaterial({ color: '#3b45b3' })
    const edges = new THREE.LineSegments(edgesGeo, edgesMat)
    mesh.add(edges)

    group.add(mesh)
  })

  // ── 오버레이(Room) 박스 ──
  overlayLayers.forEach((overlayLayer, layerIndex) => {
    const overlayOpacity = Math.min(Math.max(overlayLayer.opacity, 0.1), 0.95)
    overlayLayer.rooms.forEach((room, roomIndex) => {
      const sizeX = room.widthMm * MM_TO_WORLD
      const sizeY = wallHeightWorld
      const sizeZ = room.heightMm * MM_TO_WORLD
      if (sizeX < 0.01 || sizeY < 0.01 || sizeZ < 0.01) return

      const posX = (room.x + room.width / 2) * PX_TO_WORLD
      const posY = sizeY / 2
      const posZ = (room.y + room.height / 2) * PX_TO_WORLD

      const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
      const color = room.color || getDefaultRoomColor(roomIndex)
      const mat = new THREE.MeshLambertMaterial({
        color,
        transparent: true,
        opacity: overlayOpacity,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(posX, posY + 0.002 + layerIndex * 0.0005, posZ)
      mesh.userData.floorPlanElement = {
        id: `overlay:${overlayLayer.layerId}:${room.id}`,
        name: `${overlayLayer.layerName || 'Overlay'} · ${room.label || 'Room'}`,
        ifcClass: 'IfcSpace',
        category: 'OverlaySpace',
        lengthMm: room.widthMm,
        heightMm: storyHeightMm,
        thicknessMm: room.heightMm,
        properties: {
          RoomId: room.id,
          BubbleId: room.bubbleId,
          LayerId: overlayLayer.layerId,
          LayerName: overlayLayer.layerName,
          ...(room.globalId ? { GlobalId: room.globalId } : {}),
          Category: 'OverlaySpace',
          Class: 'IfcSpace',
        },
      }
      group.add(mesh)
    })
  })

  // ── 벽(Wall) 박스 ──
  walls.forEach((wall) => {
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
    mesh.position.set(midX, height / 2, midZ)
    mesh.rotation.y = -Math.atan2(dz, dx)
    const wallCategory = wall.type === 'exterior'
      ? 'Exterior wall'
      : wall.type === 'partition'
        ? 'Interior wall'
        : 'Wall'
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
        ...(wall.globalId ? { GlobalId: wall.globalId } : {}),
        Category: wallCategory,
        Class: wall.type === 'exterior' ? 'IfcWallStandardCase' : 'IfcWall',
        ...(wall.startMm ? { StartMmX: wall.startMm.x, StartMmY: wall.startMm.y } : {}),
        ...(wall.endMm ? { EndMmX: wall.endMm.x, EndMmY: wall.endMm.y } : {}),
      },
    }
    mesh.userData.floorPlanBaseWorldSize = {
      x: length,
      y: height,
      z: wallThickness,
    }
    group.add(mesh)
  })

  // ── 바닥 슬라브 ──
  if (rooms.length > 0) {
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    rooms.forEach((room) => {
      const x1 = room.x * PX_TO_WORLD
      const z1 = room.y * PX_TO_WORLD
      const x2 = (room.x + room.width) * PX_TO_WORLD
      const z2 = (room.y + room.height) * PX_TO_WORLD
      if (x1 < minX) minX = x1
      if (x2 > maxX) maxX = x2
      if (z1 < minZ) minZ = z1
      if (z2 > maxZ) maxZ = z2
    })
    const floorW = maxX - minX
    const floorD = maxZ - minZ
    if (floorW > 0.01 && floorD > 0.01) {
      const floorGeo = new THREE.BoxGeometry(floorW, 0.05, floorD)
      const floorMat = new THREE.MeshLambertMaterial({ color: '#e8e4de' })
      const floorMesh = new THREE.Mesh(floorGeo, floorMat)
      floorMesh.position.set(minX + floorW / 2, -0.025, minZ + floorD / 2)
      floorMesh.userData.floorPlanElement = {
        id: 'local-floor-slab',
        name: 'Floor',
        ifcClass: 'IfcSlab',
        category: 'Floor',
        lengthMm: Math.round(floorW / MM_TO_WORLD),
        thicknessMm: Math.round(0.05 / MM_TO_WORLD),
        heightMm: Math.round(floorD / MM_TO_WORLD),
        properties: {
          Category: 'Floor',
          Class: 'IfcSlab',
        },
      }
      floorMesh.userData.floorPlanBaseWorldSize = {
        x: floorW,
        y: 0.05,
        z: floorD,
      }
      group.add(floorMesh)
    }
  }

  return group
}
