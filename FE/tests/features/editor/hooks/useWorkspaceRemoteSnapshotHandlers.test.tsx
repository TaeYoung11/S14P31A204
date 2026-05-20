/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkspaceRemoteSnapshotHandlers } from '@/features/editor/hooks/useWorkspaceRemoteSnapshotHandlers'
import { WORKSPACE_SYNC_ACTION, type FloorPlanSnapshotPayload } from '@/features/editor/utils/workspaceSyncMessage'

type HandlerResult = ReturnType<typeof useWorkspaceRemoteSnapshotHandlers>

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface HookArgs {
  projectId: string
  latestBubbleSnapshotRef: { current: { bubbles: []; connections: []; zones: []; floorMeta: undefined } }
  isBubbleDragTransactionActiveRef: { current: boolean }
  workspaceEditTransactionDepthRef: { current: number }
  pendingWorkspaceSnapshotCommitRef: { current: boolean }
  awaitingServerSyncRef: { current: { projectId: string; historyDomain: 'bubble' | 'floorPlan'; baseIndex: number } | null }
  floorPlanHistoryCommandInFlightRef: { current: boolean }
  suppressNextAutosaveRef: { current: boolean }
  setSelectedConnectionPair: ReturnType<typeof vi.fn>
  setConnectingFromId: ReturnType<typeof vi.fn>
  setSaveStatus: ReturnType<typeof vi.fn>
  setIfcRevisionByProjectId: ReturnType<typeof vi.fn>
  clearConnectionAndTwoDSelection: ReturnType<typeof vi.fn>
  clearSelection: ReturnType<typeof vi.fn>
  resolveSnapshotSyncStatus: ReturnType<typeof vi.fn>
  replaceBubbles: ReturnType<typeof vi.fn>
  replaceConnections: ReturnType<typeof vi.fn>
  replaceZonesState: ReturnType<typeof vi.fn>
  applyBubbleFloorMetaState: ReturnType<typeof vi.fn>
  applyFloorPlanLayoutState: ReturnType<typeof vi.fn>
  applyFloorProjectSnapshot: ReturnType<typeof vi.fn>
  replaceFloorPlanState: ReturnType<typeof vi.fn>
  floorPlanFallback: { isGenerated: boolean; layoutSource: null; layers: []; activeLayerId: null }
  traceBubbleSnapshot: ReturnType<typeof vi.fn>
}

interface HarnessProps {
  args: HookArgs
  onReady: (handlers: HandlerResult) => void
}

function Harness({ args, onReady }: HarnessProps) {
  const handlers = useWorkspaceRemoteSnapshotHandlers(args)
  onReady(handlers)
  return null
}

function createArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    projectId: 'project-1',
    latestBubbleSnapshotRef: { current: { bubbles: [], connections: [], zones: [], floorMeta: undefined } },
    isBubbleDragTransactionActiveRef: { current: false },
    workspaceEditTransactionDepthRef: { current: 0 },
    pendingWorkspaceSnapshotCommitRef: { current: false },
    awaitingServerSyncRef: { current: null },
    floorPlanHistoryCommandInFlightRef: { current: false },
    suppressNextAutosaveRef: { current: false },
    setSelectedConnectionPair: vi.fn(),
    setConnectingFromId: vi.fn(),
    setSaveStatus: vi.fn(),
    setIfcRevisionByProjectId: vi.fn(),
    clearConnectionAndTwoDSelection: vi.fn(),
    clearSelection: vi.fn(),
    resolveSnapshotSyncStatus: vi.fn().mockReturnValue('synced'),
    replaceBubbles: vi.fn(),
    replaceConnections: vi.fn(),
    replaceZonesState: vi.fn(),
    applyBubbleFloorMetaState: vi.fn(),
    applyFloorPlanLayoutState: vi.fn(),
    applyFloorProjectSnapshot: vi.fn(),
    replaceFloorPlanState: vi.fn(),
    floorPlanFallback: { isGenerated: false, layoutSource: null, layers: [], activeLayerId: null },
    traceBubbleSnapshot: vi.fn(),
    ...overrides,
  }
}

const floorPlanSnapshot: FloorPlanSnapshotPayload = {
  bubbles: [],
  connections: [],
  layout: {
    isFloorPlanGenerated: true,
  },
}

describe('useWorkspaceRemoteSnapshotHandlers', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(args: HookArgs): HandlerResult {
    let handlers: HandlerResult | null = null
    act(() => {
      root.render(<Harness args={args} onReady={(next) => { handlers = next }} />)
    })
    if (!handlers) throw new Error('handlers not ready')
    return handlers
  }

  it('does not apply authoritative floor-plan events over a pending local edit without an ack match', () => {
    const args = createArgs({
      pendingWorkspaceSnapshotCommitRef: { current: true },
    })
    const handlers = render(args)

    act(() => {
      handlers.applyRemoteFloorPlanSnapshot(floorPlanSnapshot, {
        action: WORKSPACE_SYNC_ACTION.floorPlanUpdated,
        payloadBaseIndex: null,
      })
    })

    expect(args.applyFloorPlanLayoutState).not.toHaveBeenCalled()
    expect(args.pendingWorkspaceSnapshotCommitRef.current).toBe(true)
    expect(args.setSaveStatus).toHaveBeenCalledWith('dirty')
  })

  it('applies and clears pending state when the authoritative event is the awaited floor-plan ack', () => {
    const args = createArgs({
      pendingWorkspaceSnapshotCommitRef: { current: true },
      awaitingServerSyncRef: { current: { projectId: 'project-1', historyDomain: 'floorPlan', baseIndex: 1 } },
    })
    const handlers = render(args)

    act(() => {
      handlers.applyRemoteFloorPlanSnapshot(floorPlanSnapshot, {
        action: WORKSPACE_SYNC_ACTION.floorPlanUpdated,
        payloadBaseIndex: 2,
      })
    })

    expect(args.applyFloorPlanLayoutState).toHaveBeenCalled()
    expect(args.pendingWorkspaceSnapshotCommitRef.current).toBe(false)
    expect(args.awaitingServerSyncRef.current).toBeNull()
    expect(args.setSaveStatus).toHaveBeenCalledWith('synced')
  })
})
