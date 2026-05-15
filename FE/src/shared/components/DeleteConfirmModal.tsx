import Modal from './Modal'

interface DeleteConfirmModalProps {
  isOpen: boolean
  title?: string
  message: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  isDeleting?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteConfirmModal({
  isOpen,
  title = '삭제 확인',
  message,
  description = '삭제 후에는 되돌릴 수 없습니다.',
  confirmLabel = '삭제',
  cancelLabel = '취소',
  isDeleting = false,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-[420px]">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[#111827]">{message}</p>
          {description && <p className="text-xs leading-5 text-[#9CA3AF]">{description}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-md border border-[#D1D5DB] px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? '삭제 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
