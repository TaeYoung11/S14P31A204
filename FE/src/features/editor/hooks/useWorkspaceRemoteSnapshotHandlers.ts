import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  BubbleData,
  ConnectionData,
  FloorLayer,
  SaveStatus,
  ZoneData,
} from '../types'
import { normalizeBubbleFloor } from '../utils/bubbleFloorUtils'
import {
  logBubbleDebug,
  summarizeBubbleSnapshotForDebug,
} from '../utils/bubbleSnapshotRecoveryUtils'
import { resolveBubbleSnapshotViewState } from '../utils/bubbleSnapshotSyncUtils'
import {
  buildBubbleSnapshotSignature,
  resolveSnapshotZonesOrFallback,
  toComparableBubbleSnapshot,
} from '../utils/bubbleSnapshotApplyHelpers'
import {
  isBubbleSnapshotPayload,
  isFloorProjectPayload,
  WORKSPACE_SYNC_ACTION,
  type BubbleSnapshotPayload,
  type FloorPlanSnapshotPayload,
} from '../utils/workspaceSyncMessage'
import {
  logEditor3dUndoDebug,
  summarizeFloorPlanSnapshotFor3dUndo,
} from '../utils/editor3dUndoDebug'
import type { FloorProject } from '../types/floorProject.types'

interface LatestBubbleSnapshotState {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones: ZoneData[]
  floorMeta: BubbleSnapshotPayload['floorMeta']
}

interface FloorPlanLayoutState {
  isGenerated: boolean
  layoutSource: 'bubble' | 'project' | null
  layers: FloorLayer[]
  activeLayerId: string | null
}

interface ApplyRemoteFloorPlanSnapshotMeta {
  action?: string | null
  layoutOnly?: boolean
  payloadBaseIndex?: number | null
  hasIfcStorageUrl?: boolean
  revisionId?: string | null
}

interface AwaitingServerSyncLike {
  projectId: string
  historyDomain: 'bubble' | 'floorPlan'
  baseIndex: number
  startedAt?: number
}

interface UseWorkspaceRemoteSnapshotHandlersInput {
  projectId: string | null | undefined
  latestBubbleSnapshotRef: MutableRefObject<LatestBubbleSnapshotState>
  isBubbleDragTransactionActiveRef: MutableRefObject<boolean>
  workspaceEditTransactionDepthRef: MutableRefObject<number>
  pendingWorkspaceSnapshotCommitRef: MutableRefObject<boolean>
  awaitingServerSyncRef: MutableRefObject<AwaitingServerSyncLike | null>
  floorPlanHistoryCommandInFlightRef: MutableRefObject<boolean>
  setFloorPlanHistoryCommandInFlight?: (value: boolean) => void
  suppressNextAutosaveRef: MutableRefObject<boolean>
  setSelectedConnectionPair: (pair: { from: string; to: string } | null) => void
  setConnectingFromId: (id: string | null) => void
  setSaveStatus: (status: SaveStatus) => void
  setIfcRevisionByProjectId: Dispatch<SetStateAction<Record<string, string | null>>>
  clearConnectionAndTwoDSelection: () => void
  clearSelection: () => void
  resolveSnapshotSyncStatus: () => SaveStatus
  replaceBubbles: (next: BubbleData[]) => void
  replaceConnections: (next: ConnectionData[]) => void
  replaceZonesState: (next: ZoneData[]) => void
  applyBubbleFloorMetaState: (
    floorMeta: { namesByFloor: Record<number, string>; extraFloors: number[] },
    availableFloors: number[],
  ) => void
  applyFloorPlanLayoutState: (params: {
    layout: NonNullable<FloorPlanSnapshotPayload['layout']>
    replaceLayoutState: (next: FloorPlanLayoutState) => void
    fallback: FloorPlanLayoutState
  }) => void
  applyFloorProjectSnapshot?: (project: FloorProject) => void
  replaceFloorPlanState: (next: FloorPlanLayoutState) => void
  floorPlanFallback: FloorPlanLayoutState
  traceBubbleSnapshot: (
    label: string,
    projectId: string | undefined,
    snapshot: BubbleSnapshotPayload | null | undefined,
    extra?: Record<string, unknown>,
  ) => void
}

/**
 * 워크스페이스 실시간 수신 스냅샷을 에디터 상태에 반영하는 훅.
 * 버블/층 정보 정규화, 로컬 편집 중 충돌 회피, floorplan 반영을 일관되게 처리한다.
 */
export function useWorkspaceRemoteSnapshotHandlers({
  projectId,
  latestBubbleSnapshotRef,
  isBubbleDragTransactionActiveRef,
  workspaceEditTransactionDepthRef,
  pendingWorkspaceSnapshotCommitRef,
  awaitingServerSyncRef,
  floorPlanHistoryCommandInFlightRef,
  setFloorPlanHistoryCommandInFlight,
  suppressNextAutosaveRef,
  setSelectedConnectionPair,
  setConnectingFromId,
  setSaveStatus,
  setIfcRevisionByProjectId,
  clearConnectionAndTwoDSelection,
  clearSelection,
  resolveSnapshotSyncStatus,
  replaceBubbles,
  replaceConnections,
  replaceZonesState,
  applyBubbleFloorMetaState,
  applyFloorPlanLayoutState,
  applyFloorProjectSnapshot,
  replaceFloorPlanState,
  floorPlanFallback,
  traceBubbleSnapshot,
}: UseWorkspaceRemoteSnapshotHandlersInput) {
  const traceProjectId = projectId ?? undefined
  const releaseFloorPlanHistoryCommand = useCallback(() => {
    floorPlanHistoryCommandInFlightRef.current = false
    setFloorPlanHistoryCommandInFlight?.(false)
  }, [floorPlanHistoryCommandInFlightRef, setFloorPlanHistoryCommandInFlight])

  const buildPreviousBubbleMap = useCallback(
    () => new Map(latestBubbleSnapshotRef.current.bubbles.map((bubble) => [bubble.id, bubble] as const)),
    [latestBubbleSnapshotRef],
  )
  const resolveNormalizedBubbleSnapshotState = useCallback((snapshot: BubbleSnapshotPayload) => {
    const previousById = buildPreviousBubbleMap()
    const { normalizedBubbles, floorMeta, availableFloors } = resolveBubbleSnapshotViewState(snapshot, {
      previousById,
      areaUnitLabel: 'm²',
      fallbackFloorMeta: latestBubbleSnapshotRef.current.floorMeta,
    })

    return { previousById, normalizedBubbles, floorMeta, availableFloors }
  }, [buildPreviousBubbleMap, latestBubbleSnapshotRef])

  const applyNormalizedBubbleSnapshotState = useCallback((params: {
    snapshot: BubbleSnapshotPayload
    normalizedBubbles: BubbleData[]
    floorMeta: { namesByFloor: Record<number, string>; extraFloors: number[] }
    availableFloors: number[]
    fallbackZones: ZoneData[]
  }) => {
    const { snapshot, normalizedBubbles, floorMeta, availableFloors, fallbackZones } = params
    replaceBubbles(normalizedBubbles)
    replaceConnections(snapshot.connections)
    replaceZonesState(resolveSnapshotZonesOrFallback(snapshot.zones, fallbackZones))
    applyBubbleFloorMetaState(floorMeta, availableFloors)
  }, [
    applyBubbleFloorMetaState,
    replaceBubbles,
    replaceConnections,
    replaceZonesState,
  ])

  const applyRemoteBubbleSnapshot = useCallback((
    snapshot: BubbleSnapshotPayload,
    meta?: { action: string | null; payloadBaseIndex: number | null },
  ) => {
    const incomingSignature = buildBubbleSnapshotSignature(snapshot)
    const latestLocalSnapshot = latestBubbleSnapshotRef.current
    const latestLocalSignature = buildBubbleSnapshotSignature(
      toComparableBubbleSnapshot(latestLocalSnapshot),
    )
    const hasLocalBubbleEditInFlight =
      isBubbleDragTransactionActiveRef.current ||
      workspaceEditTransactionDepthRef.current > 0 ||
      pendingWorkspaceSnapshotCommitRef.current ||
      awaitingServerSyncRef.current !== null

    if (hasLocalBubbleEditInFlight && incomingSignature !== latestLocalSignature) {
      logBubbleDebug('remote-bubble:skipped-due-to-local-edit', {
        projectId,
        incoming: summarizeBubbleSnapshotForDebug(snapshot),
      })
      traceBubbleSnapshot('remote-bubble:skipped-due-to-local-edit', traceProjectId, snapshot)
      return
    }

    const incomingSummary = summarizeBubbleSnapshotForDebug(snapshot)
    const localSummary = summarizeBubbleSnapshotForDebug(latestLocalSnapshot)
    const localBubbleIds = new Set(latestLocalSnapshot.bubbles.map((bubble) => bubble.id))
    const incomingBubbleIds = new Set(snapshot.bubbles.map((bubble) => bubble.id))
    const sameBubbleIdSet =
      localBubbleIds.size === incomingBubbleIds.size &&
      [...localBubbleIds].every((bubbleId) => incomingBubbleIds.has(bubbleId))
    const looksLikeUnexpectedFloorFlatten =
      sameBubbleIdSet &&
      localSummary.bubbleFloors.some((floor) => floor > 1) &&
      incomingSummary.bubbleFloors.length === 1 &&
      incomingSummary.bubbleFloors[0] === 1

    if (
      meta?.action === WORKSPACE_SYNC_ACTION.bubbleUpdated &&
      looksLikeUnexpectedFloorFlatten
    ) {
      logBubbleDebug('remote-bubble:skipped-flattened-overwrite', {
        projectId,
        action: meta?.action ?? null,
        payloadBaseIndex: meta?.payloadBaseIndex ?? null,
        localSummary,
        incomingSummary,
      })
      traceBubbleSnapshot('remote-bubble:skipped-flattened-overwrite', traceProjectId, snapshot, {
        action: meta?.action ?? null,
        payloadBaseIndex: meta?.payloadBaseIndex ?? null,
      })
      return
    }

    suppressNextAutosaveRef.current = true
    const { previousById, normalizedBubbles, floorMeta, availableFloors } =
      resolveNormalizedBubbleSnapshotState(snapshot)

    // 원격 echo 원본의 층 필드 형태를 기록한다.
    logBubbleDebug('remote-bubble:incoming-floor-data', {
      projectId,
      incomingFloorCounts: snapshot.bubbles.reduce<Record<string, number>>((acc, bubble) => {
        const raw = bubble as BubbleData & Record<string, unknown>
        const key = `floor=${String(raw.floor ?? 'undefined')}/layer=${String(raw.layer ?? 'undefined')}`
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {}),
      incomingFloorMeta: snapshot.floorMeta,
      localFloorCounts: latestLocalSnapshot.bubbles.reduce<Record<number, number>>((acc, bubble) => {
        const floor = normalizeBubbleFloor(bubble.floor)
        acc[floor] = (acc[floor] ?? 0) + 1
        return acc
      }, {}),
      localFloorMeta: latestBubbleSnapshotRef.current.floorMeta,
    })

    // 층 정규화 결과를 기록해 원격 데이터로 인한 floor 변형 여부를 추적한다.
    logBubbleDebug('remote-bubble:normalized-floor-result', {
      projectId,
      normalizedFloorCounts: normalizedBubbles.reduce<Record<number, number>>((acc, bubble) => {
        const floor = normalizeBubbleFloor(bubble.floor)
        acc[floor] = (acc[floor] ?? 0) + 1
        return acc
      }, {}),
      floorChangedBubbles: normalizedBubbles
        .filter((bubble) => {
          const prev = previousById.get(bubble.id)
          return prev && normalizeBubbleFloor(prev.floor) !== bubble.floor
        })
        .map((bubble) => ({
          id: bubble.id,
          prevFloor: previousById.get(bubble.id)?.floor,
          newFloor: bubble.floor,
        })),
    })

    applyNormalizedBubbleSnapshotState({
      snapshot,
      normalizedBubbles,
      floorMeta,
      availableFloors,
      fallbackZones: latestLocalSnapshot.zones,
    })
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
    awaitingServerSyncRef.current = null
    logBubbleDebug('remote-bubble:applied', {
      projectId,
      summary: summarizeBubbleSnapshotForDebug(snapshot),
    })
    traceBubbleSnapshot('remote-bubble:applied', traceProjectId, snapshot)
    setSaveStatus(resolveSnapshotSyncStatus())
  }, [
    applyNormalizedBubbleSnapshotState,
    awaitingServerSyncRef,
    isBubbleDragTransactionActiveRef,
    latestBubbleSnapshotRef,
    pendingWorkspaceSnapshotCommitRef,
    projectId,
    resolveNormalizedBubbleSnapshotState,
    resolveSnapshotSyncStatus,
    setConnectingFromId,
    setSaveStatus,
    setSelectedConnectionPair,
    suppressNextAutosaveRef,
    traceProjectId,
    traceBubbleSnapshot,
    workspaceEditTransactionDepthRef,
  ])

  const applyRemoteFloorPlanSnapshot = useCallback((
    snapshot: FloorPlanSnapshotPayload,
    meta?: ApplyRemoteFloorPlanSnapshotMeta,
  ) => {
    const isAuthoritativeFloorPlanEvent =
      meta?.action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
      meta?.action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
      meta?.action === WORKSPACE_SYNC_ACTION.floorPlanRedo
    const awaitingSync = awaitingServerSyncRef.current
    const awaitingFloorPlanSync =
      awaitingSync !== null &&
      awaitingSync.projectId === projectId &&
      awaitingSync.historyDomain === 'floorPlan'
    const incomingBaseIndex =
      typeof meta?.payloadBaseIndex === 'number'
        ? meta.payloadBaseIndex
        : (typeof snapshot.baseIndex === 'number' ? snapshot.baseIndex : null)
    const isAwaitedFloorPlanAck =
      isAuthoritativeFloorPlanEvent &&
      awaitingFloorPlanSync &&
      awaitingSync !== null &&
      incomingBaseIndex !== null &&
      (
        incomingBaseIndex === awaitingSync.baseIndex ||
        incomingBaseIndex > awaitingSync.baseIndex ||
        (awaitingSync.baseIndex >= 9 && incomingBaseIndex === 9)
      )
    const hasLocalFloorPlanEditInFlight =
      workspaceEditTransactionDepthRef.current > 0 ||
      pendingWorkspaceSnapshotCommitRef.current ||
      awaitingFloorPlanSync
    const shouldSkipRemoteFloorPlanSnapshot =
      hasLocalFloorPlanEditInFlight && (!isAuthoritativeFloorPlanEvent || !isAwaitedFloorPlanAck)
    const layout = snapshot.layout
    const willApplyLayout = Boolean(layout) && !shouldSkipRemoteFloorPlanSnapshot
    const willClearSelection = !shouldSkipRemoteFloorPlanSnapshot

    logEditor3dUndoDebug('remote-snapshot', 'apply_floor_plan_snapshot_decision', {
      projectId: projectId ?? null,
      action: meta?.action ?? null,
      revisionId: meta?.revisionId ?? snapshot.revisionId ?? null,
      hasS3Url: meta?.hasIfcStorageUrl === true,
      payloadBaseIndex: meta?.payloadBaseIndex ?? null,
      snapshotBaseIndex: snapshot.baseIndex ?? null,
      awaitingBaseIndex: awaitingFloorPlanSync ? awaitingSync?.baseIndex ?? null : null,
      isAuthoritativeFloorPlanEvent,
      isAwaitedFloorPlanAck,
      hasLocalFloorPlanEditInFlight,
      workspaceEditTransactionDepth: workspaceEditTransactionDepthRef.current,
      pendingWorkspaceSnapshotCommit: pendingWorkspaceSnapshotCommitRef.current,
      layoutOnly: meta?.layoutOnly === true,
      willApplyLayout,
      willClearSelection,
      snapshot: summarizeFloorPlanSnapshotFor3dUndo(snapshot),
    })

    if (shouldSkipRemoteFloorPlanSnapshot) {
      logEditor3dUndoDebug('remote-snapshot', 'apply_floor_plan_snapshot_skip', {
        reason: 'local_floor_plan_edit_in_flight',
        action: meta?.action ?? null,
        isAuthoritativeFloorPlanEvent,
        isAwaitedFloorPlanAck,
      })
      releaseFloorPlanHistoryCommand()
      setSaveStatus('dirty')
      return
    }

    suppressNextAutosaveRef.current = true
    if (projectId && snapshot.revisionId !== undefined) {
      setIfcRevisionByProjectId((prev) => ({
        ...prev,
        [projectId]: snapshot.revisionId ?? null,
      }))
    }

    if (!meta?.layoutOnly && isBubbleSnapshotPayload(snapshot)) {
      const { normalizedBubbles, floorMeta, availableFloors } =
        resolveNormalizedBubbleSnapshotState(snapshot)
      applyNormalizedBubbleSnapshotState({
        snapshot,
        normalizedBubbles,
        floorMeta,
        availableFloors,
        fallbackZones: latestBubbleSnapshotRef.current.zones,
      })
    }

    if (layout) {
      logEditor3dUndoDebug('remote-snapshot', 'apply_floor_plan_layout_start', {
        action: meta?.action ?? null,
        layoutOnly: meta?.layoutOnly === true,
        snapshot: summarizeFloorPlanSnapshotFor3dUndo(snapshot),
      })
      applyFloorPlanLayoutState({
        layout,
        replaceLayoutState: replaceFloorPlanState,
        fallback: floorPlanFallback,
      })
      logEditor3dUndoDebug('remote-snapshot', 'apply_floor_plan_layout_done', {
        action: meta?.action ?? null,
      })
    }
    if (isFloorProjectPayload(snapshot.floorProject)) {
      applyFloorProjectSnapshot?.(snapshot.floorProject)
    }

    setConnectingFromId(null)
    clearConnectionAndTwoDSelection()
    logEditor3dUndoDebug('remote-snapshot', 'clear_selection_start', {
      action: meta?.action ?? null,
      isAwaitedFloorPlanAck,
      hasLocalFloorPlanEditInFlight,
    })
    clearSelection()
    logEditor3dUndoDebug('remote-snapshot', 'clear_selection_done', {
      action: meta?.action ?? null,
      isAwaitedFloorPlanAck,
      hasLocalFloorPlanEditInFlight,
    })
    if (!pendingWorkspaceSnapshotCommitRef.current || isAwaitedFloorPlanAck) {
      pendingWorkspaceSnapshotCommitRef.current = false
    }
    if (awaitingFloorPlanSync && isAwaitedFloorPlanAck) {
      awaitingServerSyncRef.current = null
    }
    releaseFloorPlanHistoryCommand()
    setSaveStatus(resolveSnapshotSyncStatus())
  }, [
    applyNormalizedBubbleSnapshotState,
    applyFloorPlanLayoutState,
    applyFloorProjectSnapshot,
    awaitingServerSyncRef,
    clearConnectionAndTwoDSelection,
    clearSelection,
    floorPlanFallback,
    latestBubbleSnapshotRef,
    pendingWorkspaceSnapshotCommitRef,
    projectId,
    replaceFloorPlanState,
    releaseFloorPlanHistoryCommand,
    resolveNormalizedBubbleSnapshotState,
    resolveSnapshotSyncStatus,
    setConnectingFromId,
    setIfcRevisionByProjectId,
    setSaveStatus,
    suppressNextAutosaveRef,
    workspaceEditTransactionDepthRef,
  ])

  return {
    applyRemoteBubbleSnapshot,
    applyRemoteFloorPlanSnapshot,
  }
}
