import { ShieldAlert } from 'lucide-react'
import ActionModal, { ActionModalSummary } from '@/shared/components/ActionModal'
import type { Project } from '@/shared/types'

interface ProjectDeleteConfirmModalProps {
  isOpen: boolean
  projects: Project[]
  confirmText: string
  confirmName: string
  isConfirmValid: boolean
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
  onConfirmNameChange: (name: string) => void
}

/**
 * 프로젝트 삭제 확인 모달.
 * - 오입력 삭제를 방지하기 위해 지정한 확인 텍스트를 입력받는다.
 * - 단일/다중 삭제 화면을 동일 컴포넌트에서 렌더링한다.
 */
export default function ProjectDeleteConfirmModal({
  isOpen,
  projects,
  confirmText,
  confirmName,
  isConfirmValid,
  isDeleting,
  onClose,
  onConfirm,
  onConfirmNameChange,
}: ProjectDeleteConfirmModalProps) {
  const isBulkDelete = projects.length > 1
  const primaryProjectName = projects[0]?.name ?? '프로젝트'
  const targetLabel = isBulkDelete
    ? `${primaryProjectName} 외 ${projects.length - 1}개 프로젝트`
    : primaryProjectName

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      group="destructive"
      title="프로젝트 삭제"
      icon={<ShieldAlert className="h-5 w-5" />}
      maxWidth="max-w-[400px]"
    >
      <div className="space-y-4">
        <ActionModalSummary
          description="삭제 후 복구할 수 없습니다."
          compact
        >
          <p className="truncate text-sm font-black text-[#111827]">{targetLabel}</p>
        </ActionModalSummary>

        <div className="space-y-2.5">
          <label htmlFor="delete-project-confirm" className="mb-0 block text-[13px] font-bold text-[#374151]">
            <span className="text-[#b42318]">삭제</span> 입력
          </label>
          <input
            id="delete-project-confirm"
            type="text"
            className="project-input w-full"
            placeholder={confirmText}
            value={confirmName}
            onChange={(e) => onConfirmNameChange(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="project-secondary-button min-w-20"
            onClick={onClose}
            disabled={isDeleting}
          >
            취소
          </button>
          <button
            type="button"
            className="project-danger-button min-w-20 bg-[#b42318] text-white hover:bg-[#8f1f16]"
            onClick={onConfirm}
            disabled={isDeleting || !isConfirmValid}
          >
            {isDeleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </ActionModal>
  )
}
