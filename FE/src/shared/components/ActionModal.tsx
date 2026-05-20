import type { ReactNode } from 'react'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import Modal from './Modal'

export type ActionModalGroup = 'destructive' | 'productive'

interface ActionModalProps {
  isOpen: boolean
  onClose: () => void
  group: ActionModalGroup
  title: string
  eyebrow?: string
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
  maxWidth?: string
}

interface ActionModalNoticeProps {
  group: ActionModalGroup
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}

interface ActionModalSummaryProps {
  label?: ReactNode
  description?: ReactNode
  children?: ReactNode
  compact?: boolean
}

const groupStyles: Record<ActionModalGroup, {
  iconClassName: string
  eyebrowClassName: string
  noticeClassName: string
  noticeIconClassName: string
  noticeTitleClassName: string
  noticeDescriptionClassName: string
}> = {
  destructive: {
    iconClassName: 'border-[#ead7d4] bg-white text-[#b42318]',
    eyebrowClassName: 'text-[#b91c1c]',
    noticeClassName: 'border-[#ead7d4] bg-[#fffdfc]',
    noticeIconClassName: 'bg-[#fff4f2] text-[#b42318]',
    noticeTitleClassName: 'text-[#111827]',
    noticeDescriptionClassName: 'text-[#7f1d1d]/70',
  },
  productive: {
    iconClassName: 'border-[#dbeafe] bg-white text-[#4f46e5]',
    eyebrowClassName: 'text-[#64748b]',
    noticeClassName: 'border-[#dbeafe] bg-[#f8faff]',
    noticeIconClassName: 'bg-[#eef2ff] text-[#4f46e5]',
    noticeTitleClassName: 'text-[#111827]',
    noticeDescriptionClassName: 'text-[#64748b]',
  },
}

const defaultIcons: Record<ActionModalGroup, ReactNode> = {
  destructive: <ShieldAlert className="h-5 w-5" />,
  productive: <CheckCircle2 className="h-5 w-5" />,
}

export default function ActionModal({
  isOpen,
  onClose,
  group,
  title,
  eyebrow,
  subtitle,
  icon,
  children,
  maxWidth = 'max-w-[460px]',
}: ActionModalProps) {
  const styles = groupStyles[group]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={(
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm ${styles.iconClassName}`}
            aria-hidden="true"
          >
            {icon ?? defaultIcons[group]}
          </span>
          <span className="min-w-0">
            {eyebrow && (
              <span className={`mb-0.5 block text-[11px] font-black leading-4 ${styles.eyebrowClassName}`}>
                {eyebrow}
              </span>
            )}
            <span className="block truncate text-xl font-black leading-7 tracking-tight text-[#111827]">
              {title}
            </span>
            {subtitle && (
              <span className="mt-0.5 block truncate text-xs font-semibold text-[#8E95A3]">
                {subtitle}
              </span>
            )}
          </span>
        </span>
      )}
      maxWidth={maxWidth}
    >
      {children}
    </Modal>
  )
}

export function ActionModalNotice({
  group,
  icon,
  title,
  description,
  children,
}: ActionModalNoticeProps) {
  const styles = groupStyles[group]

  return (
    <div className={`rounded-2xl border px-4 py-4 ${styles.noticeClassName}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.noticeIconClassName}`}
          aria-hidden="true"
        >
          {icon ?? defaultIcons[group]}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-black ${styles.noticeTitleClassName}`}>{title}</p>
          {description && (
            <p className={`mt-1 text-xs leading-5 ${styles.noticeDescriptionClassName}`}>
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

export function ActionModalSummary({
  label,
  description,
  children,
  compact = false,
}: ActionModalSummaryProps) {
  const hasBody = Boolean(label || children)

  return (
    <div
      className={`rounded-2xl border border-[#e5e7eb] bg-[#fbfbfc] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${
        compact ? 'py-3' : 'py-4'
      }`}
    >
      {hasBody && (
        <div className="min-w-0 space-y-1.5">
          {label && (
            <p className="text-[11px] font-black leading-4 text-[#8b95a1]">
              {label}
            </p>
          )}
          {children}
        </div>
      )}
      {description && (
        <p
          className={`${hasBody ? (compact ? 'mt-2' : 'mt-2.5') : ''} text-xs font-semibold leading-5 text-[#9ca3af]`}
        >
          {description}
        </p>
      )}
    </div>
  )
}
