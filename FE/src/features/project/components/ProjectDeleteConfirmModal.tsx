import Modal from '@/shared/components/Modal'
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBulkDelete ? '프로젝트 삭제 확인' : '프로젝트 삭제'}
      maxWidth="max-w-[440px]"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm text-[#374151]">
            {isBulkDelete
              ? `선택한 ${projects.length}개 프로젝트를 삭제하시겠습니까?`
              : '이 프로젝트를 삭제하시겠습니까?'}
          </p>
          <p className="text-xs text-[#9ca3af]">삭제 후에는 되돌릴 수 없습니다.</p>
        </div>

        <div className="rounded-lg bg-[#f8f9fa] px-3 py-3">
          {isBulkDelete ? (
            <div className="space-y-1.5">
              {projects.slice(0, 5).map((project) => (
                <p key={project.id} className="truncate text-sm font-medium text-[#111827]">
                  {project.name}
                </p>
              ))}
              {projects.length > 5 && (
                <p className="text-xs text-[#6b7280]">외 {projects.length - 5}개</p>
              )}
            </div>
          ) : (
            <p className="text-sm font-medium text-[#111827]">{projects[0]?.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="delete-project-confirm" className="block text-xs font-medium text-[#374151]">
            삭제를 진행하려면 <span className="font-semibold text-[#dc2626]">{confirmText}</span> 를 입력하세요.
          </label>
          <input
            id="delete-project-confirm"
            type="text"
            className="input-base w-full"
            placeholder={confirmText}
            value={confirmName}
            onChange={(e) => onConfirmNameChange(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={isDeleting || !isConfirmValid}
          >
            {isDeleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
