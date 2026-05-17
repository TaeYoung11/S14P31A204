/* @vitest-environment jsdom */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantPromptSection } from '../../../../../../src/features/editor/components/panels/assistant/AssistantPromptSection'
import { LLM_DEMO_SHORTCUTS } from '../../../../../../src/features/editor/utils/llmDemoShortcuts'

describe('AssistantPromptSection', () => {
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

  function renderPrompt(initialPrompt: string, onRun = vi.fn()) {
    const onPromptChange = vi.fn()

    function Harness() {
      const [prompt, setPrompt] = useState(initialPrompt)
      return (
        <AssistantPromptSection
          prompt={prompt}
          status="idle"
          isLoading={false}
          canRun={prompt.trim().length > 0}
          preview={null}
          onPromptChange={(value) => {
            onPromptChange(value)
            setPrompt(value)
          }}
          onRun={onRun}
          onApply={vi.fn()}
          onDiscard={vi.fn()}
        />
      )
    }

    act(() => {
      root.render(<Harness />)
    })

    return { onPromptChange, onRun }
  }

  it('expands exact shortcut before button submit without running raw command', () => {
    const shortcut = LLM_DEMO_SHORTCUTS[0]
    const onRun = vi.fn()
    const { onPromptChange } = renderPrompt(shortcut.command, onRun)

    const sendButton = container.querySelector('button[type="button"]') as HTMLButtonElement | null
    expect(sendButton).not.toBeNull()

    act(() => {
      sendButton?.click()
    })

    expect(onPromptChange).toHaveBeenCalledWith(shortcut.prompt)
    expect(onRun).not.toHaveBeenCalled()
  })

  it('uses the same shortcut expansion path for Enter submit', () => {
    const shortcut = LLM_DEMO_SHORTCUTS[0]
    const onRun = vi.fn()
    const { onPromptChange } = renderPrompt(shortcut.command, onRun)

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()

    act(() => {
      textarea?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onPromptChange).toHaveBeenCalledWith(shortcut.prompt)
    expect(onRun).not.toHaveBeenCalled()
  })
})
