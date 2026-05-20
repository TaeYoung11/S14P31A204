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
            className="project-secondary-button"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="project-danger-button"
          >
            {isDeleting ? '삭제 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
