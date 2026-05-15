import type { BubbleData, ConnectionData, WorkspaceSnapshot, ZoneData } from '../types'
import {
  normalizeBubbleFloor,
  normalizeBubbleFloorName,
  normalizeBubbleFloorSet,
} from '../utils/bubbleFloorUtils'
import { resolveBubbleFloorFromUnknown } from '../utils/bubbleSnapshotSyncUtils'

export interface WorkspaceBubbleFloorMetaPayload {
  namesByFloor: Record<number, string>
  extraFloors: number[]
}

export interface WorkspaceBubbleNodePayload {
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
}

export interface WorkspaceBubbleConnectionPayload {
  from: string
  to: string
  type: string
}

export interface WorkspaceBubbleSnapshotPayload {
  bubbles: WorkspaceBubbleNodePayload[]
  connections: WorkspaceBubbleConnectionPayload[]
  zones?: WorkspaceBubbleZonePayload[]
  floorMeta?: WorkspaceBubbleFloorMetaPayload
}

export interface WorkspaceBubbleZonePayload {
  id: string
  name: string
  color: string
  bubbleIds: string[]
  source: ZoneData['source']
}

/**
 * 버블 데이터를 서버 저장/동기화용 payload 형식으로 변환한다.
 */
export const mapBubbleToWorkspacePayload = (
  bubble: BubbleData,
): WorkspaceBubbleNodePayload => {
  const floor = resolveBubbleFloorFromUnknown(bubble as BubbleData & Record<string, unknown>)
  return {
    id: bubble.id,
    floor,
    layer: floor,
    level: floor,
    floorNumber: floor,
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
  }
}

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
 * 조닝 데이터를 서버 payload 형식으로 변환한다.
 */
export const mapZoneToWorkspacePayload = (
  zone: ZoneData,
): WorkspaceBubbleZonePayload => ({
  id: zone.id,
  name: zone.name,
  color: zone.color,
  bubbleIds: [...zone.bubbleIds],
  source: zone.source,
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

const buildFloorMetaPayload = (
  bubbles: WorkspaceBubbleNodePayload[],
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): WorkspaceBubbleFloorMetaPayload => {
  const floorSet = new Set<number>()
  const floorNameEntries = Object.entries(floorMeta?.namesByFloor ?? {})
  const extraFloorCandidates = floorMeta?.extraFloors ?? []

  bubbles.forEach((bubble) => {
    floorSet.add(normalizeBubbleFloor(bubble.floor))
  })
  extraFloorCandidates.forEach((floor) => {
    floorSet.add(normalizeBubbleFloor(floor))
  })
  floorNameEntries.forEach(([floor]) => {
    floorSet.add(normalizeBubbleFloor(Number(floor)))
  })
  if (floorSet.size === 0) {
    floorSet.add(normalizeBubbleFloor(undefined))
  }

  const floors = normalizeBubbleFloorSet(floorSet)
  const namesByFloor = Object.fromEntries(
    floors.map((floor) => [floor, normalizeBubbleFloorName(undefined, floor)]),
  ) as Record<number, string>

  floorNameEntries.forEach(([rawFloor, rawName]) => {
    const floor = normalizeBubbleFloor(Number(rawFloor))
    namesByFloor[floor] = normalizeBubbleFloorName(rawName, floor)
  })

  const floorsWithBubble = new Set(
    bubbles.map((bubble) => normalizeBubbleFloor(bubble.floor)),
  )
  const explicitExtraFloors = new Set(
    extraFloorCandidates.map((floor) => normalizeBubbleFloor(floor)),
  )
  const extraFloors = floors.filter(
    (floor) => explicitExtraFloors.has(floor) || !floorsWithBubble.has(floor),
  )

  return { namesByFloor, extraFloors }
}

/**
 * 버블/연결선/층 메타데이터를 워크스페이스 저장 payload로 합친다.
 */
export const mapBubbleSnapshotToWorkspacePayload = (
  bubbles: BubbleData[],
  connections: ConnectionData[],
  zones?: ZoneData[],
  floorMeta?: WorkspaceBubbleFloorMetaPayload,
): WorkspaceBubbleSnapshotPayload => {
  const bubblePayload = bubbles.map(mapBubbleToWorkspacePayload)
  return {
    bubbles: bubblePayload,
    connections: connections.map(mapConnectionToWorkspacePayload),
    zones: zones?.map(mapZoneToWorkspacePayload) ?? [],
    floorMeta: buildFloorMetaPayload(bubblePayload, floorMeta),
  }
}
