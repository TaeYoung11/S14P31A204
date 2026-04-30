import { Loader2, Wand2 } from 'lucide-react'
import type { LlmEditPreview, LlmEditStatus } from '../../../types/llmEdit.types'

interface AssistantPromptSectionProps {
  provider: 'mock' | 'api'
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

/** 자연어 지시 입력과 실행/적용 버튼 영역 */
export function AssistantPromptSection({
  provider,
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
  return (
    <>
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-[#475569]">수정 요청</label>
        <span className="text-[10px] font-semibold text-[#64748B]">
          {provider === 'api' ? 'API 모드' : 'Mock 모드'}
        </span>
      </div>
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="예: 거실과 주방 사이에 연결 추가해줘"
        className="mt-2 w-full min-h-[84px] resize-none rounded-lg border border-[#E2E6EF] px-3 py-2 text-[12px] text-[#1C1C1E] outline-none focus:border-[#3B45B3]"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onRun}
          disabled={!canRun}
          className="inline-flex items-center gap-1 rounded-lg bg-[#3B45B3] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          실행
        </button>
        {(status === 'preview' || status === 'applied') && (
          <>
            <button
              onClick={onApply}
              disabled={!preview || status === 'applied'}
              className="rounded-lg border border-[#3B45B3] px-3 py-1.5 text-[11px] font-bold text-[#3B45B3] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              적용
            </button>
            <button
              onClick={onDiscard}
              className="rounded-lg border border-[#E2E6EF] px-3 py-1.5 text-[11px] font-bold text-[#64748B]"
            >
              취소
            </button>
          </>
        )}
      </div>
    </>
  )
}
