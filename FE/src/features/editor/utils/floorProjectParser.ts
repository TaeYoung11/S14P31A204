import type { FloorProject } from '../types/floorProject.types'

interface ParseResultSuccess {
  ok: true
  project: FloorProject
}

interface ParseResultFailure {
  ok: false
  message: string
}

export type FloorProjectParseResult = ParseResultSuccess | ParseResultFailure

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isPoint = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'

const parseFloors = (value: unknown): FloorProject['floors'] | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const floors = value.map((item) => {
    if (!isRecord(item)) return null
    if (typeof item.id !== 'string') return null
    if (typeof item.number !== 'number') return null
    if (typeof item.name !== 'string') return null
    if (typeof item.elevation !== 'number') return null
    if (typeof item.ceiling_height !== 'number') return null
    return {
      id: item.id,
      number: item.number,
      name: item.name,
      elevation: item.elevation,
      ceiling_height: item.ceiling_height,
      metadata: isRecord(item.metadata) ? item.metadata : null,
    }
  })
  return floors.every((floor) => floor !== null) ? floors : null
}

const parseRooms = (value: unknown): FloorProject['rooms'] | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const rooms = value.map((item) => {
    if (!isRecord(item)) return null
    if (typeof item.id !== 'string') return null
    if (typeof item.name !== 'string') return null
    if (typeof item.type !== 'string') return null
    if (typeof item.floor !== 'number') return null
    if (!Array.isArray(item.polygon) || item.polygon.length < 3) return null
    if (!item.polygon.every(isPoint)) return null
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      floor: item.floor,
      polygon: item.polygon.map((point) => ({ x: point.x, y: point.y })),
      floor_material: typeof item.floor_material === 'string' ? item.floor_material : undefined,
      color: typeof item.color === 'string' ? item.color : undefined,
      metadata: isRecord(item.metadata) ? item.metadata : null,
    }
  })
  return rooms.every((room) => room !== null) ? rooms : null
}

const parseAdjacency = (value: unknown): FloorProject['adjacency'] | null => {
  if (!Array.isArray(value)) return null
  const adjacency = value.map((item) => {
    if (!isRecord(item)) return null
    if (typeof item.id !== 'string') return null
    if (typeof item.from_room_id !== 'string') return null
    if (typeof item.to_room_id !== 'string') return null
    if (typeof item.strength !== 'number') return null
    return {
      id: item.id,
      from_room_id: item.from_room_id,
      to_room_id: item.to_room_id,
      strength: item.strength,
      metadata: isRecord(item.metadata) ? item.metadata : null,
    }
  })
  return adjacency.every((item) => item !== null) ? adjacency : null
}

/** FloorProject 표준 JSON 기본 검증 */
export function parseFloorProjectJson(rawText: string): FloorProjectParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { ok: false, message: 'JSON 파싱에 실패했습니다. 형식을 확인해 주세요.' }
  }

  if (!isRecord(parsed)) {
    return { ok: false, message: '객체 형태의 JSON만 지원됩니다.' }
  }

  if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string') {
    return { ok: false, message: 'project id/name 필드가 필요합니다.' }
  }
  if (typeof parsed.created_at !== 'string' || typeof parsed.updated_at !== 'string') {
    return { ok: false, message: 'created_at/updated_at 필드가 필요합니다.' }
  }
  if (parsed.unit !== 'meter') {
    return { ok: false, message: "unit은 'meter'만 지원됩니다." }
  }
  const floors = parseFloors(parsed.floors)
  if (!floors) {
    return { ok: false, message: 'floors 필드가 유효하지 않습니다.' }
  }
  const rooms = parseRooms(parsed.rooms)
  if (!rooms) {
    return { ok: false, message: 'rooms 필드가 유효하지 않습니다.' }
  }
  const adjacency = parseAdjacency(parsed.adjacency)
  if (!adjacency) {
    return { ok: false, message: 'adjacency 필드가 유효하지 않습니다.' }
  }

  return {
    ok: true,
    project: {
      id: parsed.id,
      name: parsed.name,
      created_at: parsed.created_at,
      updated_at: parsed.updated_at,
      unit: 'meter',
      metadata: isRecord(parsed.metadata) ? parsed.metadata : null,
      floors,
      rooms,
      adjacency,
    },
  }
}
