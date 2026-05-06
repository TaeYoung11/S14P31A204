import { useCallback, useEffect, useRef } from 'react'
import type { IMessage } from '@stomp/stompjs'
import { getStompClient } from '@/shared/lib/stomp'
import { getRuntimeEnvBoolean } from '@/shared/lib/runtimeEnv'
import type { BubbleData, ConnectionData, PhaseStatus } from '../types'
import { publishBubbleSnapshotUpdate } from '../services/workspaceCommand.service'
import { subscribeStompTopicsWithPolling } from '../utils/stompSubscription'
import {
  CURSOR_INVALID_CODE,
  IFC_COMPLETED_ACTION_SET,
  IFC_STARTED_ACTION_SET,
  PROJECT_JOBS_TOPIC_PREFIX,
  PROJECT_SYNC_TOPIC_PREFIX,
  USER_ERROR_TOPIC,
  WORKSPACE_SYNC_ACTION,
  extractFloorPlanBubbleSnapshot,
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
  onIfcStorageUrlReceived?: (ifcStorageUrl: string, action: string | null) => void
}

const PUBLISH_DEBOUNCE_MS = 120
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
}: UseBubbleSnapshotRealtimeParams) {
  const remoteSnapshotHandlerRef = useRef(onRemoteSnapshot)
  const phaseStatusHandlerRef = useRef(onPhaseStatusChanged)
  const ifcStorageUrlHandlerRef = useRef(onIfcStorageUrlReceived)
  const pendingPublishRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const baseIndexRef = useRef(-1)
  const publishTimerRef = useRef<number | null>(null)

  useEffect(() => {
    remoteSnapshotHandlerRef.current = onRemoteSnapshot
  }, [onRemoteSnapshot])

  useEffect(() => {
    phaseStatusHandlerRef.current = onPhaseStatusChanged
  }, [onPhaseStatusChanged])

  useEffect(() => {
    ifcStorageUrlHandlerRef.current = onIfcStorageUrlReceived
  }, [onIfcStorageUrlReceived])

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
    const applyRemoteSnapshot = (snapshot: BubbleSnapshotPayload) => {
      applyingRemoteRef.current = true
      pendingPublishRef.current = false
      remoteSnapshotHandlerRef.current(snapshot)
      baseIndexRef.current += 1
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
        if (ifcStorageUrl) {
          if (IFC_URL_DEBUG && typeof window !== 'undefined') {
            window.localStorage.setItem('ifc-last-ws-url', ifcStorageUrl)
            console.info('[ifc-url][ws]', { action, ifcStorageUrl })
          }
          ifcStorageUrlHandlerRef.current?.(ifcStorageUrl, action)
        }
      }

      if (action === WORKSPACE_SYNC_ACTION.floorPlanUpdated) {
        const floorPlanBubbleSnapshot = extractFloorPlanBubbleSnapshot(parsed)
        if (floorPlanBubbleSnapshot) {
          applyRemoteSnapshot(floorPlanBubbleSnapshot)
        }
      }

      if (action !== WORKSPACE_SYNC_ACTION.bubbleUpdated) return
      if (!isBubbleSnapshotPayload(parsed.bubbleSnapshotJson)) return

      applyRemoteSnapshot(parsed.bubbleSnapshotJson)
    }

    const handleErrorMessage = (message: IMessage) => {
      const parsed = parseStompErrorMessage(message)
      if (!parsed?.code) return
      if (parsed.code === CURSOR_INVALID_CODE) {
        baseIndexRef.current = -1
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
