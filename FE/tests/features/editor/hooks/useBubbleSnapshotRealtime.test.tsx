/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { IMessage } from '@stomp/stompjs'
import { useBubbleSnapshotRealtime } from '@/features/editor/hooks/useBubbleSnapshotRealtime'
import type { BubbleData, ConnectionData } from '@/features/editor/types'

interface CapturedTopic {
  destination: string
  onMessage: (message: IMessage) => void
}

const stompMocks = vi.hoisted(() => {
  const state = {
    topics: [] as CapturedTopic[],
    unsubscribe: vi.fn(),
    getStompClient: vi.fn(() => ({ connected: true })),
    subscribeStompTopicsWithPolling: vi.fn((params: { topics: CapturedTopic[] }) => {
      state.topics = params.topics
      return state.unsubscribe
    }),
  }
  return state
})

vi.mock('@/shared/lib/stomp', () => ({
  getStompClient: stompMocks.getStompClient,
}))

vi.mock('@/features/editor/utils/stompSubscription', () => ({
  subscribeStompTopicsWithPolling: stompMocks.subscribeStompTopicsWithPolling,
}))

interface HarnessProps {
  onRemoteSnapshot?: ReturnType<typeof vi.fn>
  onRemoteFloorPlanSnapshot?: ReturnType<typeof vi.fn>
  onPhaseStatusChanged?: ReturnType<typeof vi.fn>
  onIfcStorageUrlReceived?: ReturnType<typeof vi.fn>
  onFloorPlanHistoryCursorChanged?: ReturnType<typeof vi.fn>
  floorPlanHistoryCursor?: { baseIndex: number; redoDepth: number }
}

function Harness({
  onRemoteSnapshot = vi.fn(),
  onRemoteFloorPlanSnapshot = vi.fn(),
  onPhaseStatusChanged = vi.fn(),
  onIfcStorageUrlReceived = vi.fn(),
  onFloorPlanHistoryCursorChanged = vi.fn(),
  floorPlanHistoryCursor = { baseIndex: 2, redoDepth: 0 },
}: HarnessProps) {
  useBubbleSnapshotRealtime({
    projectId: 'project-1',
    canPublish: true,
    bubbles: [] as BubbleData[],
    connections: [] as ConnectionData[],
    onRemoteSnapshot,
    onRemoteFloorPlanSnapshot,
    onPhaseStatusChanged,
    onIfcStorageUrlReceived,
    onFloorPlanHistoryCursorChanged,
    floorPlanHistoryCursor,
  })
  return null
}

const emitFloorPlanSync = (payload: unknown) => {
  const topic = stompMocks.topics.find((candidate) => candidate.destination.endsWith('/floor-plan/sync'))
  if (!topic) throw new Error('floor-plan sync topic was not subscribed')
  topic.onMessage({ body: JSON.stringify(payload) } as IMessage)
}

const createFloorPlanPayload = (overrides?: Record<string, unknown>) => ({
  baseIndex: 2,
  revisionId: 'revision-previous',
  sceneType: 'THREE_D',
  bubbles: [],
  connections: [],
  layout: {
    phaseStatus: 'IFC_EDIT',
    libraryElements: [
      {
        id: 'door-152970-1',
        type: 'room-door',
        name: 'Door',
        sourceAssetId: 'door-152970',
      },
    ],
    baseIndex: 2,
  },
  ...overrides,
})

describe('useBubbleSnapshotRealtime floor-plan IFC reload handling', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    stompMocks.topics = []
    stompMocks.unsubscribe.mockClear()
    stompMocks.getStompClient.mockClear()
    stompMocks.subscribeStompTopicsWithPolling.mockClear()
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

  it.each([
    ['FLOOR_PLAN_UNDO'],
    ['FLOOR_PLAN_REDO'],
  ])('%s with library layout and IFC source forwards to IFC reload handler', (action) => {
    const onIfcStorageUrlReceived = vi.fn()
    const onRemoteFloorPlanSnapshot = vi.fn()

    act(() => {
      root.render(
        <Harness
          onIfcStorageUrlReceived={onIfcStorageUrlReceived}
          onRemoteFloorPlanSnapshot={onRemoteFloorPlanSnapshot}
        />,
      )
    })

    const floorPlanPayloadJson = createFloorPlanPayload()
    act(() => {
      emitFloorPlanSync({
        action,
        projectId: 'project-1',
        status: 'IFC_EDIT',
        revisionId: 'revision-previous',
        floorPlanPayloadJson,
        s3Url: 's3://bucket/previous.ifc',
      })
    })

    expect(onIfcStorageUrlReceived).toHaveBeenCalledWith(
      's3://bucket/previous.ifc',
      action,
      null,
      'revision-previous',
      expect.objectContaining({ layout: expect.objectContaining({ libraryElements: expect.any(Array) }) }),
    )
    expect(onRemoteFloorPlanSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ layout: expect.objectContaining({ libraryElements: expect.any(Array) }) }),
      expect.objectContaining({ action, layoutOnly: true, payloadBaseIndex: 2 }),
    )
  })

  it('local library-only FLOOR_PLAN_UPDATED without IFC source still skips IFC reload', () => {
    const onIfcStorageUrlReceived = vi.fn()
    const onRemoteFloorPlanSnapshot = vi.fn()

    act(() => {
      root.render(
        <Harness
          onIfcStorageUrlReceived={onIfcStorageUrlReceived}
          onRemoteFloorPlanSnapshot={onRemoteFloorPlanSnapshot}
        />,
      )
    })

    act(() => {
      emitFloorPlanSync({
        action: 'FLOOR_PLAN_UPDATED',
        projectId: 'project-1',
        status: 'IFC_EDIT',
        revisionId: 'revision-current',
        floorPlanPayloadJson: createFloorPlanPayload({
          revisionId: 'revision-current',
          workspaceCommand: {
            op: 'update',
            entity: 'door',
            id: 'door-152970-1',
            patch: { sourceAssetId: 'door-152970' },
          },
        }),
      })
    })

    expect(onIfcStorageUrlReceived).not.toHaveBeenCalled()
    expect(onRemoteFloorPlanSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ layout: expect.objectContaining({ libraryElements: expect.any(Array) }) }),
      expect.objectContaining({ action: 'FLOOR_PLAN_UPDATED', layoutOnly: true, payloadBaseIndex: 2 }),
    )
  })

  it('generate undo baseline enables redo cursor and redo reloads generated IFC', () => {
    const onIfcStorageUrlReceived = vi.fn()
    const onFloorPlanHistoryCursorChanged = vi.fn()

    act(() => {
      root.render(
        <Harness
          onIfcStorageUrlReceived={onIfcStorageUrlReceived}
          onFloorPlanHistoryCursorChanged={onFloorPlanHistoryCursorChanged}
          floorPlanHistoryCursor={{ baseIndex: 1, redoDepth: 0 }}
        />,
      )
    })

    act(() => {
      emitFloorPlanSync({
        action: 'FLOOR_PLAN_UNDO',
        projectId: 'project-1',
        status: 'BUBBLE_DRAFT',
        floorPlanPayloadJson: {
          baseIndex: -1,
          sceneType: 'THREE_D',
          bubbles: [],
          connections: [],
          layout: null,
        },
      })
    })

    expect(onIfcStorageUrlReceived).toHaveBeenCalledWith(
      '',
      'FLOOR_PLAN_UNDO',
      null,
      null,
      expect.objectContaining({ baseIndex: -1 }),
    )
    expect(onFloorPlanHistoryCursorChanged).toHaveBeenLastCalledWith(0, 1)

    act(() => {
      root.render(
        <Harness
          onIfcStorageUrlReceived={onIfcStorageUrlReceived}
          onFloorPlanHistoryCursorChanged={onFloorPlanHistoryCursorChanged}
          floorPlanHistoryCursor={{ baseIndex: 0, redoDepth: 1 }}
        />,
      )
    })

    act(() => {
      emitFloorPlanSync({
        action: 'FLOOR_PLAN_REDO',
        projectId: 'project-1',
        status: 'IFC_EDIT',
        revisionId: 'revision-generated',
        s3Url: 's3://bucket/generated.ifc',
        floorPlanPayloadJson: {
          baseIndex: 0,
          revisionId: 'revision-generated',
          sceneType: 'THREE_D',
          bubbles: [],
          connections: [],
          layout: null,
        },
      })
    })

    expect(onIfcStorageUrlReceived).toHaveBeenLastCalledWith(
      's3://bucket/generated.ifc',
      'FLOOR_PLAN_REDO',
      null,
      'revision-generated',
      expect.objectContaining({ baseIndex: 0 }),
    )
    expect(onFloorPlanHistoryCursorChanged).toHaveBeenLastCalledWith(1, 0)
  })
})
