import { useCallback, useEffect, useRef } from 'react'
import type { IMessage } from '@stomp/stompjs'
import { getStompClient } from '@/shared/lib/stomp'
import { getRuntimeEnvBoolean } from '@/shared/lib/runtimeEnv'
import type { BubbleData, ConnectionData, PhaseStatus } from '../types'
import { normalizeIfcSourceDedupeKey } from '../utils/ifcSource'
import { subscribeStompTopicsWithPolling } from '../utils/stompSubscription'
import {
  CURSOR_INVALID_CODE,
  FLOOR_PLAN_CURSOR_INVALID_CODE,
  IFC_COMPLETED_ACTION_SET,
  IFC_STARTED_ACTION_SET,
  PROJECT_JOBS_TOPIC_PREFIX,
  PROJECT_SYNC_TOPIC_PREFIX,
  USER_ERROR_TOPIC,
  WORKSPACE_SYNC_ACTION,
  extractBubbleBaseIndex,
  extractFloorPlanSnapshot,
  extractFloorPlanBaseIndex,
  extractIfcAssetId,
  extractRevisionId,
  extractIfcStorageUrl,
  isBubbleSnapshotPayload,
  isObjectRecord,
  normalizeAction,
  normalizePhaseStatus,
  parseProjectSyncMessage,
  parseStompErrorMessage,
  type BubbleSnapshotPayload,
  type FloorPlanSnapshotPayload,
} from '../utils/workspaceSyncMessage'

type HistoryCursor = { baseIndex: number; redoDepth: number }

interface UseBubbleSnapshotRealtimeParams {
  projectId: string | undefined
  canPublish: boolean
  bubbles: BubbleData[]
  connections: ConnectionData[]
  onRemoteSnapshot: (
    snapshot: BubbleSnapshotPayload,
    meta?: { action: string | null; payloadBaseIndex: number | null },
  ) => void
  onRemoteFloorPlanSnapshot?: (
    snapshot: FloorPlanSnapshotPayload,
    meta?: { action?: string | null; layoutOnly?: boolean },
  ) => void
  onPhaseStatusChanged?: (status: PhaseStatus) => void
  onIfcStorageUrlReceived?: (
    ifcStorageUrl: string,
    action: string | null,
    assetId: string | null,
    revisionId: string | null,
    floorPlanSnapshot?: FloorPlanSnapshotPayload | null,
  ) => void
  onBubbleHistoryCursorChanged?: (baseIndex: number, redoDepth: number) => void
  onFloorPlanHistoryCursorChanged?: (baseIndex: number, redoDepth: number) => void
  onBubbleHistoryCursorInvalid?: () => void
  onFloorPlanHistoryCursorInvalid?: () => void
  onServerError?: (error: { code?: string; message?: string }) => void
  bubbleHistoryCursor?: HistoryCursor
  floorPlanHistoryCursor?: HistoryCursor
}

const IFC_EVENT_DEDUP_TTL_MS = 2000
const IFC_URL_DEBUG = getRuntimeEnvBoolean('VITE_IFC_URL_DEBUG')
const WORKSPACE_HISTORY_MAX_INDEX = 9

/**
 * 버블 스냅샷 실시간 동기화 훅
 * - STOMP 구독으로 원격 변경사항/상태를 반영한다.
 * - 로컬 변경사항은 debounce publish로 전송한다.
 * - IFC 결과 URL 수신 시 상위 훅으로 전달한다.
 */
export function useBubbleSnapshotRealtime({
  projectId,
  canPublish: _canPublish,
  bubbles: _bubbles,
  connections: _connections,
  onRemoteSnapshot,
  onRemoteFloorPlanSnapshot,
  onPhaseStatusChanged,
  onIfcStorageUrlReceived,
  onBubbleHistoryCursorChanged,
  onFloorPlanHistoryCursorChanged,
  onBubbleHistoryCursorInvalid,
  onFloorPlanHistoryCursorInvalid,
  onServerError,
  bubbleHistoryCursor,
  floorPlanHistoryCursor,
}: UseBubbleSnapshotRealtimeParams) {
  const remoteSnapshotHandlerRef = useRef(onRemoteSnapshot)
  const phaseStatusHandlerRef = useRef(onPhaseStatusChanged)
  const floorPlanSnapshotHandlerRef = useRef(onRemoteFloorPlanSnapshot)
  const ifcStorageUrlHandlerRef = useRef(onIfcStorageUrlReceived)
  const bubbleHistoryCursorHandlerRef = useRef(onBubbleHistoryCursorChanged)
  const floorPlanHistoryCursorHandlerRef = useRef(onFloorPlanHistoryCursorChanged)
  const bubbleHistoryCursorInvalidHandlerRef = useRef(onBubbleHistoryCursorInvalid)
  const floorPlanHistoryCursorInvalidHandlerRef = useRef(onFloorPlanHistoryCursorInvalid)
  const serverErrorHandlerRef = useRef(onServerError)
  const baseIndexRef = useRef(-1)
  const bubbleRedoDepthRef = useRef(0)
  const floorPlanBaseIndexRef = useRef(-1)
  const floorPlanRedoDepthRef = useRef(0)
  const recentIfcEventRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    remoteSnapshotHandlerRef.current = onRemoteSnapshot
  }, [onRemoteSnapshot])

  useEffect(() => {
    phaseStatusHandlerRef.current = onPhaseStatusChanged
  }, [onPhaseStatusChanged])

  useEffect(() => {
    floorPlanSnapshotHandlerRef.current = onRemoteFloorPlanSnapshot
  }, [onRemoteFloorPlanSnapshot])

  useEffect(() => {
    ifcStorageUrlHandlerRef.current = onIfcStorageUrlReceived
  }, [onIfcStorageUrlReceived])

  useEffect(() => {
    bubbleHistoryCursorHandlerRef.current = onBubbleHistoryCursorChanged
  }, [onBubbleHistoryCursorChanged])

  useEffect(() => {
    floorPlanHistoryCursorHandlerRef.current = onFloorPlanHistoryCursorChanged
  }, [onFloorPlanHistoryCursorChanged])

  useEffect(() => {
    bubbleHistoryCursorInvalidHandlerRef.current = onBubbleHistoryCursorInvalid
  }, [onBubbleHistoryCursorInvalid])

  useEffect(() => {
    floorPlanHistoryCursorInvalidHandlerRef.current = onFloorPlanHistoryCursorInvalid
  }, [onFloorPlanHistoryCursorInvalid])

  useEffect(() => {
    serverErrorHandlerRef.current = onServerError
  }, [onServerError])

  useEffect(() => {
    if (!bubbleHistoryCursor) return
    baseIndexRef.current = bubbleHistoryCursor.baseIndex
    bubbleRedoDepthRef.current = bubbleHistoryCursor.redoDepth
  }, [bubbleHistoryCursor])

  useEffect(() => {
    if (!floorPlanHistoryCursor) return
    floorPlanBaseIndexRef.current = floorPlanHistoryCursor.baseIndex
    floorPlanRedoDepthRef.current = floorPlanHistoryCursor.redoDepth
  }, [floorPlanHistoryCursor])

  const markLocalBubbleSnapshotChanged = useCallback(() => {}, [])

  useEffect(() => {
    if (!projectId) return

    const client = getStompClient()
    const projectSyncTopic = `${PROJECT_SYNC_TOPIC_PREFIX}/${projectId}/sync`
    const floorPlanSyncTopic = `${PROJECT_SYNC_TOPIC_PREFIX}/${projectId}/floor-plan/sync`
    const projectJobsTopic = `${PROJECT_JOBS_TOPIC_PREFIX}/${projectId}/jobs`

    /**
     * 원격 스냅샷 적용 중에는 로컬 publish를 잠시 막아
     * 리플레이/재전송 루프를 방지한다.
     */
    const notifyBubbleHistoryCursor = () => {
      bubbleHistoryCursorHandlerRef.current?.(baseIndexRef.current, bubbleRedoDepthRef.current)
    }

    const notifyFloorPlanHistoryCursor = () => {
      floorPlanHistoryCursorHandlerRef.current?.(floorPlanBaseIndexRef.current, floorPlanRedoDepthRef.current)
    }

    const syncBubbleHistoryCursor = (action: string | null, payloadBaseIndex: number | null) => {
      if (action === WORKSPACE_SYNC_ACTION.bubbleUndo) {
        baseIndexRef.current = payloadBaseIndex ?? Math.max(-1, baseIndexRef.current - 1)
        bubbleRedoDepthRef.current += 1
      } else if (action === WORKSPACE_SYNC_ACTION.bubbleRedo) {
        baseIndexRef.current = payloadBaseIndex ?? Math.min(WORKSPACE_HISTORY_MAX_INDEX, baseIndexRef.current + 1)
        bubbleRedoDepthRef.current = Math.max(0, bubbleRedoDepthRef.current - 1)
      } else {
        baseIndexRef.current = payloadBaseIndex ?? baseIndexRef.current + 1
        bubbleRedoDepthRef.current = 0
      }
      notifyBubbleHistoryCursor()
    }

    const syncFloorPlanHistoryCursor = (action: string | null, payloadBaseIndex: number | null) => {
      if (action === WORKSPACE_SYNC_ACTION.floorPlanUndo) {
        floorPlanBaseIndexRef.current = Math.max(-1, floorPlanBaseIndexRef.current - 1)
        floorPlanRedoDepthRef.current += 1
      } else if (action === WORKSPACE_SYNC_ACTION.floorPlanRedo) {
        floorPlanBaseIndexRef.current = Math.min(WORKSPACE_HISTORY_MAX_INDEX, floorPlanBaseIndexRef.current + 1)
        floorPlanRedoDepthRef.current = Math.max(0, floorPlanRedoDepthRef.current - 1)
      } else if (
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
        action === WORKSPACE_SYNC_ACTION.floorPlanGenerateCompleted
      ) {
        floorPlanBaseIndexRef.current = payloadBaseIndex !== null
          ? Math.min(WORKSPACE_HISTORY_MAX_INDEX, payloadBaseIndex + 1)
          : floorPlanBaseIndexRef.current + 1
        floorPlanRedoDepthRef.current = 0
      }
      notifyFloorPlanHistoryCursor()
    }

    const applyRemoteSnapshot = (
      snapshot: BubbleSnapshotPayload,
      action: string | null,
      payloadBaseIndex: number | null,
    ) => {
      remoteSnapshotHandlerRef.current(snapshot, { action, payloadBaseIndex })
      syncBubbleHistoryCursor(action, payloadBaseIndex)
    }

    const applyFloorPlanSnapshot = (
      snapshot: FloorPlanSnapshotPayload,
      meta?: { action?: string | null; layoutOnly?: boolean },
    ) => {
      if (floorPlanSnapshotHandlerRef.current) {
        floorPlanSnapshotHandlerRef.current(snapshot, meta)
      } else {
        remoteSnapshotHandlerRef.current(snapshot)
      }
    }

    const handleProjectSyncMessage = (message: IMessage) => {
      const parsed = parseProjectSyncMessage(message)
      if (!parsed) return
      const action = normalizeAction(parsed)
      const floorPlanSnapshot = extractFloorPlanSnapshot(parsed)
      const shouldSyncFloorPlanHistoryCursor =
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
        action === WORKSPACE_SYNC_ACTION.floorPlanGenerateCompleted ||
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo
      const shouldApplyFloorPlanHistoryEvent =
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo

      const status = shouldSyncFloorPlanHistoryCursor
        ? normalizePhaseStatus(floorPlanSnapshot?.layout?.phaseStatus)
          ?? normalizePhaseStatus(parsed.status)
          ?? (isObjectRecord(parsed.payload) ? normalizePhaseStatus(parsed.payload.status) : null)
        : normalizePhaseStatus(parsed.status)
          ?? (isObjectRecord(parsed.payload) ? normalizePhaseStatus(parsed.payload.status) : null)
      if (status) {
        phaseStatusHandlerRef.current?.(status)
      } else if (action && IFC_STARTED_ACTION_SET.has(action)) {
        phaseStatusHandlerRef.current?.('CONVERTING')
      }

      if (action && IFC_COMPLETED_ACTION_SET.has(action)) {
        const ifcStorageUrl = extractIfcStorageUrl(parsed)
        const assetId = extractIfcAssetId(parsed)
        const revisionId = extractRevisionId(parsed)
        const floorPlanSnapshot = extractFloorPlanSnapshot(parsed)
        const dedupRaw = assetId
          ?? (revisionId ? `revision:${revisionId}` : null)
          ?? (ifcStorageUrl ? normalizeIfcSourceDedupeKey(ifcStorageUrl) : null)
        if (dedupRaw) {
          const dedupKey = `${action}:${dedupRaw}`
          const now = Date.now()
          const previous = recentIfcEventRef.current.get(dedupKey)
          if (typeof previous === 'number' && now - previous < IFC_EVENT_DEDUP_TTL_MS) {
            if (revisionId) {
              ifcStorageUrlHandlerRef.current?.(ifcStorageUrl ?? '', action, assetId, revisionId, floorPlanSnapshot)
            }
            return
          }
          recentIfcEventRef.current.set(dedupKey, now)
          for (const [key, timestamp] of recentIfcEventRef.current.entries()) {
            if (now - timestamp >= IFC_EVENT_DEDUP_TTL_MS) {
              recentIfcEventRef.current.delete(key)
            }
          }

          if (IFC_URL_DEBUG && typeof window !== 'undefined') {
            window.localStorage.setItem('ifc-last-ws-url', ifcStorageUrl ?? '')
          }
          ifcStorageUrlHandlerRef.current?.(ifcStorageUrl ?? '', action, assetId, revisionId, floorPlanSnapshot)
        } else if (revisionId) {
          ifcStorageUrlHandlerRef.current?.('', action, null, revisionId, floorPlanSnapshot)
        }
      }

      if (action === WORKSPACE_SYNC_ACTION.floorPlanProcessing) {
        return
      }

      const shouldApplyFloorPlanLayoutOnly =
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated && extractIfcStorageUrl(parsed) !== null

      // 평면도 저장 완료가 곧 발행(publish) 응답(echo)은 아닙니다. 백엔드는 먼저
      // FLOOR_PLAN_PROCESSING을 발생시키며, 이후 워커 웹훅이 IFC S3 URL을 포함한
      // FLOOR_PLAN_UPDATED 이벤트를 반환할 때 Redis 히스토리를 저장합니다.
      // 따라서, IFC URL이 포함되지 않은 업데이트 이벤트는 최종적인 평면도
      // 히스토리 승인(ack)으로 간주하지 않습니다.

      if (shouldSyncFloorPlanHistoryCursor) {
        syncFloorPlanHistoryCursor(action, extractFloorPlanBaseIndex(parsed))
      }

      if (shouldApplyFloorPlanHistoryEvent) {
        if (floorPlanSnapshot) {
          applyFloorPlanSnapshot(floorPlanSnapshot, {
            action,
            layoutOnly: shouldApplyFloorPlanLayoutOnly,
          })
        }
      }

      if (
        action !== WORKSPACE_SYNC_ACTION.bubbleUpdated &&
        action !== WORKSPACE_SYNC_ACTION.bubbleUndo &&
        action !== WORKSPACE_SYNC_ACTION.bubbleRedo
      ) return
      if (!isBubbleSnapshotPayload(parsed.bubbleSnapshotJson)) return

      applyRemoteSnapshot(parsed.bubbleSnapshotJson, action, extractBubbleBaseIndex(parsed))
    }

    const handleErrorMessage = (message: IMessage) => {
      const parsed = parseStompErrorMessage(message)
      if (!parsed?.code) return
      if (parsed.code === CURSOR_INVALID_CODE) {
        bubbleHistoryCursorInvalidHandlerRef.current?.()
        return
      }
      if (parsed.code === FLOOR_PLAN_CURSOR_INVALID_CODE) {
        floorPlanHistoryCursorInvalidHandlerRef.current?.()
        return
      }
      serverErrorHandlerRef.current?.(parsed)
    }

    return subscribeStompTopicsWithPolling({
      client,
      topics: [
        { destination: projectSyncTopic, onMessage: handleProjectSyncMessage },
        { destination: floorPlanSyncTopic, onMessage: handleProjectSyncMessage },
        { destination: projectJobsTopic, onMessage: handleProjectSyncMessage },
        { destination: USER_ERROR_TOPIC, onMessage: handleErrorMessage },
      ],
    })
  }, [projectId])

  return {
    markLocalBubbleSnapshotChanged,
  }
}
