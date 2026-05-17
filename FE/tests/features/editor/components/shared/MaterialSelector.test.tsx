/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MaterialSelector } from '@/features/editor/components/shared/MaterialSelector'

describe('MaterialSelector', () => {
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

  it('잠금 전환 시 열려 있던 드롭다운을 닫고 재활성화해도 자동 재오픈하지 않는다', async () => {
    const onChange = vi.fn()

    act(() => {
      root.render(<MaterialSelector value="UnknownMat" onChange={onChange} />)
    })

    const toggleButton = container.querySelector('button[type="button"]') as HTMLButtonElement | null
    expect(toggleButton).not.toBeNull()

    act(() => {
      toggleButton?.click()
    })
    expect(container.textContent?.includes('IFC 정의값: UnknownMat')).toBe(true)

    act(() => {
      root.render(<MaterialSelector value="UnknownMat" onChange={onChange} disabled />)
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(container.textContent?.includes('IFC 정의값: UnknownMat')).toBe(false)

    act(() => {
      root.render(<MaterialSelector value="UnknownMat" onChange={onChange} />)
    })
    expect(container.textContent?.includes('IFC 정의값: UnknownMat')).toBe(false)
  })
})


