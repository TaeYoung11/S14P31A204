import type { BubbleData } from '../types'
import { isBubbleSnapshotPayload, type BubbleSnapshotPayload } from './workspaceSyncMessage'
import {
  normalizeBubbleFloor,
  normalizeBubbleFloorName,
  normalizeBubbleFloorSet,
} from './bubbleFloorUtils'

/**
 * 층 보기 메타데이터의 로컬 표현.
 */
export interface BubbleFloorMetaState {
  namesByFloor: Record<number, string>
  extraFloors: number[]
}

interface BubbleLocalDraftPayload {
  savedAt: number
  snapshot: BubbleSnapshotPayload
}

export interface BubbleSnapshotDebugSummary {
  bubbleCount: number
  connectionCount: number
  bubbleFloors: number[]
  floorMetaFloors: number[]
  floorCounts: Record<number, number>
  resolvedFloorCounts: Record<number, number>
  floorFieldPresenceCounts: Record<string, number>
  rawFloorTypeCounts: Record<string, number>
  rawFloorValues: unknown[]
  bubbleFloorRows: Array<{
    id: string
    rawFloor: unknown
    rawType: string
    normalizedFloor: number
    resolvedFloor: number
    floorCandidateValues: Record<string, unknown>
  }>
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

const resolveFloorFromCandidates = (candidateValues: unknown[]): number => {
  for (const value of candidateValues) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return normalizeBubbleFloor(value)
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim())
      if (Number.isFinite(parsed)) return normalizeBubbleFloor(parsed)
    }
  }
  return 1
}

/**
 * 원인 파악용 추적 로그 활성화 여부를 반환한다.
 * - editor:bubble-debug=1 이거나 editor:bubble-trace=1 이면 활성화
 */
export const isBubbleTraceEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    if ((window as typeof window & { __BUBBLE_TRACE__?: boolean }).__BUBBLE_TRACE__ === true) {
      return true
    }
    if (isBubbleDebugEnabled()) return true
    return window.localStorage.getItem('editor:bubble-trace') === '1'
  } catch {
    return false
  }
}

/**
 * 버블 저장/복원 원인 파악용 로그를 출력한다.
 */
export const logBubbleTrace = (label: string, payload: Record<string, unknown>): void => {
  if (!isBubbleTraceEnabled()) return
  console.log(`[bubble-trace] ${label}`, payload)
}

const createBubbleFloorMetaStorageKey = (projectId: string | undefined): string | null =>
  projectId ? `editor:bubble-floor-meta:${projectId}` : null

const createBubbleLocalDraftStorageKey = (projectId: string | undefined): string | null =>
  projectId ? `editor:bubble-local-draft:${projectId}` : null

/**
 * 브라우저 콘솔 디버그 활성화 여부를 반환한다.
 */
export const isBubbleDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    if ((window as typeof window & { __BUBBLE_DEBUG__?: boolean }).__BUBBLE_DEBUG__ === true) {
      return true
    }
    return window.localStorage.getItem('editor:bubble-debug') === '1'
  } catch {
    return false
  }
}

/**
 * bubble-debug 콘솔 로그를 일관된 prefix로 출력한다.
 */
export const logBubbleDebug = (...args: unknown[]) => {
  if (!isBubbleDebugEnabled()) return
  console.log('[bubble-debug][useEditorPage]', ...args)
}

/**
 * 층 메타데이터를 로컬스토리지에서 읽는다.
 */
export const readBubbleFloorMetaFromStorage = (projectId: string | undefined): BubbleFloorMetaState => {
  const storageKey = createBubbleFloorMetaStorageKey(projectId)
  if (!storageKey) return { namesByFloor: {}, extraFloors: [] }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return { namesByFloor: {}, extraFloors: [] }

    const parsed = JSON.parse(raw) as {
      namesByFloor?: Record<string, string>
      extraFloors?: number[]
    }
    const namesByFloor = parsed.namesByFloor && typeof parsed.namesByFloor === 'object'
      ? Object.entries(parsed.namesByFloor).reduce<Record<number, string>>((acc, [floor, name]) => {
        const numberFloor = normalizeBubbleFloor(Number(floor))
        acc[numberFloor] = normalizeBubbleFloorName(name, numberFloor)
        return acc
      }, {})
      : {}
    const extraFloors = Array.isArray(parsed.extraFloors)
      ? parsed.extraFloors.map((floor) => normalizeBubbleFloor(Number(floor)))
      : []

    return { namesByFloor, extraFloors }
  } catch (error) {
    console.warn('[editor] Failed to read bubble floor metadata from localStorage.', error)
    return { namesByFloor: {}, extraFloors: [] }
  }
}

/**
 * 층 보기 메타데이터를 로컬스토리지에 저장한다.
 */
export const writeBubbleFloorMetaToStorage = (
  projectId: string | undefined,
  meta: BubbleFloorMetaState,
): void => {
  const storageKey = createBubbleFloorMetaStorageKey(projectId)
  if (!storageKey) return
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        namesByFloor: meta.namesByFloor,
        extraFloors: meta.extraFloors,
      }),
    )
  } catch (error) {
    console.warn('[editor] Failed to persist bubble floor metadata to localStorage.', error)
  }
}

/**
 * 버블 스냅샷과 fallback 메타를 병합해 유효한 층 메타데이터를 만든다.
 */
export const readBubbleFloorMetaFromSnapshot = (
  floorMeta: BubbleSnapshotPayload['floorMeta'],
  snapshotBubbles: BubbleData[],
  fallbackMeta?: BubbleFloorMetaState,
): BubbleFloorMetaState => {
  const floorsInBubbles = normalizeBubbleFloorSet(snapshotBubbles.map((bubble) => normalizeBubbleFloor(bubble.floor)))
  const floorSet = new Set<number>(floorsInBubbles)

  const normalizedNamesByFloor: Record<number, string> = {}
  floorsInBubbles.forEach((floor) => {
    normalizedNamesByFloor[floor] = String(floor)
  })

  const hasFloorMetaObject = Boolean(floorMeta && typeof floorMeta === 'object')
  const shouldUseFallbackMeta = !hasFloorMetaObject && Boolean(fallbackMeta)

  if (shouldUseFallbackMeta && fallbackMeta) {
    Object.entries(fallbackMeta.namesByFloor).forEach(([floor, name]) => {
      const normalizedFloor = normalizeBubbleFloor(Number(floor))
      floorSet.add(normalizedFloor)
      normalizedNamesByFloor[normalizedFloor] = normalizeBubbleFloorName(name, normalizedFloor)
    })
    fallbackMeta.extraFloors
      .map((floor) => normalizeBubbleFloor(Number(floor)))
      .forEach((floor) => floorSet.add(floor))
  }

  const parsedExtraFloors = Array.isArray(floorMeta?.extraFloors)
    ? floorMeta.extraFloors.map((floor) => normalizeBubbleFloor(Number(floor)))
    : []
  parsedExtraFloors.forEach((floor) => floorSet.add(floor))

  if (floorMeta?.namesByFloor && typeof floorMeta.namesByFloor === 'object') {
    Object.entries(floorMeta.namesByFloor).forEach(([floor, name]) => {
      const normalizedFloor = normalizeBubbleFloor(Number(floor))
      floorSet.add(normalizedFloor)
      normalizedNamesByFloor[normalizedFloor] = normalizeBubbleFloorName(name, normalizedFloor)
    })
  }

  const sortedFloors = normalizeBubbleFloorSet(floorSet)
  if (sortedFloors.length === 0) sortedFloors.push(1)
  sortedFloors.forEach((floor) => {
    if (!normalizedNamesByFloor[floor]) normalizedNamesByFloor[floor] = String(floor)
  })

  const floorWithBubbleSet = new Set(floorsInBubbles)
  const normalizedExtraFloors = sortedFloors.filter((floor) => !floorWithBubbleSet.has(floor))

  return {
    namesByFloor: normalizedNamesByFloor,
    extraFloors: normalizedExtraFloors,
  }
}

/**
 * 현재 버블 스냅샷을 로컬 임시본으로 저장한다.
 * - 새로고침/이탈 직전 DB 저장 실패 시 복구 데이터로 사용한다.
 */
export const writeBubbleLocalDraftToStorage = (
  projectId: string | undefined,
  snapshot: BubbleSnapshotPayload,
): void => {
  const storageKey = createBubbleLocalDraftStorageKey(projectId)
  if (!storageKey) return
  try {
    const payload: BubbleLocalDraftPayload = { savedAt: Date.now(), snapshot }
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  } catch {
    // localStorage 저장 실패는 치명적이지 않아 무시한다.
  }
}

/**
 * 로컬 임시 버블 스냅샷을 읽는다.
 */
export const readBubbleLocalDraftFromStorage = (projectId: string | undefined): BubbleLocalDraftPayload | null => {
  const storageKey = createBubbleLocalDraftStorageKey(projectId)
  if (!storageKey) return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BubbleLocalDraftPayload
    if (!parsed || typeof parsed !== 'object') return null
    if (!Number.isFinite(parsed.savedAt) || !isBubbleSnapshotPayload(parsed.snapshot)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 로컬 임시 버블 스냅샷을 제거한다.
 */
export const clearBubbleLocalDraftFromStorage = (projectId: string | undefined): void => {
  const storageKey = createBubbleLocalDraftStorageKey(projectId)
  if (!storageKey) return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // localStorage 삭제 실패는 치명적이지 않아 무시한다.
  }
}

/**
 * 복구/디버깅 판단용으로 스냅샷 요약 정보를 만든다.
 */
export const summarizeBubbleSnapshotForDebug = (
  snapshot: BubbleSnapshotPayload | null | undefined,
): BubbleSnapshotDebugSummary => {
  if (!snapshot) {
    return {
      bubbleCount: 0,
      connectionCount: 0,
      bubbleFloors: [],
      floorMetaFloors: [],
      floorCounts: {},
      resolvedFloorCounts: {},
      floorFieldPresenceCounts: {},
      rawFloorTypeCounts: {},
      rawFloorValues: [],
      bubbleFloorRows: [],
    }
  }

  const floorCounts: Record<number, number> = {}
  const resolvedFloorCounts: Record<number, number> = {}
  const floorFieldPresenceCounts: Record<string, number> = {}
  const rawFloorTypeCounts: Record<string, number> = {}
  const rawFloorValues: unknown[] = []
  const bubbleFloorRows: Array<{
    id: string
    rawFloor: unknown
    rawType: string
    normalizedFloor: number
    resolvedFloor: number
    floorCandidateValues: Record<string, unknown>
  }> = []
  snapshot.bubbles.forEach((bubble) => {
    const bubbleRecord = bubble as BubbleData & Record<string, unknown>
    const rawFloor = bubbleRecord.floor
    const floorCandidateValues: Record<string, unknown> = {}
    BUBBLE_FLOOR_CANDIDATE_KEYS.forEach((key) => {
      const value = bubbleRecord[key]
      floorCandidateValues[key] = value
      if (value !== undefined && value !== null && value !== '') {
        floorFieldPresenceCounts[key] = (floorFieldPresenceCounts[key] ?? 0) + 1
      }
    })
    const floor = normalizeBubbleFloor(bubble.floor)
    const resolvedFloor = resolveFloorFromCandidates(
      BUBBLE_FLOOR_CANDIDATE_KEYS.map((key) => bubbleRecord[key]),
    )
    floorCounts[floor] = (floorCounts[floor] ?? 0) + 1
    resolvedFloorCounts[resolvedFloor] = (resolvedFloorCounts[resolvedFloor] ?? 0) + 1
    const rawType = Array.isArray(rawFloor) ? 'array' : typeof rawFloor
    rawFloorTypeCounts[rawType] = (rawFloorTypeCounts[rawType] ?? 0) + 1
    rawFloorValues.push(rawFloor)
    bubbleFloorRows.push({
      id: bubble.id,
      rawFloor,
      rawType,
      normalizedFloor: floor,
      resolvedFloor,
      floorCandidateValues,
    })
  })

  const bubbleFloors = Object.keys(floorCounts).map((floor) => normalizeBubbleFloor(Number(floor))).sort((a, b) => a - b)
  const floorMetaFloors = normalizeBubbleFloorSet([
    ...Object.keys(snapshot.floorMeta?.namesByFloor ?? {}).map((floor) => normalizeBubbleFloor(Number(floor))),
    ...((snapshot.floorMeta?.extraFloors ?? []).map((floor) => normalizeBubbleFloor(floor))),
  ])

  return {
    bubbleCount: snapshot.bubbles.length,
    connectionCount: snapshot.connections.length,
    bubbleFloors,
    floorMetaFloors,
    floorCounts,
    resolvedFloorCounts,
    floorFieldPresenceCounts,
    rawFloorTypeCounts,
    rawFloorValues,
    bubbleFloorRows,
  }
}

/**
 * history가 "다층 정보는 있는데 버블은 1층으로만 있는" 평탄화 상태인지 판단한다.
 */
export const isPossiblyFlattenedFloorSnapshot = (summary: BubbleSnapshotDebugSummary): boolean => {
  if (summary.bubbleCount <= 0) return false
  const hasUpperFloorMeta = summary.floorMetaFloors.some((floor) => floor > 1)
  const allBubblesOnSingleFloor = summary.bubbleFloors.length === 1 && summary.bubbleFloors[0] === 1
  return hasUpperFloorMeta && allBubblesOnSingleFloor
}

/**
 * 로컬 층 메타데이터 기준으로 다층 힌트가 있는지 판단한다.
 */
export const hasMultipleFloorHintFromLocalMeta = (meta: BubbleFloorMetaState): boolean => {
  const hintedFloors = normalizeBubbleFloorSet([
    ...Object.keys(meta.namesByFloor).map((floor) => normalizeBubbleFloor(Number(floor))),
    ...meta.extraFloors.map((floor) => normalizeBubbleFloor(floor)),
  ])
  return hintedFloors.some((floor) => floor !== 1)
}

const hasMultiFloorSignal = (summary: BubbleSnapshotDebugSummary): boolean =>
  summary.bubbleFloors.some((floor) => floor !== 1) || summary.floorMetaFloors.some((floor) => floor !== 1)

/**
 * 복구 후보 스냅샷 우선순위를 비교한다.
 * - 버블 수
 * - 다층 신호 유무
 * - floor/floorMeta 다양성
 * - undefined floor 비율
 */
export const isSnapshotPreferredForRecovery = (
  candidate: BubbleSnapshotDebugSummary,
  baseline: BubbleSnapshotDebugSummary,
): boolean => {
  if (candidate.bubbleCount !== baseline.bubbleCount) {
    return candidate.bubbleCount > baseline.bubbleCount
  }
  const candidateMultiFloor = hasMultiFloorSignal(candidate)
  const baselineMultiFloor = hasMultiFloorSignal(baseline)
  if (candidateMultiFloor !== baselineMultiFloor) {
    return candidateMultiFloor
  }
  if (candidate.bubbleFloors.length !== baseline.bubbleFloors.length) {
    return candidate.bubbleFloors.length > baseline.bubbleFloors.length
  }
  if (candidate.floorMetaFloors.length !== baseline.floorMetaFloors.length) {
    return candidate.floorMetaFloors.length > baseline.floorMetaFloors.length
  }
  const candidateUndefinedFloorCount = candidate.rawFloorTypeCounts.undefined ?? 0
  const baselineUndefinedFloorCount = baseline.rawFloorTypeCounts.undefined ?? 0
  if (candidateUndefinedFloorCount !== baselineUndefinedFloorCount) {
    return candidateUndefinedFloorCount < baselineUndefinedFloorCount
  }
  return false
}
