import { ensureStompConnected } from '@/shared/lib/stomp'
import type { BubbleData, ConnectionData, WorkspaceSnapshot } from '../types'
import {
  mapFloorMetaFromWorkspaceSnapshot,
  type WorkspaceBubbleConnectionPayload,
  type WorkspaceBubbleFloorMetaPayload,
  type WorkspaceBubbleNodePayload,
} from './workspaceBubblePayloadMapper'
import type { WorkspaceCommand } from '../types/workspaceCommand.types'
import { resolveBubbleFloorFromUnknown } from '../utils/bubbleSnapshotSyncUtils'

export type FloorPlanSceneType = 'TWO_D' | 'THREE_D'

interface WorkspaceBubblePayload {
  bubbles: WorkspaceBubbleNodePayload[]
  connections: WorkspaceBubbleConnectionPayload[]
  zones?: WorkspaceSnapshot['zones']
  floorMeta?: WorkspaceBubbleFloorMetaPayload
  baseIndex: number
}

interface WorkspaceFloorPlanPayload extends WorkspaceBubblePayload {
  sceneType: FloorPlanSceneType
  revisionId?: string | null
  workspaceCommand: WorkspaceCommand
  layout: {
    phaseStatus: WorkspaceSnapshot['phaseStatus']
    floorLayers: WorkspaceSnapshot['floorLayers']
    activeFloorLayerId: WorkspaceSnapshot['activeFloorLayerId']
    isFloorPlanGenerated: WorkspaceSnapshot['isFloorPlanGenerated']
    floorPlanLayoutSource: WorkspaceSnapshot['floorPlanLayoutSource']
    floorWalls: WorkspaceSnapshot['floorWalls']
    floorOpenings: WorkspaceSnapshot['floorOpenings']
    hiddenAutoWallIds: WorkspaceSnapshot['hiddenAutoWallIds']
    hiddenAutoOpeningIds: WorkspaceSnapshot['hiddenAutoOpeningIds']
    isProjectStructurePreferred: WorkspaceSnapshot['isProjectStructurePreferred']
    ifcElementChanges: WorkspaceSnapshot['ifcElementChanges']
    mode: 'ifc'
    baseIndex: number
  }
}

export interface PublishWorkspaceSnapshotInput {
  projectId: string
  snapshot: WorkspaceSnapshot
  baseIndex: number
  revisionId?: string | null
  sceneType?: FloorPlanSceneType
  workspaceCommand?: WorkspaceCommand | null
}

const normalizePositiveNumber = (value: number, fallback: number): number => {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

const normalizeText = (value: string, fallback: string): string => {
  const normalized = value.trim()
  return normalized || fallback
}

const toWorkspaceBubble = (bubble: BubbleData): WorkspaceBubblePayload['bubbles'][number] => {
  const floor = resolveBubbleFloorFromUnknown(bubble as BubbleData & Record<string, unknown>)
  return {
    id: bubble.id,
    floor,
    layer: floor,
    level: floor,
    floorNumber: floor,
    x: Number.isFinite(bubble.x) ? bubble.x : 0,
    y: Number.isFinite(bubble.y) ? bubble.y : 0,
    width: normalizePositiveNumber(bubble.width, 1),
    height: normalizePositiveNumber(bubble.height, 1),
    widthMm: normalizePositiveNumber(bubble.widthMm, 100),
    heightMm: normalizePositiveNumber(bubble.heightMm, 100),
    label: normalizeText(bubble.label, 'Untitled'),
    type: normalizeText(bubble.type, 'room'),
    ratio: normalizePositiveNumber(bubble.ratio, 0.01),
    color: bubble.color,
  }
}

const normalizeConnections = (
  connections: ConnectionData[],
  bubbles: WorkspaceBubblePayload['bubbles'],
): WorkspaceBubblePayload['connections'] => {
  const bubbleIdSet = new Set(bubbles.map((bubble) => bubble.id))
  return connections
    .filter((connection) => bubbleIdSet.has(connection.from) && bubbleIdSet.has(connection.to))
    .map((connection) => ({
      from: connection.from,
      to: connection.to,
      type: connection.type ?? 'thin',
    }))
}

const toBubblePayload = (
  snapshot: WorkspaceSnapshot,
  baseIndex: number,
): WorkspaceBubblePayload => {
  // 실시간 전송 payload는 서버 검증 실패를 줄이기 위해 기본값 보정을 적용한다.
  const bubbles = snapshot.bubbles.map(toWorkspaceBubble)
  return {
    bubbles,
    connections: normalizeConnections(snapshot.connections, bubbles),
    zones: snapshot.zones,
    floorMeta: mapFloorMetaFromWorkspaceSnapshot(snapshot),
    baseIndex,
  }
}

const toTwoDFloorPlanPayload = (
  snapshot: WorkspaceSnapshot,
  baseIndex: number,
  revisionId?: string | null,
  sceneType: FloorPlanSceneType = 'TWO_D',
  workspaceCommand?: WorkspaceCommand | null,
): WorkspaceFloorPlanPayload => ({
  ...toBubblePayload(snapshot, baseIndex),
  sceneType,
  revisionId,
  workspaceCommand: requireWorkspaceCommand(workspaceCommand),
  layout: {
    phaseStatus: snapshot.phaseStatus,
    floorLayers: snapshot.floorLayers,
    activeFloorLayerId: snapshot.activeFloorLayerId,
    isFloorPlanGenerated: snapshot.isFloorPlanGenerated,
    floorPlanLayoutSource: snapshot.floorPlanLayoutSource,
    floorWalls: snapshot.floorWalls,
    floorOpenings: snapshot.floorOpenings,
    hiddenAutoWallIds: snapshot.hiddenAutoWallIds,
    hiddenAutoOpeningIds: snapshot.hiddenAutoOpeningIds,
    isProjectStructurePreferred: snapshot.isProjectStructurePreferred,
    ifcElementChanges: snapshot.ifcElementChanges,
    mode: 'ifc',
    baseIndex,
  },
})

function requireWorkspaceCommand(workspaceCommand?: WorkspaceCommand | null): WorkspaceCommand {
  if (!workspaceCommand) {
    throw new Error('floor-plan update requires a workspace command.')
  }
  return workspaceCommand
}

const STOMP_PAYLOAD_SIZE_WARN_BYTES = 64 * 1024
const STOMP_PAYLOAD_SIZE_ERROR_BYTES = 4 * 1024 * 1024

const measureUtf8Bytes = (value: string): number =>
  typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).byteLength : value.length

const measureJsonBytes = (value: unknown): number => {
  if (value === undefined) return 0
  try {
    return measureUtf8Bytes(JSON.stringify(value))
  } catch {
    return 0
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${bytes}B`
}

const summarizeFloorPlanPayloadSizes = (body: unknown): Record<string, string> => {
  if (typeof body !== 'object' || body === null) return {}
  const record = body as Record<string, unknown>
  const layout = (record.layout ?? null) as Record<string, unknown> | null
  const sizes: Record<string, number> = {
    bubbles: measureJsonBytes(record.bubbles),
    connections: measureJsonBytes(record.connections),
    zones: measureJsonBytes(record.zones),
    floorMeta: measureJsonBytes(record.floorMeta),
    workspaceCommand: measureJsonBytes(record.workspaceCommand),
  }
  if (layout) {
    Object.assign(sizes, {
      'layout.floorLayers': measureJsonBytes(layout.floorLayers),
      'layout.floorWalls': measureJsonBytes(layout.floorWalls),
      'layout.floorOpenings': measureJsonBytes(layout.floorOpenings),
      'layout.ifcElementChanges': measureJsonBytes(layout.ifcElementChanges),
      'layout.hiddenAutoWallIds': measureJsonBytes(layout.hiddenAutoWallIds),
      'layout.hiddenAutoOpeningIds': measureJsonBytes(layout.hiddenAutoOpeningIds),
    })
  }
  return Object.fromEntries(
    Object.entries(sizes)
      .filter(([, bytes]) => bytes > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([key, bytes]) => [key, formatBytes(bytes)]),
  )
}

const publishJson = async (destination: string, body: unknown): Promise<void> => {
  const client = await ensureStompConnected()
  const bodyJson = JSON.stringify(body)
  const isFloorPlanUpdate = destination.includes('/floor-plan/update')
  // floor-plan/update는 누적된 layout 페이로드를 통째로 전송하므로,
  // BE WebSocket 한계(4MB)에 근접하기 전에 경고를 남긴다.
  if (isFloorPlanUpdate) {
    const totalBytes = measureUtf8Bytes(bodyJson)
    if (totalBytes >= STOMP_PAYLOAD_SIZE_ERROR_BYTES) {
      console.error('[stomp-publish-size][over-limit]', {
        destination,
        totalBytes,
        totalSize: formatBytes(totalBytes),
        breakdown: summarizeFloorPlanPayloadSizes(body),
      })
    } else if (totalBytes >= STOMP_PAYLOAD_SIZE_WARN_BYTES) {
      console.warn('[stomp-publish-size][warn]', {
        destination,
        totalBytes,
        totalSize: formatBytes(totalBytes),
        breakdown: summarizeFloorPlanPayloadSizes(body),
      })
    }
  }
  client.publish({
    destination,
    headers: {
      'content-type': 'application/json',
    },
    body: bodyJson,
  })
}

export const workspaceRealtimeService = {
  /**
   * 현재 phaseStatus에 따라 버블 또는 2D/3D floor-plan 채널로 snapshot을 발행한다.
   * - BUBBLE_DRAFT: `/bubble/update`
   * - 그 외: `/floor-plan/update`
   */
  publishSnapshot: ({
    projectId,
    snapshot,
    baseIndex,
    revisionId,
    sceneType,
    workspaceCommand,
  }: PublishWorkspaceSnapshotInput): Promise<void> => {
    const shouldPublishFloorPlanSnapshot = Boolean(sceneType || workspaceCommand)
    const shouldPublishBubbleSnapshot = snapshot.phaseStatus === 'BUBBLE_DRAFT' && !shouldPublishFloorPlanSnapshot

    if (shouldPublishBubbleSnapshot) {
      return publishJson(
        `/app/project/${projectId}/bubble/update`,
        toBubblePayload(snapshot, baseIndex),
      )
    }

    return publishJson(
      `/app/project/${projectId}/floor-plan/update`,
      toTwoDFloorPlanPayload(snapshot, baseIndex, revisionId, sceneType, workspaceCommand),
    )
  },
}
