import { describe, expect, it } from 'vitest'
import { resolveEditorHistoryControls } from '@/features/editor/hooks/useEditorPage'

describe('resolveEditorHistoryControls', () => {
  const baseInput = {
    mode: '3d' as const,
    canEditBubble: true,
    canEditFloorPlan: true,
    saveStatus: 'synced' as const,
    bubbleHistoryCursor: { baseIndex: -1, redoDepth: 0 },
    floorPlanHistoryCursor: { baseIndex: -1, redoDepth: 0 },
    floorPlanHistoryCommandInFlight: false,
  }

  it('does not enable 3D floor-plan undo only because saveStatus is dirty', () => {
    const controls = resolveEditorHistoryControls({
      ...baseInput,
      saveStatus: 'dirty',
      floorPlanHistoryCursor: { baseIndex: -1, redoDepth: 0 },
    })

    expect(controls.canUndo).toBe(false)
    expect(controls.canRedo).toBe(false)
  })

  it('enables 3D floor-plan undo and redo from history cursor when no command is in flight', () => {
    const controls = resolveEditorHistoryControls({
      ...baseInput,
      floorPlanHistoryCursor: { baseIndex: 2, redoDepth: 1 },
    })

    expect(controls.canUndo).toBe(true)
    expect(controls.canRedo).toBe(true)
  })

  it('disables 3D floor-plan undo and redo while a history command is in flight', () => {
    const controls = resolveEditorHistoryControls({
      ...baseInput,
      floorPlanHistoryCursor: { baseIndex: 2, redoDepth: 1 },
      floorPlanHistoryCommandInFlight: true,
    })

    expect(controls.canUndo).toBe(false)
    expect(controls.canRedo).toBe(false)
  })

  it('keeps bubble dirty undo behavior unchanged', () => {
    const controls = resolveEditorHistoryControls({
      ...baseInput,
      mode: 'bubble',
      saveStatus: 'dirty',
      canEditFloorPlan: false,
    })

    expect(controls.canUndo).toBe(true)
    expect(controls.canRedo).toBe(false)
  })
})
