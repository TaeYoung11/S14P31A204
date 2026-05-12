import { useEffect } from 'react'
import { AlertTriangle, Image, MessageSquareText, X } from 'lucide-react'
import type { ProjectCommentToastState } from '@/features/project/hooks/useProjectCommentRealtime'
import {
  type ProjectNotificationToast,
  useProjectNotificationToastStore,
} from '@/features/project/stores/projectNotificationToastStore'

interface ProjectCommentToastProps {
  toast?: ProjectCommentToastState | null
  onClose?: () => void
  onOpenProject: (projectId: string, pinId?: string) => void
}

const COMMENT_PREVIEW_MAX_LENGTH = 15

const formatCommentPreview = (content: string | null | undefined): string => {
  const normalized = typeof content === 'string' ? content.trim() : ''
  if (!normalized) return '새 댓글이 등록되었습니다.'
  if (normalized.length <= COMMENT_PREVIEW_MAX_LENGTH) return normalized
  return `${normalized.slice(0, COMMENT_PREVIEW_MAX_LENGTH)}...`
}

const formatToastMessage = (toast: ProjectNotificationToast): string => {
  const normalized = toast.message.trim()
  if (toast.type === 'comment') return formatCommentPreview(normalized)
  if (normalized) return normalized
  return toast.type === 'render_failed'
    ? '렌더링 상태를 확인해 주세요.'
    : '렌더링이 완료되었습니다.'
}

const getToastIcon = (toast: ProjectNotificationToast) => {
  if (toast.type === 'comment') return <MessageSquareText className="h-4 w-4" />
  if (toast.type === 'render_failed') return <AlertTriangle className="h-4 w-4" />
  return <Image className="h-4 w-4" />
}

const getToastToneClass = (toast: ProjectNotificationToast): string => {
  if (toast.type === 'comment') return 'border-[#dbeafe] bg-[#eef2ff] text-[#4f46e5]'
  if (toast.type === 'render_failed') return 'border-[#fee2e2] bg-[#fef2f2] text-[#dc2626]'
  return 'border-[#dcfce7] bg-[#f0fdf4] text-[#16a34a]'
}

const getToastCaption = (toast: ProjectNotificationToast): string => {
  if (toast.type === 'comment') return '새 댓글이 등록되었습니다.'
  if (toast.type === 'render_failed') return '렌더링 상태를 확인해 주세요.'
  return '뷰 렌더링이 완료되었습니다.'
}

export default function ProjectCommentToast({ onOpenProject }: ProjectCommentToastProps) {
  const toasts = useProjectNotificationToastStore((state) => state.toasts)
  const dismissToast = useProjectNotificationToastStore((state) => state.dismissToast)

  useEffect(() => {
    const timeoutIds = toasts.map((currentToast) =>
      window.setTimeout(() => dismissToast(currentToast.id), currentToast.durationMs),
    )
    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [dismissToast, toasts])

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-6 top-20 z-[120] flex w-[340px] flex-col gap-3">
      {toasts.map((currentToast) => {
        const isComment = currentToast.type === 'comment'

        return (
          <div
            key={currentToast.id}
            className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-start gap-3 p-4">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${getToastToneClass(currentToast)}`}>
                {getToastIcon(currentToast)}
              </span>
              <button
                type="button"
                className={`min-w-0 flex-1 text-left ${isComment ? '' : 'cursor-default'}`}
                onClick={() => {
                  if (isComment) onOpenProject(currentToast.projectId, currentToast.pinId)
                }}
              >
                <span className="mb-1 block truncate text-xs font-bold text-[#4f46e5]">{currentToast.title}</span>
                <span className="block text-sm font-bold text-[#111827]">{formatToastMessage(currentToast)}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#6b7280]">{getToastCaption(currentToast)}</span>
              </button>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
                onClick={() => dismissToast(currentToast.id)}
                title="토스트 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
