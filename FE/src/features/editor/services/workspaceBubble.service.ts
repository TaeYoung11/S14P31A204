import { api } from '@/shared/lib/axios'
import type { BubbleData, ConnectionData } from '../types'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface SaveBubbleSnapshotRequest {
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
    color: string
  }>
  connections: Array<{
    from: string
    to: string
    type: string
  }>
}

export interface SaveBubbleSnapshotResponse {
  projectId: string
  phaseStatus: string
  savedAt: string
}

function toSaveBubbleRequest(
  bubbles: BubbleData[],
  connections: ConnectionData[],
): SaveBubbleSnapshotRequest {
  return {
    bubbles: bubbles.map((bubble) => ({
      id: bubble.id,
      x: bubble.x,
      y: bubble.y,
      width: bubble.width,
      height: bubble.height,
      widthMm: bubble.widthMm,
      heightMm: bubble.heightMm,
      label: bubble.label,
      type: bubble.type,
      ratio: bubble.ratio,
      color: bubble.color,
    })),
    connections: connections.map((connection) => ({
      from: connection.from,
      to: connection.to,
      type: connection.type,
    })),
  }
}

export async function saveBubbleSnapshotToDb(
  projectId: string,
  bubbles: BubbleData[],
  connections: ConnectionData[],
): Promise<SaveBubbleSnapshotResponse> {
  const response = await api.post<ApiResponse<SaveBubbleSnapshotResponse>>(
    `/projects/${projectId}/workspace/bubble/save`,
    toSaveBubbleRequest(bubbles, connections),
  )
  return response.data.data
}
