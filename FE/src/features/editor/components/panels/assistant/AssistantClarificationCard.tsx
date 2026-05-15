import type { ClarificationAlternative } from '../../../types/llmEdit.types'

interface AssistantClarificationCardProps {
  question: string
  alternatives: ClarificationAlternative[]
  onSelect: (alternative: ClarificationAlternative) => void
}

/** clarification_required 상태일 때 표시되는 질문 + 버튼 칩 카드 */
export function AssistantClarificationCard({
  question,
  alternatives,
  onSelect,
}: AssistantClarificationCardProps) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-[11px] font-semibold text-[#334155] mb-2">{question}</p>
      {alternatives.length === 0 ? (
        <p className="text-[11px] text-[#64748B]">아래 입력창에 직접 답변을 입력해주세요.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {alternatives.map((alt) => (
            <button
              key={alt.alternative_id}
              type="button"
              onClick={() => onSelect(alt)}
              className="rounded-full border border-[#3B45B3] px-3 py-1 text-[11px] font-medium text-[#3B45B3] hover:bg-[#EEF2FF] transition-colors"
            >
              {alt.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
