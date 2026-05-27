// 프로젝트 댓글 알림을 헤더 아이콘에서 열리는 모달로 보여준다.
import { MessageSquareText, X } from 'lucide-react'
import type { ProjectCommentListItem } from '@/features/project/services/projectComment.service'
import Spinner from '@/shared/components/Spinner'
import { parseBackendDateAsKst } from '@/shared/utils/format'

interface ProjectCommentNotificationModalProps {
  isOpen: boolean
  comments: ProjectCommentListItem[]
  isLoading: boolean
  onClose: () => void
  onCommentClick: (comment: ProjectCommentListItem) => void
}

const formatCommentTime = (createdAt: string): string => {
  const timestamp = parseBackendDateAsKst(createdAt)
  if (Number.isNaN(timestamp.getTime())) return '-'

  return timestamp.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ProjectCommentNotificationModal({
  isOpen,
  comments,
  isLoading,
  onClose,
  onCommentClick,
}: ProjectCommentNotificationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end pr-6 pt-16">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="댓글 알림 닫기" />
      <div className="relative w-[420px] overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-[#eef2f7] bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquareText className="h-[18px] w-[18px] text-[#4f46e5]" />
            <h3 className="truncate text-[15px] font-black text-[#111827]">안 읽은 댓글</h3>
            {comments.length > 0 && (
              <span className="rounded-full bg-[#4f46e5] px-2 py-0.5 text-[10px] font-black text-white">
                {comments.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="project-icon-button h-8 w-8"
            title="닫기"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="md" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#9ca3af]">
              <MessageSquareText className="mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">확인할 새 댓글이 없습니다.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <button
                key={comment.pinId}
                type="button"
                className="flex w-full items-start gap-3 border-b border-[#f8f9fd] px-5 py-4 text-left transition-colors hover:bg-[#f8faff]"
                onClick={() => onCommentClick(comment)}
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4f46e5]" />
                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-black text-[#111827]">{comment.projectName}</span>
                    <span className="shrink-0 text-[11px] text-[#9ca3af]">{formatCommentTime(comment.lastCommentAt)}</span>
                  </span>
                  {comment.pinContent && (
                    <span className="mb-1 block truncate text-[11px] font-medium text-[#6b7280]">
                      {comment.pinContent}
                    </span>
                  )}
                  <span className="text-[12px] leading-5 text-[#6b7280]">새 댓글이 달린 핀입니다.</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
