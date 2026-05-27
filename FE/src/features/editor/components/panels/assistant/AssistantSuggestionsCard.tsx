/** AI 어시스턴트 — 애매한 요청에 대한 재입력 예시 카드 */

interface AssistantSuggestionsCardProps {
  suggestions: string[]
  /** 예시 클릭 시 해당 텍스트를 입력창에 반영 */
  onSelect: (suggestion: string) => void
}

/**
 * status='ambiguous' 상태일 때 표시되는 재입력 예시 목록 카드.
 * 예시 문구를 클릭하면 프롬프트 입력창에 자동으로 채워진다.
 */
export function AssistantSuggestionsCard({ suggestions, onSelect }: AssistantSuggestionsCardProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-[10px] font-bold text-[#64748B] mb-1">재입력 예시</p>
      <ul className="space-y-1">
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              onClick={() => onSelect(suggestion)}
              className="text-left text-[11px] text-[#3B45B3] hover:underline"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
