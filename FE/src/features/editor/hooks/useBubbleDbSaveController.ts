import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { BubbleData, ConnectionData, PhaseStatus, ZoneData } from '../types'
import type { BubbleSnapshotPayload } from '../utils/workspaceSyncMessage'
import type { SaveBubbleSnapshotResponse } from '../services/workspaceBubble.service'

interface BubbleSnapshotForDbSave {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones: ZoneData[]
  floorMeta: BubbleSnapshotPayload['floorMeta']
}

interface BubbleDbSaveCallbacks {
  onSaveBegin?: (params: { force: boolean; saveStartVersion: number; snapshot: BubbleSnapshotForDbSave }) => void
  onSaveSuccess?: (params: {
    saved: SaveBubbleSnapshotResponse
    snapshot: BubbleSnapshotForDbSave
    force: boolean
    saveStartVersion: number
    changedDuringSave: boolean
  }) => void
  onSaveFailure?: (params: {
    error: unknown
    force: boolean
    saveStartVersion: number
    snapshot: BubbleSnapshotForDbSave
  }) => void
}

interface UseBubbleDbSaveControllerInput<TFloorMeta> {
  projectId: string | null | undefined
  workspacePhaseStatus: PhaseStatus
  latestBubbleSnapshotRef: MutableRefObject<BubbleSnapshotForDbSave>
  bubbleSnapshotChangeVersionRef: MutableRefObject<number>
  saveToDb: (
    projectId: string,
    bubbles: BubbleData[],
    connections: ConnectionData[],
    zones: ZoneData[],
    floorMeta?: TFloorMeta,
  ) => Promise<SaveBubbleSnapshotResponse>
  normalizeFloorMetaForSync: (floorMeta: BubbleSnapshotPayload['floorMeta']) => TFloorMeta
  writeSavedRecovery: (projectId: string, snapshot: BubbleSnapshotForDbSave) => void
  clearLocalDraft: (projectId: string) => void
  resolveDebounceMs: () => number
  callbacks?: BubbleDbSaveCallbacks
}

/**
 * 버블 스냅샷 DB 저장 제어 훅.
 * - dirty/in-flight/timer 상태를 캡슐화한다.
 * - 강제 저장(flush)과 디바운스 저장(schedule)을 동일 정책으로 처리한다.
 */
export function useBubbleDbSaveController<TFloorMeta>({
  projectId,
  workspacePhaseStatus,
  latestBubbleSnapshotRef,
  bubbleSnapshotChangeVersionRef,
  saveToDb,
  normalizeFloorMetaForSync,
  writeSavedRecovery,
  clearLocalDraft,
  resolveDebounceMs,
  callbacks,
}: UseBubbleDbSaveControllerInput<TFloorMeta>) {
  const bubbleDbSaveTimerRef = useRef<number | null>(null)
  const bubbleDbSaveInFlightRef = useRef<Promise<SaveBubbleSnapshotResponse | null> | null>(null)
  const bubbleDbDirtyRef = useRef(false)
  const flushSaveToDbRef = useRef<(force?: boolean) => Promise<SaveBubbleSnapshotResponse | null>>(
    async () => null,
  )

  const cancelScheduledSave = useCallback(() => {
    if (bubbleDbSaveTimerRef.current !== null) {
      window.clearTimeout(bubbleDbSaveTimerRef.current)
      bubbleDbSaveTimerRef.current = null
    }
  }, [])

  const flushSaveToDb = useCallback(async (force = false): Promise<SaveBubbleSnapshotResponse | null> => {
    if (!projectId) return null
    if (workspacePhaseStatus !== 'BUBBLE_DRAFT') return null
    if (!force && !bubbleDbDirtyRef.current) return null

    if (bubbleDbSaveInFlightRef.current) {
      try {
        return await bubbleDbSaveInFlightRef.current
      } catch {
        return null
      }
    }

    const snapshot = latestBubbleSnapshotRef.current
    const saveStartVersion = bubbleSnapshotChangeVersionRef.current
    callbacks?.onSaveBegin?.({ force, saveStartVersion, snapshot })

    let shouldTriggerFollowUpSave = false
    const saveTask = (async () => {
      const saved = await saveToDb(
        projectId,
        snapshot.bubbles,
        snapshot.connections,
        snapshot.zones,
        normalizeFloorMetaForSync(snapshot.floorMeta),
      )
      const changedDuringSave = bubbleSnapshotChangeVersionRef.current !== saveStartVersion
      bubbleDbDirtyRef.current = changedDuringSave
      shouldTriggerFollowUpSave = changedDuringSave
      writeSavedRecovery(projectId, snapshot)
      clearLocalDraft(projectId)
      callbacks?.onSaveSuccess?.({
        saved,
        snapshot,
        force,
        saveStartVersion,
        changedDuringSave,
      })
      return saved
    })()

    bubbleDbSaveInFlightRef.current = saveTask
    try {
      return await saveTask
    } catch (error: unknown) {
      callbacks?.onSaveFailure?.({
        error,
        force,
        saveStartVersion,
        snapshot,
      })
      return null
    } finally {
      if (bubbleDbSaveInFlightRef.current === saveTask) {
        bubbleDbSaveInFlightRef.current = null
      }
      if (shouldTriggerFollowUpSave && projectId && workspacePhaseStatus === 'BUBBLE_DRAFT') {
        // 저장 중 변경분은 최신 closure를 사용하는 flush ref를 통해 후속 저장한다.
        void flushSaveToDbRef.current(false)
      }
    }
  }, [
    callbacks,
    clearLocalDraft,
    latestBubbleSnapshotRef,
    normalizeFloorMetaForSync,
    projectId,
    saveToDb,
    workspacePhaseStatus,
    bubbleSnapshotChangeVersionRef,
    writeSavedRecovery,
  ])

  useEffect(() => {
    flushSaveToDbRef.current = flushSaveToDb
  }, [flushSaveToDb])

  const scheduleSaveToDb = useCallback((delayMs = resolveDebounceMs()) => {
    if (!projectId) return
    if (workspacePhaseStatus !== 'BUBBLE_DRAFT') return

    bubbleDbDirtyRef.current = true
    cancelScheduledSave()
    bubbleDbSaveTimerRef.current = window.setTimeout(() => {
      bubbleDbSaveTimerRef.current = null
      void flushSaveToDbRef.current(false)
    }, delayMs)
  }, [cancelScheduledSave, projectId, resolveDebounceMs, workspacePhaseStatus])

  const clearDirty = useCallback(() => {
    bubbleDbDirtyRef.current = false
  }, [])

  const markDirty = useCallback(() => {
    bubbleDbDirtyRef.current = true
  }, [])

  const isDirty = useCallback(() => bubbleDbDirtyRef.current, [])

  return {
    clearDirty,
    markDirty,
    isDirty,
    flushSaveToDb,
    scheduleSaveToDb,
    cancelScheduledSave,
  }
}
