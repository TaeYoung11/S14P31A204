import ActionModal, { ActionModalSummary } from './ActionModal'

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
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      group="destructive"
      title={title}
      maxWidth="max-w-[420px]"
    >
      <div className="space-y-4">
        <ActionModalSummary description={description}>
          <p className="text-sm font-black text-[#111827]">{message}</p>
        </ActionModalSummary>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="project-secondary-button min-w-20"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="project-danger-button min-w-20 bg-[#b42318] text-white hover:bg-[#8f1f16]"
          >
            {isDeleting ? '삭제 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </ActionModal>
  )
}
