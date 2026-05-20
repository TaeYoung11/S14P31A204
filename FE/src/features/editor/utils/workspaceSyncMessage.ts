import type { IMessage } from '@stomp/stompjs'
import type {
  BubbleData,
  ConnectionData,
  FloorLayer,
  FloorOpening,
  FloorWall,
  IfcElementChange,
  PhaseStatus,
  ZoneData,
} from '../types'

export interface BubbleSnapshotPayload {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones?: ZoneData[]
  floorMeta?: {
    namesByFloor?: Record<string, string>
    extraFloors?: number[]
  } | null
}

export interface FloorPlanSnapshotPayload extends BubbleSnapshotPayload {
  baseIndex?: number
  revisionId?: string | null
  layout?: {
    phaseStatus?: PhaseStatus
    floorLayers?: FloorLayer[]
    activeFloorLayerId?: string | null
    isFloorPlanGenerated?: boolean
    floorPlanLayoutSource?: 'bubble' | 'project' | null
    floorWalls?: FloorWall[]
    floorOpenings?: FloorOpening[]
    hiddenAutoWallIds?: string[]
    hiddenAutoOpeningIds?: string[]
    isProjectStructurePreferred?: boolean
    ifcElementChanges?: IfcElementChange[]
    activeIfcStoreyExpressId?: number | null
    overlayIfcStoreyExpressIds?: number[]
    overlayFloorLayerIds?: string[]
    hiddenElementIds?: string[]
    mode?: 'ifc' | string
    baseIndex?: number
  } | null
}

export interface ProjectSyncMessage {
  type?: string
  eventType?: string
  action?: string
  status?: string
  revisionId?: string | null
  targetRevisionId?: string | null
  currentRevision?: string | null
  currentRevisionId?: string | null
  sourceRevisionId?: string | null
  bubbleSnapshotJson?: unknown
  floorPlanPayloadJson?: unknown
  payload?: unknown
  output?: unknown
  outputIfcStorageUrl?: string
  ifcStorageUrl?: string
  s3Url?: string
  currentIfcUrl?: string
  /** S3 에셋 UUID — download-url API 호출에 사용 */
  assetId?: string
  artifactId?: string
  outputArtifactId?: string
}

export interface StompErrorMessage {
  code?: string
  message?: string
}

export const PROJECT_SYNC_TOPIC_PREFIX = '/topic/project'
export const PROJECT_JOBS_TOPIC_PREFIX = '/topic/projects'
export const USER_ERROR_TOPIC = '/user/queue/errors'
export const CURSOR_INVALID_CODE = 'WORKSPACE_BUBBLE_HISTORY_CURSOR_INVALID'
export const FLOOR_PLAN_CURSOR_INVALID_CODE = 'WORKSPACE_FLOOR_PLAN_HISTORY_CURSOR_INVALID'

export const WORKSPACE_SYNC_ACTION = {
  bubbleUpdated: 'BUBBLE_UPDATED',
  floorPlanProcessing: 'FLOOR_PLAN_PROCESSING',
  floorPlanUpdated: 'FLOOR_PLAN_UPDATED',
  bubbleUndo: 'BUBBLE_UNDO',
  bubbleRedo: 'BUBBLE_REDO',
  floorPlanUndo: 'FLOOR_PLAN_UNDO',
  floorPlanRedo: 'FLOOR_PLAN_REDO',
  convertCompleted: 'CONVERT_COMPLETED',
  editCompleted: 'EDIT_COMPLETED',
  ifcGenerateCompleted: 'IFC_GENERATE_COMPLETED',
  ifcEditCompleted: 'IFC_EDIT_COMPLETED',
  ifcGenerateFromBubbleCompleted: 'IFC_GENERATE_FROM_BUBBLE_COMPLETED',
  floorPlanGenerateCompleted: 'FLOOR_PLAN_GENERATE_COMPLETED',
  undoCompleted: 'UNDO_COMPLETED',
  redoCompleted: 'REDO_COMPLETED',
  ifcGenerateStarted: 'IFC_GENERATE_STARTED',
  ifcEditStarted: 'IFC_EDIT_STARTED',
} as const

const PHASE_STATUS_SET = new Set<PhaseStatus>(['BUBBLE_DRAFT', 'CONVERTING', 'IFC_EDIT'])
const PHASE_STATUS_ALIAS_MAP: Record<string, PhaseStatus> = {
  IFC_READY: 'IFC_EDIT',
}

export const IFC_COMPLETED_ACTION_SET = new Set<string>([
  WORKSPACE_SYNC_ACTION.convertCompleted,
  WORKSPACE_SYNC_ACTION.editCompleted,
  WORKSPACE_SYNC_ACTION.ifcGenerateCompleted,
  WORKSPACE_SYNC_ACTION.ifcEditCompleted,
  WORKSPACE_SYNC_ACTION.ifcGenerateFromBubbleCompleted,
  WORKSPACE_SYNC_ACTION.floorPlanGenerateCompleted,
  WORKSPACE_SYNC_ACTION.floorPlanUpdated,
  WORKSPACE_SYNC_ACTION.floorPlanUndo,
  WORKSPACE_SYNC_ACTION.floorPlanRedo,
  WORKSPACE_SYNC_ACTION.undoCompleted,
  WORKSPACE_SYNC_ACTION.redoCompleted,
])

export const IFC_STARTED_ACTION_SET = new Set<string>([
  WORKSPACE_SYNC_ACTION.ifcGenerateStarted,
  WORKSPACE_SYNC_ACTION.ifcEditStarted,
])

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(body: string): unknown {
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

export function parseProjectSyncMessage(message: IMessage): ProjectSyncMessage | null {
  const parsed = parseJson(message.body)
  return isObjectRecord(parsed) ? (parsed as ProjectSyncMessage) : null
}

export function parseStompErrorMessage(message: IMessage): StompErrorMessage | null {
  const parsed = parseJson(message.body)
  return isObjectRecord(parsed) ? (parsed as StompErrorMessage) : null
}

export function normalizeAction(message: ProjectSyncMessage): string | null {
  const raw = message.action ?? message.type ?? message.eventType
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toUpperCase()
  return normalized.length > 0 ? normalized : null
}

export function normalizePhaseStatus(value: unknown): PhaseStatus | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().toUpperCase()
  const normalized = (PHASE_STATUS_ALIAS_MAP[raw] ?? raw) as PhaseStatus
  return PHASE_STATUS_SET.has(normalized) ? normalized : null
}

function extractStringField(record: Record<string, unknown>, key: string): string | null {
  const raw = record[key]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractIfcUrlFromRecord(record: Record<string, unknown>): string | null {
  return extractStringField(record, 'outputIfcStorageUrl')
    ?? extractStringField(record, 'ifcStorageUrl')
    ?? extractStringField(record, 's3Url')
    ?? extractStringField(record, 'currentIfcUrl')
}

function extractIfcAssetIdFromRecord(record: Record<string, unknown>): string | null {
  return extractStringField(record, 'assetId')
    ?? extractStringField(record, 'artifactId')
    ?? extractStringField(record, 'outputArtifactId')
}

function extractIntegerField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/**
 * payload / output 루트에서 floorPlanPayloadJson 또는 bubbleSnapshotJson을 순서대로 모은다.
 * - 최상위 direct payload를 우선
 * - payload, output 내부 nested payload를 폴백
 */
function collectNestedPayloadCandidates(
  directPayload: unknown,
  message: ProjectSyncMessage,
  nestedKey: 'floorPlanPayloadJson' | 'bubbleSnapshotJson',
): unknown[] {
  const candidates: unknown[] = [directPayload]

  if (isObjectRecord(message.payload)) {
    candidates.push(message.payload[nestedKey])
  }
  if (isObjectRecord(message.output)) {
    candidates.push(message.output[nestedKey])
  }

  return candidates
}

function collectEnvelopeCandidates(message: ProjectSyncMessage): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = []
  if (isObjectRecord(message.payload)) candidates.push(message.payload)
  if (isObjectRecord(message.output)) candidates.push(message.output)
  return candidates
}

function extractBaseIndexFromFloorPlanPayload(payload: unknown): number | null {
  if (!isObjectRecord(payload)) return null
  const baseIndex = extractIntegerField(payload, 'baseIndex')
  if (baseIndex !== null) return baseIndex

  const layout = payload.layout
  if (isObjectRecord(layout)) {
    return extractIntegerField(layout, 'baseIndex')
  }
  return null
}

function extractRevisionIdFromRecord(record: Record<string, unknown>): string | null {
  return extractStringField(record, 'revisionId')
    ?? extractStringField(record, 'targetRevisionId')
    ?? extractStringField(record, 'currentRevisionId')
    ?? extractStringField(record, 'currentRevision')
    ?? extractStringField(record, 'sourceRevisionId')
}

/**
 * 프로젝트 sync 메시지에서 IFC 산출물 URL을 추출한다.
 * - 최상위 필드 우선
 * - payload/output 중첩 필드 순차 폴백
 */
export function extractIfcStorageUrl(message: ProjectSyncMessage): string | null {
  const direct = message.outputIfcStorageUrl
    ?? message.ifcStorageUrl
    ?? message.s3Url
    ?? message.currentIfcUrl
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim()
  }

  for (const envelope of collectEnvelopeCandidates(message)) {
    const envelopeUrl = extractIfcUrlFromRecord(envelope)
    if (envelopeUrl) return envelopeUrl

    const nestedFloorPlanPayload = envelope.floorPlanPayloadJson
    if (isObjectRecord(nestedFloorPlanPayload)) {
      const nestedPayloadUrl = extractIfcUrlFromRecord(nestedFloorPlanPayload)
      if (nestedPayloadUrl) return nestedPayloadUrl
    }
  }

  if (isObjectRecord(message.floorPlanPayloadJson)) {
    const floorPlanPayloadUrl = extractIfcUrlFromRecord(message.floorPlanPayloadJson)
    if (floorPlanPayloadUrl) return floorPlanPayloadUrl
  }
  return null
}

/**
 * 프로젝트 sync 메시지에서 IFC 에셋 UUID를 추출한다.
 * - BE가 download-url API 호출에 사용할 assetId를 메시지에 포함하는 경우 반환
 */
export function extractIfcAssetId(message: ProjectSyncMessage): string | null {
  const direct = message.assetId ?? message.artifactId ?? message.outputArtifactId
  if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim()

  for (const envelope of collectEnvelopeCandidates(message)) {
    const envelopeId = extractIfcAssetIdFromRecord(envelope)
    if (envelopeId) return envelopeId

    const nestedFloorPlanPayload = envelope.floorPlanPayloadJson
    if (isObjectRecord(nestedFloorPlanPayload)) {
      const nestedPayloadId = extractIfcAssetIdFromRecord(nestedFloorPlanPayload)
      if (nestedPayloadId) return nestedPayloadId
    }
  }

  if (isObjectRecord(message.floorPlanPayloadJson)) {
    const floorPlanPayloadId = extractIfcAssetIdFromRecord(message.floorPlanPayloadJson)
    if (floorPlanPayloadId) return floorPlanPayloadId
  }

  return null
}

export function extractRevisionId(message: ProjectSyncMessage): string | null {
  const direct = extractRevisionIdFromRecord(message as unknown as Record<string, unknown>)
  if (direct) return direct

  if (isObjectRecord(message.floorPlanPayloadJson)) {
    const payloadRevisionId = extractRevisionIdFromRecord(message.floorPlanPayloadJson)
    if (payloadRevisionId) return payloadRevisionId
  }

  for (const envelope of collectEnvelopeCandidates(message)) {
    const envelopeRevisionId = extractRevisionIdFromRecord(envelope)
    if (envelopeRevisionId) return envelopeRevisionId

    const nestedFloorPlanPayload = envelope.floorPlanPayloadJson
    if (isObjectRecord(nestedFloorPlanPayload)) {
      const nestedRevisionId = extractRevisionIdFromRecord(nestedFloorPlanPayload)
      if (nestedRevisionId) return nestedRevisionId
    }
  }

  return null
}

export function isBubbleSnapshotPayload(value: unknown): value is BubbleSnapshotPayload {
  if (!isObjectRecord(value)) return false
  const bubbles = value.bubbles
  const connections = value.connections
  return Array.isArray(bubbles) && Array.isArray(connections)
}

export function isFloorPlanSnapshotPayload(value: unknown): value is FloorPlanSnapshotPayload {
  if (!isBubbleSnapshotPayload(value)) return false
  const layout = (value as unknown as Record<string, unknown>).layout
  return layout == null || isObjectRecord(layout)
}

/** FLOOR_PLAN_UPDATED 이벤트에서 동봉된 버블 스냅샷을 추출한다. */
export function extractFloorPlanBubbleSnapshot(message: ProjectSyncMessage): BubbleSnapshotPayload | null {
  const candidates = collectNestedPayloadCandidates(
    message.floorPlanPayloadJson,
    message,
    'floorPlanPayloadJson',
  )
  for (const candidate of candidates) {
    if (isBubbleSnapshotPayload(candidate)) return candidate
  }

  return null
}

export function extractFloorPlanSnapshot(message: ProjectSyncMessage): FloorPlanSnapshotPayload | null {
  const candidates = collectNestedPayloadCandidates(
    message.floorPlanPayloadJson,
    message,
    'floorPlanPayloadJson',
  )
  for (const candidate of candidates) {
    if (isFloorPlanSnapshotPayload(candidate)) return candidate
  }

  return null
}

export function extractFloorPlanBaseIndex(message: ProjectSyncMessage): number | null {
  const candidates = collectNestedPayloadCandidates(
    message.floorPlanPayloadJson,
    message,
    'floorPlanPayloadJson',
  )
  for (const candidate of candidates) {
    const baseIndex = extractBaseIndexFromFloorPlanPayload(candidate)
    if (baseIndex !== null) return baseIndex
  }

  return null
}

export function extractBubbleBaseIndex(message: ProjectSyncMessage): number | null {
  const candidates = collectNestedPayloadCandidates(
    message.bubbleSnapshotJson,
    message,
    'bubbleSnapshotJson',
  )
  for (const candidate of candidates) {
    if (!isObjectRecord(candidate)) continue
    const baseIndex = extractIntegerField(candidate, 'baseIndex')
    if (baseIndex !== null) return baseIndex
  }

  for (const envelope of collectEnvelopeCandidates(message)) {
    const baseIndex = extractIntegerField(envelope, 'baseIndex')
    if (baseIndex !== null) return baseIndex
  }

  return null
}
