/** BATANG 2D 표준 스키마(FloorProject) - 프론트 타입 정의 */

export interface FloorProjectPoint2D {
  x: number
  y: number
}

export interface FloorProjectEntityBase {
  id: string
  metadata?: Record<string, unknown> | null
}

export interface FloorProjectFloor extends FloorProjectEntityBase {
  number: number
  name: string
  elevation: number
  ceiling_height: number
}

export interface FloorProjectRoom extends FloorProjectEntityBase {
  name: string
  type: string
  /** FloorProjectFloor.id 참조 (IFC IfcBuildingStorey GlobalId) */
  floor: string
  polygon: FloorProjectPoint2D[]
  /** 렌더링용 경계 세그먼트(옵션): line/arc 혼합 가능 */
  contour?: FloorProjectRoomContourSegment[]
  /** 렌더링용 2D 변환(옵션) */
  transform?: FloorProjectRoomTransform2D
  floor_material?: string
  color?: string
}

export interface FloorProjectRoomLineSegment {
  type: 'line'
  from: FloorProjectPoint2D
  to: FloorProjectPoint2D
}

export interface FloorProjectRoomArcSegment {
  type: 'arc'
  center: FloorProjectPoint2D
  radius: number
  start_angle_deg: number
  end_angle_deg: number
  clockwise?: boolean
}

export type FloorProjectRoomContourSegment = FloorProjectRoomLineSegment | FloorProjectRoomArcSegment

export interface FloorProjectRoomTransform2D {
  translation?: FloorProjectPoint2D
  rotation_deg?: number
  scale_x?: number
  scale_y?: number
  origin?: FloorProjectPoint2D
}

export interface FloorProjectAdjacency extends FloorProjectEntityBase {
  from_room_id: string
  to_room_id: string
  strength: number
}

/** IFC IfcWall / IfcWallStandardCase 에서 변환된 벽 데이터 */
export type FloorProjectWallType = 'exterior' | 'interior' | 'loadBearing' | 'partition'
export type FloorProjectWallIfcClass = 'IfcWall' | 'IfcWallStandardCase'
export type FloorProjectOpeningIfcClass = 'IfcDoor' | 'IfcWindow'

export interface FloorProjectWall extends FloorProjectEntityBase {
  /** FloorProjectFloor.id 참조 (IFC IfcBuildingStorey GlobalId) */
  floor: string
  /** IFC 원본 클래스 */
  ifc_class?: FloorProjectWallIfcClass
  start: FloorProjectPoint2D  // mm
  end: FloorProjectPoint2D    // mm
  thickness?: number          // mm (없으면 타입별 프리셋 적용)
  height?: number             // mm
  type?: FloorProjectWallType
}

/** IFC IfcDoor / IfcWindow 에서 변환된 개구부 데이터 */
export interface FloorProjectOpening extends FloorProjectEntityBase {
  /** FloorProjectFloor.id 참조 (IFC IfcBuildingStorey GlobalId) */
  floor: string
  /** IFC 원본 클래스 */
  ifc_class?: FloorProjectOpeningIfcClass
  type: 'door' | 'window'
  wall_id: string         // FloorProjectWall.id 참조
  wall_position: number   // 벽 start~end 정규화 위치 0~1 (중심)
  width: number           // mm
  height?: number         // mm
  sill_height?: number    // mm (창문 창턱 높이)
}

export interface FloorProject {
  id: string
  name: string
  created_at: string
  updated_at: string
  unit: 'mm'
  metadata?: Record<string, unknown> | null
  floors: FloorProjectFloor[]
  rooms: FloorProjectRoom[]
  adjacency: FloorProjectAdjacency[]
  /** IFC IfcWall 변환 결과 — 없으면 autoWalls 폴백 */
  walls?: FloorProjectWall[]
  /** IFC IfcDoor/IfcWindow 변환 결과 — 없으면 연결선 기반 autoOpenings 폴백 */
  openings?: FloorProjectOpening[]
}
