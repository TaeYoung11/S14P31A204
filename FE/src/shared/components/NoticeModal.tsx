import Modal from './Modal'

interface NoticeModalProps {
  isOpen: boolean
  title?: string
  message: string
  description?: string
  confirmLabel?: string
  onClose: () => void
}

export function NoticeModal({
  isOpen,
  title = '안내',
  message,
  description,
  confirmLabel = '확인',
  onClose,
}: NoticeModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-[460px]">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="whitespace-pre-line text-sm font-semibold leading-6 text-[#111827]">{message}</p>
          {description && <p className="whitespace-pre-line text-xs leading-5 text-[#6B7280]">{description}</p>}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[#3B45B3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2F378F]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
