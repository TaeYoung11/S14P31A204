import { useState } from 'react'
import { FilePlus2, PencilLine } from 'lucide-react'
import ActionModal from '@/shared/components/ActionModal'
import Spinner from '@/shared/components/Spinner'
import type { Project } from '@/shared/types'

interface ProjectCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { name: string; description: string }) => void
  isPending: boolean
  editProject?: Project | null
}

export default function ProjectCreateModal({
  isOpen, onClose, onSubmit, isPending, editProject
}: ProjectCreateModalProps) {
  const [name, setName] = useState(editProject?.name ?? '')
  const [description, setDescription] = useState(editProject?.description ?? '')
  const [nameError, setNameError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('프로젝트 이름을 입력해 주세요.')
      return
    }
    setNameError('')
    onSubmit({ name, description })
  }

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      group="productive"
      title={editProject ? '프로젝트 수정' : '새 프로젝트'}
      icon={editProject ? <PencilLine className="h-5 w-5" /> : <FilePlus2 className="h-5 w-5" />}
    >
      <form onSubmit={handleSubmit} className="project-form space-y-5" noValidate>
        <div>
          <label htmlFor="project-name" className="project-label">
            프로젝트 이름 <span className="text-[#dc2626]">*</span>
          </label>
          <input
            id="project-name"
            type="text"
            className="project-input"
            placeholder="예: 강남 근린생활시설"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError('')
            }}
            required
            autoFocus
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'project-name-error' : undefined}
          />
          {nameError && (
            <p id="project-name-error" className="project-field-error" role="alert">
              {nameError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="project-description" className="project-label">
            설명
          </label>
          <textarea
            id="project-description"
            className="project-input resize-none"
            rows={3}
            placeholder="프로젝트에 대한 간단한 설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" className="project-secondary-button h-11" onClick={onClose}>
            취소
          </button>
          <button
            id="project-create-submit"
            type="submit"
            className="project-primary-button h-11"
            disabled={isPending}
          >
            {isPending ? <><Spinner size="sm" /> 저장 중...</> : editProject ? '저장' : '다음'}
          </button>
        </div>
      </form>
    </ActionModal>
  )
}
