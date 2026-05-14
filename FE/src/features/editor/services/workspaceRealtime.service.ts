import { ensureStompConnected } from '@/shared/lib/stomp'
import type { BubbleData, ConnectionData, ConnectionStyle, WorkspaceSnapshot } from '../types'
import { mapFloorMetaFromWorkspaceSnapshot } from './workspaceBubblePayloadMapper'
import { resolveBubbleFloorFromUnknown } from '../utils/bubbleSnapshotSyncUtils'

export type FloorPlanSceneType = 'TWO_D' | 'THREE_D'

interface WorkspaceBubblePayload {
  bubbles: Array<{
    id: string
    floor?: number
    layer?: number
    level?: number
    floorNumber?: number
    x: number
    y: number
    width: number
    height: number
    widthMm: number
    heightMm: number
    label: string
    type: string
    ratio: number
    color?: string
  }>
  connections: Array<{
    from: string
    to: string
    type: ConnectionStyle
  }>
  floorMeta?: {
    namesByFloor: Record<number, string>
    extraFloors: number[]
  }
  baseIndex: number
}

interface WorkspaceFloorPlanPayload extends WorkspaceBubblePayload {
  sceneType: FloorPlanSceneType
  revisionId?: string | null
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
  const bubbles = snapshot.bubbles.map(toWorkspaceBubble)
  return {
    bubbles,
    connections: normalizeConnections(snapshot.connections, bubbles),
    floorMeta: mapFloorMetaFromWorkspaceSnapshot(snapshot),
    baseIndex,
  }
}

const toTwoDFloorPlanPayload = (
  snapshot: WorkspaceSnapshot,
  baseIndex: number,
  revisionId?: string | null,
  sceneType: FloorPlanSceneType = 'TWO_D',
): WorkspaceFloorPlanPayload => ({
  ...toBubblePayload(snapshot, baseIndex),
  sceneType,
  revisionId,
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

const publishJson = async (destination: string, body: unknown): Promise<void> => {
  const client = await ensureStompConnected()
  client.publish({
    destination,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export const workspaceRealtimeService = {
  publishSnapshot: ({
    projectId,
    snapshot,
    baseIndex,
    revisionId,
    sceneType,
  }: PublishWorkspaceSnapshotInput): Promise<void> => {
    const shouldPublishBubbleSnapshot = snapshot.phaseStatus === 'BUBBLE_DRAFT'

    if (shouldPublishBubbleSnapshot) {
      return publishJson(
        `/app/project/${projectId}/bubble/update`,
        toBubblePayload(snapshot, baseIndex),
      )
    }

    return publishJson(
      `/app/project/${projectId}/floor-plan/update`,
      toTwoDFloorPlanPayload(snapshot, baseIndex, revisionId, sceneType),
    )
  },
}
