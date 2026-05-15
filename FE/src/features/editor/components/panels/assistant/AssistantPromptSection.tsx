import { Loader2, SendHorizontal, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { LlmEditPreview, LlmEditStatus } from '../../../types/llmEdit.types'

interface AssistantPromptSectionProps {
  prompt: string
  status: LlmEditStatus
  isLoading: boolean
  canRun: boolean
  preview: LlmEditPreview | null
  onPromptChange: (value: string) => void
  onRun: () => void
  onApply: () => void
  onDiscard: () => void
}

/** Agent 채팅 입력창입니다. */
export function AssistantPromptSection({
  prompt,
  status,
  isLoading,
  canRun,
  preview,
  onPromptChange,
  onRun,
  onApply,
  onDiscard,
}: AssistantPromptSectionProps) {
  const handleSubmit = () => {
    if (!canRun) return
    onRun()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
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
            취소
          </button>
        </div>
      )}

      {(status === 'preview' || status === 'applied') && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={!preview || status === 'applied'}
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

      <div className="rounded-2xl border border-[#D8DEE9] bg-white px-3 py-2 shadow-sm">
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
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
