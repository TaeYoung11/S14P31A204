import type { BubbleData, ConnectionData, ZoneData } from '../types'
import type { BubbleSnapshotPayload } from './workspaceSyncMessage'

type BubbleSnapshotComparable = Pick<
  BubbleSnapshotPayload,
  'bubbles' | 'connections' | 'zones' | 'floorMeta'
>

/**
 * 버블 스냅샷 동등성 비교용 시그니처를 생성한다.
 * zones가 누락된 payload는 빈 배열로 정규화해 비교 오탐을 줄인다.
 */
export function buildBubbleSnapshotSignature(snapshot: BubbleSnapshotComparable): string {
  return JSON.stringify({
    bubbles: snapshot.bubbles,
    connections: snapshot.connections,
    zones: snapshot.zones ?? [],
    floorMeta: snapshot.floorMeta,
  })
}

/**
 * 원격 payload의 zones가 누락된 경우 로컬 zones를 유지한다.
 * - 서버가 zones 필드를 생략하는 과도기 메시지를 안전하게 흡수한다.
 */
export function resolveSnapshotZonesOrFallback(
  zones: ZoneData[] | undefined,
  fallbackZones: ZoneData[],
): ZoneData[] {
  return Array.isArray(zones) ? zones : fallbackZones
}

/**
 * WorkspaceSnapshot에서 버블 스냅샷 비교에 필요한 최소 필드만 추린다.
 */
export function toComparableBubbleSnapshot(snapshot: {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones: ZoneData[]
  floorMeta?: BubbleSnapshotPayload['floorMeta']
}): BubbleSnapshotComparable {
  return {
    bubbles: snapshot.bubbles,
    connections: snapshot.connections,
    zones: snapshot.zones,
    floorMeta: snapshot.floorMeta,
  }
}
