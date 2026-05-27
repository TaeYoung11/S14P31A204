import Modal from '@/shared/components/Modal'
import type { SaveStatus } from '@/features/editor/types'

interface UnsavedChangesModalProps {
  isOpen: boolean
  saveStatus: SaveStatus
  onClose: () => void
  onSave: () => void
  onLeave: () => void
}

export default function UnsavedChangesModal({
  isOpen,
  saveStatus,
  onClose,
  onSave,
  onLeave,
}: UnsavedChangesModalProps) {
  const isSyncing = saveStatus === 'syncing'
  const isError = saveStatus === 'error'
  const message = isSyncing
    ? '변경사항을 저장하는 중입니다. 지금 나가면 저장이 완료되지 않을 수 있습니다.'
    : '저장되지 않은 변경사항이 있습니다. 저장하지 않고 나가면 최근 수정 내용이 사라질 수 있습니다.'
  const description = isError
    ? '마지막 저장이 실패했습니다. 네트워크 상태를 확인한 뒤 다시 저장해 주세요.'
    : '저장을 눌러 현재 화면에 머물며 저장을 다시 시도하거나, 나가기를 눌러 이동을 계속할 수 있습니다.'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="저장되지 않은 변경사항" maxWidth="max-w-[460px]">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold leading-6 text-[#111827]">{message}</p>
          <p className="text-xs leading-5 text-[#6B7280]">{description}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onClose} className="project-secondary-button h-11">
            계속 편집
          </button>
          <button type="button" onClick={onSave} className="project-secondary-button h-11">
            저장
          </button>
          <button type="button" onClick={onLeave} className="project-primary-button h-11 bg-[#B42318] hover:bg-[#912018]">
            나가기
          </button>
        </div>
      </div>
    </Modal>
  )
}
