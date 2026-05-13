/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ZoomControlBar } from './ZoomControlBar'

describe('ZoomControlBar', () => {
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

  it('3D 편집 잠금 시 회전/스케일/스냅 UI를 disabled 처리한다', () => {
    act(() => {
      root.render(
        <ZoomControlBar
          zoom={100}
          mode="3d"
          selectedTool="selection"
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onSetZoom={vi.fn()}
          onSetTool={vi.fn()}
          onToggleGridSnap={vi.fn()}
          onGridSnapIntervalChange={vi.fn()}
          isEditingLocked
        />,
      )
    })

    const rotateButton = container.querySelector('button[aria-label="회전 기즈모"]') as HTMLButtonElement | null
    const scaleButton = container.querySelector('button[aria-label="크기 기즈모"]') as HTMLButtonElement | null
    const snapIntervalSelect = container.querySelector('select[aria-label="3D snap interval"]') as HTMLSelectElement | null
    const snapButton = snapIntervalSelect?.previousElementSibling as HTMLButtonElement | null

    expect(rotateButton).not.toBeNull()
    expect(scaleButton).not.toBeNull()
    expect(snapIntervalSelect).not.toBeNull()
    expect(snapButton).not.toBeNull()
    expect(rotateButton?.disabled).toBe(true)
    expect(scaleButton?.disabled).toBe(true)
    expect(snapButton?.disabled).toBe(true)
    expect(snapIntervalSelect?.disabled).toBe(true)
  })
})
