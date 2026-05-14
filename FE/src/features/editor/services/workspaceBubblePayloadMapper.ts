import type { BubbleData, ConnectionData, WorkspaceSnapshot } from '../types'
import { getRuntimeEnvBoolean } from '@/shared/lib/runtimeEnv'

/**
 * BE 호환 스위치:
 * - false(기본): floorMeta 필드를 전송하지 않아 구버전 BE와 호환
 * - true: floorMeta를 포함해 다층 메타데이터를 동기화
 */
const ENABLE_BUBBLE_FLOOR_META_SYNC = getRuntimeEnvBoolean(
  'VITE_ENABLE_BUBBLE_FLOOR_META_SYNC',
  false,
)

export interface WorkspaceBubbleFloorMetaPayload {
  namesByFloor: Record<number, string>
  extraFloors: number[]
}

export interface WorkspaceBubbleNodePayload {
  id: string
  floor?: number
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
}

export interface WorkspaceBubbleConnectionPayload {
  from: string
  to: string
  type: string
}

export interface WorkspaceBubbleSnapshotPayload {
  bubbles: WorkspaceBubbleNodePayload[]
  connections: WorkspaceBubbleConnectionPayload[]
  floorMeta?: WorkspaceBubbleFloorMetaPayload
}

/**
 * 버블 데이터를 서버 저장/동기화용 payload 형식으로 변환한다.
 */
export const mapBubbleToWorkspacePayload = (
  bubble: BubbleData,
): WorkspaceBubbleNodePayload => ({
  id: bubble.id,
  floor: bubble.floor,
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
})

/**
 * 연결선 데이터를 서버 payload 형식으로 변환한다.
 */
export const mapConnectionToWorkspacePayload = (
  connection: ConnectionData,
): WorkspaceBubbleConnectionPayload => ({
  from: connection.from,
  to: connection.to,
  type: connection.type,
})

/**
 * workspace snapshot에서 층 보기 메타데이터를 추출한다.
 */
export const mapFloorMetaFromWorkspaceSnapshot = (
  snapshot: Pick<WorkspaceSnapshot, 'bubbleFloorNamesByNumber' | 'extraBubbleFloors'>,
): WorkspaceBubbleFloorMetaPayload => ({
  namesByFloor: snapshot.bubbleFloorNamesByNumber,
  extraFloors: snapshot.extraBubbleFloors,
})

/**
 * 버블/연결선/층 메타데이터를 워크스페이스 저장 payload로 합친다.
 */
export const mapBubbleSnapshotToWorkspacePayload = (
  bubbles: BubbleData[],
  connections: ConnectionData[],
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): WorkspaceBubbleSnapshotPayload => ({
  bubbles: bubbles.map(mapBubbleToWorkspacePayload),
  connections: connections.map(mapConnectionToWorkspacePayload),
  ...(ENABLE_BUBBLE_FLOOR_META_SYNC && floorMeta ? {
    floorMeta: {
      namesByFloor: floorMeta.namesByFloor,
      extraFloors: floorMeta.extraFloors,
    },
  } : {}),
})
