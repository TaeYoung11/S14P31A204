// 새 댓글 SSE 이벤트를 우측 상단 토스트로 보여준다.
import { MessageSquareText, X } from 'lucide-react'
import type { ProjectCommentToastState } from '@/features/project/hooks/useProjectCommentRealtime'

interface ProjectCommentToastProps {
  toast: ProjectCommentToastState | null
  onClose: () => void
  onOpenProject: (projectId: string) => void
}

const COMMENT_PREVIEW_MAX_LENGTH = 15

const formatCommentPreview = (content: string | null | undefined): string => {
  const normalized = typeof content === 'string' ? content.trim() : ''
  if (!normalized) return '새 댓글이 등록되었습니다.'
  if (normalized.length <= COMMENT_PREVIEW_MAX_LENGTH) return normalized
  return `${normalized.slice(0, COMMENT_PREVIEW_MAX_LENGTH)}...`
}

export default function ProjectCommentToast({
  toast,
  onClose,
  onOpenProject,
}: ProjectCommentToastProps) {
  if (!toast) return null
  const commentPreview = formatCommentPreview(toast.content)

  return (
    <div className="fixed right-6 top-20 z-[120] w-[340px] overflow-hidden rounded-xl border border-[#dbeafe] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.18)]">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5]">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpenProject(toast.projectId)}
        >
          <span className="mb-1 block truncate text-xs font-bold text-[#4f46e5]">{toast.projectName}</span>
          <span className="block text-sm font-bold text-[#111827]">{commentPreview}</span>
          <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#6b7280]">새 댓글이 등록되었습니다.</span>
        </button>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
          onClick={onClose}
          title="알림 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
