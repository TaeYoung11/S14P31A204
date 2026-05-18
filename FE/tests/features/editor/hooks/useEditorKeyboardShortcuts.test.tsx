/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useEditorKeyboardShortcuts } from '@/features/editor/hooks/useEditorKeyboardShortcuts'
import type { EditorMode } from '@/features/editor/types'

interface HarnessProps {
  mode: EditorMode
  isEditorReadOnly?: boolean
  isDeleteEnabled?: boolean
  onDeleteSelected?: () => void
  onToggleLayerOverlay?: () => void
  onSetTool?: (tool: string) => void
}

function Harness({
  mode,
  isEditorReadOnly = false,
  isDeleteEnabled = true,
  onDeleteSelected = () => undefined,
  onToggleLayerOverlay = () => undefined,
  onSetTool = () => undefined,
}: HarnessProps) {
  useEditorKeyboardShortcuts({
    mode,
    isEditorReadOnly,
    isDeleteEnabled,
    onDeleteSelected,
    onToggleLayerOverlay,
    onSetTool,
  })
  return null
}

describe('useEditorKeyboardShortcuts', () => {
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

  it('Delete 키 입력 시 삭제 콜백을 실행한다', () => {
    const onDeleteSelected = vi.fn()
    act(() => {
      root.render(<Harness mode="3d" onDeleteSelected={onDeleteSelected} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    })

    expect(onDeleteSelected).toHaveBeenCalledTimes(1)
  })

  it('삭제 비활성 상태에서는 Delete 키를 무시한다', () => {
    const onDeleteSelected = vi.fn()
    act(() => {
      root.render(<Harness mode="3d" isDeleteEnabled={false} onDeleteSelected={onDeleteSelected} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    })

    expect(onDeleteSelected).not.toHaveBeenCalled()
  })

  it('입력 요소 포커스에서는 Delete 키 삭제 콜백을 실행하지 않는다', () => {
    const onDeleteSelected = vi.fn()
    act(() => {
      root.render(<Harness mode="3d" onDeleteSelected={onDeleteSelected} />)
    })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    input.remove()

    expect(onDeleteSelected).not.toHaveBeenCalled()
  })

  it('3D 모드에서 W/E/R 단축키로 도구를 전환한다', () => {
    const onSetTool = vi.fn()
    act(() => {
      root.render(<Harness mode="3d" onSetTool={onSetTool} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
    })

    expect(onSetTool).toHaveBeenNthCalledWith(1, 'selection')
    expect(onSetTool).toHaveBeenNthCalledWith(2, 'rotate')
    expect(onSetTool).toHaveBeenNthCalledWith(3, 'scale')
  })

  it('Shift+L 입력 시 2D/3D 모드에서만 오버레이 토글을 실행한다', () => {
    const onToggleLayerOverlay = vi.fn()
    act(() => {
      root.render(<Harness mode="bubble" onToggleLayerOverlay={onToggleLayerOverlay} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', code: 'KeyL', shiftKey: true }))
    })
    expect(onToggleLayerOverlay).not.toHaveBeenCalled()

    act(() => {
      root.render(<Harness mode="2d" onToggleLayerOverlay={onToggleLayerOverlay} />)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', code: 'KeyL', shiftKey: true }))
    })
    expect(onToggleLayerOverlay).toHaveBeenCalledTimes(1)
  })
})


