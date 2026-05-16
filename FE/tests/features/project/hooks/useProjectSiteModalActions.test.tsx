/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useProjectSiteModalActions } from '@/features/project/hooks/useProjectSiteModalActions'

interface HarnessProps {
  hasPolygon: boolean
  isCloseDisabled: boolean
  onCancel: () => void | Promise<void>
  onComplete: () => void | Promise<void>
  onActionError?: (message: string) => void
  onHandlersReady: (handlers: {
    handleRequestClose: () => void
    handleComplete: () => void
  }) => void
}

function Harness({
  hasPolygon,
  isCloseDisabled,
  onCancel,
  onComplete,
  onActionError,
  onHandlersReady,
}: HarnessProps) {
  const handlers = useProjectSiteModalActions({
    hasPolygon,
    isCloseDisabled,
    onCancel,
    onComplete,
    onActionError,
  })

  useEffect(() => {
    onHandlersReady(handlers)
  }, [handlers, onHandlersReady])

  return null
}

describe('useProjectSiteModalActions', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown
  let latestHandlers: {
    handleRequestClose: () => void
    handleComplete: () => void
  } | null

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestHandlers = null
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    latestHandlers = null
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironmentFlag
    vi.clearAllMocks()
  })

  it('onCancel 비동기 실패 시 onActionError로 메시지를 전달한다', async () => {
    const onActionError = vi.fn()

    act(() => {
      root.render(
        <Harness
          hasPolygon
          isCloseDisabled={false}
          onCancel={() => Promise.reject(new Error('cancel failed'))}
          onComplete={vi.fn()}
          onActionError={onActionError}
          onHandlersReady={(handlers) => {
            latestHandlers = handlers
          }}
        />,
      )
    })

    await act(async () => {
      latestHandlers?.handleRequestClose()
      await Promise.resolve()
    })

    expect(onActionError).toHaveBeenCalledWith('cancel failed')
  })

  it('닫기 비활성 상태에서 닫기 요청 시 진행 중 안내 메시지를 전달한다', async () => {
    const onActionError = vi.fn()
    const onCancel = vi.fn()

    act(() => {
      root.render(
        <Harness
          hasPolygon
          isCloseDisabled
          onCancel={onCancel}
          onComplete={vi.fn()}
          onActionError={onActionError}
          onHandlersReady={(handlers) => {
            latestHandlers = handlers
          }}
        />,
      )
    })

    await act(async () => {
      latestHandlers?.handleRequestClose()
      await Promise.resolve()
    })

    expect(onCancel).not.toHaveBeenCalled()
    expect(onActionError).toHaveBeenCalledWith('현재 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.')
  })

  it('onComplete 비동기 실패 시 onActionError로 메시지를 전달한다', async () => {
    const onActionError = vi.fn()

    act(() => {
      root.render(
        <Harness
          hasPolygon
          isCloseDisabled={false}
          onCancel={vi.fn()}
          onComplete={() => Promise.reject(new Error('complete failed'))}
          onActionError={onActionError}
          onHandlersReady={(handlers) => {
            latestHandlers = handlers
          }}
        />,
      )
    })

    await act(async () => {
      latestHandlers?.handleComplete()
      await Promise.resolve()
    })

    expect(onActionError).toHaveBeenCalledWith('complete failed')
  })
})
