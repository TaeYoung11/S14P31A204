import { describe, expect, it } from 'vitest'
import {
  LLM_DEMO_SHORTCUTS,
  filterLlmDemoShortcuts,
  resolveLlmDemoShortcut,
} from '../../../../src/features/editor/utils/llmDemoShortcuts'

describe('llmDemoShortcuts', () => {
  it('filters shortcuts only for slash-prefixed input', () => {
    expect(filterLlmDemoShortcuts('방')).toEqual([])
    expect(filterLlmDemoShortcuts('/방')).toEqual([
      expect.objectContaining({ command: '/방생성' }),
    ])
  })

  it('resolves exact shortcut prompts for chat injection', () => {
    const shortcut = resolveLlmDemoShortcut('/창문수정')

    expect(shortcut?.prompt).toContain('2층 북쪽 창문')
    expect(shortcut?.prompt).not.toContain('/창문수정')
  })

  it('keeps every demo shortcut mapped to a non-empty prompt', () => {
    expect(LLM_DEMO_SHORTCUTS.length).toBeGreaterThanOrEqual(6)
    for (const shortcut of LLM_DEMO_SHORTCUTS) {
      expect(shortcut.command.startsWith('/')).toBe(true)
      expect(shortcut.prompt.trim().length).toBeGreaterThan(10)
    }
  })
})
