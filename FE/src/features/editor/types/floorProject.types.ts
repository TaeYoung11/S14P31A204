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
  floor: number
  polygon: FloorProjectPoint2D[]
  floor_material?: string
  color?: string
}

export interface FloorProjectAdjacency extends FloorProjectEntityBase {
  from_room_id: string
  to_room_id: string
  strength: number
}

export interface FloorProject {
  id: string
  name: string
  created_at: string
  updated_at: string
  unit: 'meter'
  metadata?: Record<string, unknown> | null
  floors: FloorProjectFloor[]
  rooms: FloorProjectRoom[]
  adjacency: FloorProjectAdjacency[]
}
