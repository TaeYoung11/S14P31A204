import { Loader2, SendHorizontal, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { LlmEditPreview, LlmEditStatus } from '../../../types/llmEdit.types'
import { filterLlmDemoShortcuts, resolveLlmDemoShortcut } from '../../../utils/llmDemoShortcuts'

interface AssistantPromptSectionProps {
  prompt: string
  status: LlmEditStatus
  isLoading: boolean
  canRun: boolean
  preview: LlmEditPreview | null
  selectedWallForChat?: { wallId: string } | null
  onPromptChange: (value: string) => void
  onRun: () => void
  onApply: () => void
  onDiscard: () => void
  onClearSelectedWall?: () => void
}

/** Agent 채팅 입력창입니다. */
export function AssistantPromptSection({
  prompt,
  status,
  isLoading,
  canRun,
  preview,
  selectedWallForChat,
  onPromptChange,
  onRun,
  onApply,
  onDiscard,
  onClearSelectedWall,
}: AssistantPromptSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const shortcutOptions = useMemo(() => filterLlmDemoShortcuts(prompt), [prompt])
  const showShortcuts = isFocused && !isLoading && prompt.trim().startsWith('/') && shortcutOptions.length > 0
  const selectedWallPreview = selectedWallForChat
    ? selectedWallForChat.wallId.slice(0, 12)
    : ''

  useEffect(() => {
    if (!selectedWallForChat) return
    textareaRef.current?.focus()
  }, [selectedWallForChat])

  const handleSubmit = () => {
    if (!canRun) return
    onRun()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab' && showShortcuts) {
      event.preventDefault()
      onPromptChange(shortcutOptions[0].prompt)
      return
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    const shortcut = resolveLlmDemoShortcut(prompt)
    if (shortcut) {
      onPromptChange(shortcut.prompt)
      return
    }
    handleSubmit()
  }

  return (
    <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 pb-4 pt-3">
      {isLoading && (
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] px-2.5 py-1 text-[11px] font-semibold text-[#64748B] hover:bg-[#F1F5F9]"
          >
            <X size={11} />
            응답 대기 중단
          </button>
        </div>
      )}

      {status === 'preview' && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={!preview}
            className="rounded-md border border-[#CBD5E1] px-2.5 py-1 text-[11px] font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-40"
          >
            반영
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#CBD5E1] text-[#64748B]"
            aria-label="미리보기 닫기"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {selectedWallForChat && (
        <div className="mb-2 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#3B45B3]">
              벽 선택됨
            </span>
            <button
              type="button"
              onClick={onClearSelectedWall}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#3B45B3]/60 hover:bg-white/70 hover:text-[#3B45B3]"
              aria-label="벽 선택 취소"
            >
              <X size={11} />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#475569]">
            <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[#1F2937]">
              {selectedWallPreview}
            </span>
            <span>전송 시 이 벽 ID가 함께 전달됩니다.</span>
          </div>
        </div>
      )}

      <div className="relative rounded-2xl border border-[#D8DEE9] bg-white px-3 py-2 shadow-sm">
        {showShortcuts && (
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-lg border border-[#D8DEE9] bg-white shadow-lg">
            {shortcutOptions.map((shortcut) => (
              <button
                key={shortcut.command}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onPromptChange(shortcut.prompt)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#F1F5F9]"
              >
                <Sparkles size={13} className="shrink-0 text-[#3B45B3]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-[#1F2937]">{shortcut.command}</span>
                    <span className="truncate text-[11px] font-medium text-[#475569]">{shortcut.label}</span>
                  </span>
                  <span className="block truncate text-[11px] text-[#64748B]">{shortcut.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Ask anything"
          rows={1}
          className="max-h-28 min-h-[34px] w-full resize-none bg-transparent py-1.5 text-[12px] leading-5 text-[#1F2937] outline-none placeholder:text-[#94A3B8]"
          disabled={isLoading}
        />
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="max-w-[92px] truncate text-[11px] font-medium text-[#64748B]">바탕 Agent</span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canRun}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3B45B3] text-white transition-colors hover:bg-[#303A9B] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="메시지 보내기"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <SendHorizontal size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}
