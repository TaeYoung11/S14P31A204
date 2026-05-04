import type { LlmEditPreview } from '../../../types/llmEdit.types'

interface AssistantPreviewCardProps {
  preview: LlmEditPreview
}

/** AI 수정 미리보기 카드 */
export function AssistantPreviewCard({ preview }: AssistantPreviewCardProps) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-inner">
      <p className="text-[11px] font-bold text-[#334155]">변경 미리보기</p>
      <p className="mt-1 text-[11px] text-[#64748B]">{preview.summary}</p>
      <ul className="mt-2 space-y-1">
        {preview.changes.map((change) => (
          <li key={change.id} className="text-[11px] text-[#1E293B]">
            - {change.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
