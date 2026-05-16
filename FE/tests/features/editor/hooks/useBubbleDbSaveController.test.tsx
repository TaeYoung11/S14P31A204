/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useBubbleDbSaveController } from '@/features/editor/hooks/useBubbleDbSaveController'
import type { SaveBubbleSnapshotResponse } from '@/features/editor/services/workspaceBubble.service'

interface HookArgs {
  projectId: string | null
  workspacePhaseStatus: 'BUBBLE_DRAFT' | 'CONVERTING' | 'IFC_EDIT'
  latestBubbleSnapshotRef: {
    current: {
      bubbles: []
      connections: []
      zones: []
      floorMeta: null
    }
  }
  bubbleSnapshotChangeVersionRef: { current: number }
  saveToDb: ReturnType<typeof vi.fn>
  normalizeFloorMetaForSync: ReturnType<typeof vi.fn>
  writeSavedRecovery: ReturnType<typeof vi.fn>
  clearLocalDraft: ReturnType<typeof vi.fn>
  resolveDebounceMs: ReturnType<typeof vi.fn>
}

interface HarnessProps {
  args: HookArgs
  onReady: (value: ReturnType<typeof useBubbleDbSaveController>) => void
}

function Harness({ args, onReady }: HarnessProps) {
  const controller = useBubbleDbSaveController(args)
  onReady(controller)
  return null
}

function createResponse(projectId: string, savedAt = '2026-05-15T00:00:00.000Z'): SaveBubbleSnapshotResponse {
  return {
    projectId,
    phaseStatus: 'BUBBLE_DRAFT',
    savedAt,
  }
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createArgs(overrides?: Partial<HookArgs>): HookArgs {
  return {
    projectId: 'project-1',
    workspacePhaseStatus: 'BUBBLE_DRAFT',
    latestBubbleSnapshotRef: {
      current: {
        bubbles: [],
        connections: [],
        zones: [],
        floorMeta: null,
      },
    },
    bubbleSnapshotChangeVersionRef: { current: 1 },
    saveToDb: vi.fn().mockResolvedValue(createResponse('project-1')),
    normalizeFloorMetaForSync: vi.fn().mockReturnValue(undefined),
    writeSavedRecovery: vi.fn(),
    clearLocalDraft: vi.fn(),
    resolveDebounceMs: vi.fn().mockReturnValue(0),
    ...overrides,
  }
}

describe('useBubbleDbSaveController', () => {
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

  it('clears local draft when save completes without mid-save changes', async () => {
    const args = createArgs()
    let controller: ReturnType<typeof useBubbleDbSaveController> | null = null

    act(() => {
      root.render(<Harness args={args} onReady={(value) => { controller = value }} />)
    })

    act(() => {
      controller?.markDirty()
    })
    await act(async () => {
      await controller?.flushSaveToDb(false)
    })

    expect(args.saveToDb).toHaveBeenCalledTimes(1)
    expect(args.clearLocalDraft).toHaveBeenCalledTimes(1)
  })

  it('keeps local draft when snapshot changes during save and clears after follow-up save', async () => {
    const firstSave = createDeferred<SaveBubbleSnapshotResponse>()
    const args = createArgs({
      saveToDb: vi.fn()
        .mockImplementationOnce(() => firstSave.promise)
        .mockResolvedValueOnce(createResponse('project-1', '2026-05-15T00:00:01.000Z')),
    })
    let controller: ReturnType<typeof useBubbleDbSaveController> | null = null

    act(() => {
      root.render(<Harness args={args} onReady={(value) => { controller = value }} />)
    })

    act(() => {
      controller?.markDirty()
    })

    let firstResult: SaveBubbleSnapshotResponse | null | undefined
    await act(async () => {
      const firstPromise = controller?.flushSaveToDb(false)
      args.bubbleSnapshotChangeVersionRef.current += 1
      firstSave.resolve(createResponse('project-1'))
      firstResult = await firstPromise
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(firstResult).toEqual(createResponse('project-1'))
    expect(args.saveToDb).toHaveBeenCalledTimes(2)
    expect(args.writeSavedRecovery).toHaveBeenCalledTimes(2)
    expect(args.clearLocalDraft).toHaveBeenCalledTimes(1)
  })
})


