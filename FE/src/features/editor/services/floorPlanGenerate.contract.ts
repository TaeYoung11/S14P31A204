const UUID_V4_LOOSE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ROOM_TYPES = new Set([
  'living',
  'bedroom',
  'kitchen',
  'bathroom',
  'office',
  'entrance',
  'corridor',
  'other',
] as const)

const WALL_TYPES = new Set(['general', 'exterior', 'load_bearing', 'partition'] as const)
const CONNECTION_INTENTS = new Set(['circulation', 'open_passage', 'weak_relation', 'merge'] as const)
const CONNECTION_STRENGTHS = new Set(['strong', 'normal', 'weak'] as const)

const TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'id',
  'name',
  'rooms',
  'zones',
  'adjacency',
  'boundaries',
  'generation_options',
  'modeling_defaults',
  'generation_policy',
] as const)

const ROOM_KEYS = new Set([
  'id',
  'sourceBubbleId',
  'source_bubble_id',
  'original_label',
  'original_type',
  'name',
  'type',
  'width',
  'height',
  'floor',
  'x',
  'y',
  'angle',
  'locked',
  'material',
  'color',
  'wall_type',
  'zoneId',
] as const)

const ADJACENCY_KEYS = new Set([
  'id',
  'from_room_id',
  'to_room_id',
  'strength',
  'intent',
  'connection_strength',
  'source_bubble_id',
  'target_bubble_id',
] as const)
const ZONE_KEYS = new Set(['id', 'name', 'color'] as const)
const BOUNDARY_KEYS = new Set(['floor', 'polygon'] as const)
const GENERATION_OPTIONS_KEYS = new Set([
  'generate_spaces',
  'generate_walls',
  'generate_slabs',
  'generate_roof',
  'generate_openings',
] as const)
const MODELING_DEFAULTS_KEYS = new Set([
  'space_height_mm',
  'wall_thickness_mm',
  'slab_thickness_mm',
  'roof_height_mm',
] as const)
const GENERATION_POLICY_KEYS = new Set([
  'boundary_wall_mode',
  'shared_wall_policy',
  'roof_shape',
] as const)

export type FloorPlanRoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'office'
  | 'entrance'
  | 'corridor'
  | 'other'

export type FloorPlanWallType = 'general' | 'exterior' | 'load_bearing' | 'partition'
export type LayoutImportConnectionIntent = 'circulation' | 'open_passage' | 'weak_relation' | 'merge'
export type LayoutImportConnectionStrength = 'strong' | 'normal' | 'weak'

export interface LayoutImportV2Room {
  id: string
  sourceBubbleId?: string
  source_bubble_id?: string
  original_label?: string
  original_type?: string
  name: string
  type: FloorPlanRoomType
  width: number
  height: number
  floor: number
  x: number
  y: number
  angle: number
  locked: boolean
  material?: string
  color?: string
  wall_type?: FloorPlanWallType
  zoneId?: string | null
}

export interface LayoutImportV2Zone {
  id: string
  name: string
  color: string
}

export interface LayoutImportV2Adjacency {
  id?: string
  from_room_id: string
  to_room_id: string
  strength: number
  intent?: LayoutImportConnectionIntent
  connection_strength?: LayoutImportConnectionStrength
  source_bubble_id?: string
  target_bubble_id?: string
}

export interface LayoutImportV2Boundary {
  floor: number
  polygon: Array<[number, number]>
}

export interface LayoutImportV2GenerationOptions {
  generate_spaces?: boolean
  generate_walls?: boolean
  generate_slabs?: boolean
  generate_roof?: boolean
  generate_openings?: boolean
}

export interface LayoutImportV2ModelingDefaults {
  space_height_mm?: number
  wall_thickness_mm?: number
  slab_thickness_mm?: number
  roof_height_mm?: number
}

export interface LayoutImportV2GenerationPolicy {
  boundary_wall_mode?: 'outer_boundary'
  shared_wall_policy?: 'from_adjacency'
  roof_shape?: 'flat'
}

export interface LayoutImportV2 {
  schema_version: 'v2'
  id: string
  name: string
  rooms: LayoutImportV2Room[]
  zones?: LayoutImportV2Zone[]
  adjacency?: LayoutImportV2Adjacency[]
  boundaries?: LayoutImportV2Boundary[]
  generation_options?: LayoutImportV2GenerationOptions
  modeling_defaults?: LayoutImportV2ModelingDefaults
  generation_policy?: LayoutImportV2GenerationPolicy
}

export class FloorPlanLayoutValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super('layoutImport validation failed')
    this.name = 'FloorPlanLayoutValidationError'
    this.errors = errors
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonBlankString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function pushUnexpectedKeys(
  target: Record<string, unknown>,
  allowedKeys: Set<string>,
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(target)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${path}.${key}: additional property is not allowed`)
    }
  }
}

function validateRoom(room: unknown, index: number, errors: string[]) {
  const path = `rooms[${index}]`
  if (!isObject(room)) {
    errors.push(`${path}: must be an object`)
    return
  }

  pushUnexpectedKeys(room, ROOM_KEYS as Set<string>, path, errors)

  if (!isNonBlankString(room.id, 128)) errors.push(`${path}.id: must be a non-empty string (<=128)`)
  if (room.sourceBubbleId !== undefined && !isNonBlankString(room.sourceBubbleId, 128)) {
    errors.push(`${path}.sourceBubbleId: must be a non-empty string (<=128)`)
  }
  if (room.source_bubble_id !== undefined && !isNonBlankString(room.source_bubble_id, 128)) {
    errors.push(`${path}.source_bubble_id: must be a non-empty string (<=128)`)
  }
  if (room.original_label !== undefined && !isNonBlankString(room.original_label, 255)) {
    errors.push(`${path}.original_label: must be a non-empty string (<=255)`)
  }
  if (room.original_type !== undefined && !isNonBlankString(room.original_type, 128)) {
    errors.push(`${path}.original_type: must be a non-empty string (<=128)`)
  }
  if (!isNonBlankString(room.name, 255)) errors.push(`${path}.name: must be a non-empty string (<=255)`)
  if (typeof room.type !== 'string' || !ROOM_TYPES.has(room.type as FloorPlanRoomType)) {
    errors.push(`${path}.type: must be one of ${Array.from(ROOM_TYPES).join(', ')}`)
  }
  if (!isPositiveInteger(room.width)) errors.push(`${path}.width: must be a positive integer`)
  if (!isPositiveInteger(room.height)) errors.push(`${path}.height: must be a positive integer`)
  if (!Number.isInteger(room.floor) || (room.floor as number) < 1) errors.push(`${path}.floor: must be an integer >= 1`)
  if (!isFiniteNumber(room.x)) errors.push(`${path}.x: must be a finite number`)
  if (!isFiniteNumber(room.y)) errors.push(`${path}.y: must be a finite number`)
  if (!isFiniteNumber(room.angle)) errors.push(`${path}.angle: must be a finite number`)
  if (typeof room.locked !== 'boolean') errors.push(`${path}.locked: must be a boolean`)
  if (room.material !== undefined && !isNonBlankString(room.material, 128)) {
    errors.push(`${path}.material: must be a non-empty string (<=128)`)
  }
  if (room.color !== undefined && (typeof room.color !== 'string' || /^#[0-9A-Fa-f]{6}$/.exec(room.color) === null)) {
    errors.push(`${path}.color: must match #RRGGBB`)
  }
  if (room.wall_type !== undefined && (typeof room.wall_type !== 'string' || !WALL_TYPES.has(room.wall_type as FloorPlanWallType))) {
    errors.push(`${path}.wall_type: must be one of ${Array.from(WALL_TYPES).join(', ')}`)
  }

  if (room.zoneId !== undefined && room.zoneId !== null && !isNonBlankString(room.zoneId, 128)) {
    errors.push(`${path}.zoneId: must be null or a non-empty string (<=128)`)
  }
}

function validateAdjacencyItem(item: unknown, index: number, errors: string[]) {
  const path = `adjacency[${index}]`
  if (!isObject(item)) {
    errors.push(`${path}: must be an object`)
    return
  }
  pushUnexpectedKeys(item, ADJACENCY_KEYS as Set<string>, path, errors)

  if (item.id !== undefined && !isNonBlankString(item.id, 128)) errors.push(`${path}.id: must be a non-empty string (<=128)`)
  if (!isNonBlankString(item.from_room_id, 128)) errors.push(`${path}.from_room_id: must be a non-empty string (<=128)`)
  if (!isNonBlankString(item.to_room_id, 128)) errors.push(`${path}.to_room_id: must be a non-empty string (<=128)`)
  if (!isFiniteNumber(item.strength) || item.strength < 0 || item.strength > 1) {
    errors.push(`${path}.strength: must be a finite number between 0 and 1`)
  }
  if (item.intent !== undefined && (typeof item.intent !== 'string' || !CONNECTION_INTENTS.has(item.intent as LayoutImportConnectionIntent))) {
    errors.push(`${path}.intent: must be one of ${Array.from(CONNECTION_INTENTS).join(', ')}`)
  }
  if (
    item.connection_strength !== undefined &&
    (typeof item.connection_strength !== 'string' ||
      !CONNECTION_STRENGTHS.has(item.connection_strength as LayoutImportConnectionStrength))
  ) {
    errors.push(`${path}.connection_strength: must be one of ${Array.from(CONNECTION_STRENGTHS).join(', ')}`)
  }
  if (item.source_bubble_id !== undefined && !isNonBlankString(item.source_bubble_id, 128)) {
    errors.push(`${path}.source_bubble_id: must be a non-empty string (<=128)`)
  }
  if (item.target_bubble_id !== undefined && !isNonBlankString(item.target_bubble_id, 128)) {
    errors.push(`${path}.target_bubble_id: must be a non-empty string (<=128)`)
  }
}

function validateZoneItem(item: unknown, index: number, errors: string[]) {
  const path = `zones[${index}]`
  if (!isObject(item)) {
    errors.push(`${path}: must be an object`)
    return
  }
  pushUnexpectedKeys(item, ZONE_KEYS as Set<string>, path, errors)
  if (!isNonBlankString(item.id, 128)) errors.push(`${path}.id: must be a non-empty string (<=128)`)
  if (!isNonBlankString(item.name, 255)) errors.push(`${path}.name: must be a non-empty string (<=255)`)
  if (typeof item.color !== 'string' || /^#[0-9A-Fa-f]{6}$/.exec(item.color) === null) {
    errors.push(`${path}.color: must match #RRGGBB`)
  }
}

function validateBoundaryItem(item: unknown, index: number, errors: string[]) {
  const path = `boundaries[${index}]`
  if (!isObject(item)) {
    errors.push(`${path}: must be an object`)
    return
  }
  pushUnexpectedKeys(item, BOUNDARY_KEYS as Set<string>, path, errors)

  if (!Number.isInteger(item.floor) || (item.floor as number) < 1) {
    errors.push(`${path}.floor: must be an integer >= 1`)
  }

  if (!Array.isArray(item.polygon) || item.polygon.length < 3) {
    errors.push(`${path}.polygon: must be an array with at least 3 coordinate pairs`)
    return
  }

  item.polygon.forEach((pair, pairIndex) => {
    const pairPath = `${path}.polygon[${pairIndex}]`
    if (!Array.isArray(pair) || pair.length !== 2 || !isFiniteNumber(pair[0]) || !isFiniteNumber(pair[1])) {
      errors.push(`${pairPath}: must be [number, number]`)
    }
  })
}

function validateBooleanOptions(
  value: unknown,
  path: string,
  allowedKeys: Set<string>,
  errors: string[],
) {
  if (!isObject(value)) {
    errors.push(`${path}: must be an object`)
    return
  }
  pushUnexpectedKeys(value, allowedKeys, path, errors)
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== 'boolean') {
      errors.push(`${path}.${key}: must be a boolean`)
    }
  }
}

function validatePositiveIntegerOptions(
  value: unknown,
  path: string,
  allowedKeys: Set<string>,
  errors: string[],
) {
  if (!isObject(value)) {
    errors.push(`${path}: must be an object`)
    return
  }
  pushUnexpectedKeys(value, allowedKeys, path, errors)
  for (const key of Object.keys(value)) {
    if (!isPositiveInteger(value[key])) {
      errors.push(`${path}.${key}: must be a positive integer`)
    }
  }
}

function validateGenerationPolicy(value: unknown, errors: string[]) {
  const path = 'generation_policy'
  if (!isObject(value)) {
    errors.push(`${path}: must be an object`)
    return
  }
  pushUnexpectedKeys(value, GENERATION_POLICY_KEYS as Set<string>, path, errors)
  if (value.boundary_wall_mode !== undefined && value.boundary_wall_mode !== 'outer_boundary') {
    errors.push(`${path}.boundary_wall_mode: only 'outer_boundary' is allowed`)
  }
  if (value.shared_wall_policy !== undefined && value.shared_wall_policy !== 'from_adjacency') {
    errors.push(`${path}.shared_wall_policy: only 'from_adjacency' is allowed`)
  }
  if (value.roof_shape !== undefined && value.roof_shape !== 'flat') {
    errors.push(`${path}.roof_shape: only 'flat' is allowed`)
  }
}

export function validateLayoutImportV2(layoutImport: unknown): string[] {
  const errors: string[] = []

  if (!isObject(layoutImport)) {
    return ['layoutImport: must be an object']
  }

  pushUnexpectedKeys(layoutImport, TOP_LEVEL_KEYS as Set<string>, 'layoutImport', errors)

  if (layoutImport.schema_version !== 'v2') {
    errors.push('layoutImport.schema_version: must be exactly "v2"')
  }
  if (typeof layoutImport.id !== 'string' || UUID_V4_LOOSE_PATTERN.exec(layoutImport.id) === null) {
    errors.push('layoutImport.id: must be a valid UUID string')
  }
  if (!isNonBlankString(layoutImport.name, 255)) {
    errors.push('layoutImport.name: must be a non-empty string (<=255)')
  }
  if (!Array.isArray(layoutImport.rooms) || layoutImport.rooms.length === 0) {
    errors.push('layoutImport.rooms: must be a non-empty array')
  } else {
    layoutImport.rooms.forEach((room, index) => validateRoom(room, index, errors))
  }

  if (layoutImport.zones !== undefined) {
    if (!Array.isArray(layoutImport.zones)) {
      errors.push('layoutImport.zones: must be an array')
    } else {
      layoutImport.zones.forEach((zone, index) => validateZoneItem(zone, index, errors))
    }
  }

  if (layoutImport.adjacency !== undefined) {
    if (!Array.isArray(layoutImport.adjacency)) {
      errors.push('layoutImport.adjacency: must be an array')
    } else {
      layoutImport.adjacency.forEach((item, index) => validateAdjacencyItem(item, index, errors))
    }
  }

  if (layoutImport.boundaries !== undefined) {
    if (!Array.isArray(layoutImport.boundaries)) {
      errors.push('layoutImport.boundaries: must be an array')
    } else {
      layoutImport.boundaries.forEach((item, index) => validateBoundaryItem(item, index, errors))
    }
  }

  if (layoutImport.generation_options !== undefined) {
    validateBooleanOptions(
      layoutImport.generation_options,
      'generation_options',
      GENERATION_OPTIONS_KEYS as Set<string>,
      errors,
    )
  }

  if (layoutImport.modeling_defaults !== undefined) {
    validatePositiveIntegerOptions(
      layoutImport.modeling_defaults,
      'modeling_defaults',
      MODELING_DEFAULTS_KEYS as Set<string>,
      errors,
    )
  }

  if (layoutImport.generation_policy !== undefined) {
    validateGenerationPolicy(layoutImport.generation_policy, errors)
  }

  return errors
}

export function assertLayoutImportV2(layoutImport: unknown): asserts layoutImport is LayoutImportV2 {
  const errors = validateLayoutImportV2(layoutImport)
  if (errors.length > 0) {
    throw new FloorPlanLayoutValidationError(errors)
  }
}
