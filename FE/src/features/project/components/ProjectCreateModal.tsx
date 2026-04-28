import { useState } from 'react'
import Modal from '@/shared/components/Modal'
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ name, description })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editProject ? '프로젝트 수정' : '새 프로젝트'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="project-name" className="block text-xs font-medium text-[#374151] mb-1.5">
            프로젝트 이름 <span className="text-[#dc2626]">*</span>
          </label>
          <input
            id="project-name"
            type="text"
            className="input-base"
            placeholder="예: 강남 근린생활시설"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="project-description" className="block text-xs font-medium text-[#374151] mb-1.5">
            설명
          </label>
          <textarea
            id="project-description"
            className="input-base resize-none"
            rows={3}
            placeholder="프로젝트에 대한 간단한 설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            취소
          </button>
          <button
            id="project-create-submit"
            type="submit"
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            disabled={isPending}
          >
            {isPending ? <><Spinner size="sm" /> 저장 중...</> : editProject ? '저장' : '다음'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
