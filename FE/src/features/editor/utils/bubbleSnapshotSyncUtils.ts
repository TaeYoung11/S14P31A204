import type { BubbleData, WorkspaceSnapshot } from '../types'
import {
  normalizeBubbleFloor,
  normalizeBubbleFloorName,
  normalizeBubbleFloorSet,
} from './bubbleFloorUtils'
import { readBubbleFloorMetaFromSnapshot, type BubbleFloorMetaState } from './bubbleSnapshotRecoveryUtils'
import type { BubbleSnapshotPayload } from './workspaceSyncMessage'

interface BubbleFloorMetaSource {
  namesByFloor?: Record<number, string> | Record<string, string>
  extraFloors?: number[]
}

interface NormalizeSnapshotBubblesOptions {
  previousById?: Map<string, BubbleData>
  defaultColor?: string
  areaUnitLabel?: 'm2' | 'm²'
}

interface ResolveBubbleSnapshotViewStateOptions extends NormalizeSnapshotBubblesOptions {
  fallbackFloorMeta?: BubbleFloorMetaSource | BubbleFloorMetaState | null
}

const BUBBLE_FLOOR_CANDIDATE_KEYS = [
  'floor',
  'floorNumber',
  'floorNo',
  'layer',
  'layerNumber',
  'level',
  'storey',
  'storeyNumber',
  'story',
  'storyNumber',
] as const

/**
 * 서버/클라이언트 간 floorMeta 스키마 차이를 흡수해 저장 가능한 형태로 정규화한다.
 */
export const normalizeBubbleFloorMetaForSync = (
  floorMeta: BubbleFloorMetaSource | null | undefined,
): { namesByFloor: Record<number, string>; extraFloors: number[] } => {
  if (!floorMeta) return { namesByFloor: {}, extraFloors: [] }
  return {
    namesByFloor: Object.fromEntries(
      Object.entries(floorMeta.namesByFloor ?? {}).map(([floor, name]) => {
        const normalizedFloor = normalizeBubbleFloor(Number(floor))
        return [normalizedFloor, normalizeBubbleFloorName(name, normalizedFloor)]
      }),
    ),
    extraFloors: (floorMeta.extraFloors ?? []).map((floor) => normalizeBubbleFloor(floor)),
  }
}

/**
 * 버블/층 메타에서 실제 UI에 표시해야 할 층 목록을 계산한다.
 */
export const resolveAvailableBubbleFloors = (
  bubbles: BubbleData[],
  floorMeta: BubbleFloorMetaSource,
): number[] => {
  const floors = normalizeBubbleFloorSet([
    ...bubbles.map((bubble) => normalizeBubbleFloor(bubble.floor)),
    ...Object.keys(floorMeta.namesByFloor ?? {}).map((floor) => normalizeBubbleFloor(Number(floor))),
    ...(floorMeta.extraFloors ?? []).map((floor) => normalizeBubbleFloor(floor)),
  ])
  return floors.length > 0 ? floors : [1]
}

/**
 * 다양한 floor 필드 후보(floor/layer/level/...)를 우선순위로 읽어 최종 층 번호를 결정한다.
 */
export const resolveBubbleFloorFromUnknown = (
  bubble: BubbleData & Record<string, unknown>,
): number => {
  for (const key of BUBBLE_FLOOR_CANDIDATE_KEYS) {
    const raw = bubble[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return normalizeBubbleFloor(raw)
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw.trim())
      if (Number.isFinite(parsed)) return normalizeBubbleFloor(parsed)
    }
  }
  return 1
}

/**
 * 원격/복구 스냅샷 버블을 편집 UI 표준 형태로 정규화한다.
 * - floor 후보 필드 병합
 * - area/index/color 기본값 보강
 * - 이전 로컬 상태의 표시용 속성(index/material) 유지
 */
export const normalizeSnapshotBubbles = (
  snapshotBubbles: BubbleData[],
  options?: NormalizeSnapshotBubblesOptions,
): BubbleData[] => {
  const previousById = options?.previousById
  const defaultColor = options?.defaultColor
  const areaUnitLabel = options?.areaUnitLabel ?? 'm²'

  return snapshotBubbles.map((bubble, index) => {
    const previous = previousById?.get(bubble.id)
    const defaultIndex = (index + 1).toString().padStart(2, '0')
    const areaLabel = Number.isFinite(bubble.ratio)
      ? `${bubble.ratio.toFixed(1)} ${areaUnitLabel}`
      : (previous?.area ?? `0.0 ${areaUnitLabel}`)

    return {
      ...bubble,
      floor: resolveBubbleFloorFromUnknown(bubble as BubbleData & Record<string, unknown>),
      area: areaLabel,
      index: previous?.index ?? bubble.index ?? defaultIndex,
      color: bubble.color ?? defaultColor ?? '#93c5fd',
      material: bubble.material ?? previous?.material,
    }
  })
}

/**
 * 버블 스냅샷을 화면 적용 전에 표준 형태로 정규화한다.
 * - 버블 floor/area/index 정규화
 * - floorMeta 보정(로컬 fallback 포함)
 * - 화면 표시용 층 목록 계산
 */
export const resolveBubbleSnapshotViewState = (
  snapshot: Pick<BubbleSnapshotPayload, 'bubbles' | 'floorMeta'>,
  options?: ResolveBubbleSnapshotViewStateOptions,
): {
  normalizedBubbles: BubbleData[]
  floorMeta: BubbleFloorMetaState
  availableFloors: number[]
} => {
  const normalizedBubbles = normalizeSnapshotBubbles(snapshot.bubbles, options)
  const fallbackFloorMeta = options?.fallbackFloorMeta
    ? normalizeBubbleFloorMetaForSync(options.fallbackFloorMeta)
    : undefined
  const floorMeta = readBubbleFloorMetaFromSnapshot(
    snapshot.floorMeta,
    normalizedBubbles,
    fallbackFloorMeta,
  )
  const availableFloors = resolveAvailableBubbleFloors(normalizedBubbles, floorMeta)
  return { normalizedBubbles, floorMeta, availableFloors }
}

/**
 * 워크스페이스 스냅샷을 버블 저장/추적 형식으로 직렬화한다.
 */
export const toBubbleSnapshotPayloadFromWorkspaceSnapshot = (
  snapshot: WorkspaceSnapshot,
): BubbleSnapshotPayload => {
  const normalized = normalizeBubbleFloorMetaForSync({
    namesByFloor: snapshot.bubbleFloorNamesByNumber ?? {},
    extraFloors: snapshot.extraBubbleFloors ?? [],
  })

  return {
    bubbles: snapshot.bubbles.map((bubble) => ({
      ...bubble,
      floor: resolveBubbleFloorFromUnknown(bubble as BubbleData & Record<string, unknown>),
    })),
    connections: snapshot.connections,
    floorMeta: {
      namesByFloor: Object.fromEntries(
        Object.entries(normalized.namesByFloor).map(([floor, name]) => [String(floor), name]),
      ),
      extraFloors: normalized.extraFloors,
    },
  }
}
