import { useCallback, useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { SaveStatus } from '../types'
import type { WorkspaceHistorySnapshotResponse } from '../services/workspaceSave.service'

interface AwaitingServerSyncRecordLike {
  projectId: string
  serializedSnapshot: string
  historyDomain: 'bubble' | 'floorPlan'
  baseIndex: number
  startedAt: number
  unsavedDbChangeVersion?: number
}

interface PendingServerPublishRecordLike {
  serializedSnapshot: string
}

interface UseWorkspaceHistorySyncControllerInput {
  projectId: string | null | undefined
  saveStatus: SaveStatus
  awaitingServerSyncRef: MutableRefObject<AwaitingServerSyncRecordLike | null>
  pendingServerPublishRef: MutableRefObject<PendingServerPublishRecordLike | null>
  previousSnapshotRef: MutableRefObject<string | null>
  bubbleHistoryBaseIndexRef: MutableRefObject<number>
  bubbleHistoryRedoDepthRef: MutableRefObject<number>
  floorPlanHistoryBaseIndexRef: MutableRefObject<number>
  floorPlanHistoryRedoDepthRef: MutableRefObject<number>
  workspaceEditTransactionDepthRef: MutableRefObject<number>
  pendingWorkspaceSnapshotCommitRef: MutableRefObject<boolean>
  floorPlanHistoryCommandInFlightRef: MutableRefObject<boolean>
  setBubbleHistoryCursor: (cursor: { baseIndex: number; redoDepth: number }) => void
  setFloorPlanHistoryCursor: (cursor: { baseIndex: number; redoDepth: number }) => void
  setSaveStatus: (status: SaveStatus) => void
  requestRepublishSnapshotCommit: () => void
  clearServerPublishRetry: () => void
  scheduleServerPublishRetry: () => void
  loadHistorySnapshot: (projectId: string) => Promise<WorkspaceHistorySnapshotResponse>
  isCursorInvalidCode: (code: string | undefined) => boolean
  isNonRetriableServerErrorCode?: (code: string | undefined) => boolean
  onHistorySyncSuccess?: (awaitingSync: AwaitingServerSyncRecordLike) => void
  maxHistoryIndex?: number
}

/**
 * 워크스페이스 히스토리 커서 동기화 제어 훅.
 * - 서버 커서 업데이트 수신 시 local cursor를 보정한다.
 * - sync timeout/invalid-cursor/server-error 상황에서 재동기화 정책을 일관되게 적용한다.
 */
export function useWorkspaceHistorySyncController({
  projectId,
  saveStatus,
  awaitingServerSyncRef,
  pendingServerPublishRef,
  previousSnapshotRef,
  bubbleHistoryBaseIndexRef,
  bubbleHistoryRedoDepthRef,
  floorPlanHistoryBaseIndexRef,
  floorPlanHistoryRedoDepthRef,
  workspaceEditTransactionDepthRef,
  pendingWorkspaceSnapshotCommitRef,
  floorPlanHistoryCommandInFlightRef,
  setBubbleHistoryCursor,
  setFloorPlanHistoryCursor,
  setSaveStatus,
  requestRepublishSnapshotCommit,
  clearServerPublishRetry,
  scheduleServerPublishRetry,
  loadHistorySnapshot,
  isCursorInvalidCode,
  isNonRetriableServerErrorCode,
  onHistorySyncSuccess,
  maxHistoryIndex = 9,
}: UseWorkspaceHistorySyncControllerInput) {
  const refreshHistoryCursorFromServer = useCallback(async (options?: {
    republishOnFailure?: boolean
    republishWhenStale?: boolean
  }) => {
    if (!projectId) return
    const republishOnFailure = options?.republishOnFailure ?? true
    const republishWhenStale = options?.republishWhenStale ?? true
    const awaitingSync = awaitingServerSyncRef.current
    const history = await loadHistorySnapshot(projectId).catch(() => null)

    if (!history) {
      if (awaitingSync?.projectId === projectId) {
        awaitingServerSyncRef.current = null
        previousSnapshotRef.current = null
        setSaveStatus('dirty')
        if (republishOnFailure) {
          requestRepublishSnapshotCommit()
        }
      }
      return
    }

    const bubbleBaseIndex = history.bubble?.baseIndex ?? -1
    const bubbleRedoDepth = history.bubble?.redoDepth ?? 0
    const floorPlanBaseIndex = history.floorPlan?.baseIndex ?? -1
    const floorPlanRedoDepth = history.floorPlan?.redoDepth ?? 0

    bubbleHistoryBaseIndexRef.current = bubbleBaseIndex
    bubbleHistoryRedoDepthRef.current = bubbleRedoDepth
    floorPlanHistoryBaseIndexRef.current = floorPlanBaseIndex
    floorPlanHistoryRedoDepthRef.current = floorPlanRedoDepth
    setBubbleHistoryCursor({ baseIndex: bubbleBaseIndex, redoDepth: bubbleRedoDepth })
    setFloorPlanHistoryCursor({ baseIndex: floorPlanBaseIndex, redoDepth: floorPlanRedoDepth })

    if (!awaitingSync || awaitingSync.projectId !== projectId) return

    const currentBaseIndex = awaitingSync.historyDomain === 'bubble' ? bubbleBaseIndex : floorPlanBaseIndex
    awaitingServerSyncRef.current = null

    if (
      currentBaseIndex > awaitingSync.baseIndex ||
      (awaitingSync.baseIndex >= maxHistoryIndex && currentBaseIndex === maxHistoryIndex)
    ) {
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      pendingServerPublishRef.current = null
      onHistorySyncSuccess?.(awaitingSync)
      setSaveStatus('synced')
      return
    }

    previousSnapshotRef.current = null
    setSaveStatus('dirty')
    if (republishWhenStale) {
      requestRepublishSnapshotCommit()
    }
  }, [
    awaitingServerSyncRef,
    bubbleHistoryBaseIndexRef,
    bubbleHistoryRedoDepthRef,
    floorPlanHistoryBaseIndexRef,
    floorPlanHistoryRedoDepthRef,
    loadHistorySnapshot,
    maxHistoryIndex,
    pendingServerPublishRef,
    previousSnapshotRef,
    projectId,
    requestRepublishSnapshotCommit,
    setBubbleHistoryCursor,
    setFloorPlanHistoryCursor,
    setSaveStatus,
    onHistorySyncSuccess,
  ])

  const updateBubbleHistoryCursor = useCallback((baseIndex: number, redoDepth: number) => {
    bubbleHistoryBaseIndexRef.current = baseIndex
    bubbleHistoryRedoDepthRef.current = redoDepth
    setBubbleHistoryCursor({ baseIndex, redoDepth })
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync) return

    if (
      awaitingSync.projectId === projectId &&
      awaitingSync.historyDomain === 'bubble' &&
      workspaceEditTransactionDepthRef.current === 0 &&
      !pendingWorkspaceSnapshotCommitRef.current
    ) {
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      onHistorySyncSuccess?.(awaitingSync)
      setSaveStatus('synced')
    }
  }, [
    awaitingServerSyncRef,
    bubbleHistoryBaseIndexRef,
    bubbleHistoryRedoDepthRef,
    pendingServerPublishRef,
    pendingWorkspaceSnapshotCommitRef,
    previousSnapshotRef,
    projectId,
    setBubbleHistoryCursor,
    setSaveStatus,
    workspaceEditTransactionDepthRef,
    onHistorySyncSuccess,
  ])

  const updateFloorPlanHistoryCursor = useCallback((baseIndex: number, redoDepth: number) => {
    floorPlanHistoryCommandInFlightRef.current = false
    floorPlanHistoryBaseIndexRef.current = baseIndex
    floorPlanHistoryRedoDepthRef.current = redoDepth
    setFloorPlanHistoryCursor({ baseIndex, redoDepth })
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync) return

    if (
      awaitingSync.projectId === projectId &&
      awaitingSync.historyDomain === 'floorPlan'
    ) {
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      if (workspaceEditTransactionDepthRef.current > 0) {
        setSaveStatus('dirty')
        return
      }
      if (pendingWorkspaceSnapshotCommitRef.current) {
        pendingWorkspaceSnapshotCommitRef.current = false
        setSaveStatus('dirty')
        requestRepublishSnapshotCommit()
        return
      }
      onHistorySyncSuccess?.(awaitingSync)
      setSaveStatus('synced')
    }
  }, [
    awaitingServerSyncRef,
    floorPlanHistoryBaseIndexRef,
    floorPlanHistoryRedoDepthRef,
    floorPlanHistoryCommandInFlightRef,
    pendingServerPublishRef,
    pendingWorkspaceSnapshotCommitRef,
    previousSnapshotRef,
    projectId,
    requestRepublishSnapshotCommit,
    setFloorPlanHistoryCursor,
    setSaveStatus,
    workspaceEditTransactionDepthRef,
    onHistorySyncSuccess,
  ])

  const handleWorkspaceServerError = useCallback((error: { code?: string }) => {
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId) {
      if (isCursorInvalidCode(error.code)) {
        floorPlanHistoryCommandInFlightRef.current = false
        setSaveStatus('dirty')
        void refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
      }
      return
    }

    awaitingServerSyncRef.current = null
    floorPlanHistoryCommandInFlightRef.current = false

    if (isCursorInvalidCode(error.code)) {
      pendingServerPublishRef.current = null
      previousSnapshotRef.current = null
      clearServerPublishRetry()
      setSaveStatus('dirty')
      return
    }

    if (isNonRetriableServerErrorCode?.(error.code)) {
      pendingServerPublishRef.current = null
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      clearServerPublishRetry()
      setSaveStatus('error')
      return
    }

    if (pendingServerPublishRef.current?.serializedSnapshot === awaitingSync.serializedSnapshot) {
      scheduleServerPublishRetry()
    } else {
      clearServerPublishRetry()
    }
    setSaveStatus('error')
  }, [
    awaitingServerSyncRef,
    clearServerPublishRetry,
    floorPlanHistoryCommandInFlightRef,
    isCursorInvalidCode,
    isNonRetriableServerErrorCode,
    pendingServerPublishRef,
    previousSnapshotRef,
    projectId,
    refreshHistoryCursorFromServer,
    scheduleServerPublishRetry,
    setSaveStatus,
  ])

  const handleBubbleHistoryCursorInvalid = useCallback(() => {
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId || awaitingSync.historyDomain !== 'bubble') return
    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
    previousSnapshotRef.current = null
    clearServerPublishRetry()
    setSaveStatus('dirty')
    void refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
  }, [
    awaitingServerSyncRef,
    clearServerPublishRetry,
    pendingServerPublishRef,
    previousSnapshotRef,
    projectId,
    refreshHistoryCursorFromServer,
    setSaveStatus,
  ])

  const handleFloorPlanHistoryCursorInvalid = useCallback(() => {
    const awaitingSync = awaitingServerSyncRef.current
    const hadFloorPlanCommandInFlight = floorPlanHistoryCommandInFlightRef.current
    floorPlanHistoryCommandInFlightRef.current = false

    if (!awaitingSync || awaitingSync.projectId !== projectId || awaitingSync.historyDomain !== 'floorPlan') {
      // floor-plan undo/redo requests do not always create an awaiting sync record.
      // Ensure command lock is released when server reports cursor-invalid.
      if (hadFloorPlanCommandInFlight) {
        clearServerPublishRetry()
        setSaveStatus('dirty')
        void refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
      }
      return
    }

    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
    previousSnapshotRef.current = null
    clearServerPublishRetry()
    setSaveStatus('dirty')
    void refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
  }, [
    awaitingServerSyncRef,
    clearServerPublishRetry,
    floorPlanHistoryCommandInFlightRef,
    pendingServerPublishRef,
    previousSnapshotRef,
    projectId,
    refreshHistoryCursorFromServer,
    setSaveStatus,
  ])

  useEffect(() => {
    if (saveStatus !== 'syncing') return
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId) return
    if (awaitingSync.historyDomain === 'floorPlan') return

    const timerId = window.setTimeout(() => {
      const currentAwaitingSync = awaitingServerSyncRef.current
      if (!currentAwaitingSync || currentAwaitingSync.projectId !== projectId) return
      if (currentAwaitingSync.historyDomain === 'floorPlan') return
      if (Date.now() - currentAwaitingSync.startedAt < 5000) return
      void refreshHistoryCursorFromServer()
    }, 5200)

    return () => window.clearTimeout(timerId)
  }, [awaitingServerSyncRef, projectId, refreshHistoryCursorFromServer, saveStatus])

  return {
    updateBubbleHistoryCursor,
    updateFloorPlanHistoryCursor,
    handleWorkspaceServerError,
    handleBubbleHistoryCursorInvalid,
    handleFloorPlanHistoryCursorInvalid,
    refreshHistoryCursorFromServer,
  }
}
