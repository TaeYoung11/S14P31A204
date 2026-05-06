import { getStompClient } from '@/shared/lib/stomp'
import type { BubbleData, ConnectionData, ConnectionStyle, EditorDraftSnapshot } from '../types'

interface WorkspaceBubblePayload {
  bubbles: Array<{
    id: string
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
  baseIndex: number
}

interface WorkspaceFloorPlanPayload extends WorkspaceBubblePayload {
  revisionId?: string | null
  layout: {
    phaseStatus: EditorDraftSnapshot['phaseStatus']
    floorLayers: EditorDraftSnapshot['floorLayers']
    activeFloorLayerId: EditorDraftSnapshot['activeFloorLayerId']
    isFloorPlanGenerated: EditorDraftSnapshot['isFloorPlanGenerated']
    floorPlanLayoutSource: EditorDraftSnapshot['floorPlanLayoutSource']
    floorWalls: EditorDraftSnapshot['floorWalls']
    floorOpenings: EditorDraftSnapshot['floorOpenings']
    hiddenAutoWallIds: EditorDraftSnapshot['hiddenAutoWallIds']
    hiddenAutoOpeningIds: EditorDraftSnapshot['hiddenAutoOpeningIds']
    isProjectStructurePreferred: EditorDraftSnapshot['isProjectStructurePreferred']
    baseIndex: number
  }
}

export interface PublishWorkspaceSnapshotInput {
  projectId: string
  snapshot: EditorDraftSnapshot
  baseIndex: number
  revisionId?: string | null
}

const normalizePositiveNumber = (value: number, fallback: number): number => {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

const normalizeText = (value: string, fallback: string): string => {
  const normalized = value.trim()
  return normalized || fallback
}

const toWorkspaceBubble = (bubble: BubbleData): WorkspaceBubblePayload['bubbles'][number] => ({
  id: bubble.id,
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
})

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
  snapshot: EditorDraftSnapshot,
  baseIndex: number,
): WorkspaceBubblePayload => {
  const bubbles = snapshot.bubbles.map(toWorkspaceBubble)
  return {
    bubbles,
    connections: normalizeConnections(snapshot.connections, bubbles),
    baseIndex,
  }
}

const toFloorPlanPayload = (
  snapshot: EditorDraftSnapshot,
  baseIndex: number,
  revisionId?: string | null,
): WorkspaceFloorPlanPayload => ({
  ...toBubblePayload(snapshot, baseIndex),
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
    baseIndex,
  },
})

const getConnectedStompClient = async () => {
  const client = getStompClient()
  if (client.connected) return client

  if (!client.active) client.activate()

  await new Promise<void>((resolve, reject) => {
    let intervalId = 0
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId)
      reject(new Error('STOMP client connection timed out.'))
    }, 5000)

    intervalId = window.setInterval(() => {
      if (!client.connected) return
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      resolve()
    }, 50)
  })

  return client
}

const publishJson = async (destination: string, body: unknown): Promise<void> => {
  const client = await getConnectedStompClient()
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
  }: PublishWorkspaceSnapshotInput): Promise<void> => {
    if (snapshot.phaseStatus === 'BUBBLE_DRAFT') {
      return publishJson(
        `/app/project/${projectId}/bubble/update`,
        toBubblePayload(snapshot, baseIndex),
      )
    }

    return publishJson(
      `/app/project/${projectId}/floor-plan/update`,
      toFloorPlanPayload(snapshot, baseIndex, revisionId),
    )
  },
}
