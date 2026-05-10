import { useCallback, useEffect, useRef } from 'react'
import type { IMessage } from '@stomp/stompjs'
import { getStompClient } from '@/shared/lib/stomp'
import { getRuntimeEnvBoolean } from '@/shared/lib/runtimeEnv'
import type { BubbleData, ConnectionData, PhaseStatus } from '../types'
import { publishBubbleSnapshotUpdate } from '../services/workspaceCommand.service'
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
  extractFloorPlanBubbleSnapshot,
  extractFloorPlanBaseIndex,
  extractIfcAssetId,
  extractIfcStorageUrl,
  isBubbleSnapshotPayload,
  isObjectRecord,
  normalizeAction,
  normalizePhaseStatus,
  parseProjectSyncMessage,
  parseStompErrorMessage,
  type BubbleSnapshotPayload,
} from '../utils/workspaceSyncMessage'

interface UseBubbleSnapshotRealtimeParams {
  projectId: string | undefined
  canPublish: boolean
  bubbles: BubbleData[]
  connections: ConnectionData[]
  onRemoteSnapshot: (snapshot: BubbleSnapshotPayload) => void
  onPhaseStatusChanged?: (status: PhaseStatus) => void
  onIfcStorageUrlReceived?: (ifcStorageUrl: string, action: string | null, assetId: string | null) => void
  onBubbleHistoryCursorChanged?: (baseIndex: number, redoDepth: number) => void
  onFloorPlanHistoryCursorChanged?: (baseIndex: number, redoDepth: number) => void
}

const PUBLISH_DEBOUNCE_MS = 120
const IFC_EVENT_DEDUP_TTL_MS = 2000
const IFC_URL_DEBUG = getRuntimeEnvBoolean('VITE_IFC_URL_DEBUG')

/**
 * 버블 스냅샷 실시간 동기화 훅
 * - STOMP 구독으로 원격 변경사항/상태를 반영한다.
 * - 로컬 변경사항은 debounce publish로 전송한다.
 * - IFC 결과 URL 수신 시 상위 훅으로 전달한다.
 */
export function useBubbleSnapshotRealtime({
  projectId,
  canPublish,
  bubbles,
  connections,
  onRemoteSnapshot,
  onPhaseStatusChanged,
  onIfcStorageUrlReceived,
  onBubbleHistoryCursorChanged,
  onFloorPlanHistoryCursorChanged,
}: UseBubbleSnapshotRealtimeParams) {
  const remoteSnapshotHandlerRef = useRef(onRemoteSnapshot)
  const phaseStatusHandlerRef = useRef(onPhaseStatusChanged)
  const ifcStorageUrlHandlerRef = useRef(onIfcStorageUrlReceived)
  const bubbleHistoryCursorHandlerRef = useRef(onBubbleHistoryCursorChanged)
  const floorPlanHistoryCursorHandlerRef = useRef(onFloorPlanHistoryCursorChanged)
  const pendingPublishRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const baseIndexRef = useRef(-1)
  const bubbleRedoDepthRef = useRef(0)
  const floorPlanBaseIndexRef = useRef(-1)
  const floorPlanRedoDepthRef = useRef(0)
  const publishTimerRef = useRef<number | null>(null)
  const recentIfcEventRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    remoteSnapshotHandlerRef.current = onRemoteSnapshot
  }, [onRemoteSnapshot])

  useEffect(() => {
    phaseStatusHandlerRef.current = onPhaseStatusChanged
  }, [onPhaseStatusChanged])

  useEffect(() => {
    ifcStorageUrlHandlerRef.current = onIfcStorageUrlReceived
  }, [onIfcStorageUrlReceived])

  useEffect(() => {
    bubbleHistoryCursorHandlerRef.current = onBubbleHistoryCursorChanged
  }, [onBubbleHistoryCursorChanged])

  useEffect(() => {
    floorPlanHistoryCursorHandlerRef.current = onFloorPlanHistoryCursorChanged
  }, [onFloorPlanHistoryCursorChanged])

  const markLocalBubbleSnapshotChanged = useCallback(() => {
    pendingPublishRef.current = true
  }, [])

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

    baseIndexRef.current = -1
    bubbleRedoDepthRef.current = 0
    floorPlanBaseIndexRef.current = -1
    floorPlanRedoDepthRef.current = 0
    notifyBubbleHistoryCursor()
    notifyFloorPlanHistoryCursor()

    const syncBubbleHistoryCursor = (action: string | null) => {
      if (action === WORKSPACE_SYNC_ACTION.bubbleUndo) {
        baseIndexRef.current = Math.max(-1, baseIndexRef.current - 1)
        bubbleRedoDepthRef.current += 1
      } else if (action === WORKSPACE_SYNC_ACTION.bubbleRedo) {
        baseIndexRef.current += 1
        bubbleRedoDepthRef.current = Math.max(0, bubbleRedoDepthRef.current - 1)
      } else {
        baseIndexRef.current += 1
        bubbleRedoDepthRef.current = 0
      }
      notifyBubbleHistoryCursor()
    }

    const syncFloorPlanHistoryCursor = (action: string | null, payloadBaseIndex: number | null) => {
      if (action === WORKSPACE_SYNC_ACTION.floorPlanUndo) {
        floorPlanBaseIndexRef.current = payloadBaseIndex ?? Math.max(-1, floorPlanBaseIndexRef.current - 1)
        floorPlanRedoDepthRef.current += 1
      } else if (action === WORKSPACE_SYNC_ACTION.floorPlanRedo) {
        floorPlanBaseIndexRef.current = payloadBaseIndex ?? floorPlanBaseIndexRef.current + 1
        floorPlanRedoDepthRef.current = Math.max(0, floorPlanRedoDepthRef.current - 1)
      } else if (action === WORKSPACE_SYNC_ACTION.floorPlanUpdated) {
        floorPlanBaseIndexRef.current = (payloadBaseIndex ?? floorPlanBaseIndexRef.current) + 1
        floorPlanRedoDepthRef.current = 0
      }
      notifyFloorPlanHistoryCursor()
    }

    const applyRemoteSnapshot = (snapshot: BubbleSnapshotPayload, action: string | null) => {
      applyingRemoteRef.current = true
      pendingPublishRef.current = false
      remoteSnapshotHandlerRef.current(snapshot)
      syncBubbleHistoryCursor(action)
      queueMicrotask(() => {
        applyingRemoteRef.current = false
      })
    }

    const applyFloorPlanBubbleSnapshot = (snapshot: BubbleSnapshotPayload) => {
      applyingRemoteRef.current = true
      pendingPublishRef.current = false
      remoteSnapshotHandlerRef.current(snapshot)
      queueMicrotask(() => {
        applyingRemoteRef.current = false
      })
    }

    const handleProjectSyncMessage = (message: IMessage) => {
      const parsed = parseProjectSyncMessage(message)
      if (!parsed) return
      const action = normalizeAction(parsed)

      const status = normalizePhaseStatus(parsed.status)
        ?? (isObjectRecord(parsed.payload) ? normalizePhaseStatus(parsed.payload.status) : null)
      if (status) {
        phaseStatusHandlerRef.current?.(status)
      } else if (action && IFC_STARTED_ACTION_SET.has(action)) {
        phaseStatusHandlerRef.current?.('CONVERTING')
      }

      if (action && IFC_COMPLETED_ACTION_SET.has(action)) {
        const ifcStorageUrl = extractIfcStorageUrl(parsed)
        const assetId = extractIfcAssetId(parsed)
        const dedupRaw = assetId ?? ifcStorageUrl
        if (dedupRaw) {
          const dedupKey = `${action}:${dedupRaw}`
          const now = Date.now()
          const previous = recentIfcEventRef.current.get(dedupKey)
          if (typeof previous === 'number' && now - previous < IFC_EVENT_DEDUP_TTL_MS) {
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
            console.info('[ifc-url][ws]', { action, ifcStorageUrl, assetId })
          }
          ifcStorageUrlHandlerRef.current?.(ifcStorageUrl ?? '', action, assetId)
        }
      }

      if (
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo
      ) {
        syncFloorPlanHistoryCursor(action, extractFloorPlanBaseIndex(parsed))
      }

      if (
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo
      ) {
        const floorPlanBubbleSnapshot = extractFloorPlanBubbleSnapshot(parsed)
        if (floorPlanBubbleSnapshot) {
          applyFloorPlanBubbleSnapshot(floorPlanBubbleSnapshot)
        }
      }

      if (
        action !== WORKSPACE_SYNC_ACTION.bubbleUpdated &&
        action !== WORKSPACE_SYNC_ACTION.bubbleUndo &&
        action !== WORKSPACE_SYNC_ACTION.bubbleRedo
      ) return
      if (!isBubbleSnapshotPayload(parsed.bubbleSnapshotJson)) return

      applyRemoteSnapshot(parsed.bubbleSnapshotJson, action)
    }

    const handleErrorMessage = (message: IMessage) => {
      const parsed = parseStompErrorMessage(message)
      if (!parsed?.code) return
      if (parsed.code === CURSOR_INVALID_CODE) {
        baseIndexRef.current = -1
        bubbleRedoDepthRef.current = 0
        notifyBubbleHistoryCursor()
      }
      if (parsed.code === FLOOR_PLAN_CURSOR_INVALID_CODE) {
        floorPlanBaseIndexRef.current = -1
        floorPlanRedoDepthRef.current = 0
        notifyFloorPlanHistoryCursor()
      }
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

  useEffect(() => {
    if (!projectId) return
    if (!canPublish) return
    if (!pendingPublishRef.current) return
    if (applyingRemoteRef.current) return

    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current)
    }

    publishTimerRef.current = window.setTimeout(() => {
      publishTimerRef.current = null
      if (!pendingPublishRef.current) return
      if (applyingRemoteRef.current) return

      const payload = {
        bubbles,
        connections,
        baseIndex: baseIndexRef.current,
      }

      try {
        publishBubbleSnapshotUpdate(projectId, payload)
        pendingPublishRef.current = false
      } catch (error: unknown) {
        console.warn('[editor] bubble snapshot publish failed.', {
          projectId,
          baseIndex: baseIndexRef.current,
          error,
        })
      }
    }, PUBLISH_DEBOUNCE_MS)

    return () => {
      if (publishTimerRef.current !== null) {
        window.clearTimeout(publishTimerRef.current)
        publishTimerRef.current = null
      }
    }
  }, [bubbles, canPublish, connections, projectId])

  return {
    markLocalBubbleSnapshotChanged,
  }
}
