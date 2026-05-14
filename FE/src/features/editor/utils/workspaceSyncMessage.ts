import type { IMessage } from '@stomp/stompjs'
import type {
  BubbleData,
  ConnectionData,
  FloorLayer,
  FloorOpening,
  FloorWall,
  IfcElementChange,
  PhaseStatus,
} from '../types'

export interface BubbleSnapshotPayload {
  bubbles: BubbleData[]
  connections: ConnectionData[]
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
    const payloadUrl = extractIfcUrlFromRecord(message.payload)
    if (payloadUrl) return payloadUrl
    if (isObjectRecord(message.payload.floorPlanPayloadJson)) {
      const nestedPayloadUrl = extractIfcUrlFromRecord(message.payload.floorPlanPayloadJson)
      if (nestedPayloadUrl) return nestedPayloadUrl
    }
  }

  if (isObjectRecord(message.output)) {
    const outputUrl = extractIfcUrlFromRecord(message.output)
    if (outputUrl) return outputUrl
    if (isObjectRecord(message.output.floorPlanPayloadJson)) {
      return extractIfcUrlFromRecord(message.output.floorPlanPayloadJson)
    }
  }

  if (isObjectRecord(message.floorPlanPayloadJson)) {
    return extractIfcUrlFromRecord(message.floorPlanPayloadJson)
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
    const payloadId = extractIfcAssetIdFromRecord(message.payload)
    if (payloadId) return payloadId
    if (isObjectRecord(message.payload.floorPlanPayloadJson)) {
      const nestedPayloadId = extractIfcAssetIdFromRecord(message.payload.floorPlanPayloadJson)
      if (nestedPayloadId) return nestedPayloadId
    }
  }

  if (isObjectRecord(message.output)) {
    const outputId = extractIfcAssetIdFromRecord(message.output)
    if (outputId) return outputId
    if (isObjectRecord(message.output.floorPlanPayloadJson)) {
      return extractIfcAssetIdFromRecord(message.output.floorPlanPayloadJson)
    }
  }

  if (isObjectRecord(message.floorPlanPayloadJson)) {
    return extractIfcAssetIdFromRecord(message.floorPlanPayloadJson)
  }

  return null
}

export function extractRevisionId(message: ProjectSyncMessage): string | null {
  const direct = message.revisionId
  if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim()

  if (isObjectRecord(message.floorPlanPayloadJson)) {
    const payloadRevisionId = extractStringField(message.floorPlanPayloadJson, 'revisionId')
    if (payloadRevisionId) return payloadRevisionId
  }

  if (isObjectRecord(message.payload)) {
    const payloadRevisionId = extractStringField(message.payload, 'revisionId')
    if (payloadRevisionId) return payloadRevisionId
    if (isObjectRecord(message.payload.floorPlanPayloadJson)) {
      const nestedRevisionId = extractStringField(message.payload.floorPlanPayloadJson, 'revisionId')
      if (nestedRevisionId) return nestedRevisionId
    }
  }

  if (isObjectRecord(message.output)) {
    const outputRevisionId = extractStringField(message.output, 'revisionId')
    if (outputRevisionId) return outputRevisionId
    if (isObjectRecord(message.output.floorPlanPayloadJson)) {
      const nestedRevisionId = extractStringField(message.output.floorPlanPayloadJson, 'revisionId')
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

export function extractFloorPlanSnapshot(message: ProjectSyncMessage): FloorPlanSnapshotPayload | null {
  const directPayload = message.floorPlanPayloadJson
  if (isFloorPlanSnapshotPayload(directPayload)) {
    return directPayload
  }

  if (isObjectRecord(message.payload)) {
    const nestedPayload = message.payload.floorPlanPayloadJson
    if (isFloorPlanSnapshotPayload(nestedPayload)) {
      return nestedPayload
    }
  }

  if (isObjectRecord(message.output)) {
    const nestedOutput = message.output.floorPlanPayloadJson
    if (isFloorPlanSnapshotPayload(nestedOutput)) {
      return nestedOutput
    }
  }

  return null
}

export function extractFloorPlanBaseIndex(message: ProjectSyncMessage): number | null {
  const payload = message.floorPlanPayloadJson
  if (isObjectRecord(payload) && typeof payload.baseIndex === 'number' && Number.isInteger(payload.baseIndex)) {
    return payload.baseIndex
  }
  if (
    isObjectRecord(payload) &&
    isObjectRecord(payload.layout) &&
    typeof payload.layout.baseIndex === 'number' &&
    Number.isInteger(payload.layout.baseIndex)
  ) {
    return payload.layout.baseIndex
  }

  if (isObjectRecord(message.payload)) {
    const nestedPayload = message.payload.floorPlanPayloadJson
    if (
      isObjectRecord(nestedPayload) &&
      typeof nestedPayload.baseIndex === 'number' &&
      Number.isInteger(nestedPayload.baseIndex)
    ) {
      return nestedPayload.baseIndex
    }
    if (
      isObjectRecord(nestedPayload) &&
      isObjectRecord(nestedPayload.layout) &&
      typeof nestedPayload.layout.baseIndex === 'number' &&
      Number.isInteger(nestedPayload.layout.baseIndex)
    ) {
      return nestedPayload.layout.baseIndex
    }
  }

  if (isObjectRecord(message.output)) {
    const nestedOutput = message.output.floorPlanPayloadJson
    if (
      isObjectRecord(nestedOutput) &&
      typeof nestedOutput.baseIndex === 'number' &&
      Number.isInteger(nestedOutput.baseIndex)
    ) {
      return nestedOutput.baseIndex
    }
    if (
      isObjectRecord(nestedOutput) &&
      isObjectRecord(nestedOutput.layout) &&
      typeof nestedOutput.layout.baseIndex === 'number' &&
      Number.isInteger(nestedOutput.layout.baseIndex)
    ) {
      return nestedOutput.layout.baseIndex
    }
  }

  return null
}

export function extractBubbleBaseIndex(message: ProjectSyncMessage): number | null {
  const payload = message.bubbleSnapshotJson
  if (isObjectRecord(payload) && typeof payload.baseIndex === 'number' && Number.isInteger(payload.baseIndex)) {
    return payload.baseIndex
  }

  if (isObjectRecord(message.payload)) {
    const nestedPayload = message.payload.bubbleSnapshotJson
    if (
      isObjectRecord(nestedPayload) &&
      typeof nestedPayload.baseIndex === 'number' &&
      Number.isInteger(nestedPayload.baseIndex)
    ) {
      return nestedPayload.baseIndex
    }
  }

  if (isObjectRecord(message.output)) {
    const nestedOutput = message.output.bubbleSnapshotJson
    if (
      isObjectRecord(nestedOutput) &&
      typeof nestedOutput.baseIndex === 'number' &&
      Number.isInteger(nestedOutput.baseIndex)
    ) {
      return nestedOutput.baseIndex
    }
  }

  if (isObjectRecord(message.payload) && typeof message.payload.baseIndex === 'number' && Number.isInteger(message.payload.baseIndex)) {
    return message.payload.baseIndex
  }

  if (isObjectRecord(message.output) && typeof message.output.baseIndex === 'number' && Number.isInteger(message.output.baseIndex)) {
    return message.output.baseIndex
  }

  return null
}
