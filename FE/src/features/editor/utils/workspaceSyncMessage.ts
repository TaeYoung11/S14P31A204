import type { IMessage } from '@stomp/stompjs'
import type { BubbleData, ConnectionData, PhaseStatus } from '../types'

export interface BubbleSnapshotPayload {
  bubbles: BubbleData[]
  connections: ConnectionData[]
}

export interface ProjectSyncMessage {
  type?: string
  eventType?: string
  action?: string
  status?: string
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

export const WORKSPACE_SYNC_ACTION = {
  bubbleUpdated: 'BUBBLE_UPDATED',
  floorPlanUpdated: 'FLOOR_PLAN_UPDATED',
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

  if (isObjectRecord(message.payload)) {
    const payloadUrl = extractStringField(message.payload, 'outputIfcStorageUrl')
      ?? extractStringField(message.payload, 'ifcStorageUrl')
      ?? extractStringField(message.payload, 's3Url')
      ?? extractStringField(message.payload, 'currentIfcUrl')
    if (payloadUrl) return payloadUrl
  }

  if (isObjectRecord(message.output)) {
    return extractStringField(message.output, 'outputIfcStorageUrl')
      ?? extractStringField(message.output, 'ifcStorageUrl')
      ?? extractStringField(message.output, 's3Url')
      ?? extractStringField(message.output, 'currentIfcUrl')
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

  if (isObjectRecord(message.payload)) {
    const payloadId = extractStringField(message.payload, 'assetId')
      ?? extractStringField(message.payload, 'artifactId')
      ?? extractStringField(message.payload, 'outputArtifactId')
    if (payloadId) return payloadId
  }

  if (isObjectRecord(message.output)) {
    return extractStringField(message.output, 'assetId')
      ?? extractStringField(message.output, 'artifactId')
      ?? extractStringField(message.output, 'outputArtifactId')
  }

  return null
}

export function isBubbleSnapshotPayload(value: unknown): value is BubbleSnapshotPayload {
  if (!isObjectRecord(value)) return false
  const bubbles = value.bubbles
  const connections = value.connections
  return Array.isArray(bubbles) && Array.isArray(connections)
}

/** FLOOR_PLAN_UPDATED 이벤트에서 동봉된 버블 스냅샷을 추출한다. */
export function extractFloorPlanBubbleSnapshot(message: ProjectSyncMessage): BubbleSnapshotPayload | null {
  const directPayload = message.floorPlanPayloadJson
  if (isBubbleSnapshotPayload(directPayload)) {
    return directPayload
  }

  if (isObjectRecord(message.payload)) {
    const nestedPayload = message.payload.floorPlanPayloadJson
    if (isBubbleSnapshotPayload(nestedPayload)) {
      return nestedPayload
    }
  }

  if (isObjectRecord(message.output)) {
    const nestedOutput = message.output.floorPlanPayloadJson
    if (isBubbleSnapshotPayload(nestedOutput)) {
      return nestedOutput
    }
  }

  return null
}
