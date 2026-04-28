import { AlertCircle, Loader2 } from 'lucide-react'

interface AssistantNoticeCardProps {
  message: string
  loading?: boolean
}

/**
 * AI 패널 상태 메시지 카드
 * - loading=true일 때 스피너를 표시한다.
 * - loading=false일 때 안내/오류 메시지 아이콘을 표시한다.
 */
export function AssistantNoticeCard({ message, loading = false }: AssistantNoticeCardProps) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-[#334155] flex items-start gap-1.5">
      {loading ? (
        <Loader2 size={13} className="mt-0.5 text-[#3B45B3] animate-spin" />
      ) : (
        <AlertCircle size={13} className="mt-0.5 text-[#3B45B3]" />
      )}
      <span>{message}</span>
    </div>
  )
}
