/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkspaceHistorySyncController } from '@/features/editor/hooks/useWorkspaceHistorySyncController'
import type { SaveStatus } from '@/features/editor/types'

interface AwaitingServerSyncRecordLike {
  projectId: string
  serializedSnapshot: string
  historyDomain: 'bubble' | 'floorPlan'
  baseIndex: number
  startedAt: number
}

interface PendingServerPublishRecordLike {
  serializedSnapshot: string
}

interface HookArgs {
  projectId: string | null
  saveStatus: SaveStatus
  awaitingServerSyncRef: { current: AwaitingServerSyncRecordLike | null }
  pendingServerPublishRef: { current: PendingServerPublishRecordLike | null }
  previousSnapshotRef: { current: string | null }
  bubbleHistoryBaseIndexRef: { current: number }
  floorPlanHistoryBaseIndexRef: { current: number }
  workspaceEditTransactionDepthRef: { current: number }
  pendingWorkspaceSnapshotCommitRef: { current: boolean }
  floorPlanHistoryCommandInFlightRef: { current: boolean }
  setBubbleHistoryCursor: ReturnType<typeof vi.fn>
  setFloorPlanHistoryCursor: ReturnType<typeof vi.fn>
  setSaveStatus: ReturnType<typeof vi.fn>
  requestRepublishSnapshotCommit: ReturnType<typeof vi.fn>
  clearServerPublishRetry: ReturnType<typeof vi.fn>
  scheduleServerPublishRetry: ReturnType<typeof vi.fn>
  loadHistorySnapshot: ReturnType<typeof vi.fn>
  isCursorInvalidCode: ReturnType<typeof vi.fn>
}

interface HarnessProps {
  args: HookArgs
  onReady: (handlers: ReturnType<typeof useWorkspaceHistorySyncController>) => void
}

function Harness({ args, onReady }: HarnessProps) {
  const handlers = useWorkspaceHistorySyncController(args)
  onReady(handlers)
  return null
}

function createHookArgs(overrides?: Partial<HookArgs>): HookArgs {
  return {
    projectId: 'project-1',
    saveStatus: 'synced',
    awaitingServerSyncRef: { current: null },
    pendingServerPublishRef: { current: null },
    previousSnapshotRef: { current: null },
    bubbleHistoryBaseIndexRef: { current: -1 },
    floorPlanHistoryBaseIndexRef: { current: -1 },
    workspaceEditTransactionDepthRef: { current: 0 },
    pendingWorkspaceSnapshotCommitRef: { current: false },
    floorPlanHistoryCommandInFlightRef: { current: false },
    setBubbleHistoryCursor: vi.fn(),
    setFloorPlanHistoryCursor: vi.fn(),
    setSaveStatus: vi.fn(),
    requestRepublishSnapshotCommit: vi.fn(),
    clearServerPublishRetry: vi.fn(),
    scheduleServerPublishRetry: vi.fn(),
    loadHistorySnapshot: vi.fn().mockResolvedValue({
      bubble: { baseIndex: 2, redoDepth: 0 },
      floorPlan: { baseIndex: 3, redoDepth: 1 },
    }),
    isCursorInvalidCode: vi.fn().mockReturnValue(false),
    ...overrides,
  }
}

describe('useWorkspaceHistorySyncController', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironmentFlag
  })

  it('floor-plan cursor invalid with no awaitingSync releases in-flight lock and refreshes cursor', async () => {
    const args = createHookArgs({
      floorPlanHistoryCommandInFlightRef: { current: true },
    })
    let handlers: ReturnType<typeof useWorkspaceHistorySyncController> | null = null

    act(() => {
      root.render(<Harness args={args} onReady={(nextHandlers) => { handlers = nextHandlers }} />)
    })

    await act(async () => {
      handlers?.handleFloorPlanHistoryCursorInvalid()
      await Promise.resolve()
    })

    expect(args.floorPlanHistoryCommandInFlightRef.current).toBe(false)
    expect(args.clearServerPublishRetry).toHaveBeenCalledTimes(1)
    expect(args.setSaveStatus).toHaveBeenCalledWith('dirty')
    expect(args.loadHistorySnapshot).toHaveBeenCalledWith('project-1')
  })

  it('floor-plan cursor invalid with no awaitingSync and no in-flight lock does not force refresh', async () => {
    const args = createHookArgs({
      floorPlanHistoryCommandInFlightRef: { current: false },
    })
    let handlers: ReturnType<typeof useWorkspaceHistorySyncController> | null = null

    act(() => {
      root.render(<Harness args={args} onReady={(nextHandlers) => { handlers = nextHandlers }} />)
    })

    await act(async () => {
      handlers?.handleFloorPlanHistoryCursorInvalid()
      await Promise.resolve()
    })

    expect(args.floorPlanHistoryCommandInFlightRef.current).toBe(false)
    expect(args.clearServerPublishRetry).not.toHaveBeenCalled()
    expect(args.setSaveStatus).not.toHaveBeenCalled()
    expect(args.loadHistorySnapshot).not.toHaveBeenCalled()
  })
})


