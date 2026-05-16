import { useEffect } from 'react'
import { AlertTriangle, Bell, Image, MessageSquareText, X } from 'lucide-react'
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
const COMMENT_FALLBACK_MESSAGE = '\uC0C8 \uB313\uAE00\uC774 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'
const RENDER_FAILED_MESSAGE =
  '\uB80C\uB354\uB9C1 \uC791\uC5C5 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.'
const COMPLETE_MESSAGE = '\uC791\uC5C5\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'
const INVITATION_CAPTION =
  '\uD504\uB85C\uC81D\uD2B8 \uCD08\uB300 \uC54C\uB9BC\uC774 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4.'

const formatCommentPreview = (content: string | null | undefined): string => {
  const normalized = typeof content === 'string' ? content.trim() : ''
  if (!normalized) return COMMENT_FALLBACK_MESSAGE
  if (normalized.length <= COMMENT_PREVIEW_MAX_LENGTH) return normalized
  return `${normalized.slice(0, COMMENT_PREVIEW_MAX_LENGTH)}...`
}

const formatToastMessage = (toast: ProjectNotificationToast): string => {
  const normalized = toast.message.trim()
  if (toast.type === 'comment') return formatCommentPreview(normalized)
  if (normalized) return normalized
  return toast.type === 'render_failed' ? RENDER_FAILED_MESSAGE : COMPLETE_MESSAGE
}

const getToastIcon = (toast: ProjectNotificationToast) => {
  if (toast.type === 'comment') return <MessageSquareText className="h-4 w-4" />
  if (toast.type === 'invitation') return <Bell className="h-4 w-4" />
  if (toast.type === 'render_failed') return <AlertTriangle className="h-4 w-4" />
  return <Image className="h-4 w-4" />
}

const getToastToneClass = (toast: ProjectNotificationToast): string => {
  if (toast.type === 'comment') return 'border-[#dbeafe] bg-[#eef2ff] text-[#4f46e5]'
  if (toast.type === 'invitation') return 'border-[#dbeafe] bg-[#eff6ff] text-[#2563eb]'
  if (toast.type === 'render_failed') return 'border-[#fee2e2] bg-[#fef2f2] text-[#dc2626]'
  return 'border-[#dcfce7] bg-[#f0fdf4] text-[#16a34a]'
}

const getToastCaption = (toast: ProjectNotificationToast): string => {
  if (toast.type === 'comment') return COMMENT_FALLBACK_MESSAGE
  if (toast.type === 'invitation') return INVITATION_CAPTION
  if (toast.type === 'render_failed') return RENDER_FAILED_MESSAGE
  return COMPLETE_MESSAGE
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
        const canOpenProject = currentToast.type === 'comment' || currentToast.type === 'invitation'

        return (
          <div
            key={currentToast.id}
            className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-start gap-3 p-4">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${getToastToneClass(
                  currentToast,
                )}`}
              >
                {getToastIcon(currentToast)}
              </span>
              <button
                type="button"
                className={`min-w-0 flex-1 text-left ${canOpenProject ? '' : 'cursor-default'}`}
                onClick={() => {
                  if (canOpenProject) onOpenProject(currentToast.projectId, currentToast.pinId)
                }}
              >
                <span className="mb-1 block truncate text-xs font-bold text-[#4f46e5]">
                  {currentToast.title}
                </span>
                <span className="block text-sm font-bold text-[#111827]">
                  {formatToastMessage(currentToast)}
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#6b7280]">
                  {getToastCaption(currentToast)}
                </span>
              </button>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
                onClick={() => dismissToast(currentToast.id)}
                title="\uD1A0\uC2A4\uD2B8 \uB2EB\uAE30"
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
